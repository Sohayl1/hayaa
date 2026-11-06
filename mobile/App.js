// mobile/App.js
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  StatusBar,
  Alert
} from 'react-native';
import DoctorsScreen from './src/screens/DoctorsScreen';
import AppointmentsScreen from './src/screens/AppointmentsScreen';
import PrescriptionsScreen from './src/screens/PrescriptionsScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import { ENDPOINTS } from './src/api/config';

export default function App() {
  const [activeTab, setActiveTab] = useState('doctors');
  const [userToken, setUserToken] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  // تسجيل الدخول التجريبي التلقائي أو عند الطلب
  const handleQuickLogin = async (email = 'patient@example.com', password = 'password123') => {
    try {
      const res = await fetch(ENDPOINTS.LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setUserToken(data.token);
        setCurrentUser(data.user);
        Alert.alert('مرحباً بك 👋', `تم تسجيل الدخول بنجاح كـ ${data.user.name}`);
      } else {
        Alert.alert('خطأ', data.error || 'فشل تسجيل الدخول');
      }
    } catch (err) {
      Alert.alert('تنبيه الاتصال', `تعذر الاتصال بالخادم. تأكد من تشغيل الخادم على جهازك وأن هاتفك متصل بنفس شبكة الواي فاي.`);
    }
  };

  const handleLogout = () => {
    setUserToken('');
    setCurrentUser(null);
    Alert.alert('تم تسجيل الخروج');
  };

  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'doctors':
        return <DoctorsScreen userToken={userToken} />;
      case 'appointments':
        return (
          <AppointmentsScreen
            userToken={userToken}
            onLoginRequired={() => handleQuickLogin()}
          />
        );
      case 'prescriptions':
        return (
          <PrescriptionsScreen
            userToken={userToken}
            onLoginRequired={() => handleQuickLogin()}
          />
        );
      case 'orders':
        return (
          <OrdersScreen
            userToken={userToken}
            onLoginRequired={() => handleQuickLogin()}
          />
        );
      default:
        return <DoctorsScreen userToken={userToken} />;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0284c7" />

      {/* الرأس العلوي (Header) */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>🏥 صحتك - Telehealth</Text>
          {currentUser ? (
            <TouchableOpacity style={styles.authBtn} onPress={handleLogout}>
              <Text style={styles.authBtnText}>خروج</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.authBtn} onPress={() => handleQuickLogin()}>
              <Text style={styles.authBtnText}>تسجيل الدخول</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.headerSubtitle}>
          {currentUser ? `أهلاً، ${currentUser.name}` : 'استشارات طبية فورية وصرف الروشتات'}
        </Text>
      </View>

      {/* محتوى الشاشة الحالية */}
      <View style={styles.screenContainer}>
        {renderActiveScreen()}
      </View>

      {/* شريط التنقل السفلي (Bottom Tab Bar) */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={[styles.navItem, activeTab === 'doctors' && styles.activeNavItem]}
          onPress={() => setActiveTab('doctors')}
        >
          <Text style={styles.navIcon}>🩺</Text>
          <Text style={[styles.navText, activeTab === 'doctors' && styles.activeNavText]}>الأطباء</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'appointments' && styles.activeNavItem]}
          onPress={() => setActiveTab('appointments')}
        >
          <Text style={styles.navIcon}>📅</Text>
          <Text style={[styles.navText, activeTab === 'appointments' && styles.activeNavText]}>مواعيدي</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'prescriptions' && styles.activeNavItem]}
          onPress={() => setActiveTab('prescriptions')}
        >
          <Text style={styles.navIcon}>💊</Text>
          <Text style={[styles.navText, activeTab === 'prescriptions' && styles.activeNavText]}>الروشتات</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navItem, activeTab === 'orders' && styles.activeNavItem]}
          onPress={() => setActiveTab('orders')}
        >
          <Text style={styles.navIcon}>🚚</Text>
          <Text style={[styles.navText, activeTab === 'orders' && styles.activeNavText]}>الطلبات</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0284c7' },
  header: { backgroundColor: '#0284c7', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16 },
  headerTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  headerSubtitle: { fontSize: 13, color: '#e0f2fe', marginTop: 4, textAlign: 'right' },
  authBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  authBtnText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  screenContainer: { flex: 1, backgroundColor: '#f8fafc' },
  bottomNav: {
    flexDirection: 'row-reverse',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingVertical: 8,
    paddingHorizontal: 10,
    elevation: 8
  },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  activeNavItem: { borderTopWidth: 2, borderTopColor: '#0284c7' },
  navIcon: { fontSize: 20, marginBottom: 2 },
  navText: { fontSize: 11, fontWeight: 'bold', color: '#64748b' },
  activeNavText: { color: '#0284c7' }
});
