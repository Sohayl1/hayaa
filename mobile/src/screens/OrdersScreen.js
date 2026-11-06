// mobile/src/screens/OrdersScreen.js
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl
} from 'react-native';
import { ENDPOINTS, API_BASE_URL } from '../api/config';

export default function OrdersScreen({ userToken, onLoginRequired }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (userToken) {
      fetchOrders();
    } else {
      setLoading(false);
    }
  }, [userToken]);

  const fetchOrders = async () => {
    try {
      const res = await fetch(ENDPOINTS.MY_ORDERS, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      const data = await res.json();
      if (res.ok) setOrders(data);
    } catch (err) {
      Alert.alert('خطأ', 'تعذر جلب طلبات التوصيل');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleUpdateStatusMock = async (orderId, newStatus) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        Alert.alert('تم تحديث الحالة', `أصبحت حالة الطلب: ${newStatus}`);
        fetchOrders();
      }
    } catch (err) {
      Alert.alert('خطأ', err.message);
    }
  };

  if (!userToken) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loginPromptText}>يرجى تسجيل الدخول لمتابعة طلبات التوصيل</Text>
        <TouchableOpacity style={styles.loginBtn} onPress={onLoginRequired}>
          <Text style={styles.loginBtnText}>تسجيل الدخول</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderStatusStepper = (status) => {
    const isStep1 = true;
    const isStep2 = status === 'OUT_FOR_DELIVERY' || status === 'DELIVERED';
    const isStep3 = status === 'DELIVERED';

    return (
      <View style={styles.stepperContainer}>
        <View style={styles.stepItem}>
          <View style={[styles.stepDot, isStep1 && styles.activeDot]}>
            <Text style={styles.dotIcon}>⏳</Text>
          </View>
          <Text style={styles.stepLabel}>قيد التجهيز</Text>
        </View>

        <View style={[styles.stepLine, isStep2 && styles.activeLine]} />

        <View style={styles.stepItem}>
          <View style={[styles.stepDot, isStep2 && styles.activeDot]}>
            <Text style={styles.dotIcon}>🚚</Text>
          </View>
          <Text style={styles.stepLabel}>في الطريق</Text>
        </View>

        <View style={[styles.stepLine, isStep3 && styles.activeLine]} />

        <View style={styles.stepItem}>
          <View style={[styles.stepDot, isStep3 && styles.activeDot]}>
            <Text style={styles.dotIcon}>✅</Text>
          </View>
          <Text style={styles.stepLabel}>تم الاستلام</Text>
        </View>
      </View>
    );
  };

  const renderOrderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.deliveryBadge}>
          <Text style={styles.deliveryBadgeText}>
            {item.delivery_method === 'DELIVERY' ? '🚚 توصيل منزلي' : '🏬 استلام من الفرع'}
          </Text>
        </View>
        <Text style={styles.pharmacyName}>{item.Pharmacy?.name || 'صيدلية معتمدة'}</Text>
      </View>

      <Text style={styles.addressText}>📍 {item.Pharmacy?.address || 'العنوان غير محدد'}</Text>
      <Text style={styles.phoneText}>📞 {item.Pharmacy?.phone || 'هاتف الصيدلية'}</Text>

      {/* متتبع الحالة البصري */}
      {renderStatusStepper(item.status)}

      <View style={styles.medicineBox}>
        <Text style={styles.medicineLabel}>الدواء المصروف:</Text>
        <Text style={styles.medicineText}>{item.Prescription?.text || '-'}</Text>
      </View>

      {/* أزرار تجريبية لتغيير الحالة */}
      <View style={styles.devControls}>
        <Text style={styles.devLabel}>تجربة محاكاة التوصيل:</Text>
        <View style={styles.devBtnsRow}>
          <TouchableOpacity
            style={styles.devBtn}
            onPress={() => handleUpdateStatusMock(item.id, 'OUT_FOR_DELIVERY')}
          >
            <Text style={styles.devBtnText}>خرج للتوصيل</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.devBtn, styles.devBtnSuccess]}
            onPress={() => handleUpdateStatusMock(item.id, 'DELIVERED')}
          >
            <Text style={styles.devBtnText}>تم التسليم</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0284c7" />
          <Text style={styles.loadingText}>جاري تحميل الطلبات...</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrders(); }} />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>لا توجد أي طلبات توصيل جارية حالياً</Text>
          }
        />
      )}
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
  headerRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  pharmacyName: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
  deliveryBadge: { backgroundColor: '#e0f2fe', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  deliveryBadgeText: { fontSize: 12, color: '#0369a1', fontWeight: 'bold' },
  addressText: { fontSize: 13, color: '#64748b', textAlign: 'right', marginBottom: 2 },
  phoneText: { fontSize: 13, color: '#64748b', textAlign: 'right', marginBottom: 12 },
  stepperContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginVertical: 12
  },
  stepItem: { alignItems: 'center' },
  stepDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  activeDot: { backgroundColor: '#dcfce7', borderWidth: 1.5, borderColor: '#16a34a' },
  dotIcon: { fontSize: 16 },
  stepLabel: { fontSize: 11, fontWeight: 'bold', color: '#475569' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#cbd5e1', marginHorizontal: 4 },
  activeLine: { backgroundColor: '#16a34a' },
  medicineBox: { backgroundColor: '#f0fdf4', padding: 10, borderRadius: 8, marginTop: 4 },
  medicineLabel: { fontSize: 12, color: '#166534', fontWeight: 'bold', textAlign: 'right' },
  medicineText: { fontSize: 13, color: '#14532d', textAlign: 'right', marginTop: 2 },
  devControls: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 },
  devLabel: { fontSize: 11, color: '#94a3b8', textAlign: 'right', marginBottom: 6 },
  devBtnsRow: { flexDirection: 'row-reverse', gap: 8 },
  devBtn: { flex: 1, backgroundColor: '#0284c7', paddingVertical: 6, borderRadius: 6, alignItems: 'center' },
  devBtnSuccess: { backgroundColor: '#10b981' },
  devBtnText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loginPromptText: { fontSize: 16, color: '#64748b', marginBottom: 16 },
  loginBtn: { backgroundColor: '#0284c7', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  loginBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  loadingText: { marginTop: 10, color: '#64748b' },
  emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 15 }
});
