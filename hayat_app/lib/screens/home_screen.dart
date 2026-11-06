// lib/screens/home_screen.dart
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'login_screen.dart';
import 'doctor_form_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String _selectedSpecialty = 'الكل';
  final List<String> _filters = ['الكل', 'عام', 'نساء وتوليد', 'أطفال', 'قلب وأوعية', 'جلدية'];

  @override
  Widget build(BuildContext context) {
    Query query = FirebaseFirestore.instance.collection('doctors');
    if (_selectedSpecialty != 'الكل') {
      query = query.where('specialty', isEqualTo: _selectedSpecialty);
    }

    return Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('تطبيق حياة 🏥'),
          backgroundColor: Colors.teal,
          foregroundColor: Colors.white,
          actions: [
            IconButton(
              icon: const Icon(Icons.add_business),
              tooltip: 'تسجيل كطبيب',
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const DoctorFormScreen()),
              ),
            ),
            IconButton(
              icon: const Icon(Icons.logout),
              tooltip: 'تسجيل الخروج',
              onPressed: () async {
                await FirebaseAuth.instance.signOut();
                if (!context.mounted) return;
                Navigator.pushReplacement(
                  context,
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                );
              },
            ),
          ],
        ),
        body: Column(
          children: [
            // شريط الفلاتر والتصنيفات
            Container(
              height: 54,
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: _filters.length,
                itemBuilder: (context, index) {
                  final item = _filters[index];
                  final isSelected = item == _selectedSpecialty;
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    child: ChoiceChip(
                      label: Text(item),
                      selected: isSelected,
                      selectedColor: Colors.teal,
                      labelStyle: TextStyle(
                        color: isSelected ? Colors.white : Colors.black87,
                        fontWeight: FontWeight.bold,
                      ),
                      onSelected: (_) => setState(() => _selectedSpecialty = item),
                    ),
                  );
                },
              ),
            ),

            // قائمة الأطباء المباشرة من Firestore
            Expanded(
              child: StreamBuilder<QuerySnapshot>(
                stream: query.snapshots(),
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return const Center(child: Text('حدث خطأ في تحميل البيانات من Firestore'));
                  }
                  if (snapshot.connectionState == ConnectionState.waiting) {
                    return const Center(child: CircularProgressIndicator(color: Colors.teal));
                  }

                  final docs = snapshot.data?.docs ?? [];
                  if (docs.isEmpty) {
                    return const Center(child: Text('لا يوجد أطباء متاحون في هذا التخصص حالياً'));
                  }

                  return ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: docs.length,
                    itemBuilder: (context, index) {
                      final data = docs[index].data() as Map<String, dynamic>;
                      return Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        elevation: 2,
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  CircleAvatar(
                                    radius: 28,
                                    backgroundColor: Colors.teal.shade50,
                                    backgroundImage: data['photoUrl'] != null && data['photoUrl'] != ''
                                        ? NetworkImage(data['photoUrl'])
                                        : null,
                                    child: (data['photoUrl'] == null || data['photoUrl'] == '')
                                        ? const Icon(Icons.person, size: 28, color: Colors.teal)
                                        : null,
                                  ),
                                  const SizedBox(width: 14),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          data['name'] ?? 'طبيب',
                                          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
                                        ),
                                        Chip(
                                          label: Text(data['specialty'] ?? '', style: const TextStyle(fontSize: 12)),
                                          backgroundColor: Colors.teal.shade50,
                                          visualDensity: VisualDensity.compact,
                                        ),
                                      ],
                                    ),
                                  ),
                                  Text(
                                    '⭐ ${data['rating'] ?? 5.0}',
                                    style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.amber, fontSize: 15),
                                  ),
                                ],
                              ),
                              if (data['clinicAddress'] != null)
                                Padding(
                                  padding: const EdgeInsets.only(top: 8),
                                  child: Text('📍 ${data['clinicAddress']}', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                                ),
                              if (data['bio'] != null && data['bio'] != '')
                                Padding(
                                  padding: const EdgeInsets.only(top: 4),
                                  child: Text(data['bio'], style: const TextStyle(color: Colors.black87, fontSize: 13)),
                                ),
                              const SizedBox(height: 12),
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton.icon(
                                  style: ElevatedButton.styleFrom(backgroundColor: Colors.teal, foregroundColor: Colors.white),
                                  icon: const Icon(Icons.calendar_month, size: 18),
                                  label: const Text('حجز استشارة (50$)'),
                                  onPressed: () {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text('تم تأكيد حجز موعد مع ${data['name']}')),
                                    );
                                  },
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
