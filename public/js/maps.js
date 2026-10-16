import { PROPS } from './props.js';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MAPS = {
  haunted: {
    name: 'บ้านผีสิง', emoji: '👻', cols: 3, rows: 3, room: 12,
    sky: 0x1b1033, fog: [14, 60], ground: 0x2a2140,
    floors: [0x5a4670, 0x4c3a60], wall: 0x7a5c8f, trim: 0x3a2850,
    hemi: [0xc9b8ff, 0x302040, 1.6], sun: [0xc8b8ff, 1.4], lights: 0xffa040,
    perRoom: [7, 10],
    props: { crate: 2, chair: 3, table: 2, cabinet: 2, barrel: 2, lamp: 1, pumpkin: 3, coffin: 1, candle: 3, ghost: 1, clock: 1, sofa: 1, bookshelf: 2, plant: 1, tv: 1 },
  },
  market: {
    name: 'ซูเปอร์มาร์เก็ต', emoji: '🛒', cols: 3, rows: 2, room: 14,
    sky: 0x9fd8ff, fog: null, ground: 0x8fd18a,
    floors: [0xf2efe6, 0xe2ddd0], wall: 0x7fc8f8, trim: 0xff6b6b,
    hemi: [0xffffff, 0x8899aa, 2.0], sun: [0xffffff, 1.8], lights: 0,
    perRoom: [6, 9], aisles: 'shelf',
    props: { cart: 3, fruitbox: 3, fridge: 2, crate: 2, barrel: 1, trash: 1, cone: 1, plant: 1, shelf: 1 },
  },
  school: {
    name: 'โรงเรียน', emoji: '🏫', cols: 3, rows: 3, room: 12,
    sky: 0xa8e0ff, fog: null, ground: 0x7cc576,
    floors: [0xd9b38c, 0xc9a27a], wall: 0xfff1c1, trim: 0x5aa9e6,
    hemi: [0xffffff, 0x887766, 1.9], sun: [0xfff4dd, 1.8], lights: 0,
    perRoom: [5, 8], classrooms: true,
    props: { locker: 2, bookshelf: 2, globe: 1, ball: 2, trash: 1, plant: 2, table: 1, cabinet: 1, cone: 1, chair: 2, crate: 1 },
  },
  hospital: {
    name: 'โรงพยาบาล', emoji: '🏥', cols: 3, rows: 3, room: 12,
    sky: 0xbfe9ff, fog: null, ground: 0x9ad0a0,
    floors: [0xe8f4f8, 0xd6eaf0], wall: 0xf7fbfc, trim: 0x4fc3a1,
    hemi: [0xffffff, 0x8899aa, 1.9], sun: [0xffffff, 1.7], lights: 0,
    perRoom: [6, 9],
    props: { bed: 3, wheelchair: 2, ivstand: 2, medcab: 2, curtain: 1, chair: 2, plant: 1, trash: 1, cabinet: 1, tv: 1, table: 1 },
  },
  warehouse: {
    name: 'โกดังสินค้า', emoji: '📦', cols: 3, rows: 2, room: 14,
    sky: 0xc9d6e3, fog: [20, 70], ground: 0x8c8c8c,
    floors: [0x9e9e9e, 0x8f8f8f], wall: 0xd08c3c, trim: 0x3d3d3d,
    hemi: [0xfff4e0, 0x555555, 1.7], sun: [0xfff1d6, 1.6], lights: 0,
    perRoom: [6, 9], aisles: 'rack',
    props: { pallet: 2, boxstack: 4, crate: 3, barrel: 2, cone: 1, forklift: 1, trash: 1, rack: 1 },
  },
  park: {
    name: 'สวนสนุก', emoji: '🎡', cols: 3, rows: 3, room: 12, wallH: 1.4,
    sky: 0x8fd3ff, fog: null, ground: 0x7cc576,
    floors: [0xf4d58d, 0xe9c46a], wall: 0x3fa34d, trim: 0x2e7d32,
    hemi: [0xffffff, 0x88aa77, 1.9], sun: [0xfff4dd, 1.8], lights: 0,
    perRoom: [6, 9], ferris: true,
    props: { popcorn: 2, balloons: 2, teddy: 2, horse: 2, bench: 3, tree: 3, trash: 1, cone: 1, ticket: 1, duck: 2, plant: 1 },
  },
};
for (const [id, base, name] of [['abandoned', 'school', 'โรงเรียนร้าง'], ['asylum', 'hospital', 'โรงพยาบาลผีสิง'], ['nightpark', 'park', 'สวนสนุกกลางคืน']]) {
  MAPS[id] = { ...MAPS[base], name, sky: 0x090d20, fog: [8, 38], ground: 0x151522,
    floors: [0x373744, 0x30303b], wall: 0x535362, trim: 0x282336,
    hemi: [0x819bcf, 0x20132e, 0.85], sun: [0x899ccb, 0.65], lights: 0x99ccee,
    props: { ...MAPS[base].props, ghost: 1, candle: 2, lamp: 2 } };
}
export const MAP_IDS = Object.keys(MAPS);

