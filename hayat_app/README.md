# 🏥 تطبيق حياة (Hayat App - Flutter & Firebase)

تطبيق استشارات طبية متكامل ومبني بإطار العمل **Flutter** مع منصة **Firebase** (Auth, Firestore, Storage).

---

## 📁 هيكل المشروع

```
hayat_app/
├── pubspec.yaml              # تعريف التبعيات (Firebase, Provider, ImagePicker)
└── lib/
    ├── main.dart             # نقطة الانطلاق وتهيئة Firebase
    ├── firebase_options.dart # ملف إعدادات منصة Firebase
    ├── services/
    │   └── auth_service.dart # تسجيل الدخول عبر Google والبريد الإلكتروني
    └── screens/
        ├── login_screen.dart       # شاشة تسجيل الدخول
        ├── register_screen.dart    # شاشة تسجيل حساب مريض جديد
        ├── doctor_form_screen.dart # شاشة تسجيل الطبيب ورفع الصورة
        └── home_screen.dart        # الشاشة الرئيسية وعرض الأطباء المباشر من Firestore
```

---

## 🚀 كيفية تشغيل التطبيق:

### 1. تثبيت حزم Flutter:
```powershell
cd hayat_app
flutter pub get
```

### 2. ربط مشروع Firebase الحقيقي (اختياري عبر FlutterFire):
```powershell
flutterfire configure
```

### 3. تشغيل التطبيق:
```powershell
# لتشغيله على جهاز أندرويد أو محاكي
flutter run
```
