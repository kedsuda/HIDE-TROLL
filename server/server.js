import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;

// ---- กติกาเกม (ปรับได้) ----
const HIDE_TIME = Number(process.env.HIDE_TIME) || 30;  // วินาทีให้ฝ่ายซ่อนหาที่ซ่อน
const HUNT_TIME = Number(process.env.HUNT_TIME) || 300; // วินาทีให้ฝ่ายล่าค้นหา (5 นาที)
const END_TIME = Number(process.env.END_TIME) || 10;    // วินาทีแสดงผลก่อนกลับล็อบบี้
const TICK_MS = 66;     // ~15 ครั้ง/วินาที
const MAP_IDS = ['haunted', 'market', 'school', 'hospital', 'warehouse', 'park'];
const SKILLS = {
  invis: { cd: 30, dur: 6, hiderOnly: true },
  decoy: { cd: 20, dur: 25, hiderOnly: true },
  speed: { cd: 18, dur: 4, hiderOnly: false },
  taunt: { cd: 6, dur: 0, hiderOnly: true },
};
const PROP_KEY = /^[a-z]{2,16}:\d{1,3}$/;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const app = express();
app.use(express.static(path.join(ROOT, 'public')));
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules/three/build')));
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
const cleanSkin = (s) => ({ color: clean(s?.color, 16) || 'mint', hat: clean(s?.hat, 16) || 'none' });
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
    this.hadHunters = false;
    this.interval = setInterval(() => this.update(), TICK_MS);
  }

  get ch() { return `room:${this.code}`; }
  emit(ev, data) { io.to(this.ch).emit(ev, data); }
  sys(text) { this.emit('chat', { sys: true, text }); }
  inMatch() { return this.phase === 'hiding' || this.phase === 'hunting'; }

  add(socket, name, skin) {
    const p = {
      id: socket.id, name, skin,
      team: this.phase === 'lobby' ? 'lobby' : 'hunter',
      origTeam: 'hunter', alive: true, prop: null, state: null,
      cds: {}, invisUntil: 0, hp: 100, stunUntil: 0,
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
        id: p.id, name: p.name, skin: p.skin, team: p.team, alive: p.alive,
      })),
    };
  }
  broadcastRoom() { this.emit('room', this.publicRoom()); }

  phaseInfo() {
    return {
      phase: this.phase,
      remaining: Math.max(0, this.phaseEndsAt - Date.now()),
      mapId: this.mapId, seed: this.seed,
      decoys: [...this.decoys.values()],
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
      p.origTeam = p.team;
    });
    this.hadHunters = hunters > 0;
    this.mapId = MAP_IDS.includes(this.mapChoice) ? this.mapChoice : pick(MAP_IDS);
    this.seed = Math.floor(Math.random() * 1e9);
    this.decoys.clear();
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
      rewards.push({
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
    t.team = 'hunter';
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
    if (!sk || !this.inMatch()) return cb({ ok: false });
    if (sk.hiderOnly && (p.team !== 'hider' || !p.alive)) return cb({ ok: false, msg: 'สกิลนี้ใช้ได้เฉพาะฝ่ายซ่อน' });
    if (p.team === 'hunter' && this.phase === 'hiding') return cb({ ok: false, msg: 'รอให้ถึงช่วงล่าก่อน' });
    if (now < (p.cds[type] || 0)) return cb({ ok: false, wait: p.cds[type] - now });
    if (type === 'decoy' && !p.state) return cb({ ok: false });
    p.cds[type] = now + sk.cd * 1000;

    if (type === 'invis') {
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

  socket.on('state', (s) => { const p = me(); if (p) socket.data.room.onState(p, s); });
  socket.on('disguise', (k) => { const p = me(); if (p) socket.data.room.onDisguise(p, k); });
  socket.on('shoot', (d) => { const p = me(); if (p) socket.data.room.onShoot(p, d); });
  socket.on('skill', (t, cb) => { const p = me(); if (p) socket.data.room.onSkill(p, t, ack(cb)); });

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
