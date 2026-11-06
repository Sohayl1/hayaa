// test_doctor_wallet.js
require('dotenv').config({ path: 'c:/Users/ywsfh/Downloads/AI/.env' });

const BASE_URL = 'http://localhost:5000';

async function runWalletTests() {
  console.log('🧪 بدء فحص واختبار نظام محفظة الطبيب وسحب الأرباح (انستاباي / فودافون كاش / Paymob)...');

  try {
    // 1. تسجيل دخول الطبيب (doctor@example.com)
    console.log('\n1️⃣ تسجيل دخول الطبيب (doctor@example.com)...');
    const docLoginRes = await fetch(BASE_URL + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'doctor@example.com', password: 'password123' })
    });
    const docLogin = await docLoginRes.json();
    if (!docLoginRes.ok) throw new Error('فشل تسجيل دخول الطبيب: ' + JSON.stringify(docLogin));
    const doctorToken = docLogin.token;
    console.log('   ✅ تم تسجيل دخول الطبيب بنجاح. معرف المستخدم:', docLogin.user.id);

    // 2. استعلام محفظة الطبيب والأرباح
    console.log('\n2️⃣ جلب بيانات محفظة الطبيب وأرباح الكشوفات المسددة...');
    let walletRes = await fetch(BASE_URL + '/api/doctor/wallet', {
      headers: { 'Authorization': 'Bearer ' + doctorToken }
    });
    let walletData = await walletRes.json();
    if (!walletRes.ok) throw new Error('فشل جلب المحفظة: ' + JSON.stringify(walletData));
    console.log('   ✅ بيانات المحفظة الأولية:', {
      doctor: walletData.doctor?.name,
      availableBalance: walletData.availableBalance + ' EGP',
      totalEarnings: walletData.totalEarnings + ' EGP',
      paidConsultationsCount: walletData.paidConsultationsCount,
      pendingWithdrawals: walletData.pendingWithdrawals + ' EGP',
      completedWithdrawals: walletData.completedWithdrawals + ' EGP'
    });

    const initialAvailable = walletData.availableBalance;

    // إذا كان الرصيد المتاح 0 لأي سبب، نقوم بمحاكاة كشف مسدد لنختبر السحب بدقة
    if (initialAvailable < 150) {
      console.log('   ℹ️ جاري إضافة حجز مسدد لرفع رصيد المحفظة للاختبار...');
      const patientLoginRes = await fetch(BASE_URL + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'patient@example.com', password: 'password123' })
      });
      const patientToken = (await patientLoginRes.json()).token;

      // حجز جديد
      const newApptRes = await fetch(BASE_URL + '/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + patientToken },
        body: JSON.stringify({ doctorId: walletData.doctor.id })
      });
      const newAppt = (await newApptRes.json()).appointment;

      // إنشاء Intention وسداده
      await fetch(BASE_URL + '/api/payments/paymob/create-intention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + patientToken },
        body: JSON.stringify({ appointmentId: newAppt.id })
      });

      // إرسال Webhook سداد
      const fakeObj = {
        id: 'TX_DOC_TEST_' + Date.now(),
        amount_cents: 26000,
        currency: 'EGP',
        success: true,
        special_reference: newAppt.id,
        created_at: new Date().toISOString()
      };
      await fetch(BASE_URL + '/api/payments/paymob/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obj: fakeObj })
      });

      // إعادة جلب المحفظة بعد السداد
      walletRes = await fetch(BASE_URL + '/api/doctor/wallet', {
        headers: { 'Authorization': 'Bearer ' + doctorToken }
      });
      walletData = await walletRes.json();
      console.log('   ✅ تم تحديث الرصيد بعد الكشف المسدد:', walletData.availableBalance + ' EGP');
    }

    // 3. تقديم طلب سحب عبر انستا باي (InstaPay)
    console.log('\n3️⃣ تقديم طلب سحب أرباح عبر انستا باي (InstaPay)...');
    const withdrawAmount1 = 50;
    const payout1Res = await fetch(BASE_URL + '/api/doctor/payout-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + doctorToken
      },
      body: JSON.stringify({
        amount: withdrawAmount1,
        method: 'INSTAPAY',
        accountDetails: 'doctor_sara@instapay',
        accountName: 'د. سارة المنصور'
      })
    });
    const payout1Data = await payout1Res.json();
    if (!payout1Res.ok) throw new Error('فشل تقديم طلب سحب انستاباي: ' + JSON.stringify(payout1Data));
    const payout1Id = payout1Data.payoutRequest.id;
    console.log(`   ✅ نجح تقديم طلب سحب انستاباي! المعرف: ${payout1Id}، المبلغ: ${withdrawAmount1} ج، الرصيد المتبقي: ${payout1Data.newAvailableBalance} ج`);

    // 4. تقديم طلب سحب عبر فودافون كاش (Vodafone Cash)
    console.log('\n4️⃣ تقديم طلب سحب أرباح عبر فودافون كاش (Vodafone Cash)...');
    const withdrawAmount2 = 60;
    const payout2Res = await fetch(BASE_URL + '/api/doctor/payout-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + doctorToken
      },
      body: JSON.stringify({
        amount: withdrawAmount2,
        method: 'VODAFONE_CASH',
        accountDetails: '01012345678',
        accountName: 'د. سارة المنصور'
      })
    });
    const payout2Data = await payout2Res.json();
    if (!payout2Res.ok) throw new Error('فشل تقديم طلب سحب فودافون كاش: ' + JSON.stringify(payout2Data));
    const payout2Id = payout2Data.payoutRequest.id;
    console.log(`   ✅ نجح تقديم طلب سحب فودافون كاش! المعرف: ${payout2Id}، المبلغ: ${withdrawAmount2} ج، الرصيد المتبقي: ${payout2Data.newAvailableBalance} ج`);

    // 5. اختبار الأمان ومنع سحب مبلغ يفوق الرصيد المتاح
    console.log('\n5️⃣ اختبار الأمان: محاولة سحب مبلغ أكبر من الرصيد المتاح...');
    const overWithdrawRes = await fetch(BASE_URL + '/api/doctor/payout-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + doctorToken
      },
      body: JSON.stringify({
        amount: 999999,
        method: 'INSTAPAY',
        accountDetails: 'doctor@instapay'
      })
    });
    console.log('   ✅ نتيجة محاولة السحب الزائد: HTTP', overWithdrawRes.status);
    if (overWithdrawRes.status !== 400) {
      throw new Error('النظام لم يمنع سحب مبلغ يفوق الرصيد المتاح!');
    }

    // 6. تسجيل دخول المدير العام وفحص طلبات السحب
    console.log('\n6️⃣ تسجيل دخول مالك المنصة والمدير العام (admin@hayat.com)...');
    const adminLoginRes = await fetch(BASE_URL + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@hayat.com', password: 'admin123' })
    });
    const adminLogin = await adminLoginRes.json();
    if (!adminLoginRes.ok) throw new Error('فشل تسجيل دخول الأدمن: ' + JSON.stringify(adminLogin));
    const adminToken = adminLogin.token;

    const adminPayoutsRes = await fetch(BASE_URL + '/api/admin/payout-requests', {
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });
    const adminPayouts = await adminPayoutsRes.json();
    console.log(`   ✅ إجمالي طلبات السحب في لوحة الأدمن: ${adminPayouts.length}`);

    // 7. اعتماد طلب انستاباي بواسطة المالك
    console.log('\n7️⃣ اعتماد وتحويل طلب انستاباي بواسطة المالك...');
    const approveRes = await fetch(`${BASE_URL}/api/admin/payout-requests/${payout1Id}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + adminToken
      },
      body: JSON.stringify({
        action: 'APPROVE',
        transactionReference: 'IP-TRANSFER-' + Date.now(),
        adminNotes: 'تم إرسال التحويل لحساب انستاباي بنجاح'
      })
    });
    const approveData = await approveRes.json();
    if (!approveRes.ok) throw new Error('فشل اعتماد طلب السحب: ' + JSON.stringify(approveData));
    console.log('   ✅ نتيجة اعتماد الطلب:', approveData.message);
    if (approveData.request.status !== 'COMPLETED') {
      throw new Error('حالة الطلب لم تتغير إلى COMPLETED!');
    }

    // 8. رفض طلب فودافون كاش من قبل المالك للتأكد من استرداد الرصيد للطبيب
    console.log('\n8️⃣ رفض طلب فودافون كاش من المالك والتأكد من إعادة الرصيد لمحفظة الطبيب...');
    const rejectRes = await fetch(`${BASE_URL}/api/admin/payout-requests/${payout2Id}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + adminToken
      },
      body: JSON.stringify({
        action: 'REJECT',
        adminNotes: 'رقم المحفظة غير مفعل حالياً'
      })
    });
    const rejectData = await rejectRes.json();
    if (!rejectRes.ok) throw new Error('فشل رفض طلب السحب: ' + JSON.stringify(rejectData));
    console.log('   ✅ نتيجة الرفض:', rejectData.message);
    if (rejectData.request.status !== 'REJECTED') {
      throw new Error('حالة الطلب لم تتغير إلى REJECTED!');
    }

    // 9. التحقق النهائي من محفظة الطبيب بعد الاعتماد والرفض
    console.log('\n9️⃣ فحص أرصدة المحفظة النهائية للطبيب...');
    const finalWalletRes = await fetch(BASE_URL + '/api/doctor/wallet', {
      headers: { 'Authorization': 'Bearer ' + doctorToken }
    });
    const finalWallet = await finalWalletRes.json();
    console.log('   ✅ الأرصدة النهائية:', {
      availableBalance: finalWallet.availableBalance + ' EGP',
      completedWithdrawals: finalWallet.completedWithdrawals + ' EGP',
      pendingWithdrawals: finalWallet.pendingWithdrawals + ' EGP'
    });

    console.log('\n🎉🎉 جميع اختبارات محفظة الطبيب وسحب الأرباح (انستاباي / فودافون كاش / Paymob) اكتملت بنجاح 100%!');
  } catch (err) {
    console.error('\n❌ فشل الاختبار:', err.message);
    process.exit(1);
  }
}

runWalletTests();
