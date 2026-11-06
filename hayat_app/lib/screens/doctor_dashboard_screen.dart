// lib/screens/doctor_dashboard_screen.dart
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'login_screen.dart';

class DoctorDashboardScreen extends StatefulWidget {
  const DoctorDashboardScreen({super.key});

  @override
  State<DoctorDashboardScreen> createState() => _DoctorDashboardScreenState();
}

class _DoctorDashboardScreenState extends State<DoctorDashboardScreen> {
  final User? _currentUser = FirebaseAuth.instance.currentUser;

  // فتح ورقة الروشتة الطبية المفصلة للمريض
  void _showPrescriptionDialog(BuildContext context, String appointmentId, String patientName, String patientId) {
    final diagnosisController = TextEditingController();
    final medicinesController = TextEditingController();
    final labTestsController = TextEditingController();
    final doctorNotesController = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: const Color(0xFFE0F2F1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text('℞', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF00897B))),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('روشتة طبية لـ $patientName', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  const Text('منصة حياه للرعاية الصحية', style: TextStyle(fontSize: 11, color: Colors.grey)),
                ],
              ),
            ),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // 1. التشخيص
              const Text('🩺 1. التشخيص وتوصيف المرض (Diagnosis):', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Color(0xFF0B1E33))),
              const SizedBox(height: 6),
              TextField(
                controller: diagnosisController,
                decoration: InputDecoration(
                  hintText: 'مثال: التهاب حاد بالشعب الهوائية...',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                ),
              ),
              const SizedBox(height: 14),

              // 2. الأدوية والجرعات
              const Text('💊 2. الأدوية والجرعات المقررة (Medications):', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Color(0xFF0B1E33))),
              const SizedBox(height: 6),
              TextField(
                controller: medicinesController,
                maxLines: 4,
                decoration: InputDecoration(
                  hintText: '1. أوجمنتين 1 جم (قرص كل 12 ساعة بعد الأكل)\n2. بنادول إكسترا (قرصين عند اللزوم للصداع)...',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  contentPadding: const EdgeInsets.all(12),
                ),
              ),
              const SizedBox(height: 14),

              // 3. التحاليل والأشعات المطلوبة
              const Text('🔬 3. التحاليل أو الأشعات المطلوبة (Lab / X-Ray):', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Color(0xFF0B1E33))),
              const SizedBox(height: 6),
              TextField(
                controller: labTestsController,
                maxLines: 2,
                decoration: InputDecoration(
                  hintText: 'مثال: صورة دم كاملة CBC / أشعة سينية على الصدر...',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  contentPadding: const EdgeInsets.all(10),
                ),
              ),
              const SizedBox(height: 14),

              // 4. إرشادات الطبيب
              const Text('📝 4. إرشادات الطبيب وملاحظات المتابعة:', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Color(0xFF0B1E33))),
              const SizedBox(height: 6),
              TextField(
                controller: doctorNotesController,
                decoration: InputDecoration(
                  hintText: 'مثال: الراحة التامة، شرب السوائل الدافئة، وإعادة الاستشارة بعد أسبوع...',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('إلغاء'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF00897B),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            ),
            onPressed: () async {
              if (diagnosisController.text.trim().isEmpty && medicinesController.text.trim().isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('⚠️ يرجى كتابة التشخيص والأدوية المقررة')),
                );
                return;
              }

              final summary = '''
🩺 التشخيص: ${diagnosisController.text.trim()}
💊 الأدوية: ${medicinesController.text.trim()}
🔬 التحاليل والأشعات: ${labTestsController.text.trim()}
📝 نصائح الطبيب: ${doctorNotesController.text.trim()}
              '''.trim();

              // حفظ الروشتة في Firestore
              await FirebaseFirestore.instance.collection('prescriptions').add({
                'appointmentId': appointmentId,
                'patientId': patientId,
                'doctorId': _currentUser?.uid ?? '',
                'doctorName': _currentUser?.displayName ?? 'دكتور حياه',
                'diagnosis': diagnosisController.text.trim(),
                'medicines': medicinesController.text.trim(),
                'labTests': labTestsController.text.trim(),
                'doctorNotes': doctorNotesController.text.trim(),
                'text': summary,
                'createdAt': FieldValue.serverTimestamp(),
              });

              // تحديث حالة الموعد
              await FirebaseFirestore.instance.collection('appointments').doc(appointmentId).update({
                'status': 'COMPLETED',
                'hasPrescription': true,
              });

              if (context.mounted) {
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('🎉 تم إرسال الروشتة للمريض وشبكة الصيدليات بنجاح!')),
                );
              }
            },
            child: const Text('إرسال الروشتة للمريض 🚀', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF0F7F7),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B1E33),
        elevation: 0,
        title: Row(
          children: [
            const CircleAvatar(
              backgroundColor: Color(0xFF00897B),
              radius: 18,
              child: Icon(Icons.medical_services, color: Colors.white, size: 20),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _currentUser?.displayName ?? 'د. استشاري حياه',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                const Text(
                  'لوحة تحكم الطبيب المعتمد',
                  style: TextStyle(fontSize: 11, color: Color(0xFF38BDF8)),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.white70),
            onPressed: () async {
              await FirebaseAuth.instance.signOut();
              if (context.mounted) {
                Navigator.pushReplacement(
                  context,
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                );
              }
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // شريط التنبيهات
          Container(
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              color: Color(0xFF0B1E33),
              borderRadius: BorderRadius.only(
                bottomLeft: Radius.circular(24),
                bottomRight: Radius.circular(24),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                    decoration: BoxDecoration(
                      color: const Color(0xFF102A43),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFF00897B).withOpacity(0.3)),
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.notifications_active, color: Color(0xFF34D399), size: 20),
                        SizedBox(width: 8),
                        Text(
                          'طلبات الكشف المباشرة وحجوزات المرضى',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // قائمة الطلبات الواردة في الوقت الفعلي (StreamBuilder)
          Expanded(
            child: StreamBuilder<QuerySnapshot>(
              stream: FirebaseFirestore.instance
                  .collection('appointments')
                  .where('doctorId', isEqualTo: _currentUser?.uid ?? '')
                  .snapshots(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator(color: Color(0xFF00897B)));
                }

                if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(20),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 15),
                            ],
                          ),
                          child: const Icon(Icons.calendar_today, size: 48, color: Color(0xFF00897B)),
                        ),
                        const SizedBox(height: 16),
                        const Text(
                          'لا توجد طلبات كشف جديدة حالياً',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF0B1E33)),
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'ستظهر هنا حجوزات المرضى القادمة فور تسجيلها',
                          style: TextStyle(fontSize: 12, color: Colors.grey),
                        ),
                      ],
                    ),
                  );
                }

                final requests = snapshot.data!.docs;

                return ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  itemCount: requests.length,
                  itemBuilder: (context, index) {
                    final req = requests[index].data() as Map<String, dynamic>;
                    final reqId = requests[index].id;
                    final patientName = req['patientName'] ?? 'مريض حياه';
                    final patientPhone = req['patientPhone'] ?? '-';
                    final patientId = req['patientId'] ?? '';
                    final isPaid = req['paid'] == true;
                    final hasPrescription = req['hasPrescription'] == true;

                    return Card(
                      margin: const EdgeInsets.only(bottom: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                        side: const BorderSide(color: Color(0xFFE2E8F0)),
                      ),
                      elevation: 2,
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Row(
                                  children: [
                                    const CircleAvatar(
                                      backgroundColor: Color(0xFFE0F2FE),
                                      child: Icon(Icons.person, color: Color(0xFF0284C7)),
                                    ),
                                    const SizedBox(width: 10),
                                    Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          patientName,
                                          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF0B1E33)),
                                        ),
                                        Text(
                                          '📞 $patientPhone',
                                          style: const TextStyle(fontSize: 12, color: Colors.grey),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: isPaid ? const Color(0xFFE0F2F1) : const Color(0xFFFEF3C7),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Text(
                                    isPaid ? '✅ مدفوع (50\$)' : '⏳ غير مدفوع',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: isPaid ? const Color(0xFF00897B) : const Color(0xFFB45309),
                                    ),
                                  ),
                                ),
                              ],
                            ),

                            const Divider(height: 24),

                            if (hasPrescription)
                              Container(
                                margin: const EdgeInsets.only(bottom: 12),
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF0FDF4),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: const Color(0xFFBBF7D0)),
                                ),
                                child: const Row(
                                  children: [
                                    Icon(Icons.check_circle, color: Color(0xFF16A34A), size: 16),
                                    SizedBox(width: 6),
                                    Text('تم إصدار الروشتة الطبية لهذا الموعد', style: TextStyle(fontSize: 12, color: Color(0xFF166534))),
                                  ],
                                ),
                              ),

                            SizedBox(
                              width: double.infinity,
                              child: ElevatedButton.icon(
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF00897B),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                  padding: const EdgeInsets.symmetric(vertical: 12),
                                ),
                                icon: const Icon(Icons.receipt_long, color: Colors.white, size: 20),
                                label: const Text('📝 فتح وإصدار روشتة طبية معتمدة', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                                onPressed: () => _showPrescriptionDialog(context, reqId, patientName, patientId),
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
    );
  }
}
