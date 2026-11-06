// lib/services/auth_service.dart
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  User? get currentUser => _auth.currentUser;
  Stream<User?> get authStateChanges => _auth.authStateChanges();

  // 1. تسجيل الدخول عبر Google
  Future<UserCredential?> signInWithGoogle() async {
    try {
      final GoogleSignInAccount? googleUser = await GoogleSignIn(scopes: ['email']).signIn();
      if (googleUser == null) return null;

      final GoogleSignInAuthentication googleAuth = await googleUser.authentication;

      final AuthCredential credential = GoogleAuthProvider.credential(
        idToken: googleAuth.idToken,
        accessToken: googleAuth.accessToken,
      );

      UserCredential userCred = await _auth.signInWithCredential(credential);
      if (userCred.user != null) {
        await _storeBasicInfo(userCred.user!);
      }
      return userCred;
    } catch (e) {
      rethrow;
    }
  }

  // 2. تسجيل الدخول بالبريد وكلمة المرور
  Future<UserCredential> signInWithEmailPassword(String email, String password) async {
    return await _auth.signInWithEmailAndPassword(email: email, password: password);
  }

  // 3. حفظ بيانات المستخدم في Firestore إن لم تكن موجودة
  Future<void> _storeBasicInfo(User user) async {
    DocumentReference ref = _db.collection('users').doc(user.uid);
    DocumentSnapshot snap = await ref.get();

    if (!snap.exists) {
      await ref.set({
        'name': user.displayName ?? 'مستخدم جديد',
        'email': user.email,
        'phone': user.phoneNumber ?? '',
        'role': 'patient',
        'createdAt': FieldValue.serverTimestamp(),
      });
    }
  }

  // 4. تسجيل الخروج
  Future<void> signOut() async {
    await GoogleSignIn().signOut();
    await _auth.signOut();
  }
}
