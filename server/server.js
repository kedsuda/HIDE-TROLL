import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { OAuth2Client } from 'google-auth-library';
import { getSave, putSave, sanitizeSave } from './store.js';
import { generateMap } from '../public/js/maps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;

// ---- กติกาเกม (ปรับได้) ----
const HIDE_TIME = Number(process.env.HIDE_TIME) || 30;  // วินาทีให้ฝ่ายซ่อนหาที่ซ่อน
const HUNT_TIME = Number(process.env.HUNT_TIME) || 300; // วินาทีให้ฝ่ายล่าค้นหา (5 นาที)
const END_TIME = Number(process.env.END_TIME) || 10;    // วินาทีแสดงผลก่อนกลับล็อบบี้
const TICK_MS = 66;     // ~15 ครั้ง/วินาที
const MAP_IDS = ['haunted', 'market', 'school', 'hospital', 'warehouse', 'park', 'abandoned', 'asylum', 'nightpark'];
const SKILLS = {
  banana: { cd: 15, dur: 30, hiderOnly: true },
  ice: { cd: 20, dur: 30, hiderOnly: true },
  smoke: { cd: 25, dur: 30, hiderOnly: true },
  invis: { cd: 30, dur: 6, hiderOnly: true },
  decoy: { cd: 20, dur: 25, hiderOnly: true },
  speed: { cd: 18, dur: 4, hiderOnly: false },
  taunt: { cd: 6, dur: 0, hiderOnly: true },
};
const PROP_KEY = /^[a-z]{2,16}:\d{1,3}$/;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Client ID ของ Google Sign-In (เปิดเผยได้ ไม่ใช่ความลับ)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  || '514825075787-gfdpn0ehi2e265pspdmnct8dmscufrkf.apps.googleusercontent.com';
const googleAuth = new OAuth2Client(GOOGLE_CLIENT_ID);

const app = express();
app.use(express.static(path.join(ROOT, 'public')));
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules/three/build')));
app.use('/vendor/three-addons', express.static(path.join(ROOT, 'node_modules/three/examples/jsm')));
app.use('/vendor/socket.io', express.static(path.join(ROOT, 'node_modules/socket.io/client-dist')));
app.get('/health', (_req, res) => res.send('ok'));


const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const rooms = new Map();

const num = (v, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
};
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const cleanSkin = (s) => ({
  char: clean(s?.char, 16) || 'blob', color: clean(s?.color, 16) || 'mint', hat: clean(s?.hat, 16) || 'none', effect: clean(s?.effect, 16) || 'none',
});
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function makeCode() {
  let c;
  do c = Array.from({ length: 4 }, () => pick(CODE_CHARS)).join('');
  while (rooms.has(c));
  return c;
}

class Room {
  constructor(code, maxPlayers) {
    this.code = code;
    this.maxPlayers = Math.min(10, Math.max(4, Number(maxPlayers) || 10));
    this.mapChoice = 'random';
    this.players = new Map();
    this.hostId = null;
    this.phase = 'lobby';
    this.phaseEndsAt = 0;
    this.mapId = 'haunted';
    this.seed = 1;
    this.decoys = new Map();
    this.decoySeq = 0;
    this.traps = new Map();
    this.trapSeq = 0;
    this.objectiveSeq = 0;
    this.objectives = new Map();
    this.blackoutUntil = 0;
    this.nextBlackout = Infinity;
    this.hadHunters = false;
    this.interval = setInterval(() => this.update(), TICK_MS);
  }

  get ch() { return `room:${this.code}`; }
  emit(ev, data) { io.to(this.ch).emit(ev, data); }
  sys(text) { this.emit('chat', { sys: true, text }); }
  inMatch() { return this.phase === 'hiding' || this.phase === 'hunting'; }

  add(socket, name, skin) {
    const p = {
      id: socket.id, name, skin, pic: socket.data.user?.picture || '',
      team: this.phase === 'lobby' ? 'lobby' : 'hunter',
      origTeam: 'hunter', alive: true, prop: null, state: null,
      cds: {}, invisUntil: 0, hp: 100, stunUntil: 0,
      stats: { xp: 0, wins: 0, rounds: 0, hidden: 0 }, caughtAt: 0, choiceMade: false,
      earned: 0, catches: 0, taunts: 0, lastShot: 0, lastChat: 0,
    };
    this.players.set(socket.id, p);
    if (!this.hostId) this.hostId = socket.id;
    socket.join(this.ch);
    socket.data.room = this;
    this.sys(`${name} เข้าห้องแล้ว`);
    this.broadcastRoom();
    if (this.phase !== 'lobby') socket.emit('phase', this.phaseInfo());
  }

