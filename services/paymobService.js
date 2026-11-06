// services/paymobService.js
const crypto = require('crypto');

/**
 * Paymob Service - يدير عمليات الدفع الإلكتروني الموحدة (Unified Checkout)
 * والتحقق من توقيع الـ HMAC Webhook الصادر من خوادم Paymob
 */

const PAYMOB_BASE_URL = 'https://accept.paymob.com';

/**
 * دالة إنشاء نية دفع (Payment Intention) عبر Paymob Unified Checkout API
 */
async function createPaymobIntention({
  amount,
  currency = 'EGP',
  billingData = {},
  specialReference,
  notificationUrl,
  redirectionUrl
}) {
  const secretKey = process.env.PAYMOB_SECRET_KEY;
  const publicKey = process.env.PAYMOB_PUBLIC_KEY;

  const cardIntegrationId = parseInt(process.env.PAYMOB_CARD_INTEGRATION_ID) || null;
  const walletIntegrationId = parseInt(process.env.PAYMOB_WALLET_INTEGRATION_ID) || null;

  const paymentMethods = [];
  if (cardIntegrationId) paymentMethods.push(cardIntegrationId);
  if (walletIntegrationId) paymentMethods.push(walletIntegrationId);

  const amountCents = Math.round(parseFloat(amount) * 100);

  // إعداد بيانات العميل المطلوبة من Paymob
  const names = (billingData.name || 'عميل حياه').trim().split(' ');
  const firstName = names[0] || 'Patient';
  const lastName = names.slice(1).join(' ') || 'Hayat';

  const formattedBillingData = {
    first_name: firstName,
    last_name: lastName,
    phone_number: billingData.phone || '+201000000000',
    email: billingData.email || 'patient@hayat.com',
    apartment: 'NA',
    floor: 'NA',
    street: billingData.street || 'NA',
    building: 'NA',
    city: billingData.governorate || 'Cairo',
    country: 'EGY',
    state: billingData.governorate || 'Cairo'
  };

  // إذا لم تكن مفاتيح Paymob الحقيقية متوفرة بعد، نوفر وضع المحاكاة التجريبي (Demo Simulator Mode)
  if (!secretKey || secretKey.trim() === '' || secretKey.startsWith('mock_')) {
    console.warn('⚠️ [Paymob Service] لم يتم العثور على PAYMOB_SECRET_KEY حقيقي في .env، يتم تفعيل وضع الاختبار التجريبي الآمن.');
    const mockClientSecret = 'mock_cs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const mockIntentionId = 'mock_intent_' + Date.now();
    const mockCheckoutUrl = '/checkout.html?appointmentId=' + specialReference + '&mockPaymob=true&clientSecret=' + mockClientSecret;

    return {
      success: true,
      isMock: true,
      clientSecret: mockClientSecret,
      intentionId: mockIntentionId,
      publicKey: publicKey || 'egy_pk_test_mock',
      checkoutUrl: mockCheckoutUrl,
      amountCents
    };
  }

  // استدعاء Paymob Intention API الحقيقي
  const payload = {
    amount: amountCents,
    currency,
    payment_methods: paymentMethods.length > 0 ? paymentMethods : undefined,
    billing_data: formattedBillingData,
    special_reference: specialReference,
    notification_url: notificationUrl,
    redirection_url: redirectionUrl
  };

  try {
    const response = await fetch(`${PAYMOB_BASE_URL}/v1/intention/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${secretKey}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ [Paymob Error]:', data);
      throw new Error(data.message || JSON.stringify(data) || 'فشل الاتصال ببوابة Paymob');
    }

    const clientSecret = data.client_secret;
    const checkoutUrl = `${PAYMOB_BASE_URL}/unifiedcheckout/?publicKey=${publicKey}&clientSecret=${clientSecret}`;

    return {
      success: true,
      isMock: false,
      clientSecret,
      intentionId: data.id,
      publicKey,
      checkoutUrl,
      amountCents
    };
  } catch (err) {
    console.error('❌ [Paymob Request Failed]:', err.message);
    throw err;
  }
}

/**
 * تدقيق وفحص توقيع الـ HMAC الصادر من خوادم Paymob للتحقق من أمان ومصداقية الـ Webhook
 */
function verifyPaymobHmac(transactionObj, receivedHmac) {
  const hmacSecret = process.env.PAYMOB_HMAC_SECRET || '';

  if (!transactionObj || !receivedHmac) {
    return false;
  }

  // إذا لم يتم ضبط HMAC_SECRET في .env، نستخدم سلسلة فارغة للاختبار (تجريبي)
  // وفي هذه الحالة يُقبل الـ Webhook فقط إذا تطابق الـ HMAC مع حسابنا بنفس المفتاح الفارغ
  if (!hmacSecret || hmacSecret.trim() === '') {
    console.warn('⚠️ [Paymob HMAC] PAYMOB_HMAC_SECRET غير محدد في .env - تحقق تجريبي بمفتاح فارغ.');
  }

  // تسلسل الحقول المحدد بدقة بواسطة Paymob لحساب الـ HMAC SHA-512
  const fields = [
    transactionObj.amount_cents,
    transactionObj.created_at,
    transactionObj.currency,
    transactionObj.error_occured,
    transactionObj.has_parent_transaction,
    transactionObj.id,
    transactionObj.integration_id,
    transactionObj.is_3d_secure,
    transactionObj.is_auth,
    transactionObj.is_capture,
    transactionObj.is_refunded,
    transactionObj.is_standalone_payment,
    transactionObj.is_voided,
    transactionObj.order?.id,
    transactionObj.owner,
    transactionObj.pending,
    transactionObj.source_data?.pan,
    transactionObj.source_data?.sub_type,
    transactionObj.source_data?.type,
    transactionObj.success
  ];

  const concatenatedString = fields.map(f => (f === undefined || f === null ? '' : f.toString())).join('');

  const calculatedHmac = crypto
    .createHmac('sha512', hmacSecret)
    .update(concatenatedString)
    .digest('hex');

  const isValid = calculatedHmac.toLowerCase() === receivedHmac.toLowerCase();
  if (!isValid) {
    console.error('❌ [Paymob HMAC Error]: فشل التحقق من صحة توقيع الـ HMAC!');
  }

  return isValid;
}

module.exports = {
  createPaymobIntention,
  verifyPaymobHmac
};