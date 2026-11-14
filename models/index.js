// models/index.js
const { Sequelize, DataTypes, Op } = require('sequelize');
const path = require('path');

let sequelize;
let isMockDb = false;

if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres')) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: process.env.DB_SSL === 'true' ? {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    } : {}
  });
} else {
  // فحص توفر حزمة sqlite3 (لتجنب الانهيار في بيئات Serverless مثل Vercel)
  let sqliteLoaded = false;
  if (!process.env.VERCEL) {
    try {
      require('sqlite3');
      sqliteLoaded = true;
    } catch (err) {
      sqliteLoaded = false;
    }
  }

  if (sqliteLoaded) {
    const storagePath = path.resolve(__dirname, '..', process.env.DB_STORAGE || 'database.sqlite');
    sequelize = new Sequelize({
      dialect: 'sqlite',
      storage: storagePath,
      logging: false,
    });
  } else {
    isMockDb = true;
    console.warn('⚠️ [Sequelize] sqlite3 driver is not available in this environment (e.g. Vercel Serverless). Initializing safe resilient persistent DB layer.');

    const os = require('os');
    let seedFallbacks = {};
    try {
      seedFallbacks = require('../seedFallbacks');
    } catch(e) {
      try { seedFallbacks = require('./seedFallbacks'); } catch(e2) {}
    }

    const {
      SEED_FALLBACK_DOCTORS = [],
      SEED_FALLBACK_PHARMACIES = [],
      SEED_FALLBACK_THERAPY = [],
      SEED_FALLBACK_CLINICS = []
    } = seedFallbacks;

    const MODEL_SEEDS = {
      Doctor: SEED_FALLBACK_DOCTORS,
      Pharmacy: SEED_FALLBACK_PHARMACIES,
      TherapyCenter: SEED_FALLBACK_THERAPY,
      Clinic: SEED_FALLBACK_CLINICS,
      User: [
        {
          id: 'admin_1',
          name: 'المدير العام والمالك (Super Admin)',
          email: 'admin@hayaa.com',
          role: 'ADMIN',
          governorate: 'القاهرة',
          phone: '01000000000',
          created_at: new Date('2026-01-01').toISOString()
        },
        {
          id: 'admin_2',
          name: 'المدير العام والمالك (Super Admin)',
          email: 'hayat.healthcare3@gmail.com',
          role: 'ADMIN',
          governorate: 'القاهرة',
          phone: '01000000000',
          created_at: new Date('2026-01-01').toISOString()
        },
        {
          id: 'admin_3',
          name: 'المدير العام والمالك (Super Admin)',
          email: 'hayathealthcare3@gmail.com',
          role: 'ADMIN',
          governorate: 'القاهرة',
          phone: '01000000000',
          created_at: new Date('2026-01-01').toISOString()
        },
        {
          id: 'doc_wael_1',
          name: 'د. Mohamed Wael',
          email: 'waylm0191@gmail.com',
          role: 'DOCTOR',
          governorate: 'القاهرة',
          phone: '01012345678',
          created_at: new Date('2026-01-02').toISOString()
        },
        {
          id: '9df4dcc8-5683-4fba-aa0b-85d16c5b4d7d',
          name: 'د. سارة المنصور',
          email: 'doctor@example.com',
          role: 'DOCTOR',
          governorate: 'القاهرة',
          phone: '01012345678',
          created_at: new Date('2026-01-02').toISOString()
        },
        {
          id: 'pat_user_1',
          name: 'أحمد محمود (مريض تجريبي)',
          email: 'patient@example.com',
          role: 'PATIENT',
          governorate: 'القاهرة',
          phone: '01022223333',
          created_at: new Date('2026-01-03').toISOString()
        },
        {
          id: 'pharm_user_1',
          name: 'صيدلية الشفاء المركزية',
          email: 'pharmacy@example.com',
          role: 'PHARMACY',
          governorate: 'القاهرة',
          phone: '01033334444',
          created_at: new Date('2026-01-04').toISOString()
        },
        {
          id: 'therapy_user_1',
          name: 'مركز ريهاب بلس للتأهيل والعلاج الطبيعي',
          email: 'therapy@example.com',
          role: 'THERAPY_CENTER',
          governorate: 'القاهرة',
          phone: '01044445555',
          created_at: new Date('2026-01-05').toISOString()
        }
      ],
      Appointment: [
        {
          id: 'appt_demo_1',
          patient_name: 'أحمد محمود',
          doctor_id: '138cb805-2b8a-40c5-ab5d-afd6075ed126',
          appointment_date: '2026-11-10',
          appointment_time: '18:00',
          status: 'CONFIRMED',
          consultation_fee: 150,
          payment_method: 'CASH',
          created_at: new Date('2026-11-01').toISOString()
        }
      ],
      Order: [
        {
          id: 'order_demo_1',
          order_number: 'ORD-101',
          customer_name: 'أحمد محمود',
          total_amount: 120,
          status: 'DELIVERED',
          created_at: new Date('2026-11-02').toISOString()
        }
      ],
      Complaint: []
    };

    const inMemoryStores = new Map();
    const getFilePath = (modelName) => path.join(os.tmpdir(), 'haya_store_' + modelName.toLowerCase() + '.json');

    function loadStore(modelName) {
      if (inMemoryStores.has(modelName)) {
        return inMemoryStores.get(modelName);
      }
      const filePath = getFilePath(modelName);
      let records = null;
      try {
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) records = parsed;
        }
      } catch (e) {}

      if (!records) {
        records = MODEL_SEEDS[modelName] ? JSON.parse(JSON.stringify(MODEL_SEEDS[modelName])) : [];
        try {
          fs.writeFileSync(filePath, JSON.stringify(records));
        } catch (e) {}
      } else if (MODEL_SEEDS[modelName]) {
        // ضمان تواجد الحسابات الأساسية والبذور الجديدة دائماً حتى عند وجود ملف تخزين مؤقت سابق
        let added = false;
        for (const sItem of MODEL_SEEDS[modelName]) {
          const exists = records.some(r =>
            (sItem.id && r.id === sItem.id) ||
            (sItem.email && r.email && r.email.toLowerCase() === sItem.email.toLowerCase())
          );
          if (!exists) {
            records.push(JSON.parse(JSON.stringify(sItem)));
            added = true;
          }
        }
        if (added) {
          try { fs.writeFileSync(filePath, JSON.stringify(records)); } catch(e){}
        }
      }

      inMemoryStores.set(modelName, records);
      return records;
    }

    function saveStore(modelName, records) {
      inMemoryStores.set(modelName, records);
      const filePath = getFilePath(modelName);
      try {
        fs.writeFileSync(filePath, JSON.stringify(records));
      } catch (e) {}
    }

    function extractValue(item, attr) {
      if (!attr || !item) return undefined;
      if (typeof attr === 'string') return item[attr];
      if (attr.__isCol) return item[attr.col];
      if (attr.__isFn) {
        const rawVal = extractValue(item, attr.args && attr.args[0]);
        if (attr.fn === 'lower') {
          return String(rawVal ?? '').toLowerCase();
        }
        if (attr.fn === 'upper') {
          return String(rawVal ?? '').toUpperCase();
        }
        return rawVal;
      }
      return undefined;
    }

    function matchSingleWhere(item, whereObj) {
      if (!whereObj || typeof whereObj !== 'object') return true;

      // 1. إذا كان الكائن ناتجاً عن دالة sequelize.where(...)
      if (whereObj.__isWhere) {
        const itemVal = extractValue(item, whereObj.attribute);
        const targetLogic = whereObj.logic;
        const comparator = (whereObj.comparator || '=').toUpperCase();

        if (targetLogic && typeof targetLogic === 'object') {
          const syms = Object.getOwnPropertySymbols(targetLogic);
          for (const s of syms) {
            const sStr = s.toString();
            if (sStr.includes('like') || sStr.includes('iLike')) {
              const pattern = String(targetLogic[s]).replace(/%/g, '').toLowerCase();
              return String(itemVal ?? '').toLowerCase().includes(pattern);
            }
          }
        }

        if (comparator === 'LIKE' || comparator === 'ILIKE') {
          const pattern = String(targetLogic).replace(/%/g, '').toLowerCase();
          return String(itemVal ?? '').toLowerCase().includes(pattern);
        }

        if (typeof itemVal === 'string' && typeof targetLogic === 'string') {
          return itemVal.toLowerCase().trim() === targetLogic.toLowerCase().trim();
        }
        return itemVal == targetLogic;
      }

      // 2. معالجة العمليات المركبة بالرموز (Op.or, Op.and)
      const symbols = Object.getOwnPropertySymbols(whereObj);
      for (const sym of symbols) {
        const symStr = sym.toString();
        if (symStr.includes('or')) {
          const orList = whereObj[sym];
          if (Array.isArray(orList) && orList.length > 0) {
            const matchesAny = orList.some(subWhere => matchSingleWhere(item, subWhere));
            if (!matchesAny) return false;
          }
        } else if (symStr.includes('and')) {
          const andList = whereObj[sym];
          if (Array.isArray(andList)) {
            const matchesAll = andList.every(subWhere => matchSingleWhere(item, subWhere));
            if (!matchesAll) return false;
          }
        }
      }

      // 3. معالجة خصائص الكائن العادية
      for (const key of Object.keys(whereObj)) {
        if (key === '__isWhere' || key === 'attribute' || key === 'comparator' || key === 'logic') continue;
        const targetVal = whereObj[key];
        if (targetVal === undefined) continue;

        if (targetVal && typeof targetVal === 'object' && targetVal.__isWhere) {
          if (!matchSingleWhere(item, targetVal)) return false;
          continue;
        }

        const itemVal = item[key];

        if (targetVal && typeof targetVal === 'object' && !Array.isArray(targetVal)) {
          const targetSyms = Object.getOwnPropertySymbols(targetVal);
          let handledSym = false;
          for (const ts of targetSyms) {
            const tsStr = ts.toString();
            if (tsStr.includes('like') || tsStr.includes('iLike')) {
              handledSym = true;
              const pattern = String(targetVal[ts]).replace(/%/g, '').toLowerCase();
              if (!String(itemVal ?? '').toLowerCase().includes(pattern)) return false;
            } else if (tsStr.includes('notIn')) {
              handledSym = true;
              const list = Array.isArray(targetVal[ts]) ? targetVal[ts] : [targetVal[ts]];
              if (list.some(v => String(v).toLowerCase().trim() === String(itemVal ?? '').toLowerCase().trim())) return false;
            } else if (tsStr.includes('in')) {
              handledSym = true;
              const list = Array.isArray(targetVal[ts]) ? targetVal[ts] : [targetVal[ts]];
              if (!list.some(v => String(v).toLowerCase().trim() === String(itemVal ?? '').toLowerCase().trim())) return false;
            } else if (tsStr.includes('ne')) {
              handledSym = true;
              if (itemVal === targetVal[ts]) return false;
            } else if (tsStr.includes('gte')) {
              handledSym = true;
              if (Number(itemVal) < Number(targetVal[ts])) return false;
            } else if (tsStr.includes('lte')) {
              handledSym = true;
              if (Number(itemVal) > Number(targetVal[ts])) return false;
            } else if (tsStr.includes('gt')) {
              handledSym = true;
              if (Number(itemVal) <= Number(targetVal[ts])) return false;
            } else if (tsStr.includes('lt')) {
              handledSym = true;
              if (Number(itemVal) >= Number(targetVal[ts])) return false;
            }
          }
          if (handledSym) continue;
        }

        if (typeof targetVal === 'string' && typeof itemVal === 'string') {
          if (key.toLowerCase().includes('email')) {
            if (itemVal.toLowerCase().trim() !== targetVal.toLowerCase().trim()) return false;
          } else {
            if (itemVal !== targetVal) return false;
          }
        } else if (targetVal !== itemVal) {
          return false;
        }
      }

      return true;
    }

    function matchWhere(item, where) {
      if (!where || typeof where !== 'object') return true;
      return matchSingleWhere(item, where);
    }

    function wrapInstance(raw, modelName) {
      if (!raw) return null;
      const inst = { ...raw };
      inst.save = async function() {
        const records = loadStore(modelName);
        const idx = records.findIndex(r => String(r.id) === String(this.id));
        const plain = { ...this };
        delete plain.save; delete plain.destroy; delete plain.update; delete plain.toJSON;
        if (idx >= 0) {
          records[idx] = plain;
        } else {
          records.unshift(plain);
        }
        saveStore(modelName, records);
        return inst;
      };
      inst.destroy = async function() {
        let records = loadStore(modelName);
        records = records.filter(r => String(r.id) !== String(this.id));
        saveStore(modelName, records);
        return true;
      };
      inst.update = async function(values) {
        Object.assign(this, values);
        return this.save();
      };
      inst.toJSON = function() {
        const plain = { ...this };
        delete plain.save; delete plain.destroy; delete plain.update; delete plain.toJSON;
        return plain;
      };
      return inst;
    }

    function createMockModel(name) {
      const model = function() {};
      model.modelName = name;

      model.findAll = async (options = {}) => {
        let records = loadStore(name);
        if (options.where) {
          records = records.filter(item => matchWhere(item, options.where));
        }
        if (options.order && Array.isArray(options.order)) {
          const [field, dir] = options.order[0] || ['created_at', 'DESC'];
          records.sort((a, b) => {
            const valA = a[field] ?? '';
            const valB = b[field] ?? '';
            if (dir && String(dir).toUpperCase() === 'ASC') {
              return valA > valB ? 1 : -1;
            }
            return valA < valB ? 1 : -1;
          });
        }
        if (options.limit && typeof options.limit === 'number') {
          records = records.slice(0, options.limit);
        }

        // دعم ربط الجداول (Sequelize includes) في بيئة Mock
        if (options.include && Array.isArray(options.include)) {
          const userStore = loadStore('User');
          const docStore = loadStore('Doctor');
          const branchStore = loadStore('TherapyBranch');

          records = records.map(item => {
            const clone = { ...item };
            for (const inc of options.include) {
              const incModelName = inc.model?.modelName || (typeof inc.model === 'string' ? inc.model : (inc.as || ''));
              if (incModelName === 'User' || inc.model === User) {
                let u = userStore.find(u => String(u.id) === String(clone.user_id));
                if (!u && clone.name) {
                  const cleanDocName = String(clone.name).replace(/^د\.\s*/, '').trim().toLowerCase();
                  u = userStore.find(u => {
                    const uName = String(u.name || '').replace(/^د\.\s*/, '').trim().toLowerCase();
                    return (uName && uName === cleanDocName) || (u.email && clone.email && u.email.toLowerCase() === clone.email.toLowerCase());
                  });
                }
                clone.User = u ? { id: u.id, name: u.name, email: u.email, phone: u.phone } : null;
              } else if (incModelName === 'Doctor' || inc.model === Doctor) {
                const d = docStore.find(d => String(d.id) === String(clone.doctor_id));
                clone.Doctor = d || null;
              } else if (inc.as === 'branches' || incModelName === 'TherapyBranch') {
                clone.branches = branchStore.filter(b => String(b.center_id) === String(clone.id));
              }
            }
            return clone;
          });
        }

        return records.map(r => wrapInstance(r, name));
      };

      model.findOne = async (options = {}) => {
        const results = await model.findAll(options);
        return results.length ? results[0] : null;
      };

      model.findByPk = async (id) => {
        const records = loadStore(name);
        const found = records.find(r => String(r.id) === String(id));
        return found ? wrapInstance(found, name) : null;
      };

      model.create = async (data = {}) => {
        const records = loadStore(name);
        const id = data.id || ('id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
        const newRecord = {
          ...data,
          id,
          created_at: data.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        records.unshift(newRecord);
        saveStore(name, records);
        return wrapInstance(newRecord, name);
      };

      model.count = async (options = {}) => {
        let records = loadStore(name);
        if (options && options.where) {
          records = records.filter(item => matchWhere(item, options.where));
        }
        return records.length;
      };

      model.destroy = async (options = {}) => {
        let records = loadStore(name);
        const initial = records.length;
        if (options && options.where) {
          records = records.filter(item => !matchWhere(item, options.where));
        } else {
          records = [];
        }
        saveStore(name, records);
        return initial - records.length;
      };

      model.update = async (values, options = {}) => {
        let records = loadStore(name);
        let updatedCount = 0;
        records = records.map(r => {
          if (!options.where || matchWhere(r, options.where)) {
            updatedCount++;
            return { ...r, ...values, updated_at: new Date().toISOString() };
          }
          return r;
        });
        saveStore(name, records);
        return [updatedCount];
      };

      model.hasOne = () => {};
      model.hasMany = () => {};
      model.belongsTo = () => {};
      model.belongsToMany = () => {};
      model.addScope = () => {};
      model.scope = () => model;

      return model;
    }

    sequelize = {
      sync: async () => ({}),
      authenticate: async () => ({}),
      query: async () => ([]),
      where: (attr, comparatorOrLogic, maybeLogic) => ({
        __isWhere: true,
        attribute: attr,
        comparator: maybeLogic !== undefined ? comparatorOrLogic : '=',
        logic: maybeLogic !== undefined ? maybeLogic : comparatorOrLogic
      }),
      fn: (fnName, ...args) => ({
        __isFn: true,
        fn: String(fnName).toLowerCase(),
        args
      }),
      col: (colName) => ({
        __isCol: true,
        col: String(colName)
      }),
      define: (name) => createMockModel(name)
    };
  }
}

