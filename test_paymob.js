// test_paymob.js
require('dotenv').config({ path: 'c:/Users/ywsfh/Downloads/AI/.env' });
const crypto = require('crypto');

const BASE_URL = 'http://localhost:5000';

async function runTests() {
  console.log('🧪 بدء فحص واختبار نظام دفع Paymob الشامل...');

  try {
    // 1. تسجيل دخول المريض
    console.log('\n1️⃣ تسجيل دخول المريض (patient@example.com)...');
    const loginRes = await fetch(BASE_URL + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'patient@example.com', password: 'password123' })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) throw new Error('فشل تسجيل دخول المريض: ' + JSON.stringify(loginData));
    const patientToken = loginData.token;
    console.log('   ✅ تم تسجيل الدخول بنجاح. معرف المريض:', loginData.user.id);

    // 2. جلب الأطباء لحجز موعد
    console.log('\n2️⃣ جلب الأطباء المتاحين...');
    const docsRes = await fetch(BASE_URL + '/api/doctors');
    const docs = await docsRes.json();
    if (!docs.length) throw new Error('لا يوجد أطباء في النظام');
    const doctor = docs[0];
    console.log('   ✅ تم العثور على الطبيب: ' + doctor.name + ' (الكشف: ' + doctor.consultation_fee + ' جنيه)');

    // 3. إنشاء حجز جديد
    console.log('\n3️⃣ إنشاء حجز جديد للطبيب...');
    const apptRes = await fetch(BASE_URL + '/api/appointments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + patientToken
      },
      body: JSON.stringify({
        doctorId: doctor.id,
        appointment_date: new Date(Date.now() + 86400000).toISOString(),
        consultation_type: 'ONLINE',
        notes: 'فحص تجريبي لنظام Paymob'
      })
    });
    const apptData = await apptRes.json();
    if (!apptRes.ok) throw new Error('فشل إنشاء الحجز: ' + JSON.stringify(apptData));
    const createdAppt = apptData.appointment;
    const appointmentId = createdAppt.id;
    console.log('   ✅ تم إنشاء الحجز بنجاح. معرف الحجز: ' + appointmentId + '، كود الحجز: ' + createdAppt.booking_code + '، الحالة الأولية: ' + createdAppt.status);

    // 4. إنشاء طلب Paymob Intention
    console.log('\n4️⃣ طلب إنشاء Paymob Payment Intention...');
    const intentionRes = await fetch(BASE_URL + '/api/payments/paymob/create-intention', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + patientToken
      },
      body: JSON.stringify({
        appointmentId: appointmentId
      })
    });
    const intentionData = await intentionRes.json();
    if (!intentionRes.ok) throw new Error('فشل إنشاء Intention: ' + JSON.stringify(intentionData));
    console.log('   ✅ نجح إنشاء Intention!');
    console.log('      - Intention ID: ' + intentionData.intentionId);
    console.log('      - Total Amount: ' + intentionData.totalPriceEgp + ' EGP');
    console.log('      - Checkout URL: ' + intentionData.checkoutUrl);

    // 5. محاكاة Webhook - اختبار رفض توقيع HMAC غير الصحيح
    console.log('\n5️⃣ اختبار أمان Webhook (توقيع HMAC غير صحيح)...');
    const mockTxId = 'TX_TEST_' + Date.now();
    const fakeWebhookPayload = {
      type: 'TRANSACTION',
      obj: {
        id: mockTxId,
        amount_cents: Math.round(intentionData.totalPriceEgp * 100),
        currency: 'EGP',
        success: true,
        order: { id: intentionData.orderId || 'ORD_9999' },
        special_reference: appointmentId,
        created_at: new Date().toISOString(),
        error_occured: false,
        has_parent_transaction: false,
        integration_id: 123456,
        is_3d_secure: true,
        is_auth: false,
        is_capture: false,
        is_refunded: false,
        is_standalone_payment: true,
        is_voided: false,
        owner: 1001,
        pending: false,
        source_data: { pan: '2345', sub_type: 'MasterCard', type: 'card' }
      }
    };

    const invalidHmacRes = await fetch(BASE_URL + '/api/payments/paymob/webhook?hmac=INVALID_HMAC_HASH', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fakeWebhookPayload)
    });
    console.log('   ✅ نتيجة اختبار الـ HMAC المزيف: HTTP ' + invalidHmacRes.status + ' (المتوقع 401: Unauthorized)');
    if (invalidHmacRes.status !== 401) {
      throw new Error('الخادم لم يرفض الـ HMAC غير الصحيح!');
    }

    // 6. حساب HMAC السليم وإرسال Webhook حقيقي
    console.log('\n6️⃣ إرسال Webhook مع حساب HMAC SHA-512 السليم...');
    const hmacSecret = process.env.PAYMOB_HMAC_SECRET || '';
    const obj = fakeWebhookPayload.obj;
    const concatenatedValues = [
      obj.amount_cents,
      obj.created_at,
      obj.currency,
      obj.error_occured,
      obj.has_parent_transaction,
      obj.id,
      obj.integration_id,
      obj.is_3d_secure,
      obj.is_auth,
      obj.is_capture,
      obj.is_refunded,
      obj.is_standalone_payment,
      obj.is_voided,
      obj.order && obj.order.id,
      obj.owner,
      obj.pending,
      obj.source_data && obj.source_data.pan,
      obj.source_data && obj.source_data.sub_type,
      obj.source_data && obj.source_data.type,
      obj.success
    ].map(function(v) { return (v === undefined || v === null) ? '' : String(v); }).join('');

    const validHmac = crypto.createHmac('sha512', hmacSecret).update(concatenatedValues).digest('hex');

    const validWebhookRes = await fetch(BASE_URL + '/api/payments/paymob/webhook?hmac=' + validHmac, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fakeWebhookPayload)
    });
    const webhookResponse = await validWebhookRes.json();
    console.log('   ✅ استجابة Webhook: HTTP ' + validWebhookRes.status, webhookResponse);
    if (!validWebhookRes.ok || !webhookResponse.success) {
      throw new Error('فشل معالجة الـ Webhook السليم: ' + JSON.stringify(webhookResponse));
    }

    // 7. اختبار Idempotency (إعادة إرسال نفس المعاملة لمنع التكرار)
    console.log('\n7️⃣ اختبار Idempotency (إعادة إرسال نفس Transaction ID)...');
    const duplicateRes = await fetch(BASE_URL + '/api/payments/paymob/webhook?hmac=' + validHmac, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fakeWebhookPayload)
    });
    const duplicateData = await duplicateRes.json();
    console.log('   ✅ نتيجة إرسال نفس العملية مجدداً:', duplicateData);
    if (duplicateData.status !== 'already_processed') {
      throw new Error('الـ Idempotency لم يمنع تكرار العملية!');
    }

    // 8. التحقق من تحديث حالة الحجز (status: CONFIRMED, paid: true)
    console.log('\n8️⃣ التحقق من حالة الحجز والمدفوعات في الخادم...');
    const statusRes = await fetch(BASE_URL + '/api/payments/paymob/status/' + appointmentId, {
      headers: { 'Authorization': 'Bearer ' + patientToken }
    });
    const statusData = await statusRes.json();
    console.log('   ✅ حالة الحجز بعد الدفع:', statusData);
    if (!statusData.paid || statusData.status !== 'CONFIRMED') {
      throw new Error('لم يتم تأكيد الحجز بعد الدفع!');
    }

    // 9. تسجيل دخول كمدير عام (Admin) وفحص سجل المدفوعات في لوحة التحكم
    console.log('\n9️⃣ فحص سجل مدفوعات Paymob في لوحة تحكم المالك والمدير العام...');
    const adminLoginRes = await fetch(BASE_URL + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@hayat.com', password: 'admin123' })
    });
    const adminLoginData = await adminLoginRes.json();
    if (!adminLoginRes.ok) throw new Error('فشل تسجيل دخول المدير: ' + JSON.stringify(adminLoginData));
    const adminToken = adminLoginData.token;

    const adminPaymentsRes = await fetch(BASE_URL + '/api/admin/payments', {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    const adminPayments = await adminPaymentsRes.json();
    console.log('   ✅ إجمالي العمليات في لوحة الإدارة: ' + adminPayments.length);
    const verifiedPayment = adminPayments.find(function(p) { return p.paymob_transaction_id === mockTxId; });
    if (!verifiedPayment) {
      throw new Error('العملية لم تظهر في سجل مدفوعات لوحة التحكم!');
    }
    console.log('   ✅ تفاصيل المعاملة المؤكدة في لوحة الإدارة:', {
      transaction_id: verifiedPayment.paymob_transaction_id,
      amount: (verifiedPayment.amount_cents / 100) + ' ' + verifiedPayment.currency,
      status: verifiedPayment.status,
      patient: verifiedPayment.User && verifiedPayment.User.name,
      doctor: verifiedPayment.Appointment && verifiedPayment.Appointment.Doctor && verifiedPayment.Appointment.Doctor.name,
      booking_code: verifiedPayment.Appointment && verifiedPayment.Appointment.booking_code
    });

    console.log('\n🎉🎉 جميع اختبارات تكامل بوابة Paymob (End-to-End) اكتملت بنجاح 100%!');
  } catch (err) {
    console.error('\n❌ فشل الاختبار:', err.message);
    process.exit(1);
  }
}

runTests();
