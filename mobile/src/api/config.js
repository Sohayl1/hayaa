// mobile/src/api/config.js
import { Platform } from 'react-native';

// عنوان الخادم الخلفي (استخدم IP الشبكة المحلية 192.168.1.65 للاتصال من الهاتف الحقيقي)
export const API_BASE_URL = Platform.select({
  web: 'http://localhost:5000',
  android: 'http://192.168.1.65:5000', // أو 10.0.2.2 إذا كنت تستخدم محاكي الأندرويد
  ios: 'http://192.168.1.65:5000',
  default: 'http://192.168.1.65:5000'
});

export const ENDPOINTS = {
  LOGIN: `${API_BASE_URL}/api/auth/login`,
  REGISTER: `${API_BASE_URL}/api/auth/register`,
  DOCTORS: `${API_BASE_URL}/api/doctors`,
  APPOINTMENTS: `${API_BASE_URL}/api/appointments`,
  MY_APPOINTMENTS: `${API_BASE_URL}/api/appointments/my`,
  PRESCRIPTIONS: `${API_BASE_URL}/api/prescriptions`,
  MY_PRESCRIPTIONS: `${API_BASE_URL}/api/prescriptions/my`,
  PHARMACIES: `${API_BASE_URL}/api/pharmacies`,
  ORDERS: `${API_BASE_URL}/api/orders`,
  MY_ORDERS: `${API_BASE_URL}/api/orders/my`,
};
