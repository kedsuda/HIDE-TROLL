// ที่อยู่เซิร์ฟเวอร์สำหรับแอป Android (เว็บใช้โดเมนเดียวกับหน้าเว็บเสมอ)
// หลังขึ้น Render แล้ว ให้แก้เป็นลิงก์ของคุณ แล้วสั่ง npm run apk ใหม่
export const DEFAULT_SERVER = 'https://hide-and-troll.onrender.com';

export const IS_APP = !!window.Capacitor?.isNativePlatform?.();

export function serverUrl() {
  if (!IS_APP) return location.origin;
  try {
    return localStorage.getItem('ht_server') || DEFAULT_SERVER;
  } catch {
    return DEFAULT_SERVER;
  }
}

export function setServerUrl(url) {
  try {
    if (url) localStorage.setItem('ht_server', url.replace(/\/+$/, ''));
    else localStorage.removeItem('ht_server');
  } catch { /* ignore */ }
}