  remove(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    for (const [did, d] of this.decoys) {
      if (d.owner === id) { this.decoys.delete(did); this.emit('decoyRemove', { id: did }); }
    }
    if (this.players.size === 0) { this.destroy(); return; }
    this.sys(`${p.name} ออกจากห้อง`);
    if (this.hostId === id) {
      this.hostId = this.players.keys().next().value;
      this.sys(`👑 ${this.players.get(this.hostId).name} เป็นหัวห้องคนใหม่`);
    }
    this.broadcastRoom();
    this.checkWin();
  }

  destroy() {
    clearInterval(this.interval);
    rooms.delete(this.code);
  }

  publicRoom() {
    return {
      code: this.code, hostId: this.hostId, maxPlayers: this.maxPlayers,
      mapChoice: this.mapChoice, phase: this.phase,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, skin: p.skin, team: p.team, alive: p.alive, pic: p.pic, stats: p.stats,
      })),
    };
  }
  broadcastRoom() { this.emit('room', this.publicRoom()); }

  phaseInfo() {
    return {
      phase: this.phase,
      remaining: Math.max(0, this.phaseEndsAt - Date.now()),
      mapId: this.mapId, seed: this.seed,
      decoys: [...this.decoys.values()], traps: [...this.traps.values()], blackout: Math.max(0, this.blackoutUntil - Date.now()),
      objectives: [...this.objectives.values()],
    };
  }

  setPhase(phase, secs) {
    this.phase = phase;
    this.phaseEndsAt = Date.now() + secs * 1000;
    this.broadcastRoom();
    this.emit('phase', this.phaseInfo());
  }

  start() {
    const ids = shuffle([...this.players.keys()]);
    const n = ids.length;
    // สุ่มผู้ล่า: 2-4 คน = 1, 5-7 คน = 2, 8-10 คน = 3 (เล่นคนเดียว = โหมดฝึกซ้อม)
    const hunters = n <= 1 ? 0 : n <= 4 ? 1 : n <= 7 ? 2 : 3;
    ids.forEach((id, i) => {
      const p = this.players.get(id);
      Object.assign(p, {
        team: i < hunters ? 'hunter' : 'hider', alive: true, prop: null, state: null,
        cds: {}, invisUntil: 0, hp: 100, stunUntil: 0, earned: 0, catches: 0, taunts: 0,
      });
      p.starsCollected = 0; p.chestOpened = false; p.objectiveComplete = false;
      p.origTeam = p.team; p.caughtAt = 0; p.choiceMade = false;
    });
    this.roundStarted = Date.now();
    this.traps.clear();
    this.blackoutUntil = 0;
    this.nextBlackout = Date.now() + 15000 + Math.random() * 20000;
    this.hadHunters = hunters > 0;
    this.mapId = MAP_IDS.includes(this.mapChoice) ? this.mapChoice : pick(MAP_IDS);
    this.seed = Math.floor(Math.random() * 1e9);
    this.decoys.clear();
    this.objectives.clear();
    this.objectiveSeq = 0;
    const map = generateMap(this.mapId, this.seed);
    const hiderSpawn = map.spawns.hider[0];
    const candidates = map.props.filter(o => Math.hypot(o.x - hiderSpawn[0], o.z - hiderSpawn[1]) > 8);
    shuffle(candidates);
    for (let i = 0; i < Math.min(12, candidates.length); i++) {
      const o = candidates[i];
      const id = ++this.objectiveSeq;
      const angle = Math.atan2(o.z - hiderSpawn[1], o.x - hiderSpawn[0]);
      const offset = i % 2 ? 2.1 : 2.7;
      const x = o.x + Math.cos(angle) * offset;
      const z = o.z + Math.sin(angle) * offset;
      const kind = i < Math.ceil(Math.min(12, candidates.length) / 2) ? 'star' : 'chest';
      this.objectives.set(id, { id, kind, x, y: 0.55, z });
    }
    this.setPhase('hiding', HIDE_TIME);
    this.sys(n === 1
      ? '🧪 โหมดฝึกซ้อม: ลองแปลงร่างและใช้สกิลได้เลย (ไม่ได้เหรียญ)'
      : `🎲 เริ่มเกม! สุ่มได้ฝ่ายล่า ${hunters} คน — ฝ่ายซ่อนมีเวลา ${HIDE_TIME} วินาที`);
  }

  update() {
    const now = Date.now();
    if (this.phase !== 'lobby' && now >= this.phaseEndsAt) {
      if (this.phase === 'hiding') {
        this.setPhase('hunting', HUNT_TIME);
        this.sys('🔦 ฝ่ายล่าออกตามหาแล้ว!');
      } else if (this.phase === 'hunting') {
        this.endRound('hider');
      } else if (this.phase === 'ended') {
        this.toLobby();
      }
    }
    if (this.inMatch()) {
      if (['abandoned', 'asylum', 'nightpark', 'haunted'].includes(this.mapId) && now >= this.nextBlackout) {
        this.blackoutUntil = now + 4000 + Math.random() * 3000;
        this.nextBlackout = this.blackoutUntil + 18000 + Math.random() * 22000;
        this.emit('blackout', { duration: this.blackoutUntil - now });
      }
      for (const [id, trap] of this.traps) {
        if (now >= trap.expires) { this.traps.delete(id); this.emit('trapRemove', { id }); continue; }
        if (this.phase !== 'hunting') continue;
        const victim = [...this.players.values()].find(p => p.team === 'hunter' && p.state && dist(p.state, trap) < 1.8);
        if (!victim) continue;
        this.traps.delete(id); this.emit('trapRemove', { id });
        if (trap.type === 'banana') victim.stunUntil = now + 2200;
        this.emit('trapHit', { ...trap, victim: victim.id, duration: trap.type === 'smoke' ? 6000 : 3000 });
      }
    }
    for (const [id, d] of this.decoys) {
      if (now >= d.expires) { this.decoys.delete(id); this.emit('decoyRemove', { id }); }
    }
    if (this.phase !== 'lobby') {
      const snap = {};
      for (const p of this.players.values()) {
        const s = p.state;
        if (!s) continue;
        snap[p.id] = [s.x, s.y, s.z, s.ry, s.pr, s.m, s.a, now < p.invisUntil ? 1 : 0, p.prop || 0];
      }
      this.emit('snap', snap);
    }
  }

  endRound(winner) {
    if (!this.inMatch()) return;
    const rewards = [];
    for (const p of this.players.values()) {
      let coins = 0;
      if (this.hadHunters) {
        coins = p.earned + 10;
        if (winner === 'hider' && p.origTeam === 'hider' && p.alive) coins += 50;
        if (winner === 'hunter' && p.origTeam === 'hunter') coins += 40;
      }
      const won = winner === p.origTeam && (p.origTeam !== 'hider' || p.alive);
      const xp = this.hadHunters ? 20 + p.catches * 15 + (won ? 50 : 0) : 0;
      const hidden = p.origTeam === 'hider' ? Math.floor(((p.caughtAt || Date.now()) - this.roundStarted) / 1000) : 0;
      if (this.hadHunters) { p.stats.xp += xp; p.stats.rounds++; p.stats.wins += won ? 1 : 0; p.stats.hidden += hidden; }
      rewards.push({ xp, won, ranked: this.hadHunters, hidden,

        id: p.id, name: p.name, coins, catches: p.catches, team: p.origTeam,
        survived: p.origTeam === 'hider' && p.alive,
      });
    }
    this.emit('roundEnd', { winner, rewards });
    this.sys(winner === 'hider' ? '🫥 ฝ่ายซ่อนชนะ!' : '🔦 ฝ่ายล่าชนะ!');
    this.setPhase('ended', END_TIME);
  }

  toLobby() {
    for (const p of this.players.values()) {
      Object.assign(p, { team: 'lobby', alive: true, prop: null, state: null, invisUntil: 0 });
    }
    this.decoys.clear();
    this.traps.clear();
    this.objectives.clear();
    this.phase = 'lobby';
    this.broadcastRoom();
    this.emit('phase', { phase: 'lobby', remaining: 0 });
  }

  checkWin() {
    if (!this.inMatch() || !this.hadHunters) return;
    const ps = [...this.players.values()];
    const hidersAlive = ps.filter((p) => p.team === 'hider' && p.alive).length;
    const hunters = ps.filter((p) => p.team === 'hunter').length;
    if (hidersAlive === 0) this.endRound('hunter');
    else if (hunters === 0) this.endRound('hider');
  }

  onState(p, s) {
    if (this.phase === 'lobby' || !s || !Array.isArray(s.p)) return;
    p.state = {
      x: num(s.p[0], -200, 200), y: num(s.p[1], -50, 50), z: num(s.p[2], -200, 200),
      ry: num(s.ry, -100, 100), pr: num(s.pr, -100, 100), m: s.m ? 1 : 0, a: s.a ? 1 : 0,
    };
    p.lastStateAt = Date.now();
  }

  collectObjective(p, id) {
    if (this.phase !== 'hunting' || p.team !== 'hider' || !p.alive || p.objectiveComplete || !p.state || Date.now() - (p.lastStateAt || 0) > 1000) return;
    const item = this.objectives.get(Number(id));
    if (!item || dist(p.state, item) > 2.2 || Number(id) !== item.id) return;
    if (item.kind === 'star') p.starsCollected = (p.starsCollected || 0) + 1;
    else p.chestOpened = true;
    this.objectives.delete(item.id);
    io.to(p.id).emit('objectiveProgress', { stars: p.starsCollected || 0, chest: !!p.chestOpened });
    this.emit('objectiveRemove', { id: item.id });
    if ((p.starsCollected || 0) >= 3 || p.chestOpened) {
      p.objectiveComplete = true;
      p.earned += 30;
      io.to(p.id).emit('objectiveProgress', { stars: p.starsCollected || 0, chest: !!p.chestOpened, complete: true, bonus: 30 });
      this.sys(`🌟 ${p.name} ทำภารกิจฝ่ายซ่อนสำเร็จ รับโบนัส 30 เหรียญ!`);
    }
  }

  onDisguise(p, key) {
    if (!this.inMatch() || p.team !== 'hider' || !p.alive) return;
    if (key !== null && (typeof key !== 'string' || !PROP_KEY.test(key))) return;
    p.prop = key;
    this.emit('fx', { type: 'poof', id: p.id });
  }

  onShoot(p, d) {
    const now = Date.now();
    if (this.phase !== 'hunting' || p.team !== 'hunter' || now < p.stunUntil || now - p.lastShot < 350) return;
    if (!d || typeof d !== 'object') return;
    p.lastShot = now;
    const vec = (a) => (Array.isArray(a) ? a.slice(0, 3).map((v) => num(v, -300, 300)) : [0, 0, 0]);
    this.emit('shot', { id: p.id, o: vec(d.o), h: vec(d.h) });

    if (typeof d.target === 'string') {
      const t = this.players.get(d.target);
      if (t && t.team === 'hider' && t.alive && t.state && p.state && dist(t.state, p.state) < 45) {
        this.catchPlayer(t, p);
        return;
      }
    }
    if (Number.isInteger(d.decoy) && this.decoys.has(d.decoy)) {
      const dc = this.decoys.get(d.decoy);
      this.decoys.delete(d.decoy);
      this.emit('decoyRemove', { id: d.decoy, trolled: true });
      const owner = this.players.get(dc.owner);
      if (owner) {
        owner.earned += 10;
        this.sys(`🎭 ${p.name} โดนตัวปลอมของ ${owner.name} หลอก!`);
      }
      return;
    }
    if (d.prop) {
      p.hp -= 5;
      if (p.hp <= 0) {
        p.hp = 100;
        p.stunUntil = now + 5000;
        this.sys(`😵 ${p.name} ยิงพลาดเยอะจนมึนหัว 5 วินาที!`);
      }
      io.to(p.id).emit('hp', { hp: p.hp, stun: Math.max(0, p.stunUntil - now) });
    }
  }

  catchPlayer(t, by) {
    t.alive = false;
    t.team = 'caught';
    t.caughtAt = Date.now();
    t.prop = null;
    t.invisUntil = 0;
    t.hp = 100;
    t.cds = {};
    by.catches += 1;
    by.earned += 20;
    this.emit('caught', { id: t.id, by: by.id, name: t.name, byName: by.name });
    this.broadcastRoom();
    this.checkWin();
  }

  onSkill(p, type, cb) {
    const sk = SKILLS[type];
    const now = Date.now();
    if (!sk || !this.inMatch() || !['hider', 'hunter'].includes(p.team)) return cb({ ok: false });
    if (sk.hiderOnly && (p.team !== 'hider' || !p.alive)) return cb({ ok: false, msg: 'สกิลนี้ใช้ได้เฉพาะฝ่ายซ่อน' });
    if (p.team === 'hunter' && this.phase === 'hiding') return cb({ ok: false, msg: 'รอให้ถึงช่วงล่าก่อน' });
    if (now < (p.cds[type] || 0)) return cb({ ok: false, wait: p.cds[type] - now });
    if (['decoy', 'banana', 'ice', 'smoke'].includes(type) && !p.state) return cb({ ok: false });
    p.cds[type] = now + sk.cd * 1000;

    if (['banana', 'ice', 'smoke'].includes(type)) {
      if (this.traps.size >= 30) { cb({ ok: false, msg: 'กับดักในห้องเต็มแล้ว' }); return; }
      const trap = { id: ++this.trapSeq, owner: p.id, type, x: p.state.x, y: p.state.y, z: p.state.z, expires: now + 30000 };
      this.traps.set(trap.id, trap); this.emit('trapAdd', trap);
    } else if (type === 'invis') {
      p.invisUntil = now + sk.dur * 1000;
      this.emit('fx', { type, id: p.id, dur: sk.dur });
    } else if (type === 'speed') {
      this.emit('fx', { type, id: p.id, dur: sk.dur });
    } else if (type === 'taunt') {
      if (this.phase === 'hunting' && p.taunts < 10) { p.taunts += 1; p.earned += 2; }
      this.emit('fx', { type, id: p.id, n: Math.floor(Math.random() * 6) });
    } else if (type === 'decoy') {
      for (const [did, d] of this.decoys) {
        if (d.owner === p.id) { this.decoys.delete(did); this.emit('decoyRemove', { id: did }); }
      }
      const s = p.state;
      const d = {
        id: ++this.decoySeq, owner: p.id, x: s.x, y: s.y, z: s.z,
        ry: p.prop ? s.pr : s.ry, prop: p.prop, skin: p.skin, expires: now + sk.dur * 1000,
      };
      this.decoys.set(d.id, d);
      this.emit('decoyAdd', d);
    }
    cb({ ok: true, cd: sk.cd });
  }
}