// 1. User Model (Patients & Doctors)
const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
    validate: { isEmail: true }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING,
    defaultValue: '',
  },
  role: {
    type: DataTypes.STRING, // 'PATIENT', 'DOCTOR', 'PHARMACY', 'THERAPY_CENTER', 'ADMIN'
    defaultValue: 'PATIENT',
  },
  governorate: {
    type: DataTypes.STRING, // محافظة المريض (مثال: القاهرة، الإسكندرية، الجيزة، الدقهلية...)
    defaultValue: 'القاهرة',
  }
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

// 2. Doctor Model
const Doctor = sequelize.define('Doctor', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  specialty: {
    type: DataTypes.STRING, // e.g. 'general', 'women', 'children'
    allowNull: false,
  },
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0.0,
  },
  rating_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  avatar_url: {
    type: DataTypes.TEXT, // رابط أو صورة الأفاتار / الصورة الشخصية
  },
  bio: {
    type: DataTypes.TEXT,
  },
  phone: {
    type: DataTypes.STRING,
  },
  syndicate_card_front: {
    type: DataTypes.TEXT, // صورة كارنيه نقابة الأطباء (وجه)
  },
  syndicate_card_back: {
    type: DataTypes.TEXT, // صورة كارنيه نقابة الأطباء (ظهر)
  },
  graduation_cert: {
    type: DataTypes.TEXT, // صورة شهادة التخرج والدرجة العلمية
  },
  profile_photo: {
    type: DataTypes.TEXT, // صورة شخصية واضحة للوجه
  },
  national_id_image: {
    type: DataTypes.TEXT, // صورة البطاقة الشخصية
  },
  consultation_fee: {
    type: DataTypes.INTEGER, // سعر كشف الطبيب بالجنيه (مثال: 150 ج)
    defaultValue: 150,
  },
  verification_status: {
    type: DataTypes.STRING, // 'PENDING', 'VERIFIED', 'REJECTED'
    defaultValue: 'PENDING',
  },
  subscription_fee: {
    type: DataTypes.INTEGER, // رسوم الاشتراك والاعتماد (100 جنيه أو 0 في حالة الكود الترويجي)
    defaultValue: 100,
  },
  subscription_status: {
    type: DataTypes.STRING, // 'PENDING_PAYMENT', 'FREE_PROMO', 'PAID'
    defaultValue: 'PENDING_PAYMENT',
  },
  promo_code: {
    type: DataTypes.STRING, // الكود الترويجي المستخدم للدخول مجاناً
    allowNull: true,
  },
  clinic_name: {
    type: DataTypes.STRING, // اسم العيادة أو المركز الطبي (مثال: عيادة مصر، عيادات النيل التخصصية)
    defaultValue: 'عيادة خاصة',
  },
  clinic_type: {
    type: DataTypes.STRING, // 'PRIVATE' (عيادة خاصة) أو 'CENTER' (مركز/مجمع طبي) أو 'HOSPITAL' (مستشفى)
    defaultValue: 'PRIVATE',
  },
  clinic_photo: {
    type: DataTypes.TEXT, // صورة العيادة أو المركز الطبي
  },
  governorate: {
    type: DataTypes.STRING, // المحافظة المتواجد بها الطبيب/العيادة
    defaultValue: 'القاهرة',
  },
  clinic_address: {
    type: DataTypes.STRING, // العنوان بالتفصيل (الشارع، المنطقة، رقم العمارة)
    defaultValue: 'ميدان التحرير، وسط البلد',
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 7), // إحداثيات GPS خط العرض
    defaultValue: 30.0444,
  },
  longitude: {
    type: DataTypes.DECIMAL(10, 7), // إحداثيات GPS خط الطول
    defaultValue: 31.2357,
  },
  user_id: {
    type: DataTypes.UUID,
  }
}, {
  tableName: 'doctors',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

// 3. Appointment Model
const Appointment = sequelize.define('Appointment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  booking_code: {
    type: DataTypes.STRING, // كود الحجز (مثلاً: HY-2024-001)
    unique: true,
  },
  time_slot: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  doctor_scheduled_time: {
    type: DataTypes.STRING, // الموعد المحدد من الطبيب (مثلاً: اليوم الساعة 10:00 مساءً)
  },
  doctor_notes: {
    type: DataTypes.TEXT, // تعليمات الطبيب للمريض للموعد
  },
  patient_preferred_date: {
    type: DataTypes.STRING, // اليوم المطلوب من المريض (مثلاً: اليوم، غداً، يوم 23)
  },
  patient_notes: {
    type: DataTypes.TEXT, // ملاحظات أو أعراض المريض
  },
  status: {
    type: DataTypes.STRING, // 'WAITING_DOCTOR_TIME', 'TIME_SET', 'PAID', 'COMPLETED'
    defaultValue: 'WAITING_DOCTOR_TIME',
  },
  doctor_fee: {
    type: DataTypes.INTEGER, // سعر كشف الطبيب (مثلاً: 150 ج)
    defaultValue: 150,
  },
  app_fee: {
    type: DataTypes.INTEGER, // رسوم خدمة التطبيق (10 ج)
    defaultValue: 10,
  },
  price_cents: {
    type: DataTypes.INTEGER, // إجمالي المبلغ المطلوب سداده = doctor_fee + app_fee
    defaultValue: 160,
  },
  paid: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  payment_method: {
    type: DataTypes.STRING, // 'CARD', 'WALLET', 'INSTAPAY'
  },
  payment_sender: {
    type: DataTypes.STRING, // رقم الهاتف أو اسم حساب انستاباي المحول منه
  },
  payment_proof: {
    type: DataTypes.TEXT, // مسار صورة إيصال التحويل (Screenshot)
  },
  stripe_session: {
    type: DataTypes.STRING,
  },
  booking_type: {
    type: DataTypes.STRING, // 'DOCTOR' أو 'THERAPY'
    defaultValue: 'DOCTOR',
  },
  therapy_branch_id: {
    type: DataTypes.UUID,
    allowNull: true,
  }
}, {
  tableName: 'appointments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

// 4. Prescription Model
const Prescription = sequelize.define('Prescription', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  diagnosis: {
    type: DataTypes.TEXT, // تشخيص وتوصيف المرض
  },
  medicines: {
    type: DataTypes.TEXT, // قائمة الأدوية والجرعات
  },
  lab_tests: {
    type: DataTypes.TEXT, // الأشعات والتحاليل المطلوبة
  },
  doctor_notes: {
    type: DataTypes.TEXT, // إرشادات ونصائح الطبيب
  }
}, {
  tableName: 'prescriptions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

// 5. Pharmacy Model
const Pharmacy = sequelize.define('Pharmacy', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  address: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING,
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 6),
  },
  longitude: {
    type: DataTypes.DECIMAL(10, 6),
  },
  governorate: {
    type: DataTypes.STRING,
    defaultValue: 'القاهرة',
  },
  verification_status: {
    type: DataTypes.STRING, // 'PENDING', 'VERIFIED', 'REJECTED'
    defaultValue: 'PENDING',
  },
  subscription_fee: {
    type: DataTypes.INTEGER, // رسوم الاشتراك والاعتماد (100 جنيه أو 0 في حالة الكود الترويجي)
    defaultValue: 100,
  },
  subscription_status: {
    type: DataTypes.STRING, // 'PENDING_PAYMENT', 'FREE_PROMO', 'PAID'
    defaultValue: 'PENDING_PAYMENT',
  },
  promo_code: {
    type: DataTypes.STRING, // الكود الترويجي المستخدم للدخول مجاناً
    allowNull: true,
  },
  license_image: {
    type: DataTypes.TEXT, // صورة ترخيص الصيدلية / السجل التجاري
  },
  syndicate_card: {
    type: DataTypes.TEXT, // صورة كارنيه نقابة الصيادلة
  },
  national_id_image: {
    type: DataTypes.TEXT, // صورة بطاقة الرقم القومي للصيدلي
  },
  user_id: {
    type: DataTypes.UUID,
  }
}, {
  tableName: 'pharmacies',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

// 6. User-Pharmacies (Many-to-Many join table)
const UserPharmacy = sequelize.define('UserPharmacy', {}, {
  tableName: 'user_pharmacies',
  timestamps: false
});

// 7. Order Model (Prescription Delivery / Pick-up)
const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  delivery_method: {
    type: DataTypes.ENUM('PICKUP', 'DELIVERY'),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'OUT_FOR_DELIVERY', 'DELIVERED'),
    defaultValue: 'PENDING',
  }
}, {
  tableName: 'orders',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// 8. Therapy Center Model (مراكز العلاج الطبيعي والتأهيل الحركي)
const TherapyCenter = sequelize.define('TherapyCenter', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING, // e.g. 'مركز كيور للعلاج الطبيعي والتأهيل'
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT, // نبذة عن المركز وتجهيزاته
  },
  services: {
    type: DataTypes.TEXT, // قائمة الخدمات
  },
  rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 4.95,
  },
  phone: {
    type: DataTypes.STRING,
  },
  governorate: {
    type: DataTypes.STRING, // المحافظة الرئيسية (مثال: السويس)
    defaultValue: 'السويس',
  },
  logo: {
    type: DataTypes.TEXT,
  },
  verification_status: {
    type: DataTypes.STRING, // 'PENDING', 'VERIFIED', 'REJECTED'
    defaultValue: 'PENDING',
  },
  subscription_fee: {
    type: DataTypes.INTEGER, // رسوم الاشتراك والاعتماد (100 جنيه أو 0 في حالة الكود الترويجي)
    defaultValue: 100,
  },
  subscription_status: {
    type: DataTypes.STRING, // 'PENDING_PAYMENT', 'FREE_PROMO', 'PAID'
    defaultValue: 'PENDING_PAYMENT',
  },
  promo_code: {
    type: DataTypes.STRING, // الكود الترويجي المستخدم للدخول مجاناً
    allowNull: true,
  },
  license_image: {
    type: DataTypes.TEXT, // صورة ترخيص المركز الطبي / السجل
  },
  syndicate_card: {
    type: DataTypes.TEXT, // صورة كارنيه نقابة العلاج الطبيعي
  },
  national_id_image: {
    type: DataTypes.TEXT, // صورة بطاقة الرقم القومي
  },
  user_id: {
    type: DataTypes.UUID,
  }
}, {
  tableName: 'therapy_centers',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

// 9. Therapy Branch Model (فروع مراكز العلاج الطبيعي)
const TherapyBranch = sequelize.define('TherapyBranch', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  center_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  branch_name: {
    type: DataTypes.STRING, // e.g. 'فرع السلام 2' أو 'فرع الأربعين'
    allowNull: false,
  },
  governorate: {
    type: DataTypes.STRING, // e.g. 'السويس'
    defaultValue: 'السويس',
  },
  district: {
    type: DataTypes.STRING, // الحي أو المنطقة (e.g. 'حي السلام 2', 'حي الأربعين')
  },
  address: {
    type: DataTypes.STRING, // العنوان التفصيلي (شارع، عمارة، دور)
  },
  phone: {
    type: DataTypes.STRING,
  },
  working_hours: {
    type: DataTypes.STRING, // مواعيد العمل (مثلاً: يومياً من 10:00 ص إلى 10:00 م)
    defaultValue: 'يومياً من 10:00 ص إلى 10:00 م',
  },
  session_fee: {
    type: DataTypes.INTEGER, // سعر الجلسة بالجنيه (مثلاً: 180 ج)
    defaultValue: 180,
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 7),
    defaultValue: 29.9668,
  },
  longitude: {
    type: DataTypes.DECIMAL(10, 7),
    defaultValue: 32.5498,
  }
}, {
  tableName: 'therapy_branches',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

// ---------- Associations (العلاقات بين الجداول) ----------
// 10. Payment Model (Paymob Transactions & Online Payments)
const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  appointment_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  paymob_intention_id: {
    type: DataTypes.STRING,
  },
  paymob_order_id: {
    type: DataTypes.STRING,
  },
  paymob_transaction_id: {
    type: DataTypes.STRING,
    unique: true,
  },
  amount_cents: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'EGP',
  },
  payment_method: {
    type: DataTypes.STRING, // 'CARD', 'WALLET', 'MEEZA'
    defaultValue: 'CARD',
  },
  status: {
    type: DataTypes.STRING, // 'PENDING', 'PAID', 'FAILED'
    defaultValue: 'PENDING',
  },
  raw_webhook_data: {
    type: DataTypes.TEXT,
  },
  paid_at: {
    type: DataTypes.DATE,
  }
}, {
  tableName: 'payments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// Associations
User.hasMany(Appointment, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Appointment.belongsTo(User, { foreignKey: 'user_id' });

User.hasOne(Doctor, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Doctor.belongsTo(User, { foreignKey: 'user_id' });

User.hasOne(Pharmacy, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Pharmacy.belongsTo(User, { foreignKey: 'user_id' });

User.hasOne(TherapyCenter, { foreignKey: 'user_id', onDelete: 'CASCADE' });
TherapyCenter.belongsTo(User, { foreignKey: 'user_id' });

Doctor.hasMany(Appointment, { foreignKey: 'doctor_id', onDelete: 'CASCADE' });
Appointment.belongsTo(Doctor, { foreignKey: 'doctor_id' });

TherapyBranch.hasMany(Appointment, { foreignKey: 'therapy_branch_id', onDelete: 'SET NULL' });
Appointment.belongsTo(TherapyBranch, { as: 'TherapyBranch', foreignKey: 'therapy_branch_id' });

TherapyCenter.hasMany(TherapyBranch, { as: 'branches', foreignKey: 'center_id', onDelete: 'CASCADE' });
TherapyBranch.belongsTo(TherapyCenter, { as: 'center', foreignKey: 'center_id' });

Appointment.hasOne(Prescription, { foreignKey: 'appointment_id', onDelete: 'CASCADE' });
Prescription.belongsTo(Appointment, { foreignKey: 'appointment_id' });

User.hasMany(Prescription, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Prescription.belongsTo(User, { foreignKey: 'user_id' });

Doctor.hasMany(Prescription, { foreignKey: 'doctor_id', onDelete: 'CASCADE' });
Prescription.belongsTo(Doctor, { foreignKey: 'doctor_id' });

User.belongsToMany(Pharmacy, { through: UserPharmacy, foreignKey: 'user_id' });
Pharmacy.belongsToMany(User, { through: UserPharmacy, foreignKey: 'pharmacy_id' });

Prescription.hasOne(Order, { foreignKey: 'prescription_id', onDelete: 'CASCADE' });
Order.belongsTo(Prescription, { foreignKey: 'prescription_id' });

Pharmacy.hasMany(Order, { foreignKey: 'pharmacy_id', onDelete: 'CASCADE' });
Order.belongsTo(Pharmacy, { foreignKey: 'pharmacy_id' });

Appointment.hasMany(Payment, { foreignKey: 'appointment_id', onDelete: 'CASCADE' });
Payment.belongsTo(Appointment, { foreignKey: 'appointment_id' });

User.hasMany(Payment, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Payment.belongsTo(User, { foreignKey: 'user_id' });

// 11. PayoutRequest Model (طلبات سحب أرباح الأطباء عبر انستاباي وفودافون كاش وPaymob)
const PayoutRequest = sequelize.define('PayoutRequest', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  doctor_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  amount: {
    type: DataTypes.INTEGER, // المبلغ المطلوب سحبه بالجنيه
    allowNull: false,
  },
  method: {
    type: DataTypes.STRING, // 'INSTAPAY', 'VODAFONE_CASH', 'PAYMOB', 'BANK_TRANSFER'
    allowNull: false,
  },
  account_details: {
    type: DataTypes.STRING, // رقم المحفظة أو عنوان انستاباي أو الحساب
    allowNull: false,
  },
  account_name: {
    type: DataTypes.STRING, // اسم صاحب الحساب / المحفظة
  },
  status: {
    type: DataTypes.STRING, // 'PENDING', 'COMPLETED', 'REJECTED'
    defaultValue: 'PENDING',
  },
  transaction_reference: {
    type: DataTypes.STRING, // رقم المعاملة المرجعي للتحويل
  },
  admin_notes: {
    type: DataTypes.TEXT, // ملاحظات المالك أو سبب الرفض
  },
  processed_at: {
    type: DataTypes.DATE,
  }
}, {
  tableName: 'payout_requests',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

Doctor.hasMany(PayoutRequest, { foreignKey: 'doctor_id', onDelete: 'CASCADE' });
PayoutRequest.belongsTo(Doctor, { foreignKey: 'doctor_id' });

User.hasMany(PayoutRequest, { foreignKey: 'user_id', onDelete: 'CASCADE' });
PayoutRequest.belongsTo(User, { foreignKey: 'user_id' });

// 12. Review Model (تقييمات المرضى للأطباء)
const Review = sequelize.define('Review', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  doctor_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  appointment_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  rating: {
    type: DataTypes.INTEGER, // 1 to 5
    allowNull: false,
    validate: { min: 1, max: 5 }
  },
  comment: {
    type: DataTypes.TEXT,
  }
}, {
  tableName: 'reviews',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

Doctor.hasMany(Review, { foreignKey: 'doctor_id', onDelete: 'CASCADE' });
Review.belongsTo(Doctor, { foreignKey: 'doctor_id' });

User.hasMany(Review, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Review.belongsTo(User, { foreignKey: 'user_id' });

Appointment.hasOne(Review, { foreignKey: 'appointment_id', onDelete: 'SET NULL' });
Review.belongsTo(Appointment, { foreignKey: 'appointment_id' });

// 13. Complaint Model (شكاوي المستخدمين ومقترحاتهم للأدمن)
const Complaint = sequelize.define('Complaint', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: true, // قد تكون شكوى مجهولة
  },
  user_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  user_email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  user_phone: {
    type: DataTypes.STRING,
  },
  type: {
    type: DataTypes.STRING, // 'COMPLAINT' | 'SUGGESTION' | 'TECHNICAL' | 'OTHER'
    defaultValue: 'COMPLAINT',
  },
  subject: {
    type: DataTypes.STRING, // موضوع / عنوان الشكوى
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT, // تفاصيل الشكوى أو المقترح
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING, // 'NEW' | 'REVIEWING' | 'RESOLVED' | 'CLOSED'
    defaultValue: 'NEW',
  },
  admin_reply: {
    type: DataTypes.TEXT, // رد الأدمن على الشكوى
  },
  admin_reply_at: {
    type: DataTypes.DATE, // وقت الرد
  }
}, {
  tableName: 'complaints',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

User.hasMany(Complaint, { foreignKey: 'user_id', onDelete: 'SET NULL' });
Complaint.belongsTo(User, { foreignKey: 'user_id' });

// 14. Clinic Model (مجمعات العيادات والمراكز الطبية - مثل عيادات كليوباترا)
const Clinic = sequelize.define('Clinic', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING, // e.g. 'مجمع عيادات كليوباترا التخصصية'
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
  },
  specialty: {
    type: DataTypes.STRING,
    defaultValue: 'مجمع عيادات تخصصية متكامل',
  },
  governorate: {
    type: DataTypes.STRING,
    defaultValue: 'القاهرة',
  },
  address: {
    type: DataTypes.STRING,
    defaultValue: 'ميدان التحرير، وسط البلد، القاهرة',
  },
  phone: {
    type: DataTypes.STRING,
  },
  clinic_photo: {
    type: DataTypes.TEXT, // صورة واجهة العيادة / المجمع
  },
  user_id: {
    type: DataTypes.UUID, // مالك أو منشئ العيادة
    allowNull: true,
  }
}, {
  tableName: 'clinics',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

// 15. ClinicSchedule Model (جدول مناوبات وأطباء العيادة اليومي والأسبوعي)
const ClinicSchedule = sequelize.define('ClinicSchedule', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  clinic_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  doctor_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  day_of_week: {
    type: DataTypes.STRING, // 'السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'
    allowNull: false,
  },
  shift_hours: {
    type: DataTypes.STRING, // e.g. 'من 04:00 م إلى 10:00 م'
    defaultValue: 'من 04:00 م إلى 10:00 م',
  },
  notes: {
    type: DataTypes.STRING,
  },
  custom_fee: {
    type: DataTypes.INTEGER,
    allowNull: true,
  }
}, {
  tableName: 'clinic_schedules',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

Clinic.hasMany(ClinicSchedule, { as: 'schedules', foreignKey: 'clinic_id', onDelete: 'CASCADE' });
ClinicSchedule.belongsTo(Clinic, { foreignKey: 'clinic_id' });

Doctor.hasMany(ClinicSchedule, { as: 'clinic_schedules', foreignKey: 'doctor_id', onDelete: 'CASCADE' });
ClinicSchedule.belongsTo(Doctor, { foreignKey: 'doctor_id' });

User.hasMany(Clinic, { foreignKey: 'user_id', onDelete: 'SET NULL' });
Clinic.belongsTo(User, { foreignKey: 'user_id' });

module.exports = {
  isMockDb,
  sequelize,
  User,
  Doctor,
  Appointment,
  Prescription,
  Pharmacy,
  UserPharmacy,
  Order,
  TherapyCenter,
  TherapyBranch,
  Payment,
  PayoutRequest,
  Review,
  Complaint,
  Clinic,
  ClinicSchedule
};

