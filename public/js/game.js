import * as THREE from 'three';
import { PROPS, buildProp, parseKey, part, mat } from './props.js';
import { generateMap } from './maps.js';
import {
  buildCharacter, animateCharacter, setOpacity, makeLabel, makeEmoji, uniqueMaterials,
} from './character.js';
import { sfx } from './audio.js';

const GRAVITY = 24;
const JUMP_V = 8;
const STEP_H = 0.45;
const HIDER_SPEED = 5.2;
const HUNTER_SPEED = 5.8;
const SEND_MS = 1000 / 15;
const SHOOT_MS = 450;
const SHOOT_RANGE = 40;
const DISGUISE_RANGE = 5.5;
const TAUNTS = ['😜', '🤪', '👅', '🙈', '🤡', '💩'];
const CENTER = new THREE.Vector2(0, 0);

const damp = (k, dt) => 1 - Math.exp(-k * dt);
const r2 = (n) => Math.round(n * 100) / 100;
function lerpAngle(a, b, t) {
  const TAU = Math.PI * 2;
  const d = ((((b - a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return a + d * t;
}
function findTagged(o, key) {
  while (o) {
    if (o.userData && o.userData[key] !== undefined) return o;
    o = o.parent;
  }
  return null;
}
function bodySize(propKey) {
  if (!propKey) return { r: 0.38, h: 1.5 };
  const P = PROPS[parseKey(propKey).type];
  if (!P) return { r: 0.38, h: 1.5 };
  const [w, h, d] = P.size;
  return { r: Math.min(0.6, Math.max(0.25, Math.min(w, d) / 2)), h: Math.max(0.4, h) };
}

export class Game {
  constructor(canvas, input, hooks) {
    this.input = input;
    this.hooks = hooks;
    this.shadows = !input.touch;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !input.touch, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, input.touch ? 1.5 : 2));
    this.renderer.shadowMap.enabled = this.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.remotes = new Map();
    this.decoys = new Map();
    this.effects = [];
    this.roster = new Map();
    this.active = false;
    this.firstPerson = false;
    this.phase = 'lobby';
    this.hint = '';
    this.setupPreview();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pc = this.previewCam;
    pc.aspect = w / h;
    const wide = w / h > 1.15;
    pc.position.set(wide ? -1.9 : 0, wide ? 1.5 : 2.6, wide ? 5.2 : 7);
    pc.lookAt(wide ? -1.9 : 0, wide ? 0.9 : 1.6, 0);
    pc.updateProjectionMatrix();
  }

  // ---------- ฉากตัวอย่างหน้าเมนู ----------
  setupPreview() {
    const s = (this.preview = new THREE.Scene());
    s.background = new THREE.Color(0x2a1b4d);
    s.add(new THREE.HemisphereLight(0xffffff, 0x553377, 2.2));
    const d = new THREE.DirectionalLight(0xffffff, 2);
    d.position.set(3, 5, 4);
    s.add(d);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.3, 32), mat(0x6c4ab6));
    plat.position.y = -0.15;
    s.add(plat);
    for (const [key, x, z, ry] of [['crate:0', -2.4, -1.4, 0.4], ['pumpkin:0', 2.2, -1, -0.5], ['chair:3', -2.1, 1, 0.9], ['plant:1', 2.4, 1.1, 0], ['ghost:0', 0.4, -2.8, 0]]) {
      const g = buildProp(key);
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      s.add(g);
    }
    this.previewCam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    this.setPreviewSkin({ color: 'mint', hat: 'none' });
  }

  setPreviewSkin(skin) {
    if (this.previewChar) this.preview.remove(this.previewChar);
    this.previewChar = buildCharacter(skin, false);
    this.preview.add(this.previewChar);
  }

  // ---------- เริ่ม/จบแมตช์ ----------
  start({ mapId, seed, myId, team, skin, spawnIndex, roster, phase, decoys }) {
    this.stop();
    this.myId = myId;
    this.phase = phase;
    this.roster = new Map(roster.map((p) => [p.id, p]));
    this.buildWorld(mapId, seed);
    const list = team === 'hunter' ? this.world.map.spawns.hunter : this.world.map.spawns.hider;
    const sp = list[spawnIndex % list.length];
    this.me = {
      id: myId, team, skin, alive: true,
      pos: new THREE.Vector3(sp[0], 0, sp[1]), vel: new THREE.Vector3(),
      yaw: Math.atan2(sp[0], sp[1]), pitch: -0.15, onGround: true,
      prop: null, propRy: 0, lockRot: false,
      speedUntil: 0, invisUntil: 0, stunUntil: 0,
      facing: Math.atan2(-sp[0], -sp[1]), moving: false, op: 1,
      root: new THREE.Group(), char: null, propMesh: null,
    };
    this.scene.add(this.me.root);
    this.rebuildMe();
    for (const d of decoys || []) this.addDecoy(d, true);
    this.lastSend = 0;
    this.lastShot = 0;
    this.lastTarget = 0;
    this.target = null;
    this.active = true;
    this.input.reset();
  }

  stop() {
    this.active = false;
    this.remotes.clear();
    this.decoys.clear();
    this.effects = [];
    this.scene = null;
    this.world = null;
    this.ferris = null;
    this.me = null;
    this.setHint('');
  }

  buildWorld(mapId, seed) {
    const map = generateMap(mapId, seed);
    const th = map.theme;
    const H = map.wallH;
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(th.sky);
    if (th.fog) scene.fog = new THREE.Fog(th.sky, th.fog[0], th.fog[1]);
    scene.add(new THREE.HemisphereLight(th.hemi[0], th.hemi[1], th.hemi[2]));
    const sun = new THREE.DirectionalLight(th.sun[0], th.sun[1]);
    sun.position.set(12, 25, 8);
    if (this.shadows) {
      sun.castShadow = true;
      const r = Math.max(map.size.W, map.size.D) / 2 + 3;
      Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 80 });
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0006;
    }
    scene.add(sun, sun.target);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(th.ground));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.21;
    ground.receiveShadow = true;
    scene.add(ground);
    for (const f of map.floors) {
      const m = part('box', f.color, [f.s, 0.2, f.s], [f.x, -0.1, f.z]);
      m.castShadow = false;
      scene.add(m);
    }

    const colliders = [];
    const wallGroup = new THREE.Group();
    for (const w of map.walls) {
      wallGroup.add(part('box', th.wall, [w.w, H, w.d], [w.x, H / 2, w.z]));
      wallGroup.add(part('box', th.trim, [w.w + 0.06, 0.16, w.d + 0.06], [w.x, H, w.z]));
      colliders.push({ minX: w.x - w.w / 2, maxX: w.x + w.w / 2, minY: 0, maxY: H + 5, minZ: w.z - w.d / 2, maxZ: w.z + w.d / 2 });
    }
    scene.add(wallGroup);

    const propsGroup = new THREE.Group();
    let lights = 0;
    for (const p of map.props) {
      const key = `${p.type}:${p.v}`;
      const g = buildProp(key);
      g.position.set(p.x, 0, p.z);
      g.rotation.y = p.ry;
      g.userData.propKey = key;
      propsGroup.add(g);
      colliders.push({ minX: p.x - p.hx, maxX: p.x + p.hx, minY: 0, maxY: p.h, minZ: p.z - p.hz, maxZ: p.z + p.hz });
      if (th.lights && lights < 6 && (p.type === 'candle' || p.type === 'lamp')) {
        const l = new THREE.PointLight(th.lights, 10, 10, 1.5);
        l.position.set(p.x, 1.4, p.z);
        scene.add(l);
        lights++;
      }
    }
    scene.add(propsGroup);

    if (th.ferris) scene.add(this.buildFerris(map.size.D / 2 + 16));

    this.decoyGroup = new THREE.Group();
    scene.add(this.decoyGroup);

    this.highlight = new THREE.Box3Helper(new THREE.Box3(), 0xffe14d);
    this.highlight.visible = false;
    scene.add(this.highlight);

    this.world = { map, colliders, wallGroup, propsGroup };
  }

  // ชิงช้าสวรรค์ (ฉากหลัง ไม่มีการชน)
  buildFerris(dist) {
    const g = new THREE.Group();
    const R = 10;
    const hub = R + 2;
    const wheel = new THREE.Group();
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.3, 8, 64), mat(0xff70a6)));
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(R * 0.6, 0.2, 8, 48), mat(0xffca3a)));
    const cols = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93, 0x4cc9f0];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      wheel.add(part('box', 0xffffff, [0.18, R, 0.18], [Math.sin(a) * R / 2, Math.cos(a) * R / 2, 0], { r: [0, 0, -a] }));
      const cab = part('box', cols[i % cols.length], [1.4, 1.2, 1.2], [Math.sin(a) * R, Math.cos(a) * R - 0.8, 0]);
      wheel.add(cab);
    }
    wheel.position.y = hub;
    g.add(wheel);
    for (const s of [-1, 1]) {
      g.add(part('box', 0xeeeeee, [0.5, hub + 1, 0.5], [s * 3.2, hub / 2, 0], { r: [0, 0, s * 0.25] }));
    }
    g.position.set(0, 0, -dist);
    this.ferris = wheel;
    return g;
  }

  rebuildMe() {
    const me = this.me;
    if (me.char) me.root.remove(me.char);
    if (me.propMesh) me.root.remove(me.propMesh);
    me.char = me.propMesh = null;
    if (me.prop) {
      me.propMesh = uniqueMaterials(buildProp(me.prop));
      me.root.add(me.propMesh);
    } else {
      me.char = buildCharacter(me.skin, me.team === 'hunter');
      me.root.add(me.char);
    }
    me.op = 1;
  }

  setMyTeam(team) {
    if (!this.me || this.me.team === team) return;
    this.me.team = team;
    this.me.prop = null;
    this.me.invisUntil = 0;
    this.rebuildMe();
  }

  setPhase(phase) {
    this.phase = phase;
  }

  // ---------- ข้อมูลจากเซิร์ฟเวอร์ ----------
  updateRoster(players) {
    this.roster = new Map(players.map((p) => [p.id, p]));
    if (!this.active) return;
    const mine = this.roster.get(this.myId);
    if (mine) this.setMyTeam(mine.team);
    for (const [id, r] of this.remotes) {
      const info = this.roster.get(id);
      if (!info) { this.removeRemote(id); continue; }
      if (info.team !== r.team || info.skin.color !== r.skin.color || info.skin.hat !== r.skin.hat) {
        r.team = info.team;
        r.skin = info.skin;
        if (r.team === 'hunter') r.prop = null;
        this.rebuildRemote(r);
      }
    }
  }

  ensureRemote(id) {
    let r = this.remotes.get(id);
    if (r) return r;
    const info = this.roster.get(id);
    if (!info) return null;
    r = {
      id, team: info.team, name: info.name, skin: info.skin, prop: null,
      root: new THREE.Group(), char: null, propMesh: null, label: null,
      target: new THREE.Vector3(), ry: 0, pr: 0, moving: 0, air: 0, inv: 0, op: 1,
      init: false, seed: Math.random() * 10,
    };
    r.root.userData.playerId = id;
    this.scene.add(r.root);
    this.remotes.set(id, r);
    this.rebuildRemote(r);
    return r;
  }

  rebuildRemote(r) {
    for (const o of [r.char, r.propMesh, r.label]) if (o) r.root.remove(o);
    r.char = r.propMesh = null;
    if (r.prop) {
      r.propMesh = uniqueMaterials(buildProp(r.prop));
      r.root.add(r.propMesh);
    } else {
      r.char = buildCharacter(r.skin, r.team === 'hunter');
      r.root.add(r.char);
    }
    r.label = makeLabel(r.name, r.team === 'hunter' ? '#ff8a65' : '#9be7c4');
    r.label.position.y = r.prop ? bodySize(r.prop).h + 0.45 : 2.15;
    r.root.add(r.label);
    r.op = 1;
  }

  removeRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.scene?.remove(r.root);
    this.remotes.delete(id);
  }

  applySnapshot(snap) {
    if (!this.active) return;
    const seen = new Set();
    for (const id in snap) {
      if (id === this.myId) continue;
      const r = this.ensureRemote(id);
      if (!r) continue;
      seen.add(id);
      const s = snap[id];
      r.target.set(s[0], s[1], s[2]);
      r.ry = s[3];
      r.pr = s[4];
      r.moving = s[5];
      r.air = s[6];
      r.inv = s[7];
      const prop = s[8] || null;
      if (prop !== r.prop) {
        r.prop = prop;
        this.rebuildRemote(r);
      }
      if (!r.init) {
        r.root.position.copy(r.target);
        r.init = true;
      }
    }
    for (const id of [...this.remotes.keys()]) if (!seen.has(id)) this.removeRemote(id);
  }

  addDecoy(d, silent = false) {
    if (!this.active || this.decoys.has(d.id)) return;
    let g;
    if (d.prop) {
      g = buildProp(d.prop);
      g.rotation.y = d.ry;
    } else {
      g = buildCharacter(d.skin, false);
      g.rotation.y = d.ry;
    }
    const holder = new THREE.Group();
    holder.add(g);
    holder.position.set(d.x, d.y, d.z);
    holder.userData.decoyId = d.id;
    const lab = makeLabel('🎭 ตัวปลอม', '#ffd166', 0.3);
    lab.position.y = d.prop ? bodySize(d.prop).h + 0.4 : 2.1;
    holder.add(lab);
    holder.userData.label = lab;
    holder.userData.owner = d.owner;
    this.decoyGroup.add(holder);
    this.decoys.set(d.id, holder);
    if (!silent) this.puff(holder.position, 0xffffff, 10);
  }

  removeDecoy({ id, trolled }) {
    const h = this.decoys.get(id);
    if (!h) return;
    this.decoys.delete(id);
    this.decoyGroup.remove(h);
    this.puff(h.position, 0xffd166, 14);
    if (trolled) {
      this.floatEmoji(h.position, '🤡', 2.4);
      sfx.troll();
    }
  }

  onShot(d) {
    if (!this.active || d.id === this.myId) return;
    const o = new THREE.Vector3(...d.o);
    const h = new THREE.Vector3(...d.h);
    this.tracer(o, h, 0xff5252);
    this.puff(h, 0xffffff, 5);
    sfx.shoot(this.volAt(o));
  }

  onCaught(d) {
    if (!this.active) return;
    const isMe = d.id === this.myId;
    const pos = isMe ? this.me.pos : this.remotes.get(d.id)?.root.position;
    if (pos) this.confetti(pos);
    sfx.caught();
    if (isMe) this.me.prop = null;
  }

  onFx(d) {
    if (!this.active) return;
    const now = performance.now();
    const isMe = d.id === this.myId;
    const pos = isMe ? this.me.pos : this.remotes.get(d.id)?.root.position;
    if (!pos) return;
    const vol = isMe ? 1 : this.volAt(pos);
    switch (d.type) {
      case 'invis':
        if (isMe) this.me.invisUntil = now + d.dur * 1000;
        this.puff(pos, 0xb388ff, 12);
        sfx.invis(vol);
        break;
      case 'speed':
        if (isMe) this.me.speedUntil = now + d.dur * 1000;
        this.puff(pos, 0xffee58, 8);
        sfx.skill(vol);
        break;
      case 'taunt':
        this.floatEmoji(pos, TAUNTS[d.n % TAUNTS.length], 2.3);
        sfx.taunt(d.n);
        break;
      case 'poof':
        if (!isMe) {
          this.puff(pos, 0xffffff, 14);
          sfx.poof(vol * 0.7);
        }
        break;
      default:
        break;
    }
  }

  onHp(d) {
    if (!this.active) return;
    if (d.stun > 0) {
      this.me.stunUntil = performance.now() + d.stun;
      this.floatEmoji(this.me.pos, '😵', 2.3);
      sfx.lose();
    }
  }

  volAt(pos) {
    if (!this.me) return 0.5;
    return Math.max(0.12, 1 - pos.distanceTo(this.me.pos) / 40);
  }

  // ---------- ลูปหลัก ----------
  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    if (!this.active) {
      this.previewChar.rotation.y += dt * 0.6;
      animateCharacter(this.previewChar, t, false, false);
      this.renderer.render(this.preview, this.previewCam);
      return;
    }
    const now = performance.now();
    this.updateLocal(dt, t, now);
    this.updateRemotes(dt, t);
    this.updateEffects(dt);
    if (this.ferris) this.ferris.rotation.z += dt * 0.08;
    this.updateCamera();
    if (now - this.lastTarget > 100) {
      this.lastTarget = now;
      this.updateTargeting();
    }
    if (now - this.lastSend > SEND_MS) {
      this.lastSend = now;
      const me = this.me;
      this.hooks.state({
        p: [r2(me.pos.x), r2(me.pos.y), r2(me.pos.z)], ry: r2(me.facing), pr: r2(me.propRy),
        m: me.moving ? 1 : 0, a: me.onGround ? 0 : 1,
      });
    }
    this.renderer.render(this.scene, this.camera);
  }

  isFrozen(now) {
    const me = this.me;
    return (me.team === 'hunter' && this.phase === 'hiding') || now < me.stunUntil;
  }

  updateLocal(dt, t, now) {
    const me = this.me;
    const inp = this.input;
    const look = inp.consumeLook();
    const sens = inp.touch ? 0.0045 : 0.0025;
    me.yaw -= look.dx * sens;
    me.pitch = Math.max(-1.3, Math.min(1.1, me.pitch - look.dy * sens));

    for (const a of inp.consumeActions()) this.handleAction(a, now);

    const frozen = this.isFrozen(now);
    const mv = frozen ? { x: 0, z: 0 } : inp.move();
    const speed = (me.team === 'hunter' ? HUNTER_SPEED : HIDER_SPEED) * (now < me.speedUntil ? 1.7 : 1);
    const fx = -Math.sin(me.yaw);
    const fz = -Math.cos(me.yaw);
    const wx = (fx * mv.z + Math.cos(me.yaw) * mv.x) * speed;
    const wz = (fz * mv.z - Math.sin(me.yaw) * mv.x) * speed;
    const k = damp(me.onGround ? 14 : 4, dt);
    me.vel.x += (wx - me.vel.x) * k;
    me.vel.z += (wz - me.vel.z) * k;
    me.moving = Math.hypot(wx, wz) > 0.1;
    if (me.moving) me.facing = lerpAngle(me.facing, Math.atan2(wx, wz), damp(15, dt));
    if (me.prop && !me.lockRot) me.propRy = me.yaw;

    const { r, h } = bodySize(me.prop);
    const cols = this.world.colliders.concat(this.remoteColliders());
    me.onGround = this.moveBody(me.pos, me.vel, r, h, dt, cols);
    if (me.pos.y < -8) {
      const sp = this.world.map.spawns.hider[0];
      me.pos.set(sp[0], 1, sp[1]);
      me.vel.set(0, 0, 0);
    }

    me.root.position.copy(me.pos);
    if (me.char) {
      me.char.rotation.y = me.facing;
      animateCharacter(me.char, t, me.moving, !me.onGround);
    }
    if (me.propMesh) {
      me.propMesh.rotation.y = me.propRy;
      me.propMesh.rotation.z = me.moving && me.onGround ? Math.sin(t * 14) * 0.07 : 0;
    }
    const op = now < me.invisUntil ? 0.3 : 1;
    if (op !== me.op) {
      setOpacity(me.root, op);
      me.op = op;
    }
    me.root.visible = !this.firstPerson;
  }

  remoteColliders() {
    const out = [];
    for (const r of this.remotes.values()) {
      if (!r.init) continue;
      const { r: rad, h } = bodySize(r.prop);
      const p = r.root.position;
      out.push({ minX: p.x - rad, maxX: p.x + rad, minY: p.y, maxY: p.y + h, minZ: p.z - rad, maxZ: p.z + rad });
    }
    return out;
  }

  moveBody(pos, vel, r, h, dt, cols) {
    pos.x += vel.x * dt;
    this.resolve(pos, r, h, cols, 'x');
    pos.z += vel.z * dt;
    this.resolve(pos, r, h, cols, 'z');
    vel.y -= GRAVITY * dt;
    pos.y += vel.y * dt;
    let ground = 0;
    for (const b of cols) {
      if (pos.x + r <= b.minX || pos.x - r >= b.maxX || pos.z + r <= b.minZ || pos.z - r >= b.maxZ) continue;
      if (b.maxY <= pos.y + STEP_H && b.maxY > ground) ground = b.maxY;
    }
    if (pos.y <= ground) {
      pos.y = ground;
      if (vel.y < 0) vel.y = 0;
      return true;
    }
    return false;
  }

  resolve(pos, r, h, cols, axis) {
    for (const b of cols) {
      if (b.maxY <= pos.y + STEP_H || b.minY >= pos.y + h) continue;
      if (pos.x + r <= b.minX || pos.x - r >= b.maxX || pos.z + r <= b.minZ || pos.z - r >= b.maxZ) continue;
      if (axis === 'x') pos.x = pos.x < (b.minX + b.maxX) / 2 ? b.minX - r - 0.001 : b.maxX + r + 0.001;
      else pos.z = pos.z < (b.minZ + b.maxZ) / 2 ? b.minZ - r - 0.001 : b.maxZ + r + 0.001;
    }
  }

  handleAction(a, now) {
    const me = this.me;
    const hider = me.team === 'hider' && me.alive;
    switch (a) {
      case 'jump':
        if (me.onGround && !this.isFrozen(now)) {
          me.vel.y = JUMP_V;
          me.onGround = false;
        }
        break;
      case 'action':
        if (me.team === 'hunter') this.shoot(now);
        else if (hider) this.disguise();
        break;
      case 'revert':
        if (hider && me.prop) this.setMyProp(null);
        break;
      case 'lock':
        if (hider && me.prop) {
          me.lockRot = !me.lockRot;
          this.hooks.toast(me.lockRot ? '🔒 ล็อกการหมุนแล้ว' : '🔓 ปลดล็อกการหมุน');
        }
        break;
      case 'camera':
        this.firstPerson = !this.firstPerson;
        break;
      case 'invis':
      case 'decoy':
      case 'taunt':
        if (hider) this.hooks.skill(a);
        break;
      case 'speed':
        this.hooks.skill(a);
        break;
      default:
        break;
    }
  }

  setMyProp(key) {
    const me = this.me;
    me.prop = key;
    me.lockRot = false;
    me.propRy = me.yaw;
    this.rebuildMe();
    this.puff(me.pos, 0xffffff, 14);
    sfx.poof();
    this.hooks.disguise(key);
  }

  disguise() {
    if (this.phase === 'ended') return;
    if (!this.target) {
      this.hooks.toast('เล็งไปที่สิ่งของใกล้ๆ ก่อนนะ');
      return;
    }
    const key = this.target.userData.propKey;
    if (key === this.me.prop) return;
    this.setMyProp(key);
  }

  shoot(now) {
    const me = this.me;
    if (this.phase !== 'hunting') {
      this.hooks.toast('รอฝ่ายซ่อนหาที่ซ่อนก่อน!');
      return;
    }
    if (now < me.stunUntil || now - this.lastShot < SHOOT_MS) return;
    this.lastShot = now;
    this.raycaster.setFromCamera(CENTER, this.camera);
    this.raycaster.far = 80;
    const targets = [this.world.propsGroup, this.world.wallGroup, this.decoyGroup];
    for (const r of this.remotes.values()) if (r.team === 'hider') targets.push(r.root);
    const hit = this.raycaster.intersectObjects(targets, true).find((h) => !h.object.userData.noHit);
    const right = new THREE.Vector3(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
    const muzzle = me.pos.clone().add(new THREE.Vector3(0, 0.85, 0)).addScaledVector(right, 0.45);
    const end = hit ? hit.point : this.raycaster.ray.at(60, new THREE.Vector3());
    const data = { o: [r2(muzzle.x), r2(muzzle.y), r2(muzzle.z)], h: [r2(end.x), r2(end.y), r2(end.z)] };
    if (hit && hit.point.distanceTo(me.pos) < SHOOT_RANGE) {
      const pl = findTagged(hit.object, 'playerId');
      const dc = findTagged(hit.object, 'decoyId');
      const pr = findTagged(hit.object, 'propKey');
      if (pl) data.target = pl.userData.playerId;
      else if (dc) data.decoy = dc.userData.decoyId;
      else if (pr) {
        data.prop = 1;
        this.floatText(end, '-5 HP');
        sfx.miss();
      }
    }
    this.hooks.shoot(data);
    this.tracer(muzzle, end, 0xffe14d);
    this.puff(end, 0xffffff, 6);
    sfx.shoot();
  }

  updateTargeting() {
    const me = this.me;
    let target = null;
    if (me.team === 'hider' && me.alive && this.phase !== 'ended') {
      this.raycaster.setFromCamera(CENTER, this.camera);
      this.raycaster.far = 40;
      const hit = this.raycaster.intersectObjects([this.world.propsGroup, this.world.wallGroup], true)[0];
      if (hit) {
        const g = findTagged(hit.object, 'propKey');
        if (g && hit.point.distanceTo(me.pos) < DISGUISE_RANGE) target = g;
      }
      // ช่วยเล็ง: ของชิ้นบาง (เสาน้ำเกลือ, ม้าหมุน) เลือกชิ้นที่ใกล้เป้าที่สุด
      if (!target) {
        const ray = this.raycaster.ray;
        const c = new THREE.Vector3();
        let best = 0.1;
        for (const g of this.world.propsGroup.children) {
          c.copy(g.position);
          if (c.distanceTo(me.pos) > DISGUISE_RANGE) continue;
          c.y += 0.5;
          const ang = c.sub(ray.origin).angleTo(ray.direction);
          if (ang < best) { best = ang; target = g; }
        }
      }
    }
    this.target = target;
    if (target) {
      this.highlight.box.setFromObject(target);
      this.highlight.visible = true;
    } else {
      this.highlight.visible = false;
    }

    let hint = '';
    const touch = this.input.touch;
    if (me.team === 'hider') {
      if (target) {
        const name = PROPS[parseKey(target.userData.propKey).type]?.name || 'สิ่งของ';
        hint = touch ? `แตะ 🪄 เพื่อแปลงเป็น "${name}"` : `กด E เพื่อแปลงเป็น "${name}"`;
      } else if (me.prop) {
        hint = touch ? 'อยู่นิ่งๆ ให้เหมือนของจริง • 🔒 ล็อกการหมุน' : 'อยู่นิ่งๆ ให้เหมือนของจริง • R ล็อกการหมุน • Z กลับร่าง';
      } else {
        hint = 'เล็งสิ่งของในฉากเพื่อแปลงร่าง';
      }
    } else if (me.team === 'hunter') {
      if (this.phase === 'hiding') hint = '';
      else hint = touch ? 'เล็งแล้วแตะ 🎯 ยิงของที่น่าสงสัย (ยิงผิดเสีย HP)' : 'คลิกยิงของที่น่าสงสัย (ยิงผิดเสีย 5 HP)';
    }
    this.setHint(hint);

    for (const h of this.decoys.values()) h.userData.label.visible = me.team === 'hider';
  }

  setHint(h) {
    if (h === this.hint) return;
    this.hint = h;
    this.hooks.hint(h);
  }

  updateRemotes(dt, t) {
    const meHunter = this.me.team === 'hunter';
    for (const r of this.remotes.values()) {
      r.root.position.lerp(r.target, damp(14, dt));
      if (r.char) {
        r.char.rotation.y = lerpAngle(r.char.rotation.y, r.ry, damp(12, dt));
        animateCharacter(r.char, t + r.seed, r.moving, r.air);
      }
      if (r.propMesh) {
        r.propMesh.rotation.y = lerpAngle(r.propMesh.rotation.y, r.pr, damp(12, dt));
        r.propMesh.rotation.z = r.moving && !r.air ? Math.sin(t * 14) * 0.07 : 0;
      }
      r.root.visible = !(r.inv && meHunter && r.team === 'hider');
      const op = r.inv ? 0.3 : 1;
      if (op !== r.op) {
        setOpacity(r.root, op);
        r.op = op;
      }
      if (r.label) r.label.visible = r.team === 'hunter' || this.me.team === r.team;
    }
  }

  updateCamera() {
    const me = this.me;
    const cam = this.camera;
    const { h } = bodySize(me.prop);
    const eye = me.prop ? Math.max(0.6, h * 0.85) : 1.35;
    const target = me.pos.clone();
    target.y += eye;
    const cp = Math.cos(me.pitch);
    const f = new THREE.Vector3(-Math.sin(me.yaw) * cp, Math.sin(me.pitch), -Math.cos(me.yaw) * cp);
    if (this.firstPerson) {
      cam.position.copy(target);
    } else {
      const right = new THREE.Vector3(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
      const pivot = target.clone().addScaledVector(right, 0.55);
      let dist = 4.2 + (me.prop ? Math.min(2, h * 0.6) : 0);
      this.raycaster.set(pivot, f.clone().negate());
      this.raycaster.far = dist;
      const hit = this.raycaster.intersectObject(this.world.wallGroup, true)[0];
      if (hit) dist = Math.max(0.4, hit.distance - 0.25);
      cam.position.copy(pivot).addScaledVector(f, -dist);
      cam.position.y = Math.max(0.25, cam.position.y);
    }
    cam.lookAt(cam.position.clone().add(f));
  }

  // ---------- เอฟเฟกต์ ----------
  addEffect(obj, life, update) {
    this.scene.add(obj);
    this.effects.push({ obj, life, max: life, update });
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      e.update?.(e, dt);
      if (e.life <= 0) {
        this.scene.remove(e.obj);
        this.effects.splice(i, 1);
      }
    }
  }

  tracer(a, b, color) {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true }),
    );
    m.scale.y = len;
    m.position.copy(a).lerp(b, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    this.addEffect(m, 0.15, (e) => { m.material.opacity = e.life / e.max; });
  }

  puff(pos, color, n) {
    const matl = new THREE.MeshBasicMaterial({ color, transparent: true });
    const geo = new THREE.SphereGeometry(0.12, 6, 5);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, matl);
      m.position.set(pos.x, pos.y + 0.6, pos.z);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(4);
      this.addEffect(m, 0.6, (e, dt) => {
        m.position.addScaledVector(v, dt);
        v.multiplyScalar(0.92);
        m.scale.setScalar(0.4 + (e.life / e.max) * 1.4);
        matl.opacity = e.life / e.max;
      });
    }
  }

  confetti(pos) {
    const colors = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93, 0xff70a6];
    const geo = new THREE.BoxGeometry(0.1, 0.1, 0.02);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length] }));
      m.position.set(pos.x, pos.y + 1, pos.z);
      const v = new THREE.Vector3((Math.random() - 0.5) * 6, 4 + Math.random() * 4, (Math.random() - 0.5) * 6);
      const spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0);
      this.addEffect(m, 1.6, (e, dt) => {
        v.y -= 12 * dt;
        m.position.addScaledVector(v, dt);
        m.rotation.x += spin.x * dt;
        m.rotation.y += spin.y * dt;
      });
    }
  }

  floatEmoji(pos, text, y = 2) {
    const s = makeEmoji(text);
    s.position.set(pos.x, pos.y + y, pos.z);
    this.addEffect(s, 1.6, (e, dt) => {
      s.position.y += dt * 0.8;
      s.material.opacity = Math.min(1, e.life / 0.5);
    });
  }

  floatText(pos, text) {
    const s = makeLabel(text, '#ff6b6b', 0.4);
    s.position.copy(pos);
    this.addEffect(s, 1, (e, dt) => {
      s.position.y += dt;
      s.material.opacity = e.life / e.max;
    });
  }
}
