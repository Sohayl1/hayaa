# 🌐 دليل نشر منصة "حَيَاه" للعامة (Public Deployment Guide)

تم تجهيز المنصة بالكامل لتكون **جاهزة للإطلاق والنشر أونلاين على الإنترنت للجميع**.

---

## 💡 كيف تعمل المنصة أونلاين؟
تتكون منصة "حياه" من نظام متكامل:
1. **الواجهة الأمامية (Frontend):** تصفح الأطباء، الحجوزات، الروشتات، طلب الأدوية، وخاصية طوارئ SOS.
2. **الواجهة الخلفية (Backend API):** سيرفر Node.js / Express لمعالجة التسجيل، المصادقة (JWT)، والمدفوعات.
3. **قاعدة البيانات (Database):** PostgreSQL سحابية للإنتاج، أو SQLite.

---

## 🚀 الخيار الأول: النشر بنقرة واحدة على Render.com (مجاني 100% وموصى به)

منصة [Render.com](https://render.com) توفر استضافة مجانية مع شهادة أمان SSL (HTTPS) مجانية وربط تلقائي مع مستودع GitHub.

### خطوات النشر في 3 دقائق:
1. افتح موقع [https://render.com](https://render.com) واضغط **Sign Up** واختر **Sign in with GitHub**.
2. من لوحة التحكم، اضغط على زر **New +** فوق على اليمين واختر **Blueprint**.
3. اختر مستودع مشروعك: **`Sohayl1/hayaa`**.
4. سيقرأ موقع Render ملف الإعدادات المجهز تلقائياً [`render.yaml`](./render.yaml):
   - سيقوم بإنشاء خادم Node.js مع قاعدة بيانات PostgreSQL سحابية مجاناً.
5. اضغط على **Apply**.
6. سيبدأ البناء وسيظهر لك رابط المنصة الرسمي المباشر مثل:
   👉 `https://hayaa-health.onrender.com`

> 🎉 بمجرد انتهاء البناء، سيكون الموقع متاحاً لأي شخص في العالم على مدار 24 ساعة، مع تحديثات تلقائية بمجرد عمل `git push`!

---

## ⚡ الخيار الثاني: النشر عبر Docker على Railway أو Koyeb

تم تجهيز ملف [`Dockerfile`](./Dockerfile) مسبقاً:
1. سجل في [Railway.app](https://railway.app).
2. اضغط **New Project** ➔ **Deploy from GitHub repo**.
3. اختر مستودع `hayaa`.
4. سيتعرف Railway على الـ Dockerfile ويبدأ التشغيل الفوري.

---

## 📱 ربط تطبيق الأندرويد بالرابط العام المباشر

بعد حصولك على الرابط العام لموقعك (مثلاً: `https://hayaa-health.onrender.com`):

1. افتح ملف نصوص الأندرويد:
   `hayaa_android/app/src/main/res/values/strings.xml`
2. عدل السطر رقم 15 وضع رابطك العام بدلاً من رابط اللوكال:
   ```xml
   <string name="app_url">https://hayaa-health.onrender.com</string>
   ```
3. أعد استخراج الحزمة لتطبيق الأندرويد بالأمر:
   ```bash
   cd hayaa_android
   .\gradlew.bat bundleRelease
   ```
4. مبروك! التطبيق سيتصل مباشرة بسيرفرك السحابي من أي موبايل في أي دولة في العالم!

---

## 🔍 مميزات تم إضافتها لمحركات البحث وSEO
- **ملف Robots:** [`public/robots.txt`](./public/robots.txt)
- **خريطة الموقع:** [`public/sitemap.xml`](./public/sitemap.xml)
- **فحص صحة الخادم:** `GET /health` و `GET /api/health`
- **بطاقات المشاركة:** بطاقات Open Graph و Twitter لظهور شعار ووصف المنصة عند مشاركة الرابط على واتساب وفيسبوك.
