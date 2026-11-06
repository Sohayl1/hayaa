# 📱 تطبيق الهاتف الذكي (Telehealth Mobile App)

تطبيق هاتف متكامل يعمل على **Android و iPhone (iOS)** باستخدام **React Native + Expo**.

---

## 🚀 كيفية تشغيل التطبيق وتجربته على هاتفك:

### 1. تثبيت حزم التطبيق:
افتح نافذة PowerShell وانتقل لمجلد الهاتف ثم ثبت الحزم:
```powershell
cd mobile
npm install
```

### 2. تشغيل خادم التطبيق (Expo):
```powershell
npx expo start
```

---

## 📲 كيفية فتحه على هاتفك المحمول مباشرة:

1. حمّل تطبيق **Expo Go** على هاتفك:
   * لأجهزة **Android**: من متجر [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)
   * لأجهزة **iPhone**: من متجر [App Store](https://apps.apple.com/app/expo-go/id982107779)
2. تأكد أن هاتفك وجهاز الكمبيوتر متصلان بـ **نفس شبكة الواي فاي (Wi-Fi)**.
3. افتح تطبيق Expo Go (أو كاميرا الهاتف في الآيفون) وامسح **رمز الاستجابة السريعة (QR Code)** الذي سيظهر في شاشة الـ Terminal.
4. سيفتح التطبيق ويعمل على هاتفك فوراً! 🎉

---

## 🌐 إعدادات عنوان الخادم:
تم ضبط عنوان الخادم في ملف `src/api/config.js` ليكون:
`http://192.168.1.65:5000` (عنوان IP جهازك على الشبكة المحلية).
