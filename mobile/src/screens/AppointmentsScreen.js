// mobile/src/screens/AppointmentsScreen.js
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

export default function AppointmentsScreen({ userToken, onLoginRequired }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (userToken) {
      fetchAppointments();
    } else {
      setLoading(false);
    }
  }, [userToken]);

  const fetchAppointments = async () => {
    try {
      const res = await fetch(ENDPOINTS.MY_APPOINTMENTS, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        setAppointments(data);
      }
    } catch (err) {
      Alert.alert('خطأ', 'تعذر جلب قائمة المواعيد');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handlePayMock = async (appointmentId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/${appointmentId}/pay-mock`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('تم الدفع بنجاح ✅', 'تم تأكيد دفع رسوم الكشف وجاهزية الموعد.');
        fetchAppointments();
      } else {
        Alert.alert('خطأ', data.error || 'فشلت عملية الدفع');
      }
    } catch (err) {
      Alert.alert('خطأ في الاتصال', err.message);
    }
  };

  if (!userToken) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loginPromptText}>يرجى تسجيل الدخول لعرض مواعيدك</Text>
        <TouchableOpacity style={styles.loginBtn} onPress={onLoginRequired}>
          <Text style={styles.loginBtnText}>تسجيل الدخول السريع</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderAppointmentItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={[styles.statusBadge, item.paid ? styles.paidBadge : styles.unpaidBadge]}>
          <Text style={[styles.statusText, item.paid ? styles.paidText : styles.unpaidText]}>
            {item.paid ? '✅ تم الدفع' : '⏳ بانتظار الدفع'}
          </Text>
        </View>
        <Text style={styles.doctorName}>د. {item.Doctor?.name || 'الطبيب'}</Text>
      </View>

      <Text style={styles.specialtyText}>التخصص: {item.Doctor?.specialty || 'استشارة طبية'}</Text>
      <Text style={styles.timeText}>
        📅 {new Date(item.time_slot).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
      </Text>

      <View style={styles.footerRow}>
        <Text style={styles.priceText}>الرسوم: 50.00 $</Text>
        {!item.paid && (
          <TouchableOpacity
            style={styles.payButton}
            onPress={() => handlePayMock(item.id)}
          >
            <Text style={styles.payButtonText}>💳 تأكيد الدفع الفوري</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0284c7" />
          <Text style={styles.loadingText}>جاري تحميل المواعيد...</Text>
        </View>
      ) : (
        <FlatList
          data={appointments}
          keyExtractor={(item) => item.id}
          renderItem={renderAppointmentItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAppointments(); }} />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>ليس لديك أي مواعيد محجوزة حتى الآن</Text>
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
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2
  },
  headerRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  doctorName: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  paidBadge: { backgroundColor: '#dcfce7' },
  unpaidBadge: { backgroundColor: '#fef3c7' },
  statusText: { fontSize: 12, fontWeight: 'bold' },
  paidText: { color: '#15803d' },
  unpaidText: { color: '#b45309' },
  specialtyText: { fontSize: 13, color: '#64748b', textAlign: 'right', marginBottom: 6 },
  timeText: { fontSize: 13, color: '#334155', textAlign: 'right', marginBottom: 12 },
  footerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10
  },
  priceText: { fontSize: 14, fontWeight: 'bold', color: '#0f172a' },
  payButton: { backgroundColor: '#10b981', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  payButtonText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loginPromptText: { fontSize: 16, color: '#64748b', marginBottom: 16 },
  loginBtn: { backgroundColor: '#0284c7', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  loginBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  loadingText: { marginTop: 10, color: '#64748b' },
  emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 15 }
});
