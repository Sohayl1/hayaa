// mobile/src/screens/PrescriptionsScreen.js
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl
} from 'react-native';
import { ENDPOINTS } from '../api/config';

export default function PrescriptionsScreen({ userToken, onLoginRequired }) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [pharmacies, setPharmacies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPrescription, setSelectedPrescription] = useState(null);
  const [selectedPharmacy, setSelectedPharmacy] = useState(null);
  const [deliveryMethod, setDeliveryMethod] = useState('DELIVERY');
  const [orderLoading, setOrderLoading] = useState(false);

  useEffect(() => {
    if (userToken) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [userToken]);

  const loadData = async () => {
    try {
      const [prescRes, pharmRes] = await Promise.all([
        fetch(ENDPOINTS.MY_PRESCRIPTIONS, {
          headers: { 'Authorization': `Bearer ${userToken}` }
        }),
        fetch(ENDPOINTS.PHARMACIES)
      ]);

      const prescs = await prescRes.json();
      const pharms = await pharmRes.json();

      if (prescRes.ok) setPrescriptions(prescs);
      if (pharmRes.ok) {
        setPharmacies(pharms);
        if (pharms.length > 0) setSelectedPharmacy(pharms[0]);
      }
    } catch (err) {
      Alert.alert('خطأ', 'تعذر جلب الروشتات أو الصيدليات');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleCreateOrder = async () => {
    if (!selectedPrescription || !selectedPharmacy) return;

    setOrderLoading(true);
    try {
      const res = await fetch(ENDPOINTS.ORDERS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          prescriptionId: selectedPrescription.id,
          pharmacyId: selectedPharmacy.id,
          deliveryMethod
        })
      });
      const data = await res.json();
      if (res.ok && data.order) {
        setSelectedPrescription(null);
        Alert.alert('تم إرسال الطلب بنجاح 🚚', 'تم توجيه الروشتة للصيدلية. يمكنك تتبع حالة التوصيل في شاشة "الطلبات".');
        loadData();
      } else {
        Alert.alert('تنبيه', data.error || 'تعذر إتمام طلب الصرف');
      }
    } catch (err) {
      Alert.alert('خطأ', err.message);
    } finally {
      setOrderLoading(false);
    }
  };

  if (!userToken) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loginPromptText}>يرجى تسجيل الدخول لعرض الروشتات</Text>
        <TouchableOpacity style={styles.loginBtn} onPress={onLoginRequired}>
          <Text style={styles.loginBtnText}>تسجيل الدخول</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderPrescriptionItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>💊 روشتة طبية</Text>
        </View>
        <Text style={styles.doctorName}>د. {item.Doctor?.name || 'الطبيب المعالج'}</Text>
      </View>

      <View style={styles.rxBox}>
        <Text style={styles.rxText}>{item.text}</Text>
      </View>

      <Text style={styles.dateText}>
        📅 {new Date(item.created_at).toLocaleDateString('ar-EG', { dateStyle: 'long' })}
      </Text>

      {item.Order ? (
        <View style={styles.orderedBanner}>
          <Text style={styles.orderedText}>
            ✅ تم إنشاء طلب صرف الدواء: {item.Order.status === 'PENDING' ? 'قيد التجهيز' : item.Order.status}
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.orderButton}
          onPress={() => setSelectedPrescription(item)}
        >
          <Text style={styles.orderButtonText}>🛒 طلب وصرف الدواء من الصيدلية</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0284c7" />
          <Text style={styles.loadingText}>جاري تحميل الروشتات الطبية...</Text>
        </View>
      ) : (
        <FlatList
          data={prescriptions}
          keyExtractor={(item) => item.id}
          renderItem={renderPrescriptionItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>لا توجد أي روشتات طبية مسجلة لك حالياً</Text>
          }
        />
      )}

      {/* نافذة اختيار الصيدلية وطريقة الاستلام */}
      <Modal
        visible={!!selectedPrescription}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedPrescription(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>صرف الروشتة الطبية</Text>

            <Text style={styles.sectionLabel}>اختر الصيدلية المعتمدة:</Text>
            {pharmacies.map((pharm) => (
              <TouchableOpacity
                key={pharm.id}
                style={[
                  styles.pharmacyOption,
                  selectedPharmacy?.id === pharm.id && styles.selectedPharmacyOption
                ]}
                onPress={() => setSelectedPharmacy(pharm)}
              >
                <Text style={styles.pharmacyName}>💊 {pharm.name}</Text>
                <Text style={styles.pharmacyAddress}>📍 {pharm.address}</Text>
              </TouchableOpacity>
            ))}

            <Text style={[styles.sectionLabel, { marginTop: 12 }]}>طريقة الاستلام:</Text>
            <View style={styles.deliveryToggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, deliveryMethod === 'DELIVERY' && styles.activeToggleBtn]}
                onPress={() => setDeliveryMethod('DELIVERY')}
              >
                <Text style={[styles.toggleBtnText, deliveryMethod === 'DELIVERY' && styles.activeToggleBtnText]}>
                  🚚 توصيل للمنزل
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, deliveryMethod === 'PICKUP' && styles.activeToggleBtn]}
                onPress={() => setDeliveryMethod('PICKUP')}
              >
                <Text style={[styles.toggleBtnText, deliveryMethod === 'PICKUP' && styles.activeToggleBtnText]}>
                  🏬 استلام من الفرع
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.confirmBtn]}
                onPress={handleCreateOrder}
                disabled={orderLoading}
              >
                {orderLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.confirmBtnText}>تأكيد الطلب</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setSelectedPrescription(null)}
                disabled={orderLoading}
              >
                <Text style={styles.cancelBtnText}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  listContent: { padding: 16 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2
  },
  cardHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  doctorName: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
  badge: { backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 12, color: '#b45309', fontWeight: 'bold' },
  rxBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10
  },
  rxText: { fontSize: 14, color: '#166534', lineHeight: 22, textAlign: 'right', fontWeight: '500' },
  dateText: { fontSize: 12, color: '#94a3b8', textAlign: 'right', marginBottom: 14 },
  orderButton: { backgroundColor: '#10b981', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  orderButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },
  orderedBanner: { backgroundColor: '#f1f5f9', padding: 10, borderRadius: 8, alignItems: 'center' },
  orderedText: { fontSize: 13, color: '#475569', fontWeight: 'bold' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loginPromptText: { fontSize: 16, color: '#64748b', marginBottom: 16 },
  loginBtn: { backgroundColor: '#0284c7', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  loginBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  loadingText: { marginTop: 10, color: '#64748b' },
  emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 20, padding: 22, width: '100%', maxWidth: 390 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', textAlign: 'center', marginBottom: 14 },
  sectionLabel: { fontSize: 13, fontWeight: 'bold', color: '#334155', textAlign: 'right', marginBottom: 6 },
  pharmacyOption: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    alignItems: 'flex-end'
  },
  selectedPharmacyOption: { borderColor: '#0284c7', backgroundColor: '#f0f9ff' },
  pharmacyName: { fontSize: 14, fontWeight: 'bold', color: '#0f172a' },
  pharmacyAddress: { fontSize: 12, color: '#64748b', marginTop: 2 },
  deliveryToggleRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 18 },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  activeToggleBtn: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  toggleBtnText: { fontSize: 13, color: '#64748b', fontWeight: 'bold' },
  activeToggleBtnText: { color: 'white' },
  modalButtons: { flexDirection: 'row-reverse', gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  confirmBtn: { backgroundColor: '#10b981' },
  confirmBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  cancelBtn: { backgroundColor: '#f1f5f9' },
  cancelBtnText: { color: '#64748b', fontWeight: 'bold', fontSize: 15 }
});
