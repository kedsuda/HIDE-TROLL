// เก็บข้อมูลผู้เล่นที่ล็อกอิน Google (เหรียญ / ของที่ซื้อ / สกิน / ชื่อ)
// ตอนนี้เก็บเป็นไฟล์ JSON ใน DATA_DIR — บน Render แพลนฟรีไฟล์จะหายเมื่อเซิร์ฟเวอร์รีสตาร์ต/อัปเดต
// ถ้าจะให้ถาวร ให้เปลี่ยนสองฟังก์ชัน getSave/putSave ไปใช้ฐานข้อมูล (เช่น Supabase / Firebase)
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'accounts.json');

let accounts = {};
try {
  accounts = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  accounts = {};
}

let writeTimer = null;
function scheduleWrite() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(accounts));
      fs.renameSync(`${FILE}.tmp`, FILE);
    } catch (err) {
      console.error('บันทึกข้อมูลผู้เล่นไม่สำเร็จ', err.message);
    }
  }, 1000);
}

const str = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);

// ตรวจรูปแบบข้อมูลที่เครื่องผู้เล่นส่งมา ก่อนเก็บ
export function sanitizeSave(d) {
  if (!d || typeof d !== 'object') return null;
  const coins = Math.floor(Number(d.coins));
  return {
    coins: Number.isFinite(coins) ? Math.min(10_000_000, Math.max(0, coins)) : 0,
    startingCoinsGranted: d.startingCoinsGranted === true,
    startingCoinsAmount: d.startingCoinsAmount === 2000 ? 2000 : 0,
    owned: Array.isArray(d.owned) ? [...new Set(d.owned.map((o) => str(o, 40)).filter(Boolean))].slice(0, 100) : [],
    skin: {
      char: str(d.skin?.char, 16) || 'blob',
      color: str(d.skin?.color, 16) || 'mint',
      hat: str(d.skin?.hat, 16) || 'none',
    },
    name: str(d.name, 14),
  };
}

export function getSave(sub) {
  return accounts[sub]?.save || null;
}

export function putSave(sub, save, profile) {
  accounts[sub] = { save, name: profile?.name || accounts[sub]?.name || '', updated: Date.now() };
  scheduleWrite();
}
