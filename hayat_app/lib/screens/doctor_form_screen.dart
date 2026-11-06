// lib/screens/doctor_form_screen.dart
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'home_screen.dart';

class DoctorFormScreen extends StatefulWidget {
  const DoctorFormScreen({super.key});

  @override
  State<DoctorFormScreen> createState() => _DoctorFormScreenState();
}

class _DoctorFormScreenState extends State<DoctorFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _bioController = TextEditingController();
  final _clinicAddressController = TextEditingController();
  final _priceController = TextEditingController(text: '150');

  String _selectedSpecialty = 'عام';
  final List<String> _specialties = ['عام', 'نساء وتوليد', 'أطفال', 'قلب وأوعية', 'جلدية', 'عظام', 'جراحة'];

  File? _syndicateFrontFile;
  File? _syndicateBackFile;
  File? _graduationCertFile;
  File? _facePhotoFile;
  bool _isLoading = false;

  Future<void> _pickDocumentImage(Function(File) onPicked) async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (picked != null) {
      setState(() => onPicked(File(picked.path)));
    }
  }

  Future<String> _uploadFile(File file, String folder, String uid) async {
    final ref = FirebaseStorage.instance
        .ref()
        .child('doctors_verification')
        .child(uid)
        .child('$folder.jpg');
    await ref.putFile(file);
    return await ref.getDownloadURL();
  }

  Future<void> _submitDoctor() async {
    if (!_formKey.currentState!.validate()) return;

    if (_syndicateFrontFile == null ||
        _syndicateBackFile == null ||
        _graduationCertFile == null ||
        _facePhotoFile == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: Colors.red,
          content: Text('⚠️ يرجى إرفاق المستندات الأربعة كاملة (كارنيه النقابة وش وضهر، شهادة التخرج، وصورة الوجه).'),
        ),
      );
      return;
    }

    setState(() => _isLoading = true);
    try {
      final user = FirebaseAuth.instance.currentUser;
      final uid = user?.uid ?? DateTime.now().millisecondsSinceEpoch.toString();

      final syndicateFrontUrl = await _uploadFile(_syndicateFrontFile!, 'syndicate_front', uid);
      final syndicateBackUrl = await _uploadFile(_syndicateBackFile!, 'syndicate_back', uid);
      final gradCertUrl = await _uploadFile(_graduationCertFile!, 'graduation_cert', uid);
      final facePhotoUrl = await _uploadFile(_facePhotoFile!, 'face_photo', uid);

      await FirebaseFirestore.instance.collection('doctors').add({
        'name': _nameController.text.trim(),
        'specialty': _selectedSpecialty,
        'bio': _bioController.text.trim(),
        'clinicAddress': _clinicAddressController.text.trim(),
        'price': double.tryParse(_priceController.text) ?? 150.0,
        'rating': 5.0,
        'syndicateFrontUrl': syndicateFrontUrl,
        'syndicateBackUrl': syndicateBackUrl,
        'graduationCertUrl': gradCertUrl,
        'photoUrl': facePhotoUrl,
        'verificationStatus': 'PENDING',
        'userId': user?.uid ?? '',
        'createdAt': FieldValue.serverTimestamp(),
      });

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: Colors.teal,
          content: Text('🎉 تم استلام طلبك والمستندات بنجاح! الأوراق قيد المراجعة والاعتماد.'),
        ),
      );

      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => const HomeScreen()),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('خطأ أثناء الحفظ: $e')),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Widget _buildUploadTile({
    required String title,
    required String subtitle,
    required File? file,
    required VoidCallback onTap,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: file != null ? Colors.teal.shade50 : Colors.grey.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: file != null ? Colors.teal : Colors.grey.shade300,
          width: file != null ? 1.5 : 1,
        ),
      ),
      child: Row(
        children: [
          Icon(
            file != null ? Icons.check_circle : Icons.upload_file,
            color: file != null ? Colors.teal : Colors.grey,
            size: 28,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                Text(subtitle, style: TextStyle(color: Colors.grey.shade600, fontSize: 11)),
                if (file != null)
                  const Text('✅ تم اختيار الصورة', style: TextStyle(color: Colors.green, fontSize: 11, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          TextButton(
            onPressed: onTap,
            style: TextButton.styleFrom(
              backgroundColor: Colors.teal.shade100,
              foregroundColor: Colors.teal.shade900,
            ),
            child: Text(file != null ? 'تغيير' : 'رفع'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('تسجيل واعتماد طبيب جديد 👨‍⚕️'),
          backgroundColor: Colors.teal,
          foregroundColor: Colors.white,
        ),
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: _formKey,
            child: ListView(
              children: [
                const Text(
                  'البيانات الأساسية',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Colors.teal),
                ),
                const SizedBox(height: 12),

                TextFormField(
                  controller: _nameController,
                  decoration: const InputDecoration(
                    labelText: 'اسم الطبيب واللقب العلمي',
                    border: OutlineInputBorder(),
                  ),
                  validator: (v) => v!.isEmpty ? 'يرجى إدخال اسم الطبيب' : null,
                ),
                const SizedBox(height: 14),

                DropdownButtonFormField<String>(
                  value: _selectedSpecialty,
                  decoration: const InputDecoration(
                    labelText: 'التخصص الطبي',
                    border: OutlineInputBorder(),
                  ),
                  items: _specialties.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
                  onChanged: (v) => setState(() => _selectedSpecialty = v!),
                ),
                const SizedBox(height: 14),

                TextFormField(
                  controller: _priceController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'سعر الكشف (جنيه مصري)',
                    helperText: 'تضاف تلقائياً 10 جنيه رسوم خدمة التطبيق عند الدفع',
                    border: OutlineInputBorder(),
                  ),
                  validator: (v) => v!.isEmpty ? 'يرجى إدخال سعر الكشف' : null,
                ),
                const SizedBox(height: 14),

                TextFormField(
                  controller: _clinicAddressController,
                  decoration: const InputDecoration(
                    labelText: 'عنوان العيادة / المستشفى',
                    border: OutlineInputBorder(),
                  ),
                  validator: (v) => v!.isEmpty ? 'يرجى إدخال العنوان' : null,
                ),
                const SizedBox(height: 14),

                TextFormField(
                  controller: _bioController,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'نبذة عن المؤهلات والخبرات',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 20),

                // قسم المستندات الأربعة
                const Text(
                  '🛡️ مستندات التحقق الرسمية (4 مستندات إلزامية):',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Colors.teal),
                ),
                const Text(
                  'يتم مراجعة هذه الوثائق للتأكد من هويتك كطبيب معتمد',
                  style: TextStyle(color: Colors.grey, fontSize: 11.5),
                ),
                const SizedBox(height: 12),

                _buildUploadTile(
                  title: '1. صورة كارنيه النقابة (الوجه الأمامي - وش)',
                  subtitle: 'كارنيه نقابة الأطباء الساري',
                  file: _syndicateFrontFile,
                  onTap: () => _pickDocumentImage((f) => _syndicateFrontFile = f),
                ),

                _buildUploadTile(
                  title: '2. صورة كارنيه النقابة (الوجه الخلفي - ضهر)',
                  subtitle: 'الواجهة الخلفية لكارنيه النقابة',
                  file: _syndicateBackFile,
                  onTap: () => _pickDocumentImage((f) => _syndicateBackFile = f),
                ),

                _buildUploadTile(
                  title: '3. صورة شهادة التخرج والدرجة العلمية',
                  subtitle: 'شهادة البكالوريوس أو الماجستير من كلية الطب',
                  file: _graduationCertFile,
                  onTap: () => _pickDocumentImage((f) => _graduationCertFile = f),
                ),

                _buildUploadTile(
                  title: '4. صورة شخصية واضحة للوجه',
                  subtitle: 'صورة بروفايل رسمية بالزي الطبي',
                  file: _facePhotoFile,
                  onTap: () => _pickDocumentImage((f) => _facePhotoFile = f),
                ),

                const SizedBox(height: 20),

                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    backgroundColor: Colors.teal,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: _isLoading ? null : _submitDoctor,
                  child: _isLoading
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text('إرسال طلب الانضمام واعتماد المستندات 🛡️', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                ),
                const SizedBox(height: 30),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

