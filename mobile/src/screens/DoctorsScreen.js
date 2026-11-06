// mobile/src/screens/DoctorsScreen.js
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal
} from 'react-native';
import { ENDPOINTS } from '../api/config';

export default function DoctorsScreen({ userToken, navigation }) {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSpecialty, setSelectedSpecialty] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [bookingLoading, setBookingLoading] = useState(false);

  useEffect(() => {
    fetchDoctors(selectedSpecialty);
  }, [selectedSpecialty]);

  const fetchDoctors = async (specialty = '') => {
    setLoading(true);
    try {
      const url = specialty ? `${ENDPOINTS.DOCTORS}?specialty=${specialty}` : ENDPOINTS.DOCTORS;
      const res = await fetch(url);
      const data = await res.json();
      setDoctors(data);
    } catch (err) {
      Alert.alert('خطأ', 'تعذر الاتصال بالخادم لجلب قائمة الأطباء');
    } finally {
      setLoading(false);
    }
  };

  const handleBookAppointment = async () => {
    if (!userToken) {
      Alert.alert('تنبيه', 'يرجى تسجيل الدخول أولاً لتتمكن من حجز موعد');
      return;
    }
    if (!selectedDoctor) return;

    setBookingLoading(true);
    try {
      const res = await fetch(ENDPOINTS.APPOINTMENTS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          doctorId: selectedDoctor.id,
          timeSlot: new Date(Date.now() + 24 * 60 * 60 * 1000)
        })
      });
      const data = await res.json();
      if (res.ok && data.appointment) {
        setSelectedDoctor(null);
        Alert.alert(
          'تم الحجز بنجاح 🎉',
          `تم إنشاء موعدك مع ${selectedDoctor.name}.\nيمكنك الآن الانتقال لتبويب "مواعيدي" لمتابعة الدفع والاستشارة.`
        );
      } else {
        Alert.alert('خطأ', data.error || 'تعذر إتمام الحجز');
      }
    } catch (err) {
      Alert.alert('خطأ في الاتصال', err.message);
    } finally {
      setBookingLoading(false);
    }
  };

  const getSpecialtyArabic = (spec) => {
    switch (spec) {
      case 'general': return 'طب عام وباطنة';
      case 'women': return 'نساء وتوليد';
      case 'children': return 'طب أطفال';
      default: return spec;
    }
  };

  const renderDoctorItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>🩺</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.doctorName}>{item.name}</Text>
          <View style={styles.specialtyBadge}>
            <Text style={styles.specialtyText}>{getSpecialtyArabic(item.specialty)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.ratingText}>⭐ {item.rating} / 5.0</Text>
      <Text style={styles.bioText} numberOfLines={3}>{item.bio || 'استشاري معتمد لدى المنصة.'}</Text>

      <TouchableOpacity
        style={styles.bookButton}
        onPress={() => setSelectedDoctor(item)}
      >
        <Text style={styles.bookButtonText}>📅 حجز موعد استشارة (50$)</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* شريط الفلاتر */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, selectedSpecialty === '' && styles.activeFilterChip]}
          onPress={() => setSelectedSpecialty('')}
        >
          <Text style={[styles.filterChipText, selectedSpecialty === '' && styles.activeFilterChipText]}>الكل</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, selectedSpecialty === 'general' && styles.activeFilterChip]}
          onPress={() => setSelectedSpecialty('general')}
        >
          <Text style={[styles.filterChipText, selectedSpecialty === 'general' && styles.activeFilterChipText]}>عام</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, selectedSpecialty === 'women' && styles.activeFilterChip]}
          onPress={() => setSelectedSpecialty('women')}
        >
          <Text style={[styles.filterChipText, selectedSpecialty === 'women' && styles.activeFilterChipText]}>نساء</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, selectedSpecialty === 'children' && styles.activeFilterChip]}
          onPress={() => setSelectedSpecialty('children')}
        >
          <Text style={[styles.filterChipText, selectedSpecialty === 'children' && styles.activeFilterChipText]}>أطفال</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0284c7" />
          <Text style={styles.loadingText}>جاري تحميل قائمة الأطباء...</Text>
        </View>
      ) : (
        <FlatList
          data={doctors}
          keyExtractor={(item) => item.id}
          renderItem={renderDoctorItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={styles.emptyText}>لا يوجد أطباء في هذا التخصص حالياً</Text>
          }
        />
      )}

      {/* نافذة تأكيد الحجز */}
      <Modal
        visible={!!selectedDoctor}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedDoctor(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>تأكيد حجز الاستشارة</Text>
            {selectedDoctor && (
              <>
                <Text style={styles.modalDoctorName}>{selectedDoctor.name}</Text>
                <Text style={styles.modalSpecialty}>{getSpecialtyArabic(selectedDoctor.specialty)}</Text>
                <View style={styles.priceContainer}>
                  <Text style={styles.priceLabel}>رسوم الكشف والاستشارة:</Text>
                  <Text style={styles.priceValue}>50.00 $</Text>
                </View>
                <Text style={styles.modalNote}>
                  سيتم حجز أقرب موعد متاح وتوفير رابط الدفع الإلكتروني عبر Stripe.
                </Text>

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.confirmBtn]}
                    onPress={handleBookAppointment}
                    disabled={bookingLoading}
                  >
                    {bookingLoading ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text style={styles.confirmBtnText}>تأكيد الحجز</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.cancelBtn]}
                    onPress={() => setSelectedDoctor(null)}
                    disabled={bookingLoading}
                  >
                    <Text style={styles.cancelBtnText}>إلغاء</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  filterRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginLeft: 8
  },
  activeFilterChip: { backgroundColor: '#0284c7' },
  filterChipText: { fontSize: 14, fontWeight: 'bold', color: '#64748b' },
  activeFilterChipText: { color: '#ffffff' },
  listContent: { padding: 16 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2
  },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'center', marginBottom: 10 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12
  },
  avatarText: { fontSize: 24 },
  headerInfo: { flex: 1, alignItems: 'flex-end' },
  doctorName: { fontSize: 17, fontWeight: 'bold', color: '#0f172a' },
  specialtyBadge: {
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 4
  },
  specialtyText: { fontSize: 12, color: '#166534', fontWeight: 'bold' },
  ratingText: { fontSize: 13, color: '#d97706', fontWeight: 'bold', textAlign: 'right', marginBottom: 6 },
  bioText: { fontSize: 13, color: '#64748b', textAlign: 'right', lineHeight: 20, marginBottom: 14 },
  bookButton: {
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center'
  },
  bookButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#64748b', fontSize: 14 },
  emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center'
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a', marginBottom: 12 },
  modalDoctorName: { fontSize: 18, fontWeight: 'bold', color: '#0284c7' },
  modalSpecialty: { fontSize: 14, color: '#64748b', marginBottom: 16 },
  priceContainer: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12
  },
  priceLabel: { fontSize: 14, color: '#334155' },
  priceValue: { fontSize: 16, fontWeight: 'bold', color: '#16a34a' },
  modalNote: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginBottom: 20 },
  modalButtons: { flexDirection: 'row-reverse', width: '100%', gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  confirmBtn: { backgroundColor: '#0284c7' },
  confirmBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  cancelBtn: { backgroundColor: '#f1f5f9' },
  cancelBtnText: { color: '#64748b', fontWeight: 'bold', fontSize: 15 }
});
