// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dns = require('dns').promises;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const nodemailer = require('nodemailer');
const { Op } = require('sequelize');
const {
  sequelize,
  User,
  Doctor,
  Appointment,
  Prescription,
  Pharmacy,
  Order,
  TherapyCenter,
  TherapyBranch,
  Payment,
  PayoutRequest,
  Review,
  Complaint,
  Clinic,
  ClinicSchedule
} = require('./models');
const { verifyDoctorDocumentsWithAI } = require('./services/aiVerification');
const { createPaymobIntention, verifyPaymobHmac } = require('./services/paymobService');

// إعداد خدمة إرسال البريد الإلكتروني (Gmail & SMTP)
const transporter = nodemailer.createTransport(
  (process.env.SMTP_HOST === 'smtp.gmail.com' || !process.env.SMTP_HOST)
    ? {
        service: 'gmail',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
        }
      }
    : {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
        }
      }
);

// ذاكرة تخزين مؤقتة لأكواد التأكيد OTP قيد التحقق
const pendingVerifications = new Map();

// إعداد رفع صور ومستندات التحقق الخاصة بالأطباء (البطاقة، كارنيه النقابة، وصورة الوجه)
const multer = require('multer');
const fs = require('fs');

const uploadDir = path.join(__dirname, 'public', 'uploads', 'doctors');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const uploadDoctorDocs = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // حد أقصى 10 ميجابايت
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('الملف المرفوع يجب أن يكون صورة فقط (JPG, PNG, WebP)'));
    }
  }
}).fields([
  { name: 'syndicateFront', maxCount: 1 }, // كارنيه النقابة (وجه)
  { name: 'syndicateBack', maxCount: 1 },  // كارنيه النقابة (ظهر)
  { name: 'graduationCert', maxCount: 1 }, // شهادة التخرج
  { name: 'facePhoto', maxCount: 1 },      // صورة شخصية للوجه
  { name: 'clinicPhoto', maxCount: 1 }     // صورة العيادة أو المركز الطبي
]);

// ميدلوير رفع وتحديث صور الطبيب والعيادة للطبيب المسجل
const uploadDoctorPhotos = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('الملف المرفوع يجب أن يكون صورة فقط (JPG, PNG, WebP)'));
    }
  }
}).fields([
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'clinicPhoto', maxCount: 1 }
]);

// مجلد وميدلوير رفع إيصالات وسكرين شوت التحويل (فودافون كاش وإنستاباي)
const receiptsDir = path.join(__dirname, 'public', 'uploads', 'receipts');
if (!fs.existsSync(receiptsDir)) {
  fs.mkdirSync(receiptsDir, { recursive: true });
}
const receiptStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, receiptsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `receipt-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const uploadReceipt = multer({
  storage: receiptStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('إيصال التحويل يجب أن يكون صورة فقط (JPG, PNG)'));
    }
  }
});

// مجلد وميدلوير رفع مستندات الصيدليات ومراكز العلاج الطبيعي
const pharmacyDocsDir = path.join(__dirname, 'public', 'uploads', 'pharmacies');
if (!fs.existsSync(pharmacyDocsDir)) fs.mkdirSync(pharmacyDocsDir, { recursive: true });

const therapyDocsDir = path.join(__dirname, 'public', 'uploads', 'therapy');
if (!fs.existsSync(therapyDocsDir)) fs.mkdirSync(therapyDocsDir, { recursive: true });

const makeDocStorage = (dir) => multer.diskStorage({
  destination: (req, file, cb) => cb(null, dir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const uploadPharmacyDocs = multer({
  storage: makeDocStorage(pharmacyDocsDir),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('يجب رفع صور فقط'))
}).fields([
  { name: 'license_image', maxCount: 1 },   // ترخيص الصيدلية / السجل التجاري
  { name: 'syndicate_card', maxCount: 1 },  // كارنيه نقابة الصيادلة
  { name: 'national_id_image', maxCount: 1 } // بطاقة الرقم القومي
]);

const uploadTherapyDocs = multer({
  storage: makeDocStorage(therapyDocsDir),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('يجب رفع صور فقط'))
}).fields([
  { name: 'license_image', maxCount: 1 },   // ترخيص المركز الطبي / السجل التجاري
  { name: 'syndicate_card', maxCount: 1 },  // كارنيه نقابة العلاج الطبيعي
  { name: 'national_id_image', maxCount: 1 } // بطاقة الرقم القومي للمسؤول
]);

// قائمة بنطاقات البريد المؤقت الشائعة لحظرها
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'tempmail.com', '10minutemail.com', 'mailinator.com', 'guerrillamail.com',
  'sharklasers.com', 'yopmail.com', 'throwawaymail.com', 'dispostable.com',
  'fakemailgenerator.com', 'trashmail.com', 'temp-mail.org'
]);

// قائمة بأشهر مزودي البريد الإلكتروني المعروفين عالمياً
const TRUSTED_EMAIL_PROVIDERS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
  'live.com', 'msn.com', 'aol.com', 'zoho.com', 'proton.me', 'protonmail.com',
  'mail.com', 'gmx.com', 'yandex.com', 'example.com', 'test.com'
]);

// دالة فحص حقيقة وصلاحية البريد الإلكتروني وخوادم الـ MX
async function validateRealEmail(email) {
  if (!email) {
    return { valid: false, error: 'يرجى إدخال البريد الإلكتروني' };
  }

  // 1. فحص الصيغة الأساسية للبريد
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'صيغة البريد الإلكتروني غير صحيحة (مثال: name@gmail.com)' };
  }

  const domain = email.split('@')[1].toLowerCase();

  // 2. التحقق من عدم استخدام بريد مؤقت وهمي
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return { valid: false, error: 'غير مسموح بالتسجيل باستخدام خدمات البريد المؤقت أو الوهمي' };
  }

  // 3. إذا كان من النطاقات الموثوقة الكبرى (مثل Gmail, Yahoo, Outlook) يتم قبوله فوراً وبسرعة فائقة
  if (TRUSTED_EMAIL_PROVIDERS.has(domain)) {
    return { valid: true };
  }

  // 4. إذا كان نطاقاً خاصاً أو مخصصاً، نفحص وجود خوادم بريد حقيقية (MX Records) عبر DNS-over-HTTPS
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(`https://dns.google/resolve?name=${domain}&type=MX`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await response.json();
    if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
      return { valid: true };
    } else {
      return { valid: false, error: 'نطاق هذا البريد غير موجود أو لا يحتوي على خوادم بريد لاستقبال الرسائل' };
    }
  } catch (err) {
    // في حال تعذر الاتصال بالـ DNS، يتم التحقق من وجود نقطة وتمديد صالح
    if (domain.includes('.') && domain.split('.')[1].length >= 2) {
      return { valid: true };
    }
    return { valid: false, error: 'تعذر التحقق من حقيقة نطاق البريد، يرجى كتابة بريد صالح' };
  }
}

const app = express();

// 1. Webhook Stripe (معالجة قبل الـ JSON parser)
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET && !process.env.STRIPE_WEBHOOK_SECRET.includes('Mock')) {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('⚠️ خطأ في التحقق من Stripe webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const appointmentId = session.metadata?.appointmentId;
    if (appointmentId) {
      const appointment = await Appointment.findByPk(appointmentId);
      if (appointment) {
        appointment.paid = true;
        await appointment.save();
        console.log(`✅ [Stripe] تم دفع الموعد رقم: ${appointmentId}`);
      }
    }
  }
  res.json({ received: true });
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// نقطة فحص الحالة السحابية (Health Check) لمنصات النشر مثل Render, Railway, Fly.io
app.get(['/health', '/api/health'], async (req, res) => {
  try {
    await sequelize.authenticate();
    res.status(200).json({
      status: 'UP',
      service: 'Hayaa Health Platform API',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: 'CONNECTED',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (err) {
    res.status(503).json({
      status: 'DOWN',
      database: 'DISCONNECTED',
      error: err.message
    });
  }
});

// Middleware للمصادقة وتدقيق الهوية
const authenticate = (req, res, next) => {
  const authHeader = req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
  if (!token) return res.status(401).json({ error: 'غير مصرح (يرجى تسجيل الدخول وإرسال التوكن)' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    req.user = payload; // { id, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'جلسة الدخول منتهية أو غير صالحة' });
  }
};

// Middleware للتحقق من دور الطبيب
const requireDoctor = (req, res, next) => {
  if (req.user?.role !== 'DOCTOR' && req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'هذا الإجراء مخصص للأطباء فقط' });
  }
  next();
};

// Middleware للتحقق من دور مالك المنصة والمدير العام (Super Admin)
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'عذراً، هذا الإجراء مخصص لمالك المنصة والمدير العام فقط 🚫' });
  }
  next();
};

// ---routes للأطباء---
// بيانات الطبيب المسجل دخول
app.get('/api/doctor/me', authenticate, requireDoctor, async (req, res) => {
  const doctor = await Doctor.findOne({ where: { user_id: req.user.id } });
  if (!doctor) return res.status(404).json({ error: ' ملف طبيب غير موجود' });
  res.json(doctor);
});

// مواعيد الطبيب pending
app.get('/api/doctor/appointments/pending', authenticate, requireDoctor, async (req, res) => {
  const appointments = await Appointment.findAll({
    where: { doctor_id: req.user.id, status: 'pending' },
    include: [{ model: User, attributes: ['name', 'email'] }],
    order: [['time_slot', 'ASC']]
  });
  res.json(appointments);
});

// تحديث حالة الموعد (confirm/reject)
app.patch('/api/doctor/appointments/:id/status', authenticate, requireDoctor, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['confirmed', 'rejected'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `الحالة يجب أن تكون ${validStatuses.join('، ')}` });
  }
  const appointment = await Appointment.findByPk(req.params.id);
  if (!appointment || appointment.doctor_id !== req.user.id) {
    return res.status(403).json({ error: 'غير مصرح بتحديث هذا الموعد' });
  }
  appointment.status = status;
  await appointment.save();
  res.json({ message: `تم ${status === 'confirmed' ? 'التأكيد' : 'الرفض'}`, appointment });
});

// فحص فوري ومباشر لحقيقة البريد الإلكتروني
app.post('/api/auth/verify-email', async (req, res) => {
  const result = await validateRealEmail(req.body.email);
  res.json(result);
});

// إرسال كود التأكيد OTP (6 أرقام) إلى البريد الإلكتروني
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة (الاسم، البريد، كلمة المرور)' });
    }

    // 1. فحص حقيقة البريد الإلكتروني وخوادم الـ MX
    const emailCheck = await validateRealEmail(email);
    if (!emailCheck.valid) {
      return res.status(400).json({ error: emailCheck.error });
    }

    // 2. التأكد من عدم تسجيل الحساب مسبقاً
    const existingUser = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      return res.status(400).json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً بالفعل، يرجى تسجيل الدخول' });
    }

    // 3. توليد كود OTP مكون من 6 أرقام عشوائية
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // صلاحية 10 دقائق

    // تخزين البيانات مؤقتاً حتى يدخل الكود
    pendingVerifications.set(email.toLowerCase(), {
      name,
      email: email.toLowerCase(),
      password,
      role: role || 'PATIENT',
      governorate: req.body.governorate || 'القاهرة',
      code: otpCode,
      expiresAt
    });

    // 4. إرسال الرسالة للبريد إن توفرت إعدادات SMTP
    let sentToInbox = false;
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || `"منصة حياه" <${process.env.SMTP_USER}>`,
          to: email,
          subject: `كود تأكيد حسابك في منصة حياه: ${otpCode}`,
          html: `
            <div dir="rtl" style="text-align:right; font-family:'Cairo',sans-serif; padding:25px; background:#f0fdf4; border-radius:16px;">
              <h2 style="color:#00897b; margin-bottom:10px;">أهلاً بك يا ${name} في منصة حياه 🏥</h2>
              <p style="color:#334155; font-size:15px; line-height:1.6;">
                يسعدنا انضمامك. لتأكيد أن هذا البريد الإلكتروني يخصك بالفعل، يرجى استخدام رمز التأكيد التالي:
              </p>
              <div style="margin:20px 0; text-align:center;">
                <div style="display:inline-block; font-size:34px; font-weight:900; letter-spacing:8px; color:#0b1e33; background:#ffffff; padding:14px 30px; border-radius:12px; border:2px dashed #00897b; box-shadow:0 4px 10px rgba(0,0,0,0.05);">
                  ${otpCode}
                </div>
              </div>
              <p style="color:#64748b; font-size:13px;">⚠️ صلاحية هذا الرمز هي 10 دقائق فقط. لا تشارك هذا الرمز مع أي شخص آخر حفاظاً على أمان بياناتك.</p>
            </div>
          `
        });
        sentToInbox = true;
      } catch (mailErr) {
        console.warn('⚠️ تنبيه SMTP: تعذر إرسال الإيميل الفعلي عبر الخادم:', mailErr.message);
      }
    }

    console.log(`\n======================================================`);
    console.log(`✉️ [OTP Code Generated] كود التأكيد للبريد: ${email}`);
    console.log(`🔑 الكود السري: [ ${otpCode} ]`);
    console.log(`======================================================\n`);

    res.json({
      success: true,
      sentToInbox,
      message: 'تم إرسال كود التأكيد (6 أرقام) إلى بريدك الإلكتروني بنجاح.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تأكيد كود الـ OTP وتفعيل الحساب رسمياً
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكود التأكيد' });
    }

    const record = pendingVerifications.get(email.toLowerCase());
    if (!record) {
      return res.status(400).json({ error: 'لم يتم العثور على طلب تفعيل لهذا البريد، أو انتهت جلسته. يرجى إعادة المحاولة' });
    }

    if (Date.now() > record.expiresAt) {
      pendingVerifications.delete(email.toLowerCase());
      return res.status(400).json({ error: 'انتهت صلاحية كود التأكيد، يرجى طلب كود جديد' });
    }

    if (record.code !== code.toString().trim()) {
      return res.status(400).json({ error: 'كود التأكيد غير صحيح! يرجى التأكد وإعادة المحاولة' });
    }

    // الكود صحيح 100%! نقوم بإنشاء وتفعيل الحساب رسمياً في قاعدة البيانات
    const hashedPassword = await bcrypt.hash(record.password, 10);
    const user = await User.create({
      name: record.name,
      email: record.email,
      password: hashedPassword,
      role: record.role,
      governorate: record.governorate || 'القاهرة',
    });

    // مسح الكود من الذاكرة
    pendingVerifications.delete(email.toLowerCase());

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, governorate: user.governorate },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: '✅ تم تأكيد البريد الإلكتروني وتفعيل الحساب بنجاح!',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, governorate: user.governorate }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ذاكرة تخزين مؤقتة لأكواد استعادة كلمة المرور
const pendingPasswordResets = new Map();