export const WALL_H = 3.6;
const WALL_T = 0.4;
const DOOR = 2.8;

// สร้างแผนที่จาก seed เดียวกัน => ทุกเครื่องได้ฉากเหมือนกัน แต่สุ่มใหม่ทุกรอบ
export function generateMap(id, seed) {
  const M = MAPS[id] || MAPS.haunted;
  const rng = mulberry32((seed >>> 0) || 1);
  const rand = (a, b) => a + rng() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const S = M.room;
  const W = M.cols * S;
  const D = M.rows * S;
  const x0 = -W / 2;
  const z0 = -D / 2;
  const walls = [];
  const doors = [];
  const props = [];
  const floors = [];
  const rooms = [];
  const box = (x, z, w, d) => ({ x, z, w, d });

  walls.push(box(0, z0, W + WALL_T, WALL_T), box(0, z0 + D, W + WALL_T, WALL_T));
  walls.push(box(x0, 0, WALL_T, D + WALL_T), box(x0 + W, 0, WALL_T, D + WALL_T));

  // ผนังกั้นห้องแนวตั้ง (มีประตู หรือเปิดโล่งบางช่วง)
  for (let c = 1; c < M.cols; c++) {
    const x = x0 + c * S;
    for (let r = 0; r < M.rows; r++) {
      const za = z0 + r * S;
      const zb = za + S;
      if (rng() < 0.15) continue;
      const dz = rand(za + 2.5, zb - 2.5);
      const a = dz - DOOR / 2;
      const b = dz + DOOR / 2;
      walls.push(box(x, (za + a) / 2, WALL_T, a - za), box(x, (b + zb) / 2, WALL_T, zb - b));
      doors.push({ x, z: dz });
    }
  }
  // ผนังกั้นห้องแนวนอน
  for (let r = 1; r < M.rows; r++) {
    const z = z0 + r * S;
    for (let c = 0; c < M.cols; c++) {
      const xa = x0 + c * S;
      const xb = xa + S;
      if (rng() < 0.15) continue;
      const dx = rand(xa + 2.5, xb - 2.5);
      const a = dx - DOOR / 2;
      const b = dx + DOOR / 2;
      walls.push(box((xa + a) / 2, z, a - xa, WALL_T), box((b + xb) / 2, z, xb - b, WALL_T));
      doors.push({ x: dx, z });
    }
  }

  for (let r = 0; r < M.rows; r++) {
    for (let c = 0; c < M.cols; c++) {
      const cx = x0 + (c + 0.5) * S;
      const cz = z0 + (r + 0.5) * S;
      floors.push({ x: cx, z: cz, s: S, color: M.floors[(c + r) % 2] });
      rooms.push({
        c, r, cx, cz,
        minX: cx - S / 2 + WALL_T / 2, maxX: cx + S / 2 - WALL_T / 2,
        minZ: cz - S / 2 + WALL_T / 2, maxZ: cz + S / 2 - WALL_T / 2,
      });
    }
  }

  const hunterRoom = rooms[0];
  const hiderRoom = rooms[Math.floor(M.rows / 2) * M.cols + Math.floor(M.cols / 2)];
  const reserved = [
    { x: hunterRoom.cx, z: hunterRoom.cz, r: 2.2 },
    { x: hiderRoom.cx, z: hiderRoom.cz, r: 2.4 },
  ];

  function place(R, type, x, z, ry, v) {
    const P = PROPS[type];
    const [w, h, d] = P.size;
    const c = Math.abs(Math.cos(ry));
    const s = Math.abs(Math.sin(ry));
    const hx = (w * c + d * s) / 2;
    const hz = (w * s + d * c) / 2;
    if (x - hx < R.minX || x + hx > R.maxX || z - hz < R.minZ || z + hz > R.maxZ) return false;
    for (const o of props) {
      if (Math.abs(o.x - x) < o.hx + hx + 0.35 && Math.abs(o.z - z) < o.hz + hz + 0.35) return false;
    }
    for (const dr of doors) {
      if (Math.abs(dr.x - x) < hx + 1.9 && Math.abs(dr.z - z) < hz + 1.9) return false;
    }
    for (const rs of reserved) {
      if (Math.hypot(rs.x - x, rs.z - z) < rs.r + Math.max(hx, hz)) return false;
    }
    props.push({ type, v, x, z, ry, hx, hz, h });
    return true;
  }

  const bag = [];
  for (const [t, wgt] of Object.entries(M.props)) for (let i = 0; i < wgt; i++) bag.push(t);

  for (const R of rooms) {
    if (M.aisles && rng() < 0.8) {
      const step = PROPS[M.aisles].size[0] + 0.2;
      for (const zo of [-3.4, 2.4]) {
        for (const xo of [-step, 0, step]) {
          if (rng() < 0.85) place(R, M.aisles, R.cx + xo, R.cz + zo, 0, randInt(0, 9));
        }
      }
    }
    if (M.classrooms && rng() < 0.75) {
      for (const zo of [-2.4, 1.0]) {
        for (const xo of [-3, 0, 3]) {
          if (place(R, 'desk', R.cx + xo, R.cz + zo, 0, 0)) {
            place(R, 'chair', R.cx + xo, R.cz + zo + 1.05, Math.PI, randInt(0, 9));
          }
        }
      }
    }
    const target = randInt(M.perRoom[0], M.perRoom[1]);
    let placed = 0;
    for (let tries = 0; tries < 80 && placed < target; tries++) {
      const type = bag[Math.floor(rng() * bag.length)];
      const P = PROPS[type];
      const v = randInt(0, 9);
      let ok;
      if (P.wall) {
        const [w, , d] = P.size;
        const side = randInt(0, 3);
        if (side === 0) ok = place(R, type, rand(R.minX + w / 2, R.maxX - w / 2), R.minZ + d / 2 + 0.02, 0, v);
        else if (side === 1) ok = place(R, type, rand(R.minX + w / 2, R.maxX - w / 2), R.maxZ - d / 2 - 0.02, Math.PI, v);
        else if (side === 2) ok = place(R, type, R.minX + d / 2 + 0.02, rand(R.minZ + w / 2, R.maxZ - w / 2), Math.PI / 2, v);
        else ok = place(R, type, R.maxX - d / 2 - 0.02, rand(R.minZ + w / 2, R.maxZ - w / 2), -Math.PI / 2, v);
      } else {
        const ry = randInt(0, 3) * (Math.PI / 2) + rand(-0.25, 0.25);
        ok = place(R, type, rand(R.minX + 0.8, R.maxX - 0.8), rand(R.minZ + 0.8, R.maxZ - 0.8), ry, v);
      }
      if (ok) placed++;
    }
  }

  // จุดเกิด: ฝ่ายล่าอยู่ห้องมุม ฝ่ายซ่อนอยู่ห้องกลาง
  const ring = (R, rad, n) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [R.cx + Math.cos(a) * rad, R.cz + Math.sin(a) * rad];
  });

  return {
    id, theme: M, walls, props, floors, wallH: M.wallH || WALL_H,
    size: { W, D },
    spawns: { hunter: ring(hunterRoom, 1, 4), hider: ring(hiderRoom, 1.3, 10) },
  };
}