function leave(socket) {
  const r = socket.data.room;
  if (!r) return;
  socket.to(r.ch).emit('voiceReady', { id: socket.id, ready: false });
  socket.data.voiceReady = false;
  socket.leave(r.ch);
  socket.data.room = null;
  r.remove(socket.id);
}

io.on('connection', (socket) => {
  const me = () => socket.data.room?.players.get(socket.id);
  const ack = (cb) => (typeof cb === 'function' ? cb : () => {});

  socket.on('createRoom', (d, cb) => {
    cb = ack(cb);
    leave(socket);
    const room = new Room(makeCode(), d?.maxPlayers);
    rooms.set(room.code, room);
    room.add(socket, clean(d?.name, 14) || 'ผู้เล่น', cleanSkin(d?.skin));
    cb({ ok: true, code: room.code });
  });

  socket.on('joinRoom', (d, cb) => {
    cb = ack(cb);
    const room = rooms.get(clean(d?.code, 4).toUpperCase());
    if (!room) return cb({ ok: false, msg: 'ไม่พบห้องนี้ — เช็กรหัส และต้องเล่นเว็บ/แอปเดียวกับคนสร้างห้อง' });
    if (room.players.size >= room.maxPlayers) return cb({ ok: false, msg: 'ห้องเต็มแล้ว' });
    leave(socket);
    room.add(socket, clean(d?.name, 14) || 'ผู้เล่น', cleanSkin(d?.skin));
    cb({ ok: true, code: room.code });
  });

  socket.on('leaveRoom', () => leave(socket));

  // ---- ล็อกอิน Google: ตรวจ ID token กับ Google จริงก่อนเชื่อ ----
  socket.on('login', async (idToken, cb) => {
    cb = ack(cb);
    try {
      const ticket = await googleAuth.verifyIdToken({ idToken: String(idToken), audience: GOOGLE_CLIENT_ID });
      const t = ticket.getPayload();
      const picture = /^https:\/\/lh\d\.googleusercontent\.com\//.test(t.picture || '') ? t.picture : '';
      socket.data.user = { sub: t.sub, name: clean(t.name || t.given_name, 30), picture };
      cb({ ok: true, user: { name: socket.data.user.name, picture }, save: getSave(t.sub) });
    } catch {
      cb({ ok: false, msg: 'ล็อกอิน Google ไม่สำเร็จ ลองใหม่อีกครั้ง' });
    }
  });

  socket.on('logout', () => { socket.data.user = null; });

  socket.on('saveData', (d) => {
    const u = socket.data.user;
    const s = sanitizeSave(d);
    if (u && s) putSave(u.sub, s, u);
  });

  socket.on('settings', (d) => {
    const r = socket.data.room;
    if (!r || r.hostId !== socket.id || r.phase !== 'lobby' || !d) return;
    if (d.mapChoice === 'random' || MAP_IDS.includes(d.mapChoice)) r.mapChoice = d.mapChoice;
    if (d.maxPlayers) r.maxPlayers = Math.min(10, Math.max(4, r.players.size, Number(d.maxPlayers) || 10));
    r.broadcastRoom();
  });

  socket.on('start', (cb) => {
    cb = ack(cb);
    const r = socket.data.room;
    if (!r || r.hostId !== socket.id || r.phase !== 'lobby') return cb({ ok: false });
    r.start();
    cb({ ok: true });
  });

  socket.on('setSkin', (s) => {
    const p = me();
    if (!p) return;
    p.skin = cleanSkin(s);
    socket.data.room.broadcastRoom();
  });

  socket.on('afterCaught', (choice, cb) => {
    const p = me(), r = socket.data.room;
    if (!p || !r.inMatch() || p.team !== 'caught' || p.choiceMade || !['ghost', 'hunter'].includes(choice)) return ack(cb)({ ok: false });
    p.choiceMade = true; p.team = choice; r.broadcastRoom(); ack(cb)({ ok: true });
  });
  socket.on('voiceReady', (ready) => {
    socket.data.voiceReady = ready === true;
    if (socket.data.room) socket.to(socket.data.room.ch).emit('voiceReady', { id: socket.id, ready: ready === true });
  });
  socket.on('voiceSignal', (d) => {
    const r = socket.data.room;
    if (!r || !socket.data.voiceReady || !r.players.has(d?.to) || d.to === socket.id) return;
    const target = io.sockets.sockets.get(d.to);
    if (!target?.data.voiceReady) return;
    const signalWindow = Math.floor(Date.now() / 1000);
    if (socket.data.signalWindow !== signalWindow) { socket.data.signalWindow = signalWindow; socket.data.signalCount = 0; }
    if (++socket.data.signalCount > 100) return;
    if (!d.description && !d.candidate) return;
    if (JSON.stringify(d).length > 16000) return;
    socket.data.lastSignal = Date.now();
    target.emit('voiceSignal', { from: socket.id, description: d.description, candidate: d.candidate });
  });
  socket.on('voicePeers', (_, cb) => ack(cb)([...(socket.data.room?.players.keys() || [])].filter(id => id !== socket.id && io.sockets.sockets.get(id)?.data.voiceReady)));
  socket.on('state', (s) => { const p = me(); if (p) socket.data.room.onState(p, s); });
  socket.on('disguise', (k) => { const p = me(); if (p) socket.data.room.onDisguise(p, k); });
  socket.on('shoot', (d) => { const p = me(); if (p) socket.data.room.onShoot(p, d); });
  socket.on('skill', (t, cb) => { const p = me(); if (p) socket.data.room.onSkill(p, t, ack(cb)); });
  socket.on('collectObjective', (id) => { const p = me(); if (p) socket.data.room.collectObjective(p, id); });

  socket.on('chat', (text) => {
    const p = me();
    const now = Date.now();
    if (!p || now - p.lastChat < 400) return;
    const t = clean(text, 120);
    if (!t) return;
    p.lastChat = now;
    socket.data.room.emit('chat', { name: p.name, team: p.team, text: t });
  });

  socket.on('disconnect', () => leave(socket));
});

server.listen(PORT, () => {
  console.log(`HIDE & TROLL พร้อมเล่นที่ http://localhost:${PORT}`);
});
