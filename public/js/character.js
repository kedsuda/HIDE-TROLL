import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { part, mat } from './props.js';

// ตัวละครให้เลือก
// file = โมเดล 3D ใน public/models, yaw = หมุนให้หันหน้าไปทาง +z
// hat = จุดวางหมวกบนหัวจริงของตัวละคร { y: ความสูงหัว, z: เลื่อนไปข้างหน้า, s: ขนาดหมวก }
export const CHARACTERS = {
  blob: { name: 'บล็อบ', icon: '🟢', price: 0 },
  tuxedo: { name: 'ทักซิโด้แซม', icon: '🐧', price: 0, file: 'models/tuxedo.glb', yaw: 0, hat: { x: 0.17, y: 1.44, z: 0, s: 0.85 } },
  duo: { name: 'ดูโอ้', icon: '🦉', price: 0, file: 'models/duo.glb', yaw: 0, hat: { y: 1.42, z: 0, s: 1 } },
  porter: { name: 'แมวพอร์เตอร์', icon: '🐱', price: 0, file: 'models/porter.glb', yaw: 0, hat: { y: 1.36, z: 0.27, s: 0.72 } },
  doraemon: { name: 'โดราเอมอน', icon: '🔔', price: 0, file: 'models/doraemon.glb', yaw: 0, hat: { y: 1.42, z: 0, s: 1.05 } },
  ods: { name: 'กวางน้อย', icon: '🦌', price: 0, file: 'models/ods.glb', yaw: 0, hat: { y: 1.06, z: 0.27, s: 0.7 } },
};
const BLOB_HEAD_TOP = 1.51;

// ย้ายหมวก (ซึ่งออกแบบไว้สำหรับหัวบล็อบ) ไปวางบนหัวของตัวละครแต่ละตัว
function mountHat(hat, cfg) {
  const g = new THREE.Group();
  const h = buildHat(hat);
  h.position.y = -BLOB_HEAD_TOP;
  g.add(h);
  g.position.set(cfg?.x ?? 0, cfg?.y ?? BLOB_HEAD_TOP, cfg?.z ?? 0);
  g.scale.setScalar(cfg?.s ?? 1);
  g.userData.isHat = true;
  return g;
}
const CHAR_HEIGHT = 1.5;
const templates = new Map();

export const isCharLoaded = (id) => templates.has(id);

// โหลดโมเดลทั้งหมดครั้งเดียว แล้วจำขนาด/จุดกึ่งกลางไว้ใช้ตอนสร้างตัวละคร
export async function loadCharacters() {
  const loader = new GLTFLoader();
  await Promise.all(Object.entries(CHARACTERS).filter(([, c]) => c.file).map(async ([id, c]) => {
    try {
      const gltf = await loader.loadAsync(c.file);
      // วัดขนาดจากท่าแรกของแอนิเมชันจริง (ท่าตั้งต้นของโมเดลบางตัวสูงกว่าท่าที่เล่นจริง)
      if (gltf.animations.length) {
        const mixer = new THREE.AnimationMixer(gltf.scene);
        mixer.clipAction(gltf.animations[0]).play();
        mixer.update(0);
      }
      gltf.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(gltf.scene, true);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      templates.set(id, {
        scene: gltf.scene, clips: gltf.animations,
        scale: CHAR_HEIGHT / size.y, offset: new THREE.Vector3(-center.x, -box.min.y, -center.z),
      });
    } catch (err) {
      console.warn(`โหลดตัวละคร ${id} ไม่สำเร็จ ใช้บล็อบแทน`, err);
    }
  }));
}