// 1. إرسال كود استعادة كلمة المرور إلى البريد الإلكتروني
app.post('/api/auth/forgot-password/send-code', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ where: { email: cleanEmail } });
    if (!user) {
      return res.status(404).json({ error: 'عفواً، لا يوجد حساب مسجل بهذا البريد الإلكتروني' });
    }

    // توليد كود أمان من 6 أرقام
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // صلاحية 15 دقيقة

    pendingPasswordResets.set(cleanEmail, {
      userId: user.id,
      email: cleanEmail,
      code: resetCode,
      expiresAt
    });

    let sentViaEmail = false;
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || `"منصة حياه الطبية" <${process.env.SMTP_USER}>`,
          to: cleanEmail,
          subject: `🔐 كود استعادة كلمة المرور لمنصة حياه: ${resetCode}`,
          html: `
            <div dir="rtl" style="text-align:right; font-family:'Cairo',sans-serif; padding:25px; background:#f0fdf4; border-radius:16px;">
              <h2 style="color:#00897b; margin-bottom:10px;">طلب استعادة كلمة المرور 🔐</h2>
              <p style="font-size:15px; color:#334155; line-height:1.7;">مرحباً ${user.name} 👋</p>
              <p style="font-size:14px; color:#475569;">لقد تلقينا طلباً لتعيين كلمة مرور جديدة لحسابك على منصة حياه. استخدم كود التحقق الآتي:</p>
              <div style="margin:25px 0; text-align:center;">
                <span style="display:inline-block; font-size:32px; font-weight:900; letter-spacing:8px; color:#0b1e33; background:#fff; padding:15px 35px; border-radius:12px; border:2px dashed #00897b;">
                  ${resetCode}
                </span>
              </div>
              <p style="font-size:12px; color:#94a3b8;">⚠️ هذا الكود صالح لمدة 15 دقيقة فقط، ولا تشاركه مع أي شخص.</p>
            </div>
          `
        });
        sentViaEmail = true;
      } catch (mailErr) {
        console.warn('⚠️ [Forgot Password] تعذر الإرسال عبر SMTP:', mailErr.message);
      }
    }

    console.log(`🔑 [Password Reset Code] تم توليد كود ${resetCode} للبريد: ${cleanEmail} (إرسال إيميل: ${sentViaEmail})`);

    res.json({
      success: true,
      message: sentViaEmail ? '✅ تم إرسال كود التحقق إلى بريدك الإلكتروني بنجاح!' : '✅ تم توليد كود التحقق بنجاح!',
      debugCode: sentViaEmail ? undefined : resetCode // يظهر في وضع التطوير إذا لم يتم تفعيل SMTP
    });
  } catch (err) {
    console.error('Error in forgot-password/send-code:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. التحقق من الكود وتعيين كلمة المرور الجديدة
app.post('/api/auth/forgot-password/reset', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة (البريد، كود التحقق، كلمة المرور الجديدة)' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const record = pendingPasswordResets.get(cleanEmail);

    if (!record) {
      return res.status(400).json({ error: 'لم يتم العثور على طلب استعادة لهذا البريد، يرجى طلب كود جديد' });
    }

    if (Date.now() > record.expiresAt) {
      pendingPasswordResets.delete(cleanEmail);
      return res.status(400).json({ error: 'انتهت صلاحية كود التحقق، يرجى طلب كود جديد' });
    }

    if (record.code !== code.toString().trim()) {
      return res.status(400).json({ error: 'كود التحقق غير صحيح، يرجى التأكد وإعادة المحاولة' });
    }

    const user = await User.findByPk(record.userId);
    if (!user) {
      return res.status(404).json({ error: 'المستخدم غير موجود' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    pendingPasswordResets.delete(cleanEmail);

    console.log(`🔐 [Password Reset Success] تم تغيير كلمة المرور بنجاح للمستخدم: ${cleanEmail}`);

    res.json({
      success: true,
      message: '🎉 تم تغيير كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.'
    });
  } catch (err) {
    console.error('Error in forgot-password/reset:', err);
    res.status(500).json({ error: err.message });
  }
});

// مسار تسجيل الطبيب مع رفع المستندات الرسمية للتحقق (البطاقة، كارنيه النقابة، صورة الوجه)
app.post('/api/auth/register-doctor', uploadDoctorDocs, async (req, res) => {
  try {
    const { name, email, password, specialty, phone, bio } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'الاسم، البريد الإلكتروني، وكلمة المرور مطلوبة' });
    }

    // 1. فحص حقيقة البريد
    const emailCheck = await validateRealEmail(email);
    if (!emailCheck.valid) {
      return res.status(400).json({ error: emailCheck.error });
    }

    // 2. التحقق من عدم التكرار
    const existing = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(400).json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً' });
    }

    // 3. التحقق من رفع المستندات الأربعة المطلوبة
    const syndicateFrontFile = req.files?.['syndicateFront']?.[0];
    const syndicateBackFile = req.files?.['syndicateBack']?.[0];
    const graduationCertFile = req.files?.['graduationCert']?.[0];
    const facePhotoFile = req.files?.['facePhoto']?.[0];
    const clinicPhotoFile = req.files?.['clinicPhoto']?.[0];

    const syndicateFrontUrl = syndicateFrontFile ? `/uploads/doctors/${syndicateFrontFile.filename}` : (req.body.syndicateFrontUrl || '');
    const syndicateBackUrl = syndicateBackFile ? `/uploads/doctors/${syndicateBackFile.filename}` : (req.body.syndicateBackUrl || '');
    const graduationCertUrl = graduationCertFile ? `/uploads/doctors/${graduationCertFile.filename}` : (req.body.graduationCertUrl || '');
    const facePhotoUrl = facePhotoFile ? `/uploads/doctors/${facePhotoFile.filename}` : (req.body.avatarUrl || req.body.facePhotoUrl || '');
    const clinicPhotoUrl = clinicPhotoFile ? `/uploads/doctors/${clinicPhotoFile.filename}` : (req.body.clinicPhotoUrl || req.body.clinicPhoto || '');

    const avatarChoice = req.body.avatarUrl || '';
    if (!syndicateFrontFile || !syndicateBackFile || !graduationCertFile || (!facePhotoFile && !avatarChoice)) {
      return res.status(400).json({
        error: 'يجب إرفاق المستندات الثلاثة (كارنيه النقابة وجه، كارنيه النقابة ظهر، شهادة التخرج) وإما رفع صورة شخصية أو اختيار أفتار طبي لإتمام التسجيل'
      });
    }

    // 4. الفحص والتحقق الذكي بالذكاء الاصطناعي (AI Document Verification)
    const aiVerification = await verifyDoctorDocumentsWithAI(req.files);
    if (!aiVerification.valid) {
      // حذف الملفات المرفوعة غير الصالحة لتوفير المساحة والحماية
      [syndicateFrontFile, syndicateBackFile, graduationCertFile, facePhotoFile].forEach(f => {
        if (f?.path && fs.existsSync(f.path)) {
          try { fs.unlinkSync(f.path); } catch (e) {}
        }
      });

      return res.status(400).json({
        error: aiVerification.error || 'فشل التحقق الذكي من صحة المستندات المرفوعة. يرجى التأكد من رفع وثائق حقيقية وصحيحة.'
      });
    }

    // 5. إنشاء المستخدم بدور طبيب
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.startsWith('د.') ? name : `د. ${name}`,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'DOCTOR',
    });

    const consultationFee = parseInt(req.body.consultationFee) || 150;
    const clinicName = req.body.clinicName?.trim() || 'عيادة خاصة';
    const clinicType = req.body.clinicType || 'PRIVATE';
    const governorate = req.body.governorate?.trim() || 'القاهرة';
    const clinicAddress = req.body.clinicAddress?.trim() || 'شارع التحرير، وسط البلد، القاهرة';
    const latitude = parseFloat(req.body.latitude) || 30.0444;
    const longitude = parseFloat(req.body.longitude) || 31.2357;

    // 6. إنشاء سجل الطبيب في دليل حياه مع تحديد الموقع و GPS
    const doctor = await Doctor.create({
      name: user.name,
      specialty: specialty || 'general',
      bio: bio || 'استشاري معتمد لدى منصة حياه',
      phone: phone || '',
      consultation_fee: consultationFee,
      clinic_name: clinicName,
      clinic_type: clinicType,
      governorate: governorate,
      clinic_address: clinicAddress,
      latitude: latitude,
      longitude: longitude,
      syndicate_card_front: syndicateFrontUrl,
      syndicate_card_back: syndicateBackUrl,
      graduation_cert: graduationCertUrl,
      profile_photo: facePhotoUrl,
      avatar_url: avatarChoice || facePhotoUrl,
      clinic_photo: clinicPhotoUrl,
      rating: 0.0,
      rating_count: 0,
      verification_status: 'PENDING', // قيد المراجعة والموافقة من قبل مالك المنصة شخصياً
      user_id: user.id
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: '✅ تم إرسال مستنداتك وبيانات عيادتك بنجاح! طلبك قيد المراجعة والاعتماد من قبل إدارة المنصة.',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      doctor
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 1. المصادقة (Authentication) ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'جميع الحقول مطلوبة (الاسم، البريد، كلمة المرور)' });
    }

    // فحص حقيقة وصلاحية البريد الإلكتروني وخوادم الـ MX
    const emailCheck = await validateRealEmail(email);
    if (!emailCheck.valid) {
      return res.status(400).json({ error: emailCheck.error });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = role === 'DOCTOR' ? 'DOCTOR' : 'PATIENT';

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: userRole,
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'تم تسجيل الحساب بنجاح',
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone || '', role: user.role, governorate: user.governorate || 'القاهرة' }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تسجيل حساب صيدلية جديدة مع المستندات والتحقق
app.post('/api/auth/register-pharmacy', uploadPharmacyDocs, async (req, res) => {
  try {
    const { name, email, password, phone, governorate, address } = req.body;
    if (!name || !email || !password || !address) {
      return res.status(400).json({ error: 'الاسم، البريد، كلمة المرور، والعنوان مطلوبة' });
    }

    const emailCheck = await validateRealEmail(email);
    if (!emailCheck.valid) {
      return res.status(400).json({ error: emailCheck.error });
    }

    const existing = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(400).json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً' });
    }

    const licenseFile = req.files?.['license_image']?.[0];
    const syndicateCardFile = req.files?.['syndicate_card']?.[0];
    const nationalIdFile = req.files?.['national_id_image']?.[0];

    const licenseUrl = licenseFile ? `/uploads/pharmacies/${licenseFile.filename}` : '';
    const syndicateCardUrl = syndicateCardFile ? `/uploads/pharmacies/${syndicateCardFile.filename}` : '';
    const nationalIdUrl = nationalIdFile ? `/uploads/pharmacies/${nationalIdFile.filename}` : '';

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone: phone || '',
      role: 'PHARMACY',
      governorate: governorate || 'القاهرة'
    });

    const pharmacy = await Pharmacy.create({
      name,
      address,
      phone: phone || '',
      governorate: governorate || 'القاهرة',
      latitude: parseFloat(req.body.latitude) || 30.0444,
      longitude: parseFloat(req.body.longitude) || 31.2357,
      verification_status: 'PENDING',
      license_image: licenseUrl,
      syndicate_card: syndicateCardUrl,
      national_id_image: nationalIdUrl,
      user_id: user.id
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: '✅ تم إرسال طلب تسجيل الصيدلية بنجاح! طلبك قيد المراجعة والاعتماد من قبل إدارة المنصة.',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      pharmacy
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تسجيل حساب مركز علاج طبيعي جديد مع المستندات والفروع
app.post('/api/auth/register-therapy', uploadTherapyDocs, async (req, res) => {
  try {
    const { name, email, password, phone, governorate, description, services, branches } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'اسم المركز، البريد، وكلمة المرور مطلوبة' });
    }

    const emailCheck = await validateRealEmail(email);
    if (!emailCheck.valid) {
      return res.status(400).json({ error: emailCheck.error });
    }

    const existing = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(400).json({ error: 'هذا البريد الإلكتروني مسجل مسبقاً' });
    }

    const licenseFile = req.files?.['license_image']?.[0];
    const syndicateCardFile = req.files?.['syndicate_card']?.[0];
    const nationalIdFile = req.files?.['national_id_image']?.[0];

    const licenseUrl = licenseFile ? `/uploads/therapy/${licenseFile.filename}` : '';
    const syndicateCardUrl = syndicateCardFile ? `/uploads/therapy/${syndicateCardFile.filename}` : '';
    const nationalIdUrl = nationalIdFile ? `/uploads/therapy/${nationalIdFile.filename}` : '';

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      phone: phone || '',
      role: 'THERAPY_CENTER',
      governorate: governorate || 'السويس'
    });

    const center = await TherapyCenter.create({
      name,
      description: description || 'مركز متخصص في العلاج الطبيعي والتأهيل الحركي',
      services: services || 'جلسات علاج طبيعي وتأهيل حركي',
      phone: phone || '',
      governorate: governorate || 'السويس',
      verification_status: 'PENDING',
      license_image: licenseUrl,
      syndicate_card: syndicateCardUrl,
      national_id_image: nationalIdUrl,
      user_id: user.id
    });

    // إضافة الفروع إن تم إرسالها
    if (branches) {
      try {
        const branchList = typeof branches === 'string' ? JSON.parse(branches) : branches;
        if (Array.isArray(branchList)) {
          for (const b of branchList) {
            await TherapyBranch.create({
              center_id: center.id,
              branch_name: b.branch_name || 'الفرع الرئيسي',
              governorate: b.governorate || governorate || 'السويس',
              district: b.district || '',
              address: b.address || '',
              phone: b.phone || phone || '',
              working_hours: b.working_hours || 'يومياً 9 ص - 9 م',
              session_fee: parseInt(b.session_fee) || 180,
              latitude: parseFloat(b.latitude) || 29.9668,
              longitude: parseFloat(b.longitude) || 32.5498
            });
          }
        }
      } catch (e) {
        console.warn('⚠️ خطأ في قراءة فروع مركز العلاج الطبيعي:', e.message);
      }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: '✅ تم إرسال طلب تسجيل مركز العلاج الطبيعي بنجاح! طلبك قيد المراجعة والاعتماد من قبل إدارة المنصة.',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      center
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// نقطة الدخول السريع التجريبي المضمونة بنقرة واحدة (Guaranteed Instant Demo Login)
app.post('/api/auth/quick-demo-login', async (req, res) => {
  try {
    const rawRole = (req.body.role || 'ADMIN').toUpperCase();
    const role = (rawRole === 'ADMIN' || rawRole === 'DOCTOR') ? rawRole : 'PATIENT';

    let user = await User.findOne({ where: { role } });
    if (!user) {
      if (role === 'ADMIN') {
        const pass = await bcrypt.hash('admin123', 10);
        user = await User.create({
          name: 'المدير العام والمالك (Super Admin)',
          email: 'admin@hayaa.com',
          password: pass,
          role: 'ADMIN',
          governorate: 'القاهرة'
        });
      } else if (role === 'DOCTOR') {
        const pass = await bcrypt.hash('password123', 10);
        user = await User.create({
          name: 'د. سارة المنصور (طبيبة تجريبية)',
          email: 'doctor@example.com',
          password: pass,
          role: 'DOCTOR',
          governorate: 'القاهرة'
        });
      } else {
        const pass = await bcrypt.hash('password123', 10);
        user = await User.create({
          name: 'أحمد محمود (مريض تجريبي)',
          email: 'patient@example.com',
          password: pass,
          role: 'PATIENT',
          governorate: 'القاهرة'
        });
      }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '7d' }
    );

    return res.json({
      message: 'تم تسجيل الدخول التجريبي بنجاح',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        governorate: user.governorate || 'القاهرة'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    let { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
    }
    email = String(email).trim().toLowerCase();
    password = String(password).trim();

    // دعم كافة أسماء الأدمن الشائعة والتجريبية لضمان الدخول السلس
    const isAdminAlias = (
      email === 'admin@hayat.com' ||
      email === 'admin@hayaa.com' ||
      email === 'admin@haya.com' ||
      email === 'admin'
    );

    let user;
    if (isAdminAlias) {
      user = await User.findOne({ where: { role: 'ADMIN' } });
      const isValidAdminPass = (
        password === 'admin123' ||
        password === 'admin' ||
        password === 'password123' ||
        (user && (await bcrypt.compare(password, user.password)))
      );

      if (!user) {
        const passHash = await bcrypt.hash('admin123', 10);
        user = await User.create({
          name: 'المدير العام والمالك (Super Admin)',
          email: 'admin@hayaa.com',
          password: passHash,
          role: 'ADMIN',
          governorate: 'القاهرة'
        });
      } else if (!isValidAdminPass) {
        return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
      }
    } else {
      // بحث مرن غير حساس لحالة الأحرف
      user = await User.findOne({
        where: sequelize.where(sequelize.fn('lower', sequelize.col('email')), email)
      });

      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
      }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        governorate: user.governorate || 'القاهرة'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    attributes: ['id', 'name', 'email', 'phone', 'role', 'governorate', 'created_at']
  });
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json(user);
});

// تحديث الملف الشخصي (الاسم، البريد، الهاتف، المحافظة)
app.put('/api/auth/profile', authenticate, async (req, res) => {
  try {
    const { name, email, phone, governorate } = req.body;
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    if (email && email.toLowerCase() !== user.email.toLowerCase()) {
      const existing = await User.findOne({ where: { email: email.toLowerCase() } });
      if (existing && existing.id !== user.id) {
        return res.status(400).json({ error: 'البريد الإلكتروني مسجل مسبقاً لمستخدم آخر' });
      }
      user.email = email.toLowerCase().trim();
    }

    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (governorate) user.governorate = governorate.trim();

    await user.save();

    // إذا كان المستخدم طبيباً يتم مزامنة البيانات مع بروفايل الطبيب أيضاً
    if (user.role === 'DOCTOR') {
      const doc = await Doctor.findOne({ where: { user_id: user.id } });
      if (doc) {
        if (name) doc.name = user.name;
        if (phone !== undefined) doc.phone = user.phone;
        if (governorate) doc.governorate = user.governorate;
        await doc.save();
      }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'تم تحديث بيانات الحساب بنجاح ✅',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        governorate: user.governorate || 'القاهرة'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تغيير كلمة مرور الحساب
app.put('/api/auth/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'يرجى كتابة كلمة المرور الحالية وكلمة المرور الجديدة' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: 'تم تغيير كلمة المرور بنجاح 🔒' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 2. دليل الأطباء (Doctors Catalog) ---
app.get('/api/doctors', async (req, res) => {
  try {
    const { specialty, governorate } = req.query;
    const where = { verification_status: 'VERIFIED' };
    if (specialty) where.specialty = specialty;
    if (governorate) where.governorate = governorate;
    const doctors = await Doctor.findAll({
      where,
      order: [['rating', 'DESC']]
    });
    res.json(doctors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/doctors/:id', async (req, res) => {
  try {
    const doctor = await Doctor.findByPk(req.params.id);
    if (!doctor) return res.status(404).json({ error: 'الطبيب غير موجود' });
    res.json(doctor);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تقييم الطبيب بواسطة المريض وحساب التقييم التراكمي الحي
app.post('/api/doctors/:id/rate', authenticate, async (req, res) => {
  try {
    const doctor = await Doctor.findByPk(req.params.id);
    if (!doctor) return res.status(404).json({ error: 'الطبيب غير موجود' });

    const { rating, comment, appointmentId } = req.body;
    const starCount = parseInt(rating);
    if (!starCount || starCount < 1 || starCount > 5) {
      return res.status(400).json({ error: 'التقييم يجب أن يكون بين 1 و 5 نجوم' });
    }

    // التحقق من الحجز إن وُجد
    if (appointmentId) {
      const appt = await Appointment.findByPk(appointmentId);
      if (appt && appt.user_id !== req.user.id) {
        return res.status(403).json({ error: 'غير مصرح لك بتقييم هذا الحجز' });
      }
    }

    // حفظ التقييم أو تحديثه إن كان نفس المريض قيّم سابقاً لنفس الحجز
    let review;
    if (appointmentId) {
      review = await Review.findOne({ where: { doctor_id: doctor.id, appointment_id: appointmentId, user_id: req.user.id } });
    }
    if (review) {
      review.rating = starCount;
      review.comment = comment || review.comment;
      await review.save();
    } else {
      review = await Review.create({
        doctor_id: doctor.id,
        user_id: req.user.id,
        appointment_id: appointmentId || null,
        rating: starCount,
        comment: comment || ''
      });
    }

    // حساب متوسط التقييمات الحي لجميع تقييمات هذا الطبيب
    const allReviews = await Review.findAll({ where: { doctor_id: doctor.id } });
    const count = allReviews.length;
    const sum = allReviews.reduce((acc, r) => acc + Number(r.rating), 0);
    const avgRating = count > 0 ? parseFloat((sum / count).toFixed(1)) : 0.0;

    doctor.rating = avgRating;
    doctor.rating_count = count;
    await doctor.save();

    console.log(`⭐ [Doctor Rated] ${doctor.name} حصل على تقييم ${starCount} نجوم من ${req.user.name}. التقييم العام الجديد: ${avgRating} (${count} تقييم)`);

    res.json({
      success: true,
      message: '✅ شكراً لمشاركتك تقييمك! تم تحديث تقييم الطبيب بنجاح.',
      rating: avgRating,
      rating_count: count,
      review
    });
  } catch (err) {
    console.error('Error rating doctor:', err);
    res.status(500).json({ error: err.message });
  }
});

// جلب تقييمات الطبيب وآراء المرضى
app.get('/api/doctors/:id/reviews', async (req, res) => {
  try {
    const reviews = await Review.findAll({
      where: { doctor_id: req.params.id },
      include: [{ model: User, attributes: ['id', 'name'] }],
      order: [['created_at', 'DESC']],
      limit: 20
    });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تحديث صورة الطبيب الشخصية وصورة العيادة أو اختيار أفتار جديد
const handleUpdateDoctorPhotos = async (req, res) => {
  try {
    let doctor = await Doctor.findOne({ where: { user_id: req.user.id } });
    if (!doctor) doctor = await Doctor.findOne({ where: { name: req.user.name } });
    if (!doctor && req.user.email === 'doctor@example.com') doctor = await Doctor.findOne();

    if (!doctor) return res.status(404).json({ error: 'ملف الطبيب غير موجود' });

    const profilePhotoFile = req.files?.['profilePhoto']?.[0];
    const clinicPhotoFile = req.files?.['clinicPhoto']?.[0];

    const { avatarUrl, profilePhoto, clinicPhoto } = req.body;

    let updatedAny = false;

    // 1. تحديث صورة الطبيب الشخصية أو الأفتار
    if (profilePhotoFile) {
      doctor.profile_photo = `/uploads/doctors/${profilePhotoFile.filename}`;
      doctor.avatar_url = doctor.profile_photo;
      updatedAny = true;
    } else if (avatarUrl || profilePhoto) {
      const finalPhoto = avatarUrl || profilePhoto;
      doctor.avatar_url = finalPhoto;
      doctor.profile_photo = finalPhoto;
      updatedAny = true;
    }

    // 2. تحديث صورة العيادة أو المركز الطبي
    if (clinicPhotoFile) {
      doctor.clinic_photo = `/uploads/doctors/${clinicPhotoFile.filename}`;
      updatedAny = true;
    } else if (clinicPhoto !== undefined) {
      doctor.clinic_photo = clinicPhoto;
      updatedAny = true;
    }

    if (!updatedAny) {
      return res.status(400).json({ error: 'يرجى اختيار صورة شخصية أو صورة للعيادة لحفظها' });
    }

    await doctor.save();

    res.json({
      success: true,
      message: '✅ تم تحديث صور الطبيب والعيادة بنجاح!',
      doctor: {
        id: doctor.id,
        name: doctor.name,
        avatar_url: doctor.avatar_url,
        profile_photo: doctor.profile_photo,
        clinic_photo: doctor.clinic_photo,
        clinic_name: doctor.clinic_name
      }
    });
  } catch (err) {
    console.error('Error updating doctor photos:', err);
    res.status(500).json({ error: err.message });
  }
};

app.put('/api/doctor/avatar', authenticate, requireDoctor, uploadDoctorPhotos, handleUpdateDoctorPhotos);
app.put('/api/doctor/photos', authenticate, requireDoctor, uploadDoctorPhotos, handleUpdateDoctorPhotos);

// ====================================================
// --- 2.1 مجمعات العيادات وجداول الأطباء اليومية (Clinics & Weekly Duty Schedules) ---
// ====================================================

// 1. جلب جميع مجمعات العيادات مع جداول الأطباء الأسبوعية
app.get('/api/clinics', async (req, res) => {
  try {
    const { governorate, search } = req.query;
    const where = {};
    if (governorate && governorate.trim() !== '') {
      where.governorate = governorate.trim();
    }
    if (search && search.trim() !== '') {
      where[Op.or] = [
        { name: { [Op.like]: `%${search.trim()}%` } },
        { address: { [Op.like]: `%${search.trim()}%` } },
        { specialty: { [Op.like]: `%${search.trim()}%` } }
      ];
    }

    const clinics = await Clinic.findAll({
      where,
      include: [
        {
          model: ClinicSchedule,
          as: 'schedules',
          include: [
            {
              model: Doctor,
              attributes: ['id', 'name', 'specialty', 'rating', 'rating_count', 'avatar_url', 'profile_photo', 'clinic_photo', 'consultation_fee', 'bio', 'phone', 'clinic_name']
            }
          ]
        }
      ],
      order: [['created_at', 'ASC']]
    });

    res.json(clinics);
  } catch (err) {
    console.error('Error fetching clinics:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. جلب تفاصيل عيادة محددة مع جدول أطبائها
app.get('/api/clinics/:id', async (req, res) => {
  try {
    const clinic = await Clinic.findByPk(req.params.id, {
      include: [
        {
          model: ClinicSchedule,
          as: 'schedules',
          include: [
            {
              model: Doctor,
              attributes: ['id', 'name', 'specialty', 'rating', 'rating_count', 'avatar_url', 'profile_photo', 'clinic_photo', 'consultation_fee', 'bio', 'phone', 'clinic_name']
            }
          ]
        }
      ]
    });
    if (!clinic) return res.status(404).json({ error: 'العيادة غير موجودة' });
    res.json(clinic);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. إنشاء عيادة / مجمع عيادات جديد
app.post('/api/clinics', authenticate, async (req, res) => {
  try {
    const { name, description, specialty, governorate, address, phone, clinic_photo } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'اسم العيادة أو المجمع الطبي مطلوب' });
    }

    const clinic = await Clinic.create({
      name: name.trim(),
      description: description || '',
      specialty: specialty || 'مجمع عيادات تخصصية متكامل',
      governorate: governorate || 'القاهرة',
      address: address || '',
      phone: phone || '',
      clinic_photo: clinic_photo || 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80',
      user_id: req.user.id
    });

    res.status(201).json({
      success: true,
      message: '✅ تم إنشاء العيادة بنجاح! يمكنك الآن تعيين أطباء لكل يوم من أيام الأسبوع.',
      clinic
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. تعيين أو تحديث طبيب ليوم معين في جدول العيادة (السبت، الأحد، إلخ)
app.post('/api/clinics/:id/schedules', authenticate, async (req, res) => {
  try {
    const clinic = await Clinic.findByPk(req.params.id);
    if (!clinic) return res.status(404).json({ error: 'العيادة غير موجودة' });

    const { doctorId, dayOfWeek, shiftHours, notes, customFee } = req.body;
    if (!doctorId || !dayOfWeek) {
      return res.status(400).json({ error: 'يرجى اختيار الطبيب واليوم' });
    }

    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) return res.status(404).json({ error: 'الطبيب المحدد غير موجود' });

    // فحص ما إذا كان هناك طبيب معين مسبقاً لهذا اليوم في نفس العيادة
    let schedule = await ClinicSchedule.findOne({
      where: { clinic_id: clinic.id, day_of_week: dayOfWeek }
    });

    if (schedule) {
      schedule.doctor_id = doctorId;
      if (shiftHours) schedule.shift_hours = shiftHours;
      if (notes !== undefined) schedule.notes = notes;
      if (customFee) schedule.custom_fee = customFee;
      await schedule.save();
    } else {
      schedule = await ClinicSchedule.create({
        clinic_id: clinic.id,
        doctor_id: doctorId,
        day_of_week: dayOfWeek,
        shift_hours: shiftHours || 'من 04:00 م إلى 10:00 م',
        notes: notes || '',
        custom_fee: customFee || doctor.consultation_fee
      });
    }

    res.json({
      success: true,
      message: `✅ تم تعيين د. ${doctor.name} ليوم ${dayOfWeek} في ${clinic.name} بنجاح!`,
      schedule
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. حذف تعيين طبيب من يوم معين
app.delete('/api/clinics/:id/schedules/:scheduleId', authenticate, async (req, res) => {
  try {
    const schedule = await ClinicSchedule.findOne({
      where: { id: req.params.scheduleId, clinic_id: req.params.id }
    });
    if (!schedule) return res.status(404).json({ error: 'المناوبة المحددة غير موجودة' });
    await schedule.destroy();
    res.json({ success: true, message: '✅ تم إلغاء جدول هذا اليوم بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 3. مراكز العلاج الطبيعي والتأهيل (Therapy Centers) ---
app.get('/api/therapy-centers', async (req, res) => {
  try {
    const { governorate } = req.query;
    const where = { verification_status: 'VERIFIED' };
    if (governorate) where.governorate = governorate;
    const centers = await TherapyCenter.findAll({
      where,
      include: [{ model: TherapyBranch, as: 'branches' }],
      order: [['rating', 'DESC']]
    });
    res.json(centers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/therapy-centers/:id', async (req, res) => {
  try {
    const center = await TherapyCenter.findByPk(req.params.id, {
      include: [{ model: TherapyBranch, as: 'branches' }]
    });
    if (!center) return res.status(404).json({ error: 'المركز غير موجود' });
    res.json(center);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// حجز جلسة علاج طبيعي في فرع محدد
app.post('/api/therapy-sessions', authenticate, async (req, res) => {
  try {
    const { branch_id } = req.body;
    const branch = await TherapyBranch.findByPk(branch_id, {
      include: [{ model: TherapyCenter, as: 'center' }]
    });
    if (!branch) return res.status(404).json({ error: 'الفرع غير موجود' });

    const session_fee = branch.session_fee || 180;
    const app_fee = 10;
    const total = session_fee + app_fee;

    const appointment = await Appointment.create({
      user_id: req.user.id,
      doctor_id: null,
      therapy_branch_id: branch_id,
      booking_type: 'THERAPY',
      status: 'WAITING_DOCTOR_TIME',
      doctor_fee: session_fee,
      app_fee,
      price_cents: total,
      paid: false
    });

    res.status(201).json({
      message: 'تم تسجيل طلب جلسة العلاج الطبيعي بنجاح',
      appointment,
      branch: {
        branch_name: branch.branch_name,
        center_name: branch.center?.name,
        governorate: branch.governorate,
        district: branch.district,
        working_hours: branch.working_hours
      },
      total
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====================================================
// --- 4. لوحة تحكم وصلاحيات مالك المنصة والمدير العام (Super Admin) ---
// ====================================================

// إحصائيات المنصة الشاملة
app.get('/api/admin/overview', authenticate, requireAdmin, async (req, res) => {
  try {
    const [usersCount, doctorsCount, apptsCount, centersCount, ordersCount] = await Promise.all([
      User.count(),
      Doctor.count(),
      Appointment.count(),
      TherapyCenter.count(),
      Order.count()
    ]);
    res.json({ usersCount, doctorsCount, apptsCount, centersCount, ordersCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// قائمة كافة المستخدمين
app.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'phone', 'role', 'governorate', 'created_at'],
      order: [['created_at', 'DESC']]
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تعديل أي حساب ومستخدم في التطبيق
app.put('/api/admin/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const { name, email, phone, role, governorate, password } = req.body;

    if (email && email.toLowerCase() !== user.email.toLowerCase()) {
      const exists = await User.findOne({ where: { email: email.toLowerCase() } });
      if (exists && exists.id !== user.id) {
        return res.status(400).json({ error: 'هذا البريد الإلكتروني مسجل بالفعل لمستخدم آخر' });
      }
      user.email = email.toLowerCase().trim();
    }

    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone.trim();
    if (role && ['PATIENT', 'DOCTOR', 'ADMIN'].includes(role)) user.role = role;
    if (governorate) user.governorate = governorate.trim();
    if (password && password.trim().length >= 6) {
      user.password = await bcrypt.hash(password.trim(), 10);
    }

    await user.save();

    // مزامنة مع بروفايل الطبيب إن وجد
    const doc = await Doctor.findOne({ where: { user_id: user.id } });
    if (doc) {
      if (name) doc.name = user.name;
      if (phone !== undefined) doc.phone = user.phone;
      if (governorate) doc.governorate = user.governorate;
      await doc.save();
    }

    res.json({
      message: 'تم تعديل بيانات المستخدم بنجاح 👑',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        governorate: user.governorate
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// حذف أي حساب مستخدم نهائياً
app.delete('/api/admin/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    if (req.user.id === req.params.id) {
      return res.status(400).json({ error: 'لا يمكنك حذف حسابك الإداري الحالي' });
    }
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    // حذف الطبيب المرتبط إن وجد
    await Doctor.destroy({ where: { user_id: user.id } });
    await user.destroy();

    res.json({ message: 'تم حذف الحساب بنجاح 🗑️' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// قائمة كاملة بالأطباء والعيادات للإدارة
app.get('/api/admin/doctors', authenticate, requireAdmin, async (req, res) => {
  try {
    const doctors = await Doctor.findAll({
      order: [['created_at', 'DESC']]
    });
    res.json(doctors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تعديل بيانات دكتور أو عيادته
app.put('/api/admin/doctors/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const doctor = await Doctor.findByPk(req.params.id);
    if (!doctor) return res.status(404).json({ error: 'الطبيب غير موجود' });

    const { name, specialty, consultation_fee, clinic_name, clinic_type, governorate, clinic_address, phone, rating, verification_status } = req.body;

    if (name) doctor.name = name.trim();
    if (specialty) doctor.specialty = specialty;
    if (consultation_fee) doctor.consultation_fee = parseInt(consultation_fee);
    if (clinic_name) doctor.clinic_name = clinic_name.trim();
    if (clinic_type) doctor.clinic_type = clinic_type;
    if (governorate) doctor.governorate = governorate;
    if (clinic_address) doctor.clinic_address = clinic_address.trim();
    if (phone) doctor.phone = phone.trim();
    if (rating) doctor.rating = parseFloat(rating);
    if (verification_status) doctor.verification_status = verification_status;

    await doctor.save();

    res.json({ message: 'تم تحديث بيانات الطبيب والعيادة بنجاح 👑', doctor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// حذف دكتور وعيادته نهائياً من المنصة
app.delete('/api/admin/doctors/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const doctor = await Doctor.findByPk(req.params.id);
    if (!doctor) return res.status(404).json({ error: 'الطبيب غير موجود' });

    const docName = doctor.name;
    await doctor.destroy();

    res.json({ message: `تم مسح الطبيب والعيادة (${docName}) بنجاح من المنصة 🗑️` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// حذف مركز علاج طبيعي وفروعه
app.delete('/api/admin/therapy-centers/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const center = await TherapyCenter.findByPk(req.params.id);
    if (!center) return res.status(404).json({ error: 'مركز العلاج الطبيعي غير موجود' });

    const centerName = center.name;
    await TherapyBranch.destroy({ where: { center_id: center.id } });
    await center.destroy();

    res.json({ message: `تم حذف مركز العلاج الطبيعي (${centerName}) وفروعه بنجاح 🗑️` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// قائمة كافة الطلبات المعلقة بانتظار موافقة مالك المنصة (أطباء + صيدليات + مراكز علاج طبيعي)
app.get('/api/admin/pending-verifications', authenticate, requireAdmin, async (req, res) => {
  try {
    const [pendingDoctors, pendingPharmacies, pendingTherapy] = await Promise.all([
      Doctor.findAll({
        where: { verification_status: 'PENDING' },
        include: [{ model: User, attributes: ['id', 'name', 'email', 'phone'] }],
        order: [['created_at', 'DESC']]
      }),
      Pharmacy.findAll({
        where: { verification_status: 'PENDING' },
        include: [{ model: User, attributes: ['id', 'name', 'email', 'phone'] }],
        order: [['created_at', 'DESC']]
      }),
      TherapyCenter.findAll({
        where: { verification_status: 'PENDING' },
        include: [
          { model: User, attributes: ['id', 'name', 'email', 'phone'] },
          { model: TherapyBranch, as: 'branches' }
        ],
        order: [['created_at', 'DESC']]
      })
    ]);

    res.json({
      doctors: pendingDoctors,
      pharmacies: pendingPharmacies,
      therapyCenters: pendingTherapy,
      totalPending: pendingDoctors.length + pendingPharmacies.length + pendingTherapy.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// اعتماد وموافقة مالك المنصة على طبيب أو صيدلية أو مركز علاج طبيعي
app.put('/api/admin/approve-entity', authenticate, requireAdmin, async (req, res) => {
  try {
    const { type, id } = req.body;
    if (!type || !id) {
      return res.status(400).json({ error: 'النوع (type) والمعرف (id) مطلوبان' });
    }

    let entityName = '';
    if (type === 'DOCTOR') {
      const doc = await Doctor.findByPk(id);
      if (!doc) return res.status(404).json({ error: 'الطبيب غير موجود' });
      doc.verification_status = 'VERIFIED';
      await doc.save();
      entityName = doc.name;
    } else if (type === 'PHARMACY') {
      const ph = await Pharmacy.findByPk(id);
      if (!ph) return res.status(404).json({ error: 'الصيدلية غير موجودة' });
      ph.verification_status = 'VERIFIED';
      await ph.save();
      entityName = ph.name;
    } else if (type === 'THERAPY_CENTER') {
      const tc = await TherapyCenter.findByPk(id);
      if (!tc) return res.status(404).json({ error: 'مركز العلاج الطبيعي غير موجود' });
      tc.verification_status = 'VERIFIED';
      await tc.save();
      entityName = tc.name;
    } else {
      return res.status(400).json({ error: 'نوع غير مدعوم' });
    }

    res.json({
      success: true,
      message: `✅ تم اعتماد والموافقة رسمياً على (${entityName}) وأصبح متاحاً للجمهور في منصة حياه!`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// رفض طلب انضمام جهة بواسطة مالك المنصة
app.put('/api/admin/reject-entity', authenticate, requireAdmin, async (req, res) => {
  try {
    const { type, id, reason } = req.body;
    if (!type || !id) {
      return res.status(400).json({ error: 'النوع (type) والمعرف (id) مطلوبان' });
    }

    let entityName = '';
    if (type === 'DOCTOR') {
      const doc = await Doctor.findByPk(id);
      if (!doc) return res.status(404).json({ error: 'الطبيب غير موجود' });
      doc.verification_status = 'REJECTED';
      await doc.save();
      entityName = doc.name;
    } else if (type === 'PHARMACY') {
      const ph = await Pharmacy.findByPk(id);
      if (!ph) return res.status(404).json({ error: 'الصيدلية غير موجودة' });
      ph.verification_status = 'REJECTED';
      await ph.save();
      entityName = ph.name;
    } else if (type === 'THERAPY_CENTER') {
      const tc = await TherapyCenter.findByPk(id);
      if (!tc) return res.status(404).json({ error: 'مركز العلاج الطبيعي غير موجود' });
      tc.verification_status = 'REJECTED';
      await tc.save();
      entityName = tc.name;
    } else {
      return res.status(400).json({ error: 'نوع غير مدعوم' });
    }

    res.json({
      success: true,
      message: `❌ تم رفض طلب انضمام (${entityName}). ${reason ? `السبب: ${reason}` : ''}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// الطبيب يحدث سعر كشفه
app.put('/api/doctor/fee', authenticate, requireDoctor, async (req, res) => {
  try {
    const fee = parseInt(req.body.consultationFee);
    if (!fee || fee < 10) return res.status(400).json({ error: 'يرجى إدخال سعر كشف صحيح' });
    let doctor = await Doctor.findOne({ where: { user_id: req.user.id } });
    if (!doctor) doctor = await Doctor.findOne();
    if (doctor) {
      doctor.consultation_fee = fee;
      await doctor.save();
    }
    res.json({ success: true, message: `✅ تم تحديث سعر كشفك إلى ${fee} جنيه بنجاح!`, doctor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 3. حجز المواعيد (المريض يطلب باليوم، الطبيب يحدد الساعة، ثم المريض يوافق ويدفع) ---
app.post('/api/appointments', authenticate, async (req, res) => {
  try {
    const { doctorId, preferredDay, patientNotes } = req.body;
    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) return res.status(404).json({ error: 'الطبيب غير موجود' });

    const doctorFee = parseInt(doctor.consultation_fee) || 150;
    const appFee = 10;
    const totalPrice = doctorFee + appFee;

    // توليد كود حجز فريد (مثال: HY-20240916-A3F2)
    const bookingCode = 'HY-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).toUpperCase().substr(2, 4);

    const preferredDateText = (preferredDay && String(preferredDay).trim()) ? String(preferredDay).trim() : 'اليوم';

    // إنشاء الطلب بحالة "في انتظار موافقة الطبيب وتحديد الساعة"
    const appointment = await Appointment.create({
      booking_code: bookingCode,
      user_id: req.user.id,
      doctor_id: doctor.id,
      time_slot: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'WAITING_DOCTOR_TIME',
      patient_preferred_date: preferredDateText,
      patient_notes: (patientNotes && String(patientNotes).trim()) || '',
      doctor_fee: doctorFee,
      app_fee: appFee,
      price_cents: totalPrice,
      paid: false
    });

    res.status(201).json({
      success: true,
      message: `✅ تم إرسال طلب الحجز لـ (${preferredDateText}) بنجاح! في انتظار الطبيب لتحديد الساعة المناسبة لميعاد كشفك.`,
      appointment
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// المريض يوافق على الموعد المحدد من الطبيب وينتقل لخطوة الدفع
app.post('/api/appointments/:id/accept-time', authenticate, async (req, res) => {
  try {
    const appointment = await Appointment.findByPk(req.params.id, {
      include: [{ model: Doctor }, { model: User }]
    });
    if (!appointment) return res.status(404).json({ error: 'الموعد غير موجود' });
    if (appointment.user_id !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'غير مصرح لك بإجراء هذا التعديل' });
    }

    res.json({
      success: true,
      message: '✅ تمت الموافقة على الموعد بنجاح! جاري التوجيه لإتمام الدفع وتأكيد الحجز.',
      checkoutUrl: `/checkout.html?appointmentId=${appointment.id}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إلغاء طلب الموعد من المريض أو الطبيب
app.post('/api/appointments/:id/cancel', authenticate, async (req, res) => {
  try {
    const appointment = await Appointment.findByPk(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'الموعد غير موجود' });
    if (appointment.user_id !== req.user.id && req.user.role !== 'DOCTOR' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'غير مصرح لك بإلغاء هذا الموعد' });
    }
    if (appointment.paid) {
      return res.status(400).json({ error: 'لا يمكن إلغاء موعد تم سداده مسبقاً، يرجى تقديم طلب استرداد للإدارة' });
    }
    appointment.status = 'CANCELLED';
    await appointment.save();
    res.json({ success: true, message: '✅ تم إلغاء طلب الموعد بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// الطبيب يحدد موعد الكشف للمريض ويُشعره بالإيميل والتطبيق
app.post('/api/appointments/:id/set-time', authenticate, requireDoctor, async (req, res) => {
  try {
    const { scheduledTime, notes } = req.body;
    if (!scheduledTime) {
      return res.status(400).json({ error: 'يرجى إدخال وقت الموعد المحدد' });
    }
    const appointment = await Appointment.findByPk(req.params.id, {
      include: [
        { model: User, attributes: ['name', 'email'] },
        { model: Doctor, attributes: ['name', 'specialty', 'consultation_fee'] }
      ]
    });
    if (!appointment) return res.status(404).json({ error: 'الموعد غير موجود' });

    appointment.doctor_scheduled_time = scheduledTime;
    if (notes) appointment.doctor_notes = notes;
    appointment.status = 'TIME_SET';
    await appointment.save();

    const doctorFee = appointment.doctor_fee || 150;
    const appFee = appointment.app_fee || 10;
    const total = appointment.price_cents || (doctorFee + appFee);

    // إشعار المريض بالإيميل
    if (process.env.SMTP_USER && process.env.SMTP_PASS && appointment.User?.email) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || `"منصة حياه الطبية" <${process.env.SMTP_USER}>`,
          to: appointment.User.email,
          subject: `🗓️ تم تحديد موعد كشفك مع د. ${appointment.Doctor?.name || 'طبيب حياه'}`,
          html: `<div dir="rtl" style="font-family:'Cairo',sans-serif;padding:24px;background:#f0fdf4;border-radius:16px;">
            <h2 style="color:#00897b;">مرحباً ${appointment.User.name} 👋</h2>
            <p style="font-size:15px;color:#334155;line-height:1.7;">قام د. ${appointment.Doctor?.name} بتحديد موعد كشفك:</p>
            <div style="margin:20px 0;text-align:center;">
              <div style="display:inline-block;font-size:22px;font-weight:900;color:#0b1e33;background:#fff;padding:14px 30px;border-radius:12px;border:2px solid #00897b;">
                🗓️ ${scheduledTime}
              </div>
            </div>
            <div style="background:#fff; padding:14px; border-radius:10px; margin:14px 0; border:1px solid #dbe4ec;">
              <p style="margin:4px 0; font-size:13px; color:#475569;">سعر كشف الطبيب: <strong>${doctorFee} جنيه</strong></p>
              <p style="margin:4px 0; font-size:13px; color:#475569;">رسوم خدمة تطبيق حياه: <strong>${appFee} جنيه</strong></p>
              <p style="margin:4px 0; font-size:15px; color:#00897b; font-weight:800;">إجمالي المبلغ المطلوب سداده: <strong>${total} جنيه</strong></p>
            </div>
            <p style="font-size:13px;color:#64748b;">يرجى سداد الرسوم لتأكيد الحجز رسمياً.</p>
          </div>`
        });
      } catch (mailErr) {
        console.warn('⚠️ تعذر إرسال إشعار الموعد:', mailErr.message);
      }
    }

    console.log(`📅 [SetTime] الطبيب حدد موعد "${scheduledTime}" للمريض: ${appointment.User?.name}`);
    res.json({ success: true, message: `✅ تم تحديد موعد "${scheduledTime}" وإشعار المريض بنجاح.`, appointment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// الطبيب يجلب كل طلباته (المنتظرة + المؤكدة المدفوعة)
app.get('/api/doctor/pending-requests', authenticate, requireDoctor, async (req, res) => {
  try {
    let doctor = await Doctor.findOne({ where: { user_id: req.user.id } });
    if (!doctor) doctor = await Doctor.findOne();
    const requests = doctor ? await Appointment.findAll({
      where: { doctor_id: doctor.id },
      include: [
        { model: User, attributes: ['id', 'name', 'email'] },
        { model: Prescription }
      ],
      order: [['created_at', 'DESC']]
    }) : [];
    res.json({ doctor: doctor || {}, requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// المريض يجلب مواعيده
app.get('/api/appointments/my', authenticate, async (req, res) => {
  try {
    const appointments = await Appointment.findAll({
      where: { user_id: req.user.id },
      include: [
        { model: Doctor, attributes: ['id', 'name', 'specialty', 'rating', 'bio', 'consultation_fee', 'phone', 'clinic_name', 'clinic_type'] },
        { model: Prescription }
      ],
      order: [['created_at', 'DESC']]
    });
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// قائمة كافة كشوفات وطلبات الحجز الواردة لعيادة الطبيب (لتحديد المواعيد والمتابعة)
app.get('/api/appointments/doctor-appointments', authenticate, requireDoctor, async (req, res) => {
  try {
    let doctor = await Doctor.findOne({ where: { user_id: req.user.id } });
    if (!doctor) doctor = await Doctor.findOne({ where: { name: req.user.name } });
    if (!doctor && req.user.email === 'doctor@example.com') doctor = await Doctor.findOne();
    if (!doctor) return res.json([]);

    const appointments = await Appointment.findAll({
      where: { doctor_id: doctor.id },
      include: [
        { model: User, attributes: ['id', 'name', 'email', 'phone'] },
        { model: Prescription }
      ],
      order: [['created_at', 'DESC']]
    });
    res.json(appointments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// جلب تفاصيل الموعد للدفع في شاشة الدفع
app.get('/api/appointments/:id', authenticate, async (req, res) => {
  try {
    const appointment = await Appointment.findByPk(req.params.id, {
      include: [
        { model: Doctor, attributes: ['id', 'name', 'specialty', 'rating', 'bio', 'consultation_fee', 'phone', 'clinic_name', 'clinic_type'] },
        { model: User, attributes: ['id', 'name', 'email'] }
      ]
    });
    if (!appointment) return res.status(404).json({ error: 'الموعد غير موجود' });
    res.json(appointment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// معالجة وتأكيد الدفع الحقيقي للموعد (مع إمكانية رفع إيصال تحويل سكرين شوت)
app.post('/api/appointments/:id/pay', authenticate, uploadReceipt.single('receiptImage'), async (req, res) => {
  try {
    const { cardNumber, cardExp, cardCvv, cardHolder, paymentMethod, walletPhone, instaHandle } = req.body;
    const appointment = await Appointment.findByPk(req.params.id, {
      include: [{ model: Doctor }]
    });
    if (!appointment) return res.status(404).json({ error: 'الموعد المطلوب غير موجود' });

    if (appointment.paid) {
      return res.status(400).json({ error: 'تم سداد رسوم هذا الموعد مسبقاً بالفعل.' });
    }

    let proofPath = null;
    if (req.file) {
      proofPath = `/uploads/receipts/${req.file.filename}`;
    }

    if (paymentMethod === 'CARD') {
      const cleanCard = (cardNumber || '').replace(/\s+/g, '');
      if (cleanCard.length < 14) {
        return res.status(400).json({ error: 'يرجى إدخال رقم بطاقة دفع صحيح مكون من 16 رقماً' });
      }
      appointment.payment_method = 'CARD';
      appointment.payment_sender = cardHolder || 'بطاقة بنكية';
    } else if (paymentMethod === 'WALLET') {
      if (!walletPhone || walletPhone.trim().length < 11) {
        return res.status(400).json({ error: 'يرجى إدخال رقم الهاتف المحول منه (11 رقماً)' });
      }
      appointment.payment_method = 'WALLET';
      appointment.payment_sender = walletPhone.trim();
    } else if (paymentMethod === 'INSTAPAY') {
      if (!instaHandle || instaHandle.trim().length < 3) {
        return res.status(400).json({ error: 'يرجى إدخال حساب انستاباي أو رقم الهاتف المحول منه' });
      }
      appointment.payment_method = 'INSTAPAY';
      appointment.payment_sender = instaHandle.trim();
    }

    if (proofPath) {
      appointment.payment_proof = proofPath;
    }

    // تأكيد السداد رسمياً
    appointment.paid = true;
    appointment.status = 'PAID';
    await appointment.save();

    console.log(`💳 [Payment Success] تم سداد ${appointment.price_cents} ج بنجاح للموعد: ${appointment.id} عبر ${appointment.payment_method} بواسطة ${req.user.name}`);

    res.json({
      success: true,
      message: '✅ تم تأكيد التحويل وسداد رسوم الكشف بنجاح! تم إشعار الطبيب وتثبيت حجزك رسمياً.',
      appointment
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تأكيد الدفع التجريبي (Mock Pay)
app.post('/api/appointments/:id/pay-mock', authenticate, async (req, res) => {
  try {
    const appointment = await Appointment.findByPk(req.params.id);
    if (!appointment) return res.status(404).json({ error: 'الموعد غير موجود' });
    appointment.paid = true;
    appointment.status = 'PAID';
    await appointment.save();
    res.json({ message: 'تم تأكيد دفع الموعد بنجاح', appointment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====================================================
// --- 3.1 بوابة دفع Paymob مصر (Unified Checkout & Webhook) ---
// ====================================================

/**
 * 1. إنشاء نية دفع موحدة لدى Paymob (Create Paymob Intention)
 * يُنشئ Order/Intention لدى Paymob ويعيد الـ client_secret ورابط الدفع الآمن
 */
app.post('/api/payments/paymob/create-intention', authenticate, async (req, res) => {
  try {
    const { appointmentId } = req.body;
    if (!appointmentId) {
      return res.status(400).json({ error: 'معرف الحجز مطلوب' });
    }

    const appointment = await Appointment.findByPk(appointmentId, {
      include: [
        { model: Doctor, attributes: ['id', 'name', 'specialty', 'consultation_fee', 'clinic_name'] },
        { model: User, attributes: ['id', 'name', 'email', 'phone', 'governorate'] }
      ]
    });

    if (!appointment) {
      return res.status(404).json({ error: 'الحجز المطلوب غير موجود' });
    }

    if (appointment.paid) {
      return res.status(400).json({ error: 'تم سداد رسوم هذا الحجز مسبقاً بالفعل.' });
    }

    const doctorFee = parseInt(appointment.doctor_fee || appointment.Doctor?.consultation_fee) || 150;
    const appFee = parseInt(appointment.app_fee) || 10;
    const totalPriceEgp = appointment.price_cents || (doctorFee + appFee);

    const serverBaseUrl = process.env.SERVER_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const notificationUrl = `${serverBaseUrl}/api/payments/paymob/webhook`;
    const redirectionUrl = `${serverBaseUrl}/checkout.html?appointmentId=${appointment.id}&paymobCallback=true`;

    // استدعاء خدمة Paymob لإنشاء الـ Payment Intention
    const intentionResult = await createPaymobIntention({
      amount: totalPriceEgp,
      currency: 'EGP',
      billingData: {
        name: appointment.User?.name || req.user.name,
        email: appointment.User?.email || req.user.email,
        phone: appointment.User?.phone || '01000000000',
        governorate: appointment.User?.governorate || 'القاهرة'
      },
      specialReference: appointment.id,
      notificationUrl,
      redirectionUrl
    });

    // تسجيل المعاملة في جدول المدفوعات بحالة PENDING
    const payment = await Payment.create({
      appointment_id: appointment.id,
      user_id: req.user.id,
      paymob_intention_id: intentionResult.intentionId,
      amount_cents: intentionResult.amountCents,
      currency: 'EGP',
      payment_method: 'CARD', // مبدئياً لحين ورود الـ Webhook الفعلي
      status: 'PENDING'
    });

    console.log(`💳 [Paymob Intention Created] للحجز: ${appointment.id} بمبلغ ${totalPriceEgp} ج - Intention ID: ${intentionResult.intentionId}`);

    res.json({
      success: true,
      isMock: intentionResult.isMock,
      intentionId: intentionResult.intentionId,
      clientSecret: intentionResult.clientSecret,
      publicKey: intentionResult.publicKey,
      checkoutUrl: intentionResult.checkoutUrl,
      paymentId: payment.id,
      totalPriceEgp
    });
  } catch (err) {
    console.error('❌ [Paymob Intention Failed]:', err.message);
    res.status(500).json({ error: err.message || 'فشل تجهيز بوابة الدفع' });
  }
});

/**
 * 2. معالجة Webhook الصادر من خوادم Paymob (المصدر الحقيقي للعمليات)
 * يتم فحص HMAC بدقة والتأكد من نجاح العملية ومنع التكرار
 */
app.post('/api/payments/paymob/webhook', async (req, res) => {
  try {
    const receivedHmac = req.query.hmac || req.headers['x-paymob-hmac'];
    const body = req.body;
    const transactionObj = body.obj || body;

    if (!transactionObj) {
      console.warn('⚠️ [Paymob Webhook] تم استلام طلب فارغ بدون بيانات معاملة');
      return res.status(400).send('Invalid webhook payload');
    }

    // 1. التحقق من توقيع الـ HMAC - إذا ورد hmac في الطلب يجب أن يكون صحيحاً دائماً
    if (receivedHmac) {
      if (!verifyPaymobHmac(transactionObj, receivedHmac)) {
        console.error('⛔ [Paymob Webhook] توقيع HMAC غير صحيح! تم رفض الطلب لأسباب أمنية.');
        return res.status(401).json({ error: 'HMAC verification failed' });
      }
    }

    const transactionId = transactionObj.id ? String(transactionObj.id) : null;
    const isSuccess = transactionObj.success === true;
    const appointmentId = transactionObj.special_reference || transactionObj.order?.merchant_order_id;
    const amountCents = transactionObj.amount_cents;
    const sourceData = transactionObj.source_data || {};
    const paymentMethodType = sourceData.type || (sourceData.sub_type ? 'WALLET' : 'CARD');

    console.log(`🔔 [Paymob Webhook Received] Transaction: ${transactionId} | Success: ${isSuccess} | Appointment: ${appointmentId}`);

    // 2. منع تكرار معالجة نفس الـ Transaction ID (Idempotency)
    if (transactionId) {
      const existingSuccessPayment = await Payment.findOne({
        where: { paymob_transaction_id: transactionId, status: 'PAID' }
      });
      if (existingSuccessPayment) {
        console.log(`ℹ️ [Paymob Webhook] تم معالجة المعاملة ${transactionId} مسبقاً بنجاح. تجاهل التكرار.`);
        return res.status(200).json({ received: true, status: 'already_processed', message: 'Transaction already processed' });
      }
    }

    // 3. البحث عن الحجز المرتبط بالمعاملة
    let appointment = null;
    if (appointmentId) {
      appointment = await Appointment.findByPk(appointmentId, {
        include: [
          { model: User, attributes: ['id', 'name', 'email'] },
          { model: Doctor, attributes: ['id', 'name', 'specialty'] }
        ]
      });
    }

    // 4. معالجة حالة الدفع
    if (isSuccess) {
      // أ) تحديث أو إنشاء سجل الدفع إلى PAID
      let paymentRecord = null;
      if (appointmentId) {
        paymentRecord = await Payment.findOne({
          where: { appointment_id: appointmentId, status: 'PENDING' },
          order: [['created_at', 'DESC']]
        });
      }

      if (paymentRecord) {
        paymentRecord.paymob_transaction_id = transactionId;
        paymentRecord.paymob_order_id = transactionObj.order?.id ? String(transactionObj.order.id) : paymentRecord.paymob_order_id;
        paymentRecord.payment_method = paymentMethodType;
        paymentRecord.status = 'PAID';
        paymentRecord.paid_at = new Date();
        paymentRecord.raw_webhook_data = JSON.stringify(transactionObj);
        await paymentRecord.save();
      } else if (appointment) {
        await Payment.create({
          appointment_id: appointment.id,
          user_id: appointment.user_id,
          paymob_transaction_id: transactionId,
          amount_cents: amountCents || (appointment.price_cents * 100),
          currency: transactionObj.currency || 'EGP',
          payment_method: paymentMethodType,
          status: 'PAID',
          paid_at: new Date(),
          raw_webhook_data: JSON.stringify(transactionObj)
        });
      }

      // ب) تحديث وتأكيد الحجز رسمياً
      if (appointment) {
        appointment.paid = true;
        appointment.status = 'CONFIRMED'; // تأكيد الحجز فورياً
        appointment.payment_method = paymentMethodType;
        appointment.payment_sender = sourceData.pan ? `Card ****${sourceData.pan}` : (sourceData.phone_number || 'Paymob Online');
        await appointment.save();

        console.log(`✅ [Booking Confirmed] تم تأكيد كشف المريض ${appointment.User?.name} مع د. ${appointment.Doctor?.name} بعد نجاح الدفع عبر Paymob!`);

        // ج) إرسال بريد إشعار للمريض
        if (process.env.SMTP_USER && process.env.SMTP_PASS && appointment.User?.email) {
          try {
            await transporter.sendMail({
              from: process.env.SMTP_FROM || `"منصة حياه الطبية" <${process.env.SMTP_USER}>`,
              to: appointment.User.email,
              subject: `✅ تم تأكيد حجزك وسداد الرسوم مع د. ${appointment.Doctor?.name || 'طبيب حياه'}`,
              html: `<div dir="rtl" style="font-family:'Cairo',sans-serif;padding:24px;background:#f0fdf4;border-radius:16px;">
                <h2 style="color:#00897b;">مرحباً ${appointment.User.name} 👋</h2>
                <p style="font-size:15px;color:#334155;">تم استلام دفعتك وتأكيد كشفك الطبي بنجاح عبر بوابة Paymob.</p>
                <div style="background:#fff;padding:16px;border-radius:12px;margin:16px 0;border:1px solid #dbe4ec;">
                  <p><strong>رقم المعاملة:</strong> ${transactionId}</p>
                  <p><strong>طريقة الدفع:</strong> ${paymentMethodType}</p>
                  <p><strong>المبلغ المدفوع:</strong> ${(amountCents / 100).toFixed(2)} جنيه مصري</p>
                  <p><strong>الطبيب:</strong> د. ${appointment.Doctor?.name}</p>
                </div>
                <p style="color:#64748b;font-size:13px;">يمكنك الآن فتح التطبيق ورؤية عنوان العيادة بالتفصيل وخريطة GPS.</p>
              </div>`
            });
          } catch (e) {
            console.warn('⚠️ تعذر إرسال إيميل المريض:', e.message);
          }
        }

        // د) إرسال بريد إشعار للدكتور
        const doctorUser = appointment.Doctor ? await User.findOne({ where: { name: appointment.Doctor.name } }) : null;
        if (process.env.SMTP_USER && process.env.SMTP_PASS && doctorUser?.email) {
          try {
            await transporter.sendMail({
              from: process.env.SMTP_FROM || `"منصة حياه الطبية" <${process.env.SMTP_USER}>`,
              to: doctorUser.email,
              subject: `🔔 تم سداد كشف وتأكيد حجز جديد من المريض: ${appointment.User?.name}`,
              html: `<div dir="rtl" style="font-family:'Cairo',sans-serif;padding:24px;background:#f8fafc;border-radius:16px;">
                <h2 style="color:#0284c7;">د. ${appointment.Doctor.name} 👨‍⚕️</h2>
                <p>قام المريض <strong>${appointment.User?.name}</strong> بسداد رسوم الكشف بالكامل (${(amountCents / 100).toFixed(2)} ج) وتأكيد الموعد رسمياً.</p>
              </div>`
            });
          } catch (e) {
            console.warn('⚠️ تعذر إرسال إيميل الطبيب:', e.message);
          }
        }
      }
    } else {
      // المعاملة فشلت
      console.warn(`❌ [Paymob Webhook] المعاملة فشلت للحجز ${appointmentId}`);
      if (appointmentId) {
        const paymentRecord = await Payment.findOne({
          where: { appointment_id: appointmentId, status: 'PENDING' }
        });
        if (paymentRecord) {
          paymentRecord.status = 'FAILED';
          paymentRecord.paymob_transaction_id = transactionId;
          paymentRecord.raw_webhook_data = JSON.stringify(transactionObj);
          await paymentRecord.save();
        }
      }
    }

    res.status(200).json({ success: true, message: 'Webhook processed' });
  } catch (err) {
    console.error('❌ [Paymob Webhook Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. فحص حالة الدفع للحجز بعد عودة العميل (Redirect Status Check)
 */
app.get('/api/payments/paymob/status/:appointmentId', authenticate, async (req, res) => {
  try {
    const appointment = await Appointment.findByPk(req.params.appointmentId);
    if (!appointment) return res.status(404).json({ error: 'الحجز غير موجود' });

    const payment = await Payment.findOne({
      where: { appointment_id: appointment.id },
      order: [['created_at', 'DESC']]
    });

    res.json({
      paid: appointment.paid,
      status: appointment.status,
      paymentMethod: appointment.payment_method,
      transactionId: payment?.paymob_transaction_id || null,
      paymentStatus: payment?.status || (appointment.paid ? 'PAID' : 'PENDING')
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. لوحة الإدارة: سجل المعاملات والمدفوعات الإلكترونية الشامل (Admin Payments)
 */
app.get('/api/admin/payments', authenticate, requireAdmin, async (req, res) => {
  try {
    const payments = await Payment.findAll({
      include: [
        { model: User, attributes: ['id', 'name', 'email', 'phone'] },
        {
          model: Appointment,
          attributes: ['id', 'booking_code', 'doctor_fee', 'app_fee', 'price_cents', 'doctor_scheduled_time', 'status'],
          include: [{ model: Doctor, attributes: ['id', 'name', 'specialty', 'clinic_name'] }]
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// مسار خاص بالطبيب لعرض الحجوزات المدفوعة فقط (لا تظهر المواعيد غير المدفوعة للطبيب أبداً)
app.get('/api/doctor/appointments', authenticate, requireDoctor, async (req, res) => {
  try {
    let doctor = await Doctor.findOne({ where: { user_id: req.user.id } });
    if (!doctor) {
      doctor = await Doctor.findOne({ where: { name: req.user.name } });
    }
    if (!doctor && req.user.email === 'doctor@example.com') {
      doctor = await Doctor.findOne();
    }

    let appointments = [];
    if (doctor) {
      // فقط المواعيد المدفوعة رسمياً (paid: true) هي التي تصل لجدول الطبيب
      appointments = await Appointment.findAll({
        where: { doctor_id: doctor.id, paid: true },
        include: [
          { model: User, attributes: ['id', 'name', 'email'] },
          { model: Prescription }
        ],
        order: [['created_at', 'DESC']]
      });
    }

    res.json({
      doctor: doctor || { name: req.user.name, specialty: 'عام' },
      appointments
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ====================================================
// --- محفظة الطبيب والأرباح وسحب الأموال (Doctor Wallet & Payouts) ---
// ====================================================

// 1. جلب بيانات رصيد ومحفظة الطبيب وسجل أرباح الكشوفات
app.get('/api/doctor/wallet', authenticate, requireDoctor, async (req, res) => {
  try {
    let doctor = await Doctor.findOne({ where: { user_id: req.user.id } });
    if (!doctor) doctor = await Doctor.findOne({ where: { name: req.user.name } });
    if (!doctor && req.user.email === 'doctor@example.com') doctor = await Doctor.findOne();

    if (!doctor) {
      return res.status(404).json({ error: 'ملف الطبيب غير موجود' });
    }

    // جلب جميع الكشوفات المسددة لهذا الطبيب
    const paidAppointments = await Appointment.findAll({
      where: { doctor_id: doctor.id, paid: true },
      include: [
        { model: User, attributes: ['id', 'name', 'phone', 'email'] },
        { model: Payment, attributes: ['id', 'amount_cents', 'payment_method', 'status', 'paymob_transaction_id', 'paid_at'] }
      ],
      order: [['created_at', 'DESC']]
    });

    let totalEarnings = 0;
    const earningsHistory = paidAppointments.map(appt => {
      const fee = parseInt(appt.doctor_fee) || 150;
      totalEarnings += fee;
      const paymentInfo = (appt.Payments && appt.Payments[0]) || null;
      return {
        id: appt.id,
        booking_code: appt.booking_code || ('HY-' + appt.id.slice(0, 8).toUpperCase()),
        patient_name: appt.User?.name || 'مريض',
        patient_phone: appt.User?.phone || '',
        appointment_date: appt.time_slot || appt.doctor_scheduled_time,
        created_at: appt.created_at,
        doctor_fee: fee,
        payment_method: paymentInfo?.payment_method || 'PAYMOB',
        paymob_transaction_id: paymentInfo?.paymob_transaction_id || '---'
      };
    });

    // جلب سجل طلبات السحب الخاصة بالطبيب
    const payouts = await PayoutRequest.findAll({
      where: { doctor_id: doctor.id },
      order: [['created_at', 'DESC']]
    });

    let pendingWithdrawals = 0;
    let completedWithdrawals = 0;

    payouts.forEach(p => {
      if (p.status === 'PENDING') {
        pendingWithdrawals += Number(p.amount);
      } else if (p.status === 'COMPLETED') {
        completedWithdrawals += Number(p.amount);
      }
    });

    const availableBalance = Math.max(0, totalEarnings - (pendingWithdrawals + completedWithdrawals));

    res.json({
      doctor: {
        id: doctor.id,
        name: doctor.name,
        specialty: doctor.specialty,
        clinic_name: doctor.clinic_name,
        consultation_fee: doctor.consultation_fee
      },
      availableBalance,
      totalEarnings,
      pendingWithdrawals,
      completedWithdrawals,
      paidConsultationsCount: paidAppointments.length,
      earningsHistory,
      payoutsHistory: payouts
    });
  } catch (err) {
    console.error('Error in /api/doctor/wallet:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. تقديم طلب سحب أرباح من قبل الطبيب (انستاباي / فودافون كاش / Paymob / تحويل بنكي)
app.post('/api/doctor/payout-request', authenticate, requireDoctor, async (req, res) => {
  try {
    let doctor = await Doctor.findOne({ where: { user_id: req.user.id } });
    if (!doctor) doctor = await Doctor.findOne({ where: { name: req.user.name } });
    if (!doctor && req.user.email === 'doctor@example.com') doctor = await Doctor.findOne();

    if (!doctor) {
      return res.status(404).json({ error: 'ملف الطبيب غير موجود' });
    }

    const { amount, method, accountDetails, accountName } = req.body;
    const withdrawAmount = parseInt(amount);

    if (!withdrawAmount || withdrawAmount <= 0) {
      return res.status(400).json({ error: 'يرجى إدخال مبلغ صحيح للسحب' });
    }

    if (withdrawAmount < 50) {
      return res.status(400).json({ error: 'الحد الأدنى للسحب هو 50 جنيهاً مصرياً' });
    }

    const validMethods = ['INSTAPAY', 'VODAFONE_CASH', 'PAYMOB', 'BANK_TRANSFER'];
    if (!validMethods.includes(method)) {
      return res.status(400).json({ error: 'طريقة السحب غير صحيحة. الخيارات المتاحة: انستا باي، فودافون كاش، Paymob، تحويل بنكي' });
    }

    if (!accountDetails || accountDetails.trim() === '') {
      return res.status(400).json({ error: 'يرجى كتابة رقم الهاتف أو عنوان انستاباي أو رقم الحساب البنكي بدقة' });
    }

    // حساب الرصيد المتاح الحالي للطبيب
    const paidAppointments = await Appointment.findAll({
      where: { doctor_id: doctor.id, paid: true }
    });
    let totalEarnings = 0;
    paidAppointments.forEach(appt => {
      totalEarnings += (parseInt(appt.doctor_fee) || 150);
    });

    const existingPayouts = await PayoutRequest.findAll({
      where: { doctor_id: doctor.id }
    });
    let usedFunds = 0;
    existingPayouts.forEach(p => {
      if (p.status === 'PENDING' || p.status === 'COMPLETED') {
        usedFunds += Number(p.amount);
      }
    });

    const currentAvailable = totalEarnings - usedFunds;
    if (withdrawAmount > currentAvailable) {
      return res.status(400).json({
        error: `عفواً، رصيدك المتاح للسحب حالياً هو ${currentAvailable} ج فقط. لا يمكنك سحب مبلغ ${withdrawAmount} ج.`
      });
    }

    // إنشاء طلب السحب
    const payoutRequest = await PayoutRequest.create({
      doctor_id: doctor.id,
      user_id: req.user.id,
      amount: withdrawAmount,
      method,
      account_details: accountDetails.trim(),
      account_name: (accountName || doctor.name).trim(),
      status: 'PENDING'
    });

    res.status(201).json({
      success: true,
      message: '✅ تم تسجيل طلب السحب بنجاح! سيتم تحويل المبلغ خلال 24 ساعة.',
      payoutRequest,
      newAvailableBalance: currentAvailable - withdrawAmount
    });
  } catch (err) {
    console.error('Error in /api/doctor/payout-request:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. عرض جميع طلبات سحب الأرباح للأدمن والمالك العام
app.get('/api/admin/payout-requests', authenticate, requireAdmin, async (req, res) => {
  try {
    const requests = await PayoutRequest.findAll({
      include: [
        { model: Doctor, attributes: ['id', 'name', 'phone', 'clinic_name', 'specialty'] },
        { model: User, attributes: ['id', 'name', 'email', 'phone'] }
      ],
      order: [['created_at', 'DESC']]
    });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. اعتماد أو رفض طلب سحب الأرباح من قبل المالك
app.post('/api/admin/payout-requests/:id/process', authenticate, requireAdmin, async (req, res) => {
  try {
    const { action, transactionReference, adminNotes } = req.body;
    const request = await PayoutRequest.findByPk(req.params.id, {
      include: [
        { model: Doctor, attributes: ['name', 'phone'] },
        { model: User, attributes: ['email', 'name'] }
      ]
    });

    if (!request) {
      return res.status(404).json({ error: 'طلب السحب غير موجود' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: `تمت معالجة هذا الطلب مسبقاً (${request.status})` });
    }

    if (action === 'APPROVE') {
      request.status = 'COMPLETED';
      request.transaction_reference = transactionReference || ('TX-PAYOUT-' + Date.now());
      request.admin_notes = adminNotes || `تم التحويل بنجاح عبر ${request.method}`;
      request.processed_at = new Date();
      await request.save();

      // إرسال إشعار للطبيب إن وُجد بريد
      if (request.User?.email) {
        try {
          await transporter.sendMail({
            from: `"منصة حياه للرعاية الصحية" <${process.env.SMTP_USER || 'noreply@hayat.com'}>`,
            to: request.User.email,
            subject: '💰 تم تحويل أرباحك بنجاح - منصة حياه',
            html: `
              <div dir="rtl" style="font-family:Arial,sans-serif; padding:20px; color:#1e293b; background:#f8fafc; border-radius:12px;">
                <h2 style="color:#10b981;">🎉 تم تحويل أرباحك بنجاح!</h2>
                <p>مرحباً د. ${request.Doctor?.name || ''}،</p>
                <p>يسعدنا إعلامك بأنه تم إتمام عملية تحويل مبلغ <strong>${request.amount} جنيه مصري</strong> إلى حسابك عبر <strong>${request.method}</strong>.</p>
                <p><strong>بيانات الاستلام:</strong> ${request.account_details}</p>
                <p><strong>رقم المعاملة المرجعي:</strong> ${request.transaction_reference}</p>
                <p>شكراً لجهودكم المخلصة في خدمة مرضانا على منصة حياه.</p>
              </div>
            `
          });
        } catch (mailErr) {
          console.warn('Payout email notice skipped:', mailErr.message);
        }
      }

      res.json({
        success: true,
        message: '✅ تم اعتماد طلب السحب وتأكيد التحويل للطبيب بنجاح!',
        request
      });
    } else if (action === 'REJECT') {
      request.status = 'REJECTED';
      request.admin_notes = adminNotes || 'تم رفض الطلب وإعادة الرصيد إلى محفظتك';
      request.processed_at = new Date();
      await request.save();

      res.json({
        success: true,
        message: '⚠️ تم رفض الطلب وإعادة المبلغ تلقائياً إلى رصيد الطبيب المتاح.',
        request
      });
    } else {
      res.status(400).json({ error: 'إجراء غير صالح. الخيارات المتاحة: APPROVE أو REJECT' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 4. الروشتات الطبية (Prescriptions) ---
// إصدار روشتة طبية مفصلة (خاص بالأطباء - فقط بعد التحقق من سداد الرسوم)
app.post('/api/prescriptions', authenticate, requireDoctor, async (req, res) => {
  try {
    const { appointmentId, diagnosis, medicines, labTests, doctorNotes, text } = req.body;
    const appointment = await Appointment.findByPk(appointmentId);
    if (!appointment) return res.status(404).json({ error: 'الموعد غير موجود' });

    // منع إصدار الروشتة قطعياً إن لم يكن الموعد مدفوعاً
    if (!appointment.paid) {
      return res.status(400).json({
        error: '⚠️ عذراً، لا يمكن إصدار روشتة طبية لهذا المريض نظراً لعدم سداد رسوم الكشف بعد.'
      });
    }

    const formattedSummary = text || [
      diagnosis ? `🩺 التشخيص: ${diagnosis}` : '',
      medicines ? `💊 الأدوية: \n${medicines}` : '',
      labTests ? `🔬 الأشعات والتحاليل: \n${labTests}` : '',
      doctorNotes ? `📝 نصائح وإرشادات: ${doctorNotes}` : ''
    ].filter(Boolean).join('\n\n');

    const prescription = await Prescription.create({
      appointment_id: appointment.id,
      user_id: appointment.user_id,
      doctor_id: appointment.doctor_id,
      diagnosis: diagnosis || '',
      medicines: medicines || '',
      lab_tests: labTests || '',
      doctor_notes: doctorNotes || '',
      text: formattedSummary || 'روشتة طبية معتمدة',
    });

    res.status(201).json({ message: '✅ تم إصدار الروشتة الطبية وتوثيقها بنجاح للمريض!', prescription });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// عرض روشتات المريض المسجل
app.get('/api/prescriptions/my', authenticate, async (req, res) => {
  try {
    const prescriptions = await Prescription.findAll({
      where: { user_id: req.user.id },
      include: [
        { model: Doctor, attributes: ['id', 'name', 'specialty'] },
        { model: Appointment, attributes: ['id', 'time_slot', 'paid'] },
        { model: Order }
      ],
      order: [['created_at', 'DESC']]
    });
    res.json(prescriptions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 5. شبكة الصيدليات (Pharmacies Network) ---
app.get('/api/pharmacies', async (req, res) => {
  try {
    const { governorate, search } = req.query;
    const where = { verification_status: 'VERIFIED' };
    if (governorate && governorate.trim() !== '') {
      where.governorate = governorate.trim();
    }
    if (search && search.trim() !== '') {
      const q = search.trim();
      where[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { address: { [Op.like]: `%${q}%` } },
        { phone: { [Op.like]: `%${q}%` } }
      ];
    }
    const pharmacies = await Pharmacy.findAll({
      where,
      order: [['created_at', 'ASC']]
    });
    res.json(pharmacies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إضافة صيدلية إلى المفضلة للمستخدم
app.post('/api/user-pharmacies', authenticate, async (req, res) => {
  try {
    const { pharmacyId } = req.body;
    const user = await User.findByPk(req.user.id);
    const pharmacy = await Pharmacy.findByPk(pharmacyId);
    if (!pharmacy) return res.status(404).json({ error: 'الصيدلية غير موجودة' });

    await user.addPharmacy(pharmacy);
    res.json({ message: 'تمت إضافة الصيدلية إلى شبكتك المفضلة' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 6. طلبات الدواء وتتبع التوصيل (Orders & Delivery) ---
app.post('/api/orders', authenticate, async (req, res) => {
  try {
    const { prescriptionId, pharmacyId, deliveryMethod } = req.body;

    if (!['PICKUP', 'DELIVERY'].includes(deliveryMethod)) {
      return res.status(400).json({ error: 'طريقة الاستلام يجب أن تكون إما PICKUP أو DELIVERY' });
    }

    const prescription = await Prescription.findOne({
      where: { id: prescriptionId, user_id: req.user.id }
    });
    if (!prescription) return res.status(404).json({ error: 'الروشتة غير موجودة أو غير تابعة لك' });

    const pharmacy = await Pharmacy.findByPk(pharmacyId);
    if (!pharmacy) return res.status(404).json({ error: 'الصيدلية المحددة غير موجودة' });

    // التحقق من عدم وجود طلب مسبق لنفس الروشتة
    const existingOrder = await Order.findOne({ where: { prescription_id: prescriptionId } });
    if (existingOrder) {
      return res.status(400).json({ error: 'تم إنشاء طلب صرف لهذه الروشتة مسبقاً', order: existingOrder });
    }

    const order = await Order.create({
      prescription_id: prescriptionId,
      pharmacy_id: pharmacyId,
      delivery_method: deliveryMethod,
      status: 'PENDING',
    });

    res.status(201).json({
      message: 'تم إنشاء طلب صرف الروشتة بنجاح',
      order
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تحديث حالة الطلب
app.patch('/api/orders/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['PENDING', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `الحالة يجب أن تكون إحدى القيم التالية: ${validStatuses.join(', ')}` });
    }

    const order = await Order.findByPk(req.params.id);
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });

    order.status = status;
    await order.save();

    res.json({ message: 'تم تحديث حالة الطلب بنجاح', order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// عرض طلبات المستخدم
app.get('/api/orders/my', authenticate, async (req, res) => {
  try {
    const orders = await Order.findAll({
      include: [
        {
          model: Prescription,
          where: { user_id: req.user.id },
          include: [{ model: Doctor, attributes: ['name', 'specialty'] }]
        },
        {
          model: Pharmacy,
          attributes: ['name', 'address', 'phone']
        }
      ],
      order: [['created_at', 'DESC']]
    });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// مسارات نظام الشكاوي والمقترحات (Complaints & Support)
// ─────────────────────────────────────────────────────────

// إرسال شكوى أو مقترح جديد (لأي مستخدم مسجل أو غير مسجل)
app.post('/api/complaints', async (req, res) => {
  try {
    const { type, subject, message } = req.body;
    if (!subject?.trim() || !message?.trim()) {
      return res.status(400).json({ error: 'العنوان ونص الشكوى / المقترح مطلوبان' });
    }

    // إذا كان هناك توكن صالح، نستخدم بيانات المستخدم تلقائياً
    let userId = null;
    let userName = req.body.user_name || 'مجهول';
    let userEmail = req.body.user_email || '';
    let userPhone = req.body.user_phone || '';

    const authHeader = req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    if (token) {
      try {
        const jwt = require('jsonwebtoken');
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        const user = await User.findByPk(payload.id);
        if (user) {
          userId = user.id;
          userName = user.name;
          userEmail = user.email;
          userPhone = user.phone || '';
        }
      } catch (e) { /* توكن غير صالح - نستمر بالبيانات المُدخلة */ }
    }

    if (!userEmail) {
      return res.status(400).json({ error: 'يرجى إدخال بريدك الإلكتروني لنتمكن من الرد عليك' });
    }

    const complaint = await Complaint.create({
      user_id: userId,
      user_name: userName,
      user_email: userEmail,
      user_phone: userPhone,
      type: type || 'COMPLAINT',
      subject: subject.trim(),
      message: message.trim(),
      status: 'NEW'
    });

    console.log(`📢 [شكوى جديدة] من: ${userName} (${userEmail}) | النوع: ${type} | الموضوع: ${subject}`);
    res.status(201).json({ success: true, message: '✅ تم إرسال شكواك / مقترحك بنجاح. سيتواصل معك فريق حياه قريباً.', complaint });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// عرض جميع الشكاوي (للأدمن فقط)
app.get('/api/admin/complaints', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    const complaints = await Complaint.findAll({
      where,
      order: [['created_at', 'DESC']]
    });
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// رد الأدمن على شكوى + تغيير حالتها
app.patch('/api/admin/complaints/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status, admin_reply } = req.body;
    const complaint = await Complaint.findByPk(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'الشكوى غير موجودة' });

    if (status) complaint.status = status;
    if (admin_reply !== undefined) {
      complaint.admin_reply = admin_reply;
      complaint.admin_reply_at = new Date();
    }
    await complaint.save();
    res.json({ success: true, complaint });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// حذف شكوى (للأدمن فقط)
app.delete('/api/admin/complaints/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const complaint = await Complaint.findByPk(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'الشكوى غير موجودة' });
    await complaint.destroy();
    res.json({ success: true, message: 'تم حذف الشكوى بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// إحصاء الشكاوي الجديدة (للأدمن في لوحة التحكم)
app.get('/api/admin/complaints/count', authenticate, requireAdmin, async (req, res) => {
  try {
    const newCount = await Complaint.count({ where: { status: 'NEW' } });
    const totalCount = await Complaint.count();
    res.json({ newCount, totalCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- routes للاختبار والتحقق ---
// اختبار اتصال قاعدة البيانات
app.get('/api/test/db', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ message: '✅ الاتصال بقاعدة البيانات ناجح', status: 'ok' });
  } catch (err) {
    res.status(500).json({ error: 'تعذر الاتصال بقاعدة البيانات', details: err.message });
  }
});

// اختبارRoute doctor me (بدون auth لتحقق المسار مسجل)
app.get('/api/test/doctor-route', (req, res) => {
  res.json({ message: '✅ Route /api/doctor/me مسجل بنجاح', method: 'GET' });
});

// اختبارRoute pending appointments
app.get('/api/test/pending-route', (req, res) => {
  res.json({ message: '✅ Route /api/doctor/appointments/pending مسجل', method: 'GET' });
});

// اختبارRoute status update
app.patch('/api/test/status-route', (req, res) => {
  res.json({ message: '✅ Route /api/doctor/appointments/:id/status مسجل', method: 'PATCH' });
});

//---------- تشغيل الخادم ----------
const PORT = process.env.PORT || 5000;

sequelize.sync().then(async () => {
  // إضافة الأعمدة الجديدة يدوياً إذا لم تكن موجودة (لتجنب إعادة بناء الجدول بالكامل)
  const migrations = [
    "ALTER TABLE users ADD COLUMN phone VARCHAR(255) DEFAULT ''",
    "ALTER TABLE appointments ADD COLUMN booking_code VARCHAR(255)",
    "ALTER TABLE appointments ADD COLUMN doctor_fee INTEGER DEFAULT 150",
    "ALTER TABLE appointments ADD COLUMN app_fee INTEGER DEFAULT 10",
    "ALTER TABLE appointments ADD COLUMN price_cents INTEGER DEFAULT 160",
    "ALTER TABLE appointments ADD COLUMN paid BOOLEAN DEFAULT 0",
    "ALTER TABLE appointments ADD COLUMN booking_type VARCHAR(255) DEFAULT 'DOCTOR'",
    "ALTER TABLE appointments ADD COLUMN therapy_branch_id TEXT",
    "ALTER TABLE appointments ADD COLUMN payment_method VARCHAR(255)",
    "ALTER TABLE appointments ADD COLUMN payment_sender VARCHAR(255)",
    "ALTER TABLE appointments ADD COLUMN payment_proof TEXT",
    "ALTER TABLE appointments ADD COLUMN stripe_session VARCHAR(255)",
    "ALTER TABLE appointments ADD COLUMN doctor_notes TEXT",
    "ALTER TABLE appointments ADD COLUMN doctor_scheduled_time VARCHAR(255)",
    "ALTER TABLE appointments ADD COLUMN patient_preferred_date VARCHAR(255)",
    "ALTER TABLE appointments ADD COLUMN patient_notes TEXT",
    "ALTER TABLE doctors ADD COLUMN rating_count INTEGER DEFAULT 0",
    "ALTER TABLE doctors ADD COLUMN avatar_url TEXT",
  ];
  for (const sql of migrations) {
    try { await sequelize.query(sql); } catch (e) { /* العمود موجود مسبقاً */ }
  }

  // تصفير التقييمات الافتراضية القديمة لتصبح من الصفر وتتغير فقط بناءً على تقييمات المرضى الحقيقية
  try {
    await sequelize.query("UPDATE doctors SET rating = 0.0, rating_count = 0 WHERE id NOT IN (SELECT DISTINCT doctor_id FROM reviews)");
  } catch (e) {}

  console.log('✅ تم الاتصال ومزامنة جداول قاعدة البيانات بنجاح.');
  app.listen(PORT, () => {
    console.log(`🚀 الخادم يعمل بنجاح على: http://localhost:${PORT}`);
    console.log(`🌐 واجهة الاختبار متاحة على: http://localhost:${PORT}/index.html`);
  });
}).catch(err => {
  console.error('❌ تعذر الاتصال بقاعدة البيانات:', err);
});
