// วาดรูปไอคอนในร้านสกินจากโมเดล 3D จริง (หมวก/ตัวละคร) → รูปในร้านตรงกับของที่ใส่บนหัว
import * as THREE from 'three';
import { buildHat, buildCharacter } from './character.js';

const SIZE = 160;
const cache = new Map();
let renderer = null;
let scene = null;
let camera = null;

function setup() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a5a9a, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  camera = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
}

// วางกล้องให้วัตถุพอดีกรอบ มองเฉียงจากด้านหน้าเล็กน้อย
function snap(obj, { yaw = 0.5, pitch = 0.25, pad = 1.18 } = {}) {
  setup();
  obj.rotation.y = yaw;
  scene.add(obj);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj, true);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  const dist = (size * pad) / (2 * Math.tan((camera.fov * Math.PI) / 360));
  camera.position.set(center.x, center.y + Math.sin(pitch) * dist, center.z + Math.cos(pitch) * dist);
  camera.lookAt(center);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(obj);
  return url;
}

export function hatThumb(id) {
  if (id === 'none') return null;
  const key = `hat:${id}`;
  // วงแหวนนางฟ้ามองจากด้านบนมากขึ้นให้เห็นเป็นวง
  if (!cache.has(key)) cache.set(key, snap(buildHat(id), { yaw: 0.45, pitch: id === 'halo' ? 0.75 : 0.3 }));
  return cache.get(key);
}

// ตัวละครโมเดล 3D ต้องรอโหลดเสร็จก่อน (ready = false จะไม่เก็บแคช)
export function charThumb(id, ready = true) {
  const key = `char:${id}`;
  if (cache.has(key)) return cache.get(key);
  const url = snap(buildCharacter({ char: id, color: 'mint', hat: 'none' }), { yaw: 0.35, pitch: 0.12, pad: 1.05 });
  if (ready) cache.set(key, url);
  return url;
}
