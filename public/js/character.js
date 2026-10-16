import * as THREE from 'three';
import { part, mat } from './props.js';

export const COLORS = {
  mint: { name: 'มินต์', hex: 0x5ee6b0, price: 0 },
  sky: { name: 'ฟ้าใส', hex: 0x5ab8ff, price: 0 },
  peach: { name: 'พีช', hex: 0xffa27a, price: 0 },
  grape: { name: 'องุ่น', hex: 0xa77bff, price: 100 },
  lemon: { name: 'เลมอน', hex: 0xffe066, price: 100 },
  rose: { name: 'ชมพูหวาน', hex: 0xff6fa8, price: 150 },
  coal: { name: 'ถ่านดำ', hex: 0x3b3b4f, price: 200 },
  gold: { name: 'ทองคำ', hex: 0xffc93c, price: 500 },
};

export const HATS = {
  none: { name: 'ไม่ใส่', price: 0 },
  party: { name: 'หมวกปาร์ตี้', price: 50 },
  cap: { name: 'หมวกแก๊ป', price: 80 },
  chef: { name: 'หมวกเชฟ', price: 120 },
  bunny: { name: 'หูกระต่าย', price: 150 },
  horns: { name: 'เขาปีศาจ', price: 200 },
  halo: { name: 'วงแหวนนางฟ้า', price: 250 },
  crown: { name: 'มงกุฎ', price: 300 },
};

const capsule = new THREE.CapsuleGeometry(0.42, 0.55, 8, 18);

function buildHat(hat) {
  const g = new THREE.Group();
  switch (hat) {
    case 'party':
      g.add(part('cone', 0xff4fa3, [0.36, 0.5, 0.36], [0, 1.72, 0]), part('sph', 0xfff275, [0.14, 0.14, 0.14], [0, 1.98, 0]));
      break;
    case 'cap':
      g.add(part('sph', 0x2f6fde, [0.78, 0.4, 0.78], [0, 1.45, 0]), part('box', 0x2f6fde, [0.5, 0.04, 0.38], [0, 1.47, 0.4]));
      break;
    case 'chef':
      g.add(part('cyl', 0xffffff, [0.55, 0.35, 0.55], [0, 1.62, 0]), part('sph', 0xffffff, [0.72, 0.38, 0.72], [0, 1.84, 0]));
      break;
    case 'bunny':
      for (const s of [-1, 1]) {
        g.add(part('sph', 0xffffff, [0.16, 0.6, 0.1], [s * 0.15, 1.75, 0], { r: [0, 0, -s * 0.15] }));
        g.add(part('sph', 0xffb3c7, [0.08, 0.42, 0.04], [s * 0.15, 1.75, 0.04], { r: [0, 0, -s * 0.15] }));
      }
      break;
    case 'horns':
      for (const s of [-1, 1]) g.add(part('cone', 0xd62828, [0.13, 0.36, 0.13], [s * 0.2, 1.6, 0], { r: [0, 0, -s * 0.45] }));
      break;
    case 'halo':
      g.add(part('tor', 0xffe066, [0.55, 0.55, 0.55], [0, 1.82, 0], { r: [Math.PI / 2, 0, 0], e: 0xffb000 }));
      break;
    case 'crown':
      g.add(part('cyl', 0xffc93c, [0.55, 0.2, 0.55], [0, 1.56, 0]));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.add(part('cone', 0xffc93c, [0.1, 0.18, 0.1], [Math.sin(a) * 0.22, 1.74, Math.cos(a) * 0.22]));
      }
      g.add(part('sph', 0xe63946, [0.09, 0.09, 0.05], [0, 1.56, 0.27]));
      break;
    default:
      break;
  }
  return g;
}

// ทำให้วัสดุของตัวละครแยกจากกัน (ปรับความโปร่งใสรายคนได้)
export function uniqueMaterials(obj) {
  obj.traverse((o) => {
    if (o.isMesh) o.material = o.material.clone();
  });
  return obj;
}