function buildModelChar(id, skin, hunter) {
  const tpl = templates.get(id);
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  g.add(pivot);
  const holder = new THREE.Group();
  holder.scale.setScalar(tpl.scale);
  holder.rotation.y = CHARACTERS[id].yaw || 0;
  const model = cloneSkinned(tpl.scene);
  model.position.copy(tpl.offset);
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });
  holder.add(model);
  pivot.add(holder);
  pivot.add(mountHat(skin.hat, CHARACTERS[id].hat));
  if (hunter) {
    pivot.add(part('box', 0xff7a00, [0.14, 0.16, 0.55], [0.5, 0.78, 0.22]));
    pivot.add(part('cyl', 0x33ccff, [0.12, 0.16, 0.12], [0.5, 0.78, 0.54], { r: [Math.PI / 2, 0, 0], e: 0x0a6a8a }));
  }
  let mixer = null;
  if (tpl.clips.length) {
    mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(tpl.clips[0]).play();
  }
  g.userData.char = { pivot, mixer };
  return uniqueMaterials(g);
}

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
const halfRing = new THREE.TorusGeometry(0.44, 0.045, 8, 24, Math.PI);

// หมวกทุกแบบออกแบบให้วางบนหัวบล็อบ (ยอดหัวอยู่ที่ y = 1.51) แล้วค่อยย้ายไปหัวตัวละครอื่นด้วย mountHat
export function buildHat(hat) {
  const g = new THREE.Group();
  const T = 1.51;
  switch (hat) {
    case 'party': {
      // กรวยม่วง ลายดาวเหลือง ระบายชมพู ปอมปอมทอง
      g.add(part('cone', 0x7b3fe4, [0.4, 0.58, 0.4], [0, T + 0.29, 0]));
      const dots = [[0.1, 0.12, 0.13], [-0.11, 0.2, 0.08], [0.02, 0.33, 0.1], [0.07, 0.22, -0.12], [-0.08, 0.08, -0.14]];
      for (const [x, y, z] of dots) g.add(part('sph', 0xffd84d, [0.05, 0.05, 0.05], [x, T + y, z], { e: 0x664400 }));
      g.add(part('tor', 0xff7ab8, [0.44, 0.44, 0.45], [0, T + 0.02, 0], { r: [Math.PI / 2, 0, 0] }));
      g.add(part('sph', 0xffd84d, [0.15, 0.15, 0.15], [0, T + 0.6, 0], { e: 0x996600 }));
      break;
    }
    case 'cap':
      // แก๊ปฟ้า กระดุมบนยอด ปีกหมวกด้านหน้า
      g.add(part('sph', 0x2f7bff, [0.84, 0.5, 0.84], [0, T - 0.05, 0]));
      g.add(part('cyl', 0x1f5fd6, [0.62, 0.04, 0.46], [0, T - 0.03, 0.36]));
      g.add(part('sph', 0x1f5fd6, [0.08, 0.05, 0.08], [0, T + 0.2, 0]));
      g.add(part('box', 0x1f5fd6, [0.02, 0.2, 0.3], [0, T + 0.08, 0.12], { r: [-0.5, 0, 0] }));
      break;
    case 'chef':
      // แถบผ้าขาว + ยอดฟูนุ่ม 5 ก้อน + ป้ายทองด้านหน้า
      g.add(part('cyl', 0xf7f7f7, [0.6, 0.24, 0.6], [0, T + 0.08, 0]));
      for (const [x, y, z, r] of [[0, 0.42, 0, 0.42], [0.17, 0.32, 0, 0.34], [-0.17, 0.32, 0, 0.34], [0, 0.32, 0.16, 0.34], [0, 0.32, -0.16, 0.34]]) {
        g.add(part('sph', 0xffffff, [r, r * 0.9, r], [x, T + y, z]));
      }
      g.add(part('box', 0xffc93c, [0.08, 0.06, 0.02], [0, T + 0.08, 0.3], { e: 0x553300 }));
      break;
    case 'bunny':
      // หูกระต่ายขาว ด้านในชมพู ที่คาดผมชมพู
      {
        // ที่คาดผม: ครึ่งวงโค้งพาดบนหัว
        const band = new THREE.Mesh(halfRing, mat(0xff9fc4));
        band.position.y = T - 0.42;
        band.castShadow = true;
        g.add(band);
      }
      for (const sd of [-1, 1]) {
        g.add(part('sph', 0xffffff, [0.18, 0.66, 0.12], [sd * 0.16, T + 0.3, 0], { r: [0, 0, -sd * 0.2] }));
        g.add(part('sph', 0xff9fc4, [0.09, 0.48, 0.05], [sd * 0.16, T + 0.3, 0.045], { r: [0, 0, -sd * 0.2] }));
      }
      break;
    case 'horns':
      // เขาปีศาจสีม่วงโค้งออกด้านข้าง (ต่อ 2 ท่อนให้ดูโค้ง)
      for (const sd of [-1, 1]) {
        g.add(part('cone', 0x8e3ff0, [0.17, 0.28, 0.17], [sd * 0.2, T + 0.08, 0], { r: [0, 0, -sd * 0.55], e: 0x22004a }));
        g.add(part('cone', 0xb06bff, [0.1, 0.24, 0.1], [sd * 0.33, T + 0.26, 0], { r: [0, 0, -sd * 1.05], e: 0x22004a }));
      }
      break;
    case 'halo':
      // วงแหวนทองเรืองแสงลอยเหนือหัว
      g.add(part('tor', 0xffe066, [0.6, 0.6, 0.8], [0, T + 0.32, 0], { r: [Math.PI / 2, 0, 0], e: 0xffb000 }));
      for (const [x, z] of [[0.3, 0], [-0.21, 0.21], [0, -0.3]]) g.add(part('sph', 0xfffbe0, [0.04, 0.04, 0.04], [x, T + 0.36, z], { e: 0xffee88 }));
      break;
    case 'crown':
      // มงกุฎทอง 5 แฉก อัญมณีแดง ฟ้า เขียว ไข่มุกบนยอด
      g.add(part('cyl', 0xffc93c, [0.58, 0.2, 0.58], [0, T + 0.06, 0]));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const x = Math.sin(a) * 0.23;
        const z = Math.cos(a) * 0.23;
        g.add(part('cone', 0xffc93c, [0.12, 0.22, 0.12], [x, T + 0.26, z]));
        g.add(part('sph', 0xfff6e0, [0.05, 0.05, 0.05], [x * 1.02, T + 0.38, z * 1.02]));
      }
      g.add(part('sph', 0xe63946, [0.1, 0.1, 0.05], [0, T + 0.06, 0.29], { e: 0x330000 }));
      g.add(part('sph', 0x3a86ff, [0.07, 0.07, 0.04], [0.2, T + 0.06, 0.2], { e: 0x001133 }));
      g.add(part('sph', 0x2ecc71, [0.07, 0.07, 0.04], [-0.2, T + 0.06, 0.2], { e: 0x003311 }));
      break;
    default:
      break;
  }
  return g;
}

// ทำให้วัสดุของตัวละครแยกจากกัน (ปรับความโปร่งใสรายคนได้)
export function uniqueMaterials(obj) {
  obj.traverse((o) => {
    if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
  });
  return obj;
}

export function buildCharacter(skin = {}, hunter = false) {
  if (skin.char && skin.char !== 'blob' && templates.has(skin.char)) return buildModelChar(skin.char, skin, hunter);
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
  if (c.mixer) {
    c.mixer.update(Math.min(0.1, Math.max(0, t - (c.lastT ?? t))));
    c.lastT = t;
  }
  if (!c.fl) {
    // ตัวละครโมเดล 3D: เด้งและโยกตัวตอนเดิน
    const w = Math.sin(t * 12);
    c.pivot.position.y = airborne ? 0.05 : moving ? Math.abs(w) * 0.07 : 0;
    c.pivot.rotation.z = moving && !airborne ? w * 0.07 : 0;
    return;
  }
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
    for (const mt of Array.isArray(m.material) ? m.material : [m.material]) {
      mt.transparent = o < 1;
      mt.opacity = o;
      mt.depthWrite = o >= 1;
    }
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
