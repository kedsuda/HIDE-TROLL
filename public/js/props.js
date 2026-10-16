import * as THREE from 'three';

// ---- วัสดุแบบการ์ตูน (toon shading 3 ระดับ) ----
const grad = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter;
grad.needsUpdate = true;

const matCache = new Map();
export function mat(color, emissive = 0) {
  const key = `${color}|${emissive}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: grad });
    if (emissive) m.emissive = new THREE.Color(emissive);
    matCache.set(key, m);
  }
  return m;
}

export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 18),
  sph: new THREE.SphereGeometry(0.5, 18, 14),
  cone: new THREE.ConeGeometry(0.5, 1, 18),
  tor: new THREE.TorusGeometry(0.5, 0.1, 8, 24),
};

// part(รูปทรง, สี, [ขนาด], [ตำแหน่ง], {r: มุมหมุน, e: สีเรืองแสง})
export function part(geo, color, s, p, opt = {}) {
  const m = new THREE.Mesh(GEO[geo], mat(color, opt.e));
  m.scale.set(s[0], s[1], s[2]);
  m.position.set(p[0], p[1], p[2]);
  if (opt.r) m.rotation.set(opt.r[0], opt.r[1], opt.r[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const pick = (arr, v) => arr[((v % arr.length) + arr.length) % arr.length];
const grp = (...children) => {
  const g = new THREE.Group();
  g.add(...children.flat());
  return g;
};
const legs4 = (color, w, h, d, sx, sz) =>
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => part('box', color, [w, h, d], [a * sx, h / 2, b * sz]));

// กล่องเล็กหลายชิ้นรวมเป็น draw call เดียว (สินค้าบนชั้น, หนังสือ)
function instancedBoxes(items) {
  const m = new THREE.InstancedMesh(GEO.box, new THREE.MeshToonMaterial({ gradientMap: grad }), items.length);
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  items.forEach((it, i) => {
    o.position.set(it.p[0], it.p[1], it.p[2]);
    o.scale.set(it.s[0], it.s[1], it.s[2]);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    m.setColorAt(i, c.setHex(it.c));
  });
  m.castShadow = true;
  return m;
}

const FURN = [0xe85d5d, 0x5d9be8, 0x6fcf6f, 0xf2c14e, 0x9b6fe0];
const WOOD = [0xa0703c, 0x8b5a2b, 0xc98b4f];
const BOOKS = [0xe63946, 0x457b9d, 0xf4a261, 0x2a9d8f, 0xe9c46a, 0x9b5de5, 0xf15bb5];
const PRODUCTS = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93, 0xff924c, 0xffffff, 0x52d1dc];

// size = [กว้าง, สูง, ลึก] ใช้ทั้งชนและตอนแปลงร่าง, wall = วางชิดผนัง
export const PROPS = {
  crate: {
    name: 'ลังไม้', size: [1, 1, 1],
    build: (v) => grp(
      part('box', pick([0xc98b4f, 0xb5773d, 0xd9a066], v), [1, 1, 1], [0, 0.5, 0]),
      part('box', 0x8a5a2b, [1.04, 0.12, 1.04], [0, 0.15, 0]),
      part('box', 0x8a5a2b, [1.04, 0.12, 1.04], [0, 0.85, 0]),
      part('box', 0x8a5a2b, [0.12, 1.04, 1.04], [0, 0.5, 0]),
    ),
  },
  chair: {
    name: 'เก้าอี้', size: [0.6, 1.15, 0.6],
    build: (v) => {
      const c = pick(FURN, v);
      return grp(
        part('box', c, [0.6, 0.1, 0.6], [0, 0.5, 0]),
        legs4(0x6b4a2e, 0.08, 0.5, 0.08, 0.24, 0.24),
        part('box', c, [0.6, 0.6, 0.08], [0, 0.85, -0.26]),
      );
    },
  },
  table: {
    name: 'โต๊ะ', size: [1.6, 0.8, 1],
    build: (v) => grp(
      part('box', pick([...WOOD, 0xf0f0f0], v), [1.6, 0.1, 1], [0, 0.75, 0]),
      legs4(0x5a3b20, 0.1, 0.7, 0.1, 0.7, 0.4),
    ),
  },
  cabinet: {
    name: 'ตู้', size: [1, 1.9, 0.6], wall: true,
    build: (v) => grp(
      part('box', pick([0x8b5a2b, 0x6d8fb3, 0xb36d6d, 0x7a6a5a], v), [1, 1.9, 0.6], [0, 0.95, 0]),
      part('box', 0x3a2a1a, [0.03, 1.7, 0.02], [0, 0.95, 0.31]),
      part('sph', 0xffd166, [0.08, 0.08, 0.08], [-0.08, 1, 0.32]),
      part('sph', 0xffd166, [0.08, 0.08, 0.08], [0.08, 1, 0.32]),
    ),
  },
  barrel: {
    name: 'ถัง', size: [0.8, 1.1, 0.8],
    build: (v) => grp(
      part('cyl', pick([0x9c6b3e, 0x3f8f5f, 0xc0392b], v), [0.8, 1.1, 0.8], [0, 0.55, 0]),
      part('cyl', 0x444444, [0.84, 0.07, 0.84], [0, 0.2, 0]),
      part('cyl', 0x444444, [0.84, 0.07, 0.84], [0, 0.9, 0]),
    ),
  },
  plant: {
    name: 'กระถางต้นไม้', size: [0.7, 1.3, 0.7],
    build: (v) => {
      const leaf = pick([0x3fa34d, 0x2e8b57, 0x6cc04a, 0x8a6d3b], v);
      return grp(
        part('cyl', 0xc8693a, [0.5, 0.5, 0.5], [0, 0.25, 0]),
        part('sph', leaf, [0.85, 0.85, 0.85], [0, 0.92, 0]),
        part('sph', leaf, [0.5, 0.5, 0.5], [0.2, 1.2, 0.1]),
      );
    },
  },
  lamp: {
    name: 'โคมไฟ', size: [0.5, 1.75, 0.5],
    build: (v) => grp(
      part('cyl', 0x333333, [0.4, 0.06, 0.4], [0, 0.03, 0]),
      part('cyl', 0x444444, [0.06, 1.5, 0.06], [0, 0.78, 0]),
      part('sph', 0xfff3b0, [0.2, 0.2, 0.2], [0, 1.4, 0], { e: 0xffc14d }),
      part('cone', pick([0xf2c14e, 0xe85d5d, 0x5d9be8, 0xffffff], v), [0.6, 0.45, 0.6], [0, 1.55, 0]),
    ),
  },
  pumpkin: {
    name: 'ฟักทอง', size: [0.8, 0.75, 0.8],
    build: (v) => {
      const parts = [
        part('sph', 0xff8c1a, [0.8, 0.6, 0.8], [0, 0.3, 0]),
        part('sph', 0xf07b0a, [0.5, 0.62, 0.84], [0, 0.3, 0]),
        part('cyl', 0x3d7a2a, [0.08, 0.22, 0.08], [0, 0.68, 0]),
      ];
      if (v % 2 === 0) {
        parts.push(
          part('box', 0x221100, [0.12, 0.1, 0.05], [-0.15, 0.38, 0.38], { e: 0xffaa00 }),
          part('box', 0x221100, [0.12, 0.1, 0.05], [0.15, 0.38, 0.38], { e: 0xffaa00 }),
          part('box', 0x221100, [0.3, 0.06, 0.05], [0, 0.22, 0.38], { e: 0xffaa00 }),
        );
      }
      return grp(parts);
    },
  },
  coffin: {
    name: 'โลงศพ', size: [0.8, 0.6, 1.9],
    build: () => grp(
      part('box', 0x4a2c1d, [0.8, 0.5, 1.9], [0, 0.25, 0]),
      part('box', 0x5d3a26, [0.86, 0.08, 1.96], [0, 0.53, 0]),
      part('box', 0xd4af37, [0.1, 0.03, 0.7], [0, 0.58, 0]),
      part('box', 0xd4af37, [0.42, 0.03, 0.1], [0, 0.58, -0.15]),
    ),
  },
  candle: {
    name: 'เทียน', size: [0.3, 0.55, 0.3],
    build: () => grp(
      part('cyl', 0x888888, [0.3, 0.04, 0.3], [0, 0.02, 0]),
      part('cyl', 0xfff5e0, [0.15, 0.4, 0.15], [0, 0.22, 0]),
      part('sph', 0xffcc33, [0.08, 0.15, 0.08], [0, 0.5, 0], { e: 0xff9900 }),
    ),
  },
  ghost: {
    name: 'ผีผ้าห่ม', size: [0.8, 1.4, 0.8],
    build: () => grp(
      part('cone', 0xf4f4ff, [0.9, 1.1, 0.9], [0, 0.55, 0]),
      part('sph', 0xf4f4ff, [0.75, 0.75, 0.75], [0, 1.05, 0]),
      part('sph', 0x111111, [0.12, 0.16, 0.06], [-0.14, 1.1, 0.34]),
      part('sph', 0x111111, [0.12, 0.16, 0.06], [0.14, 1.1, 0.34]),
    ),
  },
  clock: {
    name: 'นาฬิกาตั้งพื้น', size: [0.6, 2.1, 0.45], wall: true,
    build: () => grp(
      part('box', 0x5b3a1e, [0.6, 2.1, 0.45], [0, 1.05, 0]),
      part('cyl', 0xf5ecd0, [0.42, 0.04, 0.42], [0, 1.7, 0.23], { r: [Math.PI / 2, 0, 0] }),
      part('box', 0xd4af37, [0.05, 0.5, 0.02], [0, 1, 0.23]),
      part('sph', 0xd4af37, [0.16, 0.16, 0.05], [0, 0.75, 0.24]),
    ),
  },
  sofa: {
    name: 'โซฟา', size: [1.8, 0.95, 0.8],
    build: (v) => {
      const c = pick([0x8e44ad, 0xc0392b, 0x2980b9, 0x27ae60], v);
      return grp(
        part('box', c, [1.8, 0.45, 0.8], [0, 0.225, 0]),
        part('box', c, [1.8, 0.5, 0.2], [0, 0.7, -0.3]),
        part('box', c, [0.2, 0.62, 0.8], [-0.8, 0.31, 0]),
        part('box', c, [0.2, 0.62, 0.8], [0.8, 0.31, 0]),
      );
    },
  },
  bookshelf: {
    name: 'ชั้นหนังสือ', size: [1.2, 1.8, 0.4], wall: true,
    build: (v) => {
      const books = [];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 5; j++) {
          const h = 0.32 + ((v + i * 3 + j) % 3) * 0.06;
          books.push({ p: [-0.42 + j * 0.21, 0.06 + i * 0.6 + h / 2, 0.02], s: [0.16, h, 0.3], c: pick(BOOKS, v + i * 5 + j) });
        }
      }
      return grp(
        part('box', 0x8b5a2b, [1.2, 1.8, 0.05], [0, 0.9, -0.175]),
        part('box', 0x8b5a2b, [0.06, 1.8, 0.4], [-0.57, 0.9, 0]),
        part('box', 0x8b5a2b, [0.06, 1.8, 0.4], [0.57, 0.9, 0]),
        [0.03, 0.6, 1.2, 1.78].map((y) => part('box', 0x8b5a2b, [1.2, 0.05, 0.4], [0, y, 0])),
        instancedBoxes(books),
      );
    },
  },
  tv: {
    name: 'ทีวี', size: [0.9, 1.05, 0.5],
    build: () => grp(
      part('box', 0x6b4a2e, [0.9, 0.5, 0.5], [0, 0.25, 0]),
      part('box', 0x222222, [0.8, 0.52, 0.12], [0, 0.78, 0]),
      part('box', 0x3a6ea5, [0.7, 0.42, 0.01], [0, 0.78, 0.065], { e: 0x1a3a5a }),
    ),
  },
  shelf: {
    name: 'ชั้นวางสินค้า', size: [2.4, 2, 0.7], wall: true,
    build: (v) => {
      const items = [];
      for (let lvl = 0; lvl < 3; lvl++) {
        for (let k = 0; k < 8; k++) {
          for (const z of [-0.17, 0.17]) {
            const h = 0.26 + ((k + lvl + v) % 3) * 0.05;
            items.push({ p: [-1 + k * 0.285, 0.13 + lvl * 0.6 + h / 2, z], s: [0.22, h, 0.24], c: pick(PRODUCTS, v * 7 + k + lvl * 3) });
          }
        }
      }
      return grp(
        part('box', 0xb8c4cc, [0.08, 2, 0.7], [-1.16, 1, 0]),
        part('box', 0xb8c4cc, [0.08, 2, 0.7], [1.16, 1, 0]),
        part('box', 0xdde3e8, [2.32, 1.9, 0.04], [0, 1, 0]),
        [0.1, 0.7, 1.3, 1.95].map((y) => part('box', 0xe8ecef, [2.4, 0.05, 0.7], [0, y, 0])),
        instancedBoxes(items),
      );
    },
  },
  cart: {
    name: 'รถเข็น', size: [0.7, 1.1, 1.1],
    build: () => grp(
      part('box', 0xb0bec5, [0.66, 0.45, 0.9], [0, 0.78, 0]),
      part('box', 0x546e7a, [0.56, 0.4, 0.8], [0, 0.83, 0]),
      part('cyl', 0xe53935, [0.06, 0.72, 0.06], [0, 1.08, -0.5], { r: [0, 0, Math.PI / 2] }),
      legs4(0x90a4ae, 0.05, 0.56, 0.05, 0.28, 0.38),
      [[-0.28, -0.38], [0.28, -0.38], [-0.28, 0.38], [0.28, 0.38]].map(([x, z]) => part('sph', 0x222222, [0.14, 0.14, 0.14], [x, 0.07, z])),
    ),
  },
  fruitbox: {
    name: 'ลังผลไม้', size: [0.9, 0.65, 0.7],
    build: (v) => {
      const c = pick([0xff3b3b, 0xffa500, 0x9acd32, 0xffe135, 0x8e44ad], v);
      const fruits = [];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) fruits.push(part('sph', c, [0.26, 0.26, 0.26], [-0.28 + i * 0.28, 0.48, -0.14 + j * 0.28]));
      return grp(part('box', 0xc98b4f, [0.9, 0.4, 0.7], [0, 0.2, 0]), fruits);
    },
  },
  fridge: {
    name: 'ตู้แช่', size: [1, 2, 0.8], wall: true,
    build: (v) => grp(
      part('box', 0xf5f7fa, [1, 2, 0.8], [0, 1, 0]),
      part('box', 0x9fd6ff, [0.85, 1.5, 0.02], [0, 1.05, 0.41], { e: 0x0d2a40 }),
      part('box', 0xaaaaaa, [0.05, 0.6, 0.05], [0.4, 1.05, 0.44]),
      part('box', pick([0xe53935, 0x1e88e5, 0x43a047], v), [1, 0.22, 0.05], [0, 1.88, 0.42]),
    ),
  },
  trash: {
    name: 'ถังขยะ', size: [0.6, 0.95, 0.6],
    build: (v) => {
      const c = pick([0x2e8b57, 0x2b6cb0, 0xe0a800], v);
      return grp(part('cyl', c, [0.55, 0.8, 0.55], [0, 0.4, 0]), part('cyl', 0x333333, [0.62, 0.1, 0.62], [0, 0.85, 0]));
    },
  },
  cone: {
    name: 'กรวยจราจร', size: [0.55, 0.8, 0.55],
    build: () => grp(
      part('box', 0xff6f00, [0.55, 0.05, 0.55], [0, 0.025, 0]),
      part('cone', 0xff6f00, [0.45, 0.75, 0.45], [0, 0.42, 0]),
      part('cyl', 0xffffff, [0.2, 0.1, 0.2], [0, 0.48, 0]),
    ),
  },
  desk: {
    name: 'โต๊ะนักเรียน', size: [1.2, 0.8, 0.7],
    build: () => grp(
      part('box', 0xd9a066, [1.2, 0.06, 0.7], [0, 0.77, 0]),
      legs4(0x555555, 0.05, 0.75, 0.05, 0.55, 0.3),
      part('box', 0xb5773d, [0.4, 0.2, 0.6], [0.35, 0.62, 0]),
    ),
  },
  locker: {
    name: 'ล็อกเกอร์', size: [0.6, 2, 0.6], wall: true,
    build: (v) => grp(
      part('box', pick([0x3b82f6, 0xef4444, 0x10b981, 0xf59e0b], v), [0.6, 2, 0.6], [0, 1, 0]),
      [0, 1, 2].map((i) => part('box', 0x222222, [0.35, 0.03, 0.01], [0, 1.75 - i * 0.08, 0.305])),
      part('box', 0xcccccc, [0.04, 0.16, 0.04], [0.2, 1, 0.32]),
    ),
  },
  globe: {
    name: 'ลูกโลก', size: [0.6, 1, 0.6],
    build: () => grp(
      part('cyl', 0x8b5a2b, [0.4, 0.06, 0.4], [0, 0.03, 0]),
      part('cyl', 0xd4af37, [0.05, 0.45, 0.05], [0, 0.25, 0]),
      part('sph', 0x3a86ff, [0.56, 0.56, 0.56], [0, 0.72, 0]),
      part('sph', 0x52b788, [0.3, 0.26, 0.2], [0.12, 0.8, 0.18]),
      part('sph', 0x52b788, [0.2, 0.2, 0.2], [-0.15, 0.62, 0.17]),
    ),
  },
  ball: {
    name: 'ลูกบอล', size: [0.6, 0.6, 0.6],
    build: (v) => grp(
      part('sph', pick([0xff7f11, 0xffffff, 0xe63946], v), [0.6, 0.6, 0.6], [0, 0.3, 0]),
      part('tor', 0x222222, [0.61, 0.61, 0.61], [0, 0.3, 0]),
    ),
  },
};

const CARDBOARD = [0xc8a165, 0xb8905a, 0xd6b47a];

// ---- โรงพยาบาล ----
Object.assign(PROPS, {
  bed: {
    name: 'เตียงคนไข้', size: [1.1, 0.95, 2.1], wall: true,
    build: (v) => grp(
      part('box', 0xeceff1, [1.1, 0.12, 2.05], [0, 0.42, 0]),
      legs4(0x90a4ae, 0.06, 0.4, 0.06, 0.48, 0.95),
      part('box', 0xa8d8ea, [1, 0.18, 1.95], [0, 0.56, 0]),
      part('box', 0xffffff, [0.7, 0.14, 0.4], [0, 0.71, -0.72]),
      part('box', pick([0x80cbc4, 0x90caf9, 0xf48fb1, 0xfff59d], v), [1.04, 0.08, 1.15], [0, 0.68, 0.38]),
      part('box', 0x90a4ae, [1.1, 0.95, 0.07], [0, 0.48, -1.02]),
    ),
  },
  wheelchair: {
    name: 'รถเข็นคนป่วย', size: [0.75, 1, 0.8],
    build: () => grp(
      part('box', 0x37474f, [0.55, 0.08, 0.5], [0, 0.5, 0]),
      part('box', 0x37474f, [0.55, 0.5, 0.06], [0, 0.8, -0.25]),
      part('tor', 0x222222, [0.7, 0.7, 0.7], [-0.33, 0.36, 0], { r: [0, Math.PI / 2, 0] }),
      part('tor', 0x222222, [0.7, 0.7, 0.7], [0.33, 0.36, 0], { r: [0, Math.PI / 2, 0] }),
      part('sph', 0x222222, [0.12, 0.12, 0.12], [-0.22, 0.06, 0.32]),
      part('sph', 0x222222, [0.12, 0.12, 0.12], [0.22, 0.06, 0.32]),
      part('box', 0x90a4ae, [0.05, 0.2, 0.05], [-0.27, 1.05, -0.3]),
      part('box', 0x90a4ae, [0.05, 0.2, 0.05], [0.27, 1.05, -0.3]),
    ),
  },
  ivstand: {
    name: 'เสาน้ำเกลือ', size: [0.5, 1.9, 0.5],
    build: () => grp(
      part('cyl', 0x888888, [0.45, 0.05, 0.45], [0, 0.03, 0]),
      part('cyl', 0xcfd8dc, [0.04, 1.8, 0.04], [0, 0.93, 0]),
      part('box', 0xcfd8dc, [0.35, 0.03, 0.03], [0, 1.8, 0]),
      part('box', 0xbfe6ff, [0.18, 0.28, 0.06], [0.14, 1.6, 0], { e: 0x0d2a40 }),
    ),
  },
  medcab: {
    name: 'ตู้ยา', size: [0.9, 1.8, 0.45], wall: true,
    build: () => grp(
      part('box', 0xfafafa, [0.9, 1.8, 0.45], [0, 0.9, 0]),
      part('box', 0xe53935, [0.34, 0.09, 0.02], [0, 1.35, 0.23]),
      part('box', 0xe53935, [0.09, 0.34, 0.02], [0, 1.35, 0.23]),
      part('box', 0x9e9e9e, [0.86, 0.02, 0.02], [0, 0.85, 0.23]),
    ),
  },
  curtain: {
    name: 'ม่านกั้นเตียง', size: [1.6, 1.85, 0.3],
    build: (v) => grp(
      part('cyl', 0xb0bec5, [0.04, 1.85, 0.04], [-0.75, 0.93, 0]),
      part('cyl', 0xb0bec5, [0.04, 1.85, 0.04], [0.75, 0.93, 0]),
      part('box', 0xb0bec5, [0.3, 0.03, 0.3], [-0.75, 0.02, 0]),
      part('box', 0xb0bec5, [0.3, 0.03, 0.3], [0.75, 0.02, 0]),
      part('box', pick([0x80cbc4, 0xb39ddb, 0xffcc80, 0x90caf9], v), [1.46, 1.45, 0.05], [0, 1.05, 0]),
    ),
  },
});

// ---- โกดังสินค้า ----
Object.assign(PROPS, {
  pallet: {
    name: 'พาเลท', size: [1.2, 0.25, 1],
    build: () => grp(
      part('box', 0xc9a26b, [1.2, 0.05, 1], [0, 0.22, 0]),
      [-0.42, 0, 0.42].map((z) => part('box', 0xa47c48, [1.2, 0.17, 0.14], [0, 0.1, z])),
    ),
  },
  boxstack: {
    name: 'กองกล่อง', size: [1.2, 1.5, 1],
    build: (v) => {
      const boxes = [];
      for (const [x, z] of [[-0.3, -0.24], [0.3, -0.24], [-0.3, 0.24], [0.3, 0.24]]) {
        boxes.push(part('box', pick(CARDBOARD, v + boxes.length), [0.58, 0.5, 0.46], [x, 0.5, z]));
      }
      boxes.push(part('box', pick(CARDBOARD, v + 1), [0.58, 0.5, 0.46], [-0.3, 1, (v % 2) ? 0.24 : -0.24]));
      boxes.push(part('box', pick(CARDBOARD, v + 2), [0.58, 0.5, 0.46], [0.3, 1, 0]));
      if (v % 3 === 0) boxes.push(part('box', pick(CARDBOARD, v), [0.5, 0.45, 0.42], [0, 1.22 + 0.05, 0]));
      return grp(
        part('box', 0xc9a26b, [1.2, 0.05, 1], [0, 0.22, 0]),
        [-0.42, 0, 0.42].map((z) => part('box', 0xa47c48, [1.2, 0.17, 0.14], [0, 0.1, z])),
        boxes,
      );
    },
  },
  rack: {
    name: 'ชั้นวางพาเลท', size: [2.6, 2.6, 1], wall: true,
    build: (v) => {
      const items = [];
      for (let lvl = 0; lvl < 3; lvl++) {
        for (let k = 0; k < 4; k++) {
          if ((v + k + lvl) % 5 === 0) continue;
          items.push({ p: [-0.95 + k * 0.63, 0.06 + lvl * 0.9 + 0.3, 0], s: [0.55, 0.55, 0.8], c: pick(CARDBOARD, v + k * 2 + lvl) });
        }
      }
      return grp(
        [[-1.26, -0.46], [1.26, -0.46], [-1.26, 0.46], [1.26, 0.46]].map(([x, z]) => part('box', 0xff8f00, [0.08, 2.6, 0.08], [x, 1.3, z])),
        [0.9, 1.8].flatMap((y) => [-0.46, 0.46].map((z) => part('box', 0x1565c0, [2.6, 0.1, 0.08], [0, y, z]))),
        [0.04, 0.9, 1.8].map((y) => part('box', 0x9e9e9e, [2.5, 0.04, 0.95], [0, y, 0])),
        instancedBoxes(items),
      );
    },
  },
  forklift: {
    name: 'รถยก', size: [1.1, 2.1, 1.8],
    build: () => grp(
      part('box', 0xffc107, [1, 0.75, 1.2], [0, 0.55, -0.25]),
      part('box', 0x333333, [0.5, 0.3, 0.4], [0, 1.05, -0.35]),
      [[-0.45, -0.75], [0.45, -0.75], [-0.45, 0.25], [0.45, 0.25]].map(([x, z]) => part('box', 0x333333, [0.05, 1.2, 0.05], [x, 1.5, z])),
      part('box', 0xffc107, [1, 0.06, 1.1], [0, 2.1, -0.25]),
      part('box', 0x424242, [0.1, 2, 0.1], [-0.35, 1, 0.42]),
      part('box', 0x424242, [0.1, 2, 0.1], [0.35, 1, 0.42]),
      part('box', 0x616161, [0.12, 0.05, 0.75], [-0.22, 0.12, 0.85]),
      part('box', 0x616161, [0.12, 0.05, 0.75], [0.22, 0.12, 0.85]),
      [[-0.5, -0.65], [0.5, -0.65], [-0.5, 0.2], [0.5, 0.2]].map(([x, z]) => part('cyl', 0x222222, [0.42, 0.2, 0.42], [x, 0.21, z], { r: [0, 0, Math.PI / 2] })),
    ),
  },
});

// ---- สวนสนุก ----
Object.assign(PROPS, {
  popcorn: {
    name: 'รถขายป๊อปคอร์น', size: [0.9, 1.75, 0.7],
    build: () => grp(
      part('box', 0xe53935, [0.9, 0.75, 0.7], [0, 0.5, 0]),
      part('box', 0xfff3c4, [0.8, 0.6, 0.6], [0, 1.18, 0], { e: 0x2a1d00 }),
      part('box', 0xffffff, [0.95, 0.12, 0.75], [0, 1.55, 0]),
      part('box', 0xe53935, [0.95, 0.12, 0.75], [0, 1.67, 0]),
      part('cyl', 0x222222, [0.26, 0.08, 0.26], [-0.42, 0.13, 0.2], { r: [0, 0, Math.PI / 2] }),
      part('cyl', 0x222222, [0.26, 0.08, 0.26], [0.42, 0.13, 0.2], { r: [0, 0, Math.PI / 2] }),
    ),
  },
  balloons: {
    name: 'ลูกโป่ง', size: [0.6, 2.3, 0.6],
    build: (v) => {
      const cols = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0xff70a6, 0x9b5de5];
      const parts = [part('cyl', 0x555555, [0.3, 0.15, 0.3], [0, 0.08, 0])];
      [[-0.18, 1.85, 0], [0.18, 1.95, 0.05], [0, 2.1, -0.1], [0.05, 1.75, 0.18]].forEach(([x, y, z], i) => {
        parts.push(part('sph', pick(cols, v + i), [0.38, 0.46, 0.38], [x, y, z]));
        parts.push(part('cyl', 0xdddddd, [0.015, y - 0.15, 0.015], [x / 2, (y - 0.15) / 2 + 0.1, z / 2]));
      });
      return grp(parts);
    },
  },
  teddy: {
    name: 'ตุ๊กตาหมี', size: [0.8, 1.25, 0.6],
    build: (v) => {
      const c = pick([0xa0522d, 0xf4a3c0, 0xd2b48c, 0x9fd3ff], v);
      return grp(
        part('sph', c, [0.72, 0.75, 0.6], [0, 0.38, 0]),
        part('sph', c, [0.55, 0.52, 0.5], [0, 0.95, 0]),
        part('sph', c, [0.2, 0.2, 0.12], [-0.21, 1.18, 0]),
        part('sph', c, [0.2, 0.2, 0.12], [0.21, 1.18, 0]),
        part('sph', 0xf5deb3, [0.22, 0.16, 0.12], [0, 0.9, 0.24]),
        part('sph', 0x111111, [0.07, 0.07, 0.04], [-0.1, 1.02, 0.24]),
        part('sph', 0x111111, [0.07, 0.07, 0.04], [0.1, 1.02, 0.24]),
        part('sph', c, [0.22, 0.2, 0.3], [-0.2, 0.08, 0.2]),
        part('sph', c, [0.22, 0.2, 0.3], [0.2, 0.08, 0.2]),
      );
    },
  },
  horse: {
    name: 'ม้าหมุน', size: [0.5, 2, 1.2],
    build: (v) => {
      const c = pick([0xffffff, 0xf8bbd0, 0xb3e5fc, 0xfff59d], v);
      return grp(
        part('cyl', 0xd4af37, [0.4, 0.06, 0.4], [0, 0.03, 0]),
        part('cyl', 0xd4af37, [0.06, 2, 0.06], [0, 1, 0]),
        part('box', c, [0.38, 0.42, 0.85], [0, 1, 0]),
        part('box', c, [0.28, 0.5, 0.24], [0, 1.3, 0.42], { r: [-0.4, 0, 0] }),
        part('box', c, [0.26, 0.24, 0.42], [0, 1.55, 0.58]),
        part('box', 0xe53935, [0.4, 0.06, 0.4], [0, 1.24, -0.05]),
        [[-0.12, 0.3], [0.12, 0.3], [-0.12, -0.3], [0.12, -0.3]].map(([x, z]) => part('box', c, [0.08, 0.45, 0.08], [x, 0.62, z])),
      );
    },
  },
  bench: {
    name: 'ม้านั่ง', size: [1.6, 0.95, 0.6],
    build: (v) => {
      const c = pick([0xb5773d, 0x2e7d32, 0x1565c0], v);
      return grp(
        part('box', c, [1.6, 0.08, 0.5], [0, 0.45, 0]),
        part('box', c, [1.6, 0.35, 0.06], [0, 0.78, -0.25]),
        part('box', 0x333333, [0.06, 0.45, 0.5], [-0.7, 0.225, 0]),
        part('box', 0x333333, [0.06, 0.45, 0.5], [0.7, 0.225, 0]),
      );
    },
  },
  tree: {
    name: 'ต้นไม้', size: [0.9, 2.8, 0.9],
    build: (v) => {
      const leaf = pick([0x43a047, 0x66bb6a, 0x2e7d32, 0xf06292], v);
      return grp(
        part('cyl', 0x8b5a2b, [0.3, 1.3, 0.3], [0, 0.65, 0]),
        part('sph', leaf, [1.5, 1.3, 1.5], [0, 1.75, 0]),
        part('sph', leaf, [1, 0.9, 1], [0.1, 2.35, 0.1]),
      );
    },
  },
  ticket: {
    name: 'ซุ้มขายตั๋ว', size: [1.3, 2.3, 1.2], wall: true,
    build: (v) => {
      const c = pick([0xff70a6, 0x4cc9f0, 0xffca3a], v);
      return grp(
        part('box', c, [1.3, 1.8, 1.2], [0, 0.9, 0]),
        part('box', 0x1a1a2e, [0.8, 0.5, 0.02], [0, 1.25, 0.61], { e: 0x111133 }),
        part('box', 0xffffff, [1.5, 0.15, 1.4], [0, 1.9, 0]),
        part('box', c, [1.5, 0.15, 1.4], [0, 2.05, 0]),
        part('box', 0xffffff, [1.5, 0.15, 1.4], [0, 2.2, 0]),
      );
    },
  },
  duck: {
    name: 'เป็ดยางยักษ์', size: [0.7, 0.75, 0.6],
    build: () => grp(
      part('sph', 0xffd600, [0.7, 0.45, 0.55], [0, 0.23, 0]),
      part('sph', 0xffd600, [0.34, 0.34, 0.34], [0, 0.55, 0.15]),
      part('box', 0xff6f00, [0.14, 0.06, 0.14], [0, 0.53, 0.35]),
      part('sph', 0x111111, [0.06, 0.06, 0.04], [-0.1, 0.62, 0.3]),
      part('sph', 0x111111, [0.06, 0.06, 0.04], [0.1, 0.62, 0.3]),
    ),
  },
});

export function parseKey(key) {
  const [type, v] = String(key).split(':');
  return { type, v: Number(v) || 0 };
}

export function buildProp(key) {
  const { type, v } = parseKey(key);
  const P = PROPS[type] || PROPS.crate;
  const g = P.build(v);
  g.userData.type = type;
  return g;
}
