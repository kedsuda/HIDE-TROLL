// รวมไฟล์เกมทั้งหมดไว้ในโฟลเดอร์ www/ สำหรับแอป Android
import { cpSync, rmSync, mkdirSync } from 'node:fs';

rmSync('www', { recursive: true, force: true });
cpSync('public', 'www', { recursive: true });
mkdirSync('www/vendor/three', { recursive: true });
mkdirSync('www/vendor/socket.io', { recursive: true });
cpSync('node_modules/three/build/three.module.js', 'www/vendor/three/three.module.js');
cpSync('node_modules/socket.io/client-dist/socket.io.min.js', 'www/vendor/socket.io/socket.io.min.js');
console.log('www/ พร้อมแล้ว');