export function buildCharacter(skin = {}, hunter = false) {
  const color = (COLORS[skin.color] || COLORS.mint).hex;
  const dark = new THREE.Color(color).multiplyScalar(0.6).getHex();
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  g.add(pivot);

  const body = new THREE.Mesh(capsule, mat(color));
  body.position.y = 0.82;
  body.castShadow = true;
  pivot.add(body);
  for (const s of [-1, 1]) {
    pivot.add(part('sph', 0xffffff, [0.24, 0.26, 0.14], [s * 0.15, 1.12, 0.36]));
    pivot.add(part('sph', 0x1a1a2e, [0.11, 0.13, 0.06], [s * 0.15, 1.11, 0.43]));
    pivot.add(part('sph', 0xff8fab, [0.12, 0.07, 0.04], [s * 0.26, 0.96, 0.37]));
  }
  pivot.add(part('box', 0x1a1a2e, [0.14, 0.04, 0.03], [0, 0.95, 0.42]));
  pivot.add(buildHat(skin.hat));

  if (hunter) {
    pivot.add(part('tor', 0xe53935, [0.88, 0.88, 1.1], [0, 1.27, 0], { r: [Math.PI / 2, 0, 0] }));
    pivot.add(part('box', 0xff7a00, [0.14, 0.16, 0.55], [0.5, 0.78, 0.22]));
    pivot.add(part('cyl', 0x33ccff, [0.12, 0.16, 0.12], [0.5, 0.78, 0.54], { r: [Math.PI / 2, 0, 0], e: 0x0a6a8a }));
  }

  const fl = part('sph', dark, [0.3, 0.2, 0.38], [-0.2, 0.1, 0.05]);
  const fr = part('sph', dark, [0.3, 0.2, 0.38], [0.2, 0.1, 0.05]);
  g.add(fl, fr);
  g.userData.char = { pivot, fl, fr };
  return uniqueMaterials(g);
}

export function animateCharacter(g, t, moving, airborne) {
  const c = g.userData.char;
  if (!c) return;
  if (airborne) {
    c.pivot.position.y = 0.05;
    c.pivot.rotation.z = 0;
    c.fl.position.set(-0.2, 0.18, 0.12);
    c.fr.position.set(0.2, 0.18, 0.12);
    return;
  }
  const w = Math.sin(t * 12);
  c.pivot.position.y = moving ? Math.abs(w) * 0.08 : Math.sin(t * 2) * 0.015;
  c.pivot.rotation.z = moving ? w * 0.06 : 0;
  c.fl.position.set(-0.2, 0.1 + (moving ? Math.max(0, w) * 0.08 : 0), 0.05 + (moving ? w * 0.2 : 0));
  c.fr.position.set(0.2, 0.1 + (moving ? Math.max(0, -w) * 0.08 : 0), 0.05 - (moving ? w * 0.2 : 0));
}

export function setOpacity(obj, o) {
  obj.traverse((m) => {
    if (!m.isMesh || m.userData.noFade) return;
    m.material.transparent = o < 1;
    m.material.opacity = o;
    m.material.depthWrite = o >= 1;
  });
}

// ป้ายชื่อ / อีโมจิลอย (Sprite จาก canvas)
export function makeLabel(text, color = '#ffffff', size = 0.35) {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  const font = 'bold 44px Kanit, sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 36;
  cv.width = w;
  cv.height = 64;
  ctx.font = font;
  ctx.fillStyle = 'rgba(20,10,40,0.55)';
  ctx.beginPath();
  ctx.roundRect(0, 4, w, 56, 28);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set((w / 64) * size, size, 1);
  s.renderOrder = 10;
  s.userData.noHit = true;
  s.userData.noFade = true;
  return s;
}

export function makeEmoji(text, size = 0.9) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.font = '96px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 72);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(size, size, 1);
  s.renderOrder = 11;
  s.userData.noHit = true;
  return s;
}
