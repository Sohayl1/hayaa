// seed.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User, Doctor, Pharmacy, TherapyCenter, TherapyBranch } = require('./models');

async function seedDatabase() {
  try {
    await sequelize.sync({ force: true });
    console.log('🔄 تم إعادة تهيئة قاعدة البيانات...');

    // 1. إنشاء مستخدمين تجريبيين
    const passwordHash = await bcrypt.hash('password123', 10);

    const patient = await User.create({
      name: 'أحمد محمود (مريض تجريبي)',
      email: 'patient@example.com',
      password: passwordHash,
      role: 'PATIENT'
    });

    const doctorUser = await User.create({
      name: 'د. سارة المنصور (طبيبة تجريبية)',
      email: 'doctor@example.com',
      password: passwordHash,
      role: 'DOCTOR'
    });

    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    const adminUser = await User.create({
      name: 'المدير العام والمالك (Super Admin)',
      email: 'admin@hayat.com',
      password: adminPasswordHash,
      phone: '015550412989',
      role: 'ADMIN',
      governorate: 'القاهرة'
    });

    // 2. إنشاء قائمة أطباء بالتخصصات المطلوبة
    // 2. إنشاء قائمة أطباء بالتخصصات المطلوبة
    const doctorProfile = await Doctor.create({
      name: 'د. سارة المنصور',
      specialty: 'general',
      rating: 0.0,
      rating_count: 0,
      bio: 'استشارية الطب العام والباطنة ورعاية الأسرة، خبرة أكثر من 12 عاماً.',
      phone: '01012345678',
      consultation_fee: 150,
      clinic_name: 'عيادة مصر التخصصية',
      clinic_type: 'CENTER',
      governorate: 'القاهرة',
      clinic_address: 'شارع التحرير، وسط البلد، برج الأطباء، الدور الرابع',
      latitude: 30.0444,
      longitude: 31.2357,
      verification_status: 'VERIFIED',
      syndicate_card_front: 'https://firebasestorage.googleapis.com/v0/b/hayat-48b0a.firebasestorage.app/o/demo_front.jpg?alt=media',
      syndicate_card_back: 'https://firebasestorage.googleapis.com/v0/b/hayat-48b0a.firebasestorage.app/o/demo_back.jpg?alt=media',
      graduation_cert: 'https://firebasestorage.googleapis.com/v0/b/hayat-48b0a.firebasestorage.app/o/demo_grad.jpg?alt=media',
      profile_photo: 'https://firebasestorage.googleapis.com/v0/b/hayat-48b0a.firebasestorage.app/o/demo_face.jpg?alt=media',
      clinic_photo: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=700&q=80',
      user_id: doctorUser.id
    });

    const doctors = await Doctor.bulkCreate([
      {
        name: 'د. أحمد النجار',
        specialty: 'neuro',
        rating: 0.0,
        rating_count: 0,
        consultation_fee: 250,
        clinic_name: 'مركز النيل للمخ والأعصاب',
        clinic_type: 'CENTER',
        governorate: 'القاهرة',
        clinic_address: 'ميدان روكسي، مصر الجديدة، عمارة الأطباء',
        latitude: 30.0915,
        longitude: 31.3199,
        clinic_photo: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=700&q=80',
        verification_status: 'VERIFIED',
        bio: 'استشاري أول جراحة ومخ وأعصاب، علاج آلام العمود الفقري والصداع النصفي والاضطرابات العصبية.'
      },
      {
        name: 'د. طارق السعيد',
        specialty: 'children',
        rating: 0.0,
        rating_count: 0,
        consultation_fee: 160,
        clinic_name: 'عيادة براعم المستقبل',
        clinic_type: 'PRIVATE',
        governorate: 'الجيزة',
        clinic_address: 'شارع الدقي، أمام مترو الدقي، الجيزة',
        latitude: 30.0384,
        longitude: 31.2114,
        verification_status: 'VERIFIED',
        bio: 'أخصائي طب الأطفال وحديثي الولادة والتغذية العلاجية للأطفال ومتابعة النمو والتطعيمات.'
      },
      {
        name: 'د. فاطمة الزهراء',
        specialty: 'women',
        rating: 0.0,
        rating_count: 0,
        consultation_fee: 180,
        clinic_name: 'مركز الأمومة الدولي',
        clinic_type: 'CENTER',
        governorate: 'الإسكندرية',
        clinic_address: 'طريق الكورنيش، لوران، برج السلام الطبي، الإسكندرية',
        latitude: 31.2465,
        longitude: 29.9723,
        verification_status: 'VERIFIED',
        bio: 'استشارية أمراض النساء والتوليد والحقن المجهري ورعاية صحة المرأة ومتابعة الحمل الحرج.'
      },
      {
        name: 'د. يوسف حسني',
        specialty: 'eyes',
        rating: 0.0,
        rating_count: 0,
        consultation_fee: 200,
        clinic_name: 'مركز النور لجراحة العيون والليزك',
        clinic_type: 'CENTER',
        governorate: 'الدقهلية',
        clinic_address: 'شارع الجمهورية، بجوار جامعة المنصورة، المنصورة',
        latitude: 31.0409,
        longitude: 31.3785,
        verification_status: 'VERIFIED',
        bio: 'استشاري طب وجراحة العيون، تصحيح الإبصار بالليزك وعلاج المياه البيضاء وزرق العين.'
      },
      {
        name: 'د. سامح عبد الرازق',
        specialty: 'ent',
        rating: 0.0,
        rating_count: 0,
        consultation_fee: 170,
        clinic_name: 'عيادات الصفوة للأنف والأذن',
        clinic_type: 'PRIVATE',
        governorate: 'القاهرة',
        clinic_address: 'شارع عباس العقاد، مدينة نصر، القاهرة',
        latitude: 30.0571,
        longitude: 31.3413,
        verification_status: 'VERIFIED',
        bio: 'استشاري أمراض وجراحة الأنف والأذن والحنجرة ومناظير الجيوب الأنفية وضعف السمع والاتزان.'
      },
      {
        name: 'د. هاني الورداني',
        specialty: 'dental',
        rating: 0.0,
        rating_count: 0,
        consultation_fee: 150,
        clinic_name: 'عيادة هوليوود سمايل لطب الأسنان',
        clinic_type: 'PRIVATE',
        governorate: 'الجيزة',
        clinic_address: 'شارع فيصل الرئيسي، محطة حسن محمد، الجيزة',
        latitude: 30.0074,
        longitude: 31.1856,
        verification_status: 'VERIFIED',
        bio: 'أخصائي زراعة وتجميل وتقويم الأسنان وتصميم الابتسامة الرقمية وعلاج الجذور بدون ألم.'
      },
      {
        name: 'د. نورهان المهدي',
        specialty: 'derma',
        rating: 0.0,
        rating_count: 0,
        consultation_fee: 190,
        clinic_name: 'عيادات ديرما كير للتجميل والليزر',
        clinic_type: 'CENTER',
        governorate: 'القاهرة',
        clinic_address: 'التجمع الخامس، شارع التسعين الشمالي، مديكال بارك 1',
        latitude: 30.0254,
        longitude: 31.4753,
        verification_status: 'VERIFIED',
        bio: 'استشارية الأمراض الجلدية والتجميل والعلاج بالليزر وحقن الفيلر والبوتوكس ونضارة البشرة.'
      },
      {
        name: 'د. حسام الشريف',
        specialty: 'psych',
        rating: 0.0,
        rating_count: 0,
        consultation_fee: 220,
        clinic_name: 'مركز السكينة للصحة النفسية',
        clinic_type: 'PRIVATE',
        governorate: 'الإسكندرية',
        clinic_address: 'سموحة، شارع فوزي معاذ، برج الأطباء، الإسكندرية',
        latitude: 31.2156,
        longitude: 29.9489,
        verification_status: 'VERIFIED',
        bio: 'استشاري الطب النفسي وعلاج الإدمان والعلاج المعرفي السلوكي واضطرابات القلق والاكتئاب.'
      },
      {
        name: 'د. كريم عبد العزيز',
        specialty: 'general',
        rating: 0.0,
        rating_count: 0,
        consultation_fee: 200,
        clinic_name: 'عيادات السلام التخصصية',
        clinic_type: 'CENTER',
        governorate: 'الغربية',
        clinic_address: 'شارع البحر، طنطا، برج النخيل الطبي',
        latitude: 30.7865,
        longitude: 31.0004,
        verification_status: 'VERIFIED',
        bio: 'استشاري الطب العام والباطنة، خبرة أكثر من 15 عاماً في التشخيص والعلاج السريري.'
      },
      {
        name: 'د. كريم سامي',
        specialty: 'therapy',
        rating: 4.9,
        rating_count: 24,
        consultation_fee: 180,
        clinic_name: 'مركز الحياة للعلاج الطبيعي والتأهيل',
        clinic_type: 'CENTER',
        governorate: 'القاهرة',
        clinic_address: 'مدينة نصر، شارع مكرم عبيد، القاهرة',
        latitude: 30.0610,
        longitude: 31.3450,
        verification_status: 'VERIFIED',
        bio: 'استشاري العلاج الطبيعي والتأهيل الحركي، علاج الانزلاق الغضروفي، وتأهيل إصابات الملاعب وما بعد العمليات الجراحية.'
      }
    ]);

    // 3. إنشاء طلب كشف تجريبي وارد من المريض إلى الدكتورة سارة
    const { Appointment } = require('./models');
    await Appointment.create({
      user_id: patient.id,
      doctor_id: doctorProfile.id,
      time_slot: new Date(),
      doctor_scheduled_time: 'اليوم الساعة 10:00 مساءً',
      status: 'TIME_SET',
      doctor_fee: 150,
      app_fee: 10,
      price_cents: 160,
      paid: true
    });

    // 3. إنشاء صيدليات تجريبية
    const pharmacies = await Pharmacy.bulkCreate([
      {
        name: 'صيدلية الشفاء المركزية',
        address: 'شارع التحرير، وسط البلد',
        phone: '+201000000001',
        governorate: 'القاهرة',
        latitude: 30.0444,
        longitude: 31.2357,
        verification_status: 'VERIFIED'
      },
      {
        name: 'صيدلية الأمل الحديثة',
        address: 'حي الزهور، شارع النصر',
        phone: '+201000000002',
        governorate: 'القاهرة',
        latitude: 30.0555,
        longitude: 31.2450,
        verification_status: 'VERIFIED'
      },
      {
        name: 'صيدلية النور للتوصيل السريع',
        address: 'المعادي، شارع 9',
        phone: '+201000000003',
        governorate: 'القاهرة',
        latitude: 29.9602,
        longitude: 31.2569,
        verification_status: 'VERIFIED'
      },
      {
        name: 'صيدلية العزبي - فرع سموحة',
        address: 'ميدان فيكتور عمانويل، سموحة',
        phone: '03-4299999',
        governorate: 'الإسكندرية',
        latitude: 31.2156,
        longitude: 29.9553,
        verification_status: 'VERIFIED'
      },
      {
        name: 'صيدلية مصر - فرع الدقي',
        address: 'شارع التحرير، تقاطع شارع الدقي',
        phone: '02-3760000',
        governorate: 'الجيزة',
        latitude: 30.0384,
        longitude: 31.2114,
        verification_status: 'VERIFIED'
      },
      {
        name: 'صيدلية سيف - المنصورة',
        address: 'شارع المشاية السفلية، أمام حديقة شجر الدر',
        phone: '050-2211000',
        governorate: 'الدقهلية',
        latitude: 31.0409,
        longitude: 31.3785,
        verification_status: 'VERIFIED'
      },
      {
        name: 'صيدلية رشدي - طنطا',
        address: 'شارع الجيش، برج الأطباء',
        phone: '040-3344555',
        governorate: 'الغربية',
        latitude: 30.7865,
        longitude: 31.0004,
        verification_status: 'VERIFIED'
      },
      {
        name: 'صيدلية القناة للتوصيل السريع',
        address: 'شارع الجيش، حي الأربعين',
        phone: '062-3221100',
        governorate: 'السويس',
        latitude: 29.9668,
        longitude: 32.5498,
        verification_status: 'VERIFIED'
      }
    ]);

    // 4. إنشاء مراكز العلاج الطبيعي والتأهيل الحركي مع فروعها
    const cureCenterSuez = await TherapyCenter.create({
      name: 'مركز كيور للعلاج الطبيعي والتأهيل الحركي',
      description: 'مركز متخصص في العلاج الطبيعي والتأهيل الحركي وإعادة التأهيل بعد الجراحات والحوادث. نستخدم أحدث الأجهزة الطبية العالمية.',
      services: 'علاج إصابات ملاعب الرياضة | تأهيل بعد جراحات العظام | علاج خشونة المفاصل | علاج آلام الظهر والرقبة | علاج شلل الأطفال وإصابات العمود الفقري | جلسات الموجات فوق الصوتية | تقوية العضلات والرباط الصليبي',
      rating: 0.0,
        rating_count: 0,
      phone: '01200000001',
      governorate: 'السويس',
      verification_status: 'VERIFIED'
    });

    await TherapyBranch.bulkCreate([
      {
        center_id: cureCenterSuez.id,
        branch_name: 'فرع السلام 2',
        governorate: 'السويس',
        district: 'حي السلام 2',
        address: 'شارع عثمان بن عفان، بجوار مستشفى التأمين الصحي، حي السلام 2، السويس',
        phone: '01200000002',
        working_hours: 'يومياً من 9:00 ص حتى 9:00 م (ما عدا الجمعة)',
        session_fee: 180,
        latitude: 29.9312,
        longitude: 32.5497,
      },
      {
        center_id: cureCenterSuez.id,
        branch_name: 'فرع الأربعين',
        governorate: 'السويس',
        district: 'حي الأربعين',
        address: 'ميدان الأربعين، برج الأطباء الرئيسي، الدور الثالث، الأربعين، السويس',
        phone: '01200000003',
        working_hours: 'يومياً من 10:00 ص حتى 10:00 م',
        session_fee: 180,
        latitude: 29.9668,
        longitude: 32.5498,
      }
    ]);

    // مركز علاج طبيعي إضافي بالقاهرة
    const rehabCairo = await TherapyCenter.create({
      name: 'مركز ريهاب بلس للعلاج الطبيعي والتأهيل الرياضي',
      description: 'مركز متخصص في تأهيل الرياضيين وعلاج إصابات الملاعب وخشونة المفاصل وآلام العمود الفقري.',
      services: 'تأهيل رياضي | علاج آلام الظهر والرقبة | جلسات الليزر المنخفض | علاج الشد العضلي | رياضة علاجية وإعادة تأهيل حركي',
      rating: 0.0,
        rating_count: 0,
      phone: '01100000010',
      governorate: 'القاهرة',
      verification_status: 'VERIFIED'
    });

    await TherapyBranch.bulkCreate([
      {
        center_id: rehabCairo.id,
        branch_name: 'فرع مدينة نصر',
        governorate: 'القاهرة',
        district: 'مدينة نصر',
        address: 'شارع عباس العقاد، بجوار محطة مترو مدينة نصر، مدينة نصر، القاهرة',
        phone: '01100000011',
        working_hours: 'يومياً من 10:00 ص حتى 9:00 م',
        session_fee: 200,
        latitude: 30.0571,
        longitude: 31.3413,
      },
      {
        center_id: rehabCairo.id,
        branch_name: 'فرع التجمع الخامس',
        governorate: 'القاهرة',
        district: 'التجمع الخامس',
        address: 'شارع التسعين الشمالي، مديكال بارك 2، وحدة 101، التجمع الخامس، القاهرة',
        phone: '01100000012',
        working_hours: 'السبت - الخميس من 9:00 ص حتى 10:00 م',
        session_fee: 220,
        latitude: 30.0213,
        longitude: 31.4718,
      }
    ]);

    console.log('✅ تم إدخال البيانات التجريبية بنجاح!');
    console.log('----------------------------------------------------');
    console.log('👑 حساب مالك المنصة (Super Admin): admin@hayat.com | كلمة المرور: admin123');
    console.log('👤 حساب مريض تجريبي: patient@example.com | كلمة المرور: password123');
    console.log('👨‍⚕️ حساب طبيب تجريبي: doctor@example.com  | كلمة المرور: password123');
    console.log(`🩺 عدد الأطباء المضافين: ${doctors.length + 1}`);
    console.log(`💊 عدد الصيدليات المضافة: ${pharmacies.length}`);
    console.log(`🏃‍♂️ مراكز العلاج الطبيعي: 2 مراكز (4 فروع) - منها مركز كيور للعلاج الطبيعي بفرعيه في السويس`);
    console.log('----------------------------------------------------');

    process.exit(0);
  } catch (error) {
    console.error('❌ حدث خطأ أثناء إدخال البيانات:', error);
    process.exit(1);
  }
}

seedDatabase();
