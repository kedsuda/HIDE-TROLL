// รวมไฟล์เกมไว้ในโฟลเดอร์ www/ สำหรับแอป Android
// ไม่ใส่ไฟล์ที่แอปไม่ต้องใช้ — โดยเฉพาะ download/ (ห้ามมี APK ซ้อนอยู่ในแอป)
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const EXCLUDE = new Set(['download', 'sw.js']);

rmSync('www', { recursive: true, force: true });
cpSync('public', 'www', {
  recursive: true,
  filter: (src) => !EXCLUDE.has(path.relative('public', src).split(path.sep)[0]),
});
mkdirSync('www/vendor/three', { recursive: true });
mkdirSync('www/vendor/socket.io', { recursive: true });
cpSync('node_modules/three/build/three.module.js', 'www/vendor/three/three.module.js');
cpSync('node_modules/socket.io/client-dist/socket.io.min.js', 'www/vendor/socket.io/socket.io.min.js');
for (const f of ['loaders/GLTFLoader.js', 'utils/SkeletonUtils.js', 'utils/BufferGeometryUtils.js']) {
  mkdirSync(path.dirname(`www/vendor/three-addons/${f}`), { recursive: true });
  cpSync(`node_modules/three/examples/jsm/${f}`, `www/vendor/three-addons/${f}`);
}
console.log('www/ พร้อมแล้ว');
