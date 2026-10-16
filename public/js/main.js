import { Game } from './game.js';
import { Input } from './input.js';
import { COLORS, HATS } from './character.js';
import { MAPS } from './maps.js';
import { sfx, unlockAudio } from './audio.js';
import { IS_APP, DEFAULT_SERVER, serverUrl, setServerUrl } from './config.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ---------- เซฟข้อมูลผู้เล่น (เหรียญ/สกิน) ในเครื่อง ----------
const DEFAULT_SAVE = { coins: 0, owned: [], skin: { color: 'mint', hat: 'none' }, name: '' };
const save = (() => {
  try {
    return { ...DEFAULT_SAVE, ...JSON.parse(localStorage.getItem('ht_save') || '{}') };
  } catch {
    return { ...DEFAULT_SAVE };
  }
})();
function persist() {
  try { localStorage.setItem('ht_save', JSON.stringify(save)); } catch { /* ignore */ }
}

const SKILL_UI = {
  hider: [
    { act: 'action', icon: '🪄', lbl: 'แปลงร่าง', key: 'E', main: true },
    { act: 'invis', icon: '👻', lbl: 'ล่องหน', key: 'Q' },
    { act: 'decoy', icon: '🎭', lbl: 'ตัวปลอม', key: 'F' },
    { act: 'speed', icon: '⚡', lbl: 'วิ่งเร็ว', key: 'Shift' },
    { act: 'taunt', icon: '😜', lbl: 'ยั่วยุ', key: 'T' },
    { act: 'lock', icon: '🔒', lbl: 'ล็อกหมุน', key: 'R' },
    { act: 'revert', icon: '↩️', lbl: 'กลับร่าง', key: 'Z' },
  ],
  hunter: [
    { act: 'action', icon: '🎯', lbl: 'ยิง', key: 'คลิก', main: true },
    { act: 'speed', icon: '⚡', lbl: 'วิ่งเร็ว', key: 'Shift' },
  ],
};

const input = new Input($('#c'));
if (input.touch) document.body.classList.add('is-touch');

let socket = null;
let room = null;
let inGame = false;
let phase = 'lobby';
let phaseEnd = 0;
let myTeam = null;
let cooldowns = {};
let lastTick = -1;

const game = new Game($('#c'), input, {
  state: (s) => socket.volatile.emit('state', s),
  shoot: (d) => socket.emit('shoot', d),
  disguise: (k) => socket.emit('disguise', k),
  skill: (type) => {
    const cd = cooldowns[type];
    if (cd && cd.until > performance.now()) return;
    socket.emit('skill', type, (res) => {
      if (res?.ok) {
        cooldowns[type] = { until: performance.now() + res.cd * 1000, total: res.cd * 1000 };
      } else if (res?.msg) {
        toast(res.msg);
      }
    });
  },
  hint: (h) => { $('#hint').textContent = h; },
  toast: (t) => toast(t),
});
game.setPreviewSkin(save.skin);
if (new URLSearchParams(location.search).has('debug')) window.HT = { game, input };

// ---------- UI ทั่วไป ----------
let toastTimer = 0;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function feed(text) {
  const el = document.createElement('div');
  el.textContent = text;
  $('#feed').prepend(el);
  setTimeout(() => el.remove(), 5000);
  while ($('#feed').children.length > 5) $('#feed').lastChild.remove();
}

function show(id) {
  for (const s of ['#menu', '#lobby', '#hud']) $(s).classList.toggle('hidden', s !== id);
  $('#chat').classList.toggle('hidden', id === '#menu');
  $('#chat').classList.toggle('in-game', id === '#hud');
}

function updateCoins() {
  for (const el of $$('.coin-val')) el.textContent = save.coins;
}

function myName() {
  const n = $('#nameInput').value.trim();
  return n || `ผู้เล่น${Math.floor(Math.random() * 900 + 100)}`;
}

function openModal(id) {
  $(`#${id}`).classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  input.enabled = false;
  if (id === 'shop') renderShop();
  if (id === 'getapp') setupGetApp();
}
function closeModal(el) {
  el.classList.add('hidden');
  if (inGame && $('#pause').classList.contains('hidden')) input.enabled = true;
}
for (const b of $$('[data-open]')) b.addEventListener('click', () => { sfx.click(); openModal(b.dataset.open); });
for (const b of $$('[data-close]')) b.addEventListener('click', () => closeModal(b.closest('.modal')));
for (const m of $$('.modal')) {
  m.addEventListener('click', (e) => { if (e.target === m && m.id !== 'end') closeModal(m); });
}

// ---------- ดาวน์โหลดลงโทรศัพท์ ----------
let installPrompt = null;
if (!IS_APP && 'serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('#pwaOption').classList.remove('hidden');
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  $('#pwaOption').classList.add('hidden');
  toast('ติดตั้งแล้ว! เปิดเกมได้จากไอคอนบนหน้าจอ 🎉');
});
$('#btnInstallPwa').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
  $('#pwaOption').classList.add('hidden');
});
if (IS_APP) $('#btnGetApp').classList.add('hidden');

let qrLib = null;
function loadQr() {
  if (!qrLib) {
    qrLib = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/qrcode/qrcode.js';
      s.onload = () => resolve(window.qrcode);
      s.onerror = reject;
      document.head.append(s);
    });
  }
  return qrLib;
}

// ที่อยู่ที่มือถือเปิดได้: ถ้าเปิดจาก localhost ให้ใช้ IP ในวง Wi-Fi แทน
async function phoneUrl() {
  if (!/^(localhost|127.|[::1])/.test(location.hostname)) return location.origin;
  try {
    const info = await (await fetch('api/info')).json();
    return info.lan[0] || location.origin;
  } catch {
    return location.origin;
  }
}

async function setupGetApp() {
  const url = await phoneUrl();
  const note = $('#apkServerNote');
  const secure = url.startsWith('https://');
  note.classList.toggle('hidden', url === DEFAULT_SERVER);
  note.textContent = secure
    ? `หลังติดตั้ง: ถ้าแอปต่อเซิร์ฟเวอร์ไม่ได้ ให้ใส่ ${url} ในช่อง "🌐 เซิร์ฟเวอร์เกม" ที่หน้าเมนูของแอป`
    : 'แอปเชื่อมต่อได้เฉพาะเซิร์ฟเวอร์ https (เช่นบน Render) — ถ้าทดสอบในวง Wi-Fi ให้เล่นผ่าน Chrome แทน';
  if (input.touch) return;
  $('#qrBox').classList.remove('hidden');
  $('#qrUrl').textContent = url;
  try {
    const qrcode = await loadQr();
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    $('#qr').innerHTML = qr.createImgTag(5, 0);
  } catch {
    $('#qr').textContent = '';
  }
}

// ---------- ร้านสกิน ----------
function owns(kind, id, price) {
  return price === 0 || save.owned.includes(`${kind}:${id}`);
}
function renderShop() {
  updateCoins();
  const mk = (kind, list, box, visual) => {
    box.innerHTML = '';
    for (const [id, it] of Object.entries(list)) {
      const owned = owns(kind, id, it.price);
      const equipped = save.skin[kind] === id;
      const el = document.createElement('button');
      el.className = `shop-item${equipped ? ' equipped' : ''}`;
      el.append(visual(id, it));
      const name = document.createElement('div');
      name.textContent = it.name;
      const price = document.createElement('div');
      price.className = 'price';
      price.textContent = equipped ? '✔ ใส่อยู่' : owned ? 'กดเพื่อใส่' : `🪙 ${it.price}`;
      el.append(name, price);
      el.addEventListener('click', () => {
        if (!owned) {
          if (save.coins < it.price) { toast('เหรียญไม่พอ ไปเล่นเก็บเพิ่มก่อนนะ!'); return; }
          save.coins -= it.price;
          save.owned.push(`${kind}:${id}`);
          sfx.win();
        } else {
          sfx.click();
        }
        save.skin[kind] = id;
        persist();
        game.setPreviewSkin(save.skin);
        if (room) socket.emit('setSkin', save.skin);
        renderShop();
      });
      box.append(el);
    }
  };
  mk('color', COLORS, $('#shopColors'), (id, it) => {
    const d = document.createElement('div');
    d.className = 'sw';
    d.style.background = `#${it.hex.toString(16).padStart(6, '0')}`;
    return d;
  });
  const HAT_ICON = { none: '🚫', party: '🥳', cap: '🧢', chef: '👨‍🍳', bunny: '🐰', horns: '😈', halo: '😇', crown: '👑' };
  mk('hat', HATS, $('#shopHats'), (id) => {
    const d = document.createElement('div');
    d.className = 'ic';
    d.textContent = HAT_ICON[id] || '🎩';
    return d;
  });
}

// ---------- เมนูหลัก ----------
$('#nameInput').value = save.name;
$('#nameInput').addEventListener('change', () => { save.name = $('#nameInput').value.trim(); persist(); });
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) $('#codeInput').value = urlRoom.toUpperCase().slice(0, 4);

function menuMsg(t) { $('#menuMsg').textContent = t; }

$('#btnCreate').addEventListener('click', () => {
  unlockAudio();
  sfx.click();
  save.name = $('#nameInput').value.trim();
  persist();
  socket.emit('createRoom', { name: myName(), skin: save.skin, maxPlayers: $('#maxSelect').value }, (res) => {
    if (!res?.ok) menuMsg(res?.msg || 'สร้างห้องไม่สำเร็จ');
  });
});

function join() {
  unlockAudio();
  sfx.click();
  const code = $('#codeInput').value.trim().toUpperCase();
  if (code.length !== 4) { menuMsg('ใส่รหัสห้อง 4 ตัวก่อนนะ'); return; }
  save.name = $('#nameInput').value.trim();
  persist();
  socket.emit('joinRoom', { code, name: myName(), skin: save.skin }, (res) => {
    if (!res?.ok) menuMsg(res?.msg || 'เข้าห้องไม่สำเร็จ');
  });
}
$('#btnJoin').addEventListener('click', join);
$('#codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });

// ---------- ล็อบบี้ ----------
function renderLobby() {
  if (!room) return;
  const isHost = room.hostId === socket.id;
  $('#roomCode').textContent = room.code;
  $('#playerCount').textContent = `(${room.players.length}/${room.maxPlayers})`;
  const list = $('#playerList');
  list.innerHTML = '';
  for (const p of room.players) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = `#${(COLORS[p.skin.color] || COLORS.mint).hex.toString(16).padStart(6, '0')}`;
    const name = document.createElement('span');
    name.textContent = `${p.id === room.hostId ? '👑 ' : ''}${p.name}`;
    li.append(dot, name);
    if (p.id === socket.id) {
      const me = document.createElement('span');
      me.className = 'me';
      me.textContent = '(คุณ)';
      li.append(me);
    }
    list.append(li);
  }
  $('#mapSelect').value = room.mapChoice;
  $('#maxSelect2').value = String(room.maxPlayers);
  $('#mapSelect').disabled = !isHost;
  $('#maxSelect2').disabled = !isHost;
  $('#btnStart').disabled = !isHost;
  $('#btnStart').textContent = room.players.length === 1 ? '🧪 เริ่มโหมดฝึกซ้อม' : '▶ เริ่มเกม';
  $('#lobbyHint').textContent = isHost
    ? (room.players.length === 1 ? 'ชวนเพื่อนด้วยรหัสห้องหรือลิงก์ — ต้องมี 2 คนขึ้นไปถึงจะมีฝ่ายล่า' : 'ระบบจะสุ่มฝ่ายล่าให้อัตโนมัติ')
    : 'รอหัวห้องกดเริ่มเกม…';
}

$('#mapSelect').addEventListener('change', () => socket.emit('settings', { mapChoice: $('#mapSelect').value }));
$('#maxSelect2').addEventListener('change', () => socket.emit('settings', { maxPlayers: $('#maxSelect2').value }));
$('#btnStart').addEventListener('click', () => { unlockAudio(); sfx.click(); socket.emit('start'); });
$('#btnLeave').addEventListener('click', leaveRoom);
$('#btnCopy').addEventListener('click', async () => {
  const url = `${serverUrl()}/?room=${room.code}`;
  try {
    if (navigator.share && input.touch) await navigator.share({ title: 'HIDE & TROLL', text: `มาเล่นซ่อนหากัน! รหัสห้อง ${room.code}`, url });
    else { await navigator.clipboard.writeText(url); toast('คัดลอกลิงก์แล้ว ส่งให้เพื่อนได้เลย!'); }
  } catch {
    toast(`รหัสห้อง: ${room.code}`);
  }
});

function leaveRoom() {
  socket.emit('leaveRoom');
  room = null;
  stopGame();
  $('#chatLog').innerHTML = '';
  show('#menu');
  history.replaceState(null, '', location.pathname);
}

// ---------- แชต ----------
function addChat(m) {
  const log = $('#chatLog');
  const line = document.createElement('div');
  if (m.sys) {
    line.className = 'sys';
    line.textContent = m.text;
  } else {
    const n = document.createElement('span');
    n.className = `n-${m.team}`;
    n.textContent = `${m.name}: `;
    line.append(n, document.createTextNode(m.text));
  }
  log.append(line);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}
$('#chatInput').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    const t = e.target.value.trim();
    if (t) socket.emit('chat', t);
    e.target.value = '';
    if (inGame) e.target.blur();
  } else if (e.key === 'Escape') {
    e.target.blur();
  }
});
$('#chatInput').addEventListener('focus', () => { if (inGame) input.enabled = false; });
$('#chatInput').addEventListener('blur', () => { if (inGame && allModalsClosed()) input.enabled = true; });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && room && document.activeElement !== $('#chatInput') && allModalsClosed()) {
    if (document.pointerLockElement) document.exitPointerLock();
    $('#chatInput').focus();
    e.preventDefault();
  }
});
function allModalsClosed() {
  return [...$$('.modal')].every((m) => m.classList.contains('hidden'));
}

// ---------- ในเกม ----------
function renderSkills(team) {
  const box = $('#skills');
  box.innerHTML = '';
  for (const s of SKILL_UI[team] || []) {
    const b = document.createElement('button');
    b.className = `skill${s.main ? ' main' : ''}`;
    b.dataset.act = s.act;
    b.innerHTML = `<span>${s.icon}</span><span class="lbl">${s.lbl}</span><span class="key">${s.key}</span>`;
    const fire = (e) => { e.preventDefault(); input.push(s.act); };
    b.addEventListener('touchstart', fire, { passive: false });
    b.addEventListener('click', fire);
    box.append(b);
  }
  $('#crosshair').classList.toggle('hunter', team === 'hunter');
  $('#hpBar').classList.toggle('hidden', team !== 'hunter');
  const badge = $('#teamBadge');
  badge.className = `badge ${team}`;
  badge.textContent = team === 'hunter' ? '🔦 ฝ่ายล่า' : '🫥 ฝ่ายซ่อน';
}

$('#touch').classList.toggle('hidden', !input.touch);
for (const b of $$('#touch [data-act]')) {
  b.addEventListener('touchstart', (e) => { e.preventDefault(); input.push(b.dataset.act); }, { passive: false });
}

function startGame(info) {
  const me = room.players.find((p) => p.id === socket.id);
  if (!me) return;
  myTeam = me.team;
  const teamIds = room.players.filter((p) => p.team === me.team).map((p) => p.id).sort();
  game.start({
    mapId: info.mapId, seed: info.seed, myId: socket.id, team: me.team, skin: me.skin,
    spawnIndex: Math.max(0, teamIds.indexOf(me.id)), roster: room.players, phase: info.phase, decoys: info.decoys,
  });
  inGame = true;
  cooldowns = {};
  input.enabled = true;
  renderSkills(me.team);
  updateHp(100);
  updateCounts();
  show('#hud');
  const m = MAPS[info.mapId];
  toast(`${m.emoji} ${m.name} — คุณคือ${me.team === 'hunter' ? 'ฝ่ายล่า 🔦' : 'ฝ่ายซ่อน 🫥'}`);
}

function stopGame() {
  inGame = false;
  myTeam = null;
  input.enabled = false;
  game.stop();
  for (const m of $$('.modal')) m.classList.add('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}

function updateHp(hp) {
  $('#hpFill').style.width = `${hp}%`;
  $('#hpText').textContent = `HP ${hp}`;
}

function updateCounts() {
  if (!room) return;
  const alive = room.players.filter((p) => p.team === 'hider' && p.alive).length;
  $('#hiderCount').textContent = `🫥 เหลือ ${alive}`;
}

function onPhase(info) {
  const prev = phase;
  phase = info.phase;
  phaseEnd = performance.now() + (info.remaining || 0);
  if (phase === 'hiding' || phase === 'hunting') {
    if (!inGame) startGame(info);
    game.setPhase(phase);
    if (prev === 'hiding' && phase === 'hunting') {
      sfx.go();
      toast(myTeam === 'hunter' ? '🔦 ออกล่าได้แล้ว!' : '🔦 ฝ่ายล่าออกตามหาแล้ว! อยู่นิ่งๆ');
    }
  } else if (phase === 'ended') {
    game.setPhase(phase);
  } else if (phase === 'lobby') {
    if (inGame) stopGame();
    if (room) show('#lobby');
    renderLobby();
  }
}

function showEnd(d) {
  const hiderWin = d.winner === 'hider';
  $('#endTitle').textContent = hiderWin ? '🫥 ฝ่ายซ่อนชนะ!' : '🔦 ฝ่ายล่าชนะ!';
  const mine = d.rewards.find((r) => r.id === socket.id);
  const iWon = mine && ((hiderWin && mine.team === 'hider') || (!hiderWin && mine.team === 'hunter'));
  $('#endSub').textContent = mine ? `คุณได้ 🪙 ${mine.coins} เหรียญ` : '';
  (iWon ? sfx.win : sfx.lose)();
  const list = $('#endList');
  list.innerHTML = '';
  for (const r of d.rewards) {
    const li = document.createElement('li');
    if (r.id === socket.id) li.className = 'me';
    const a = document.createElement('span');
    a.textContent = `${r.team === 'hunter' ? '🔦' : r.survived ? '🫥' : '💀'} ${r.name}${r.catches ? ` • จับได้ ${r.catches}` : ''}`;
    const b = document.createElement('span');
    b.textContent = `🪙 +${r.coins}`;
    li.append(a, b);
    list.append(li);
  }
  if (mine) {
    save.coins += mine.coins;
    persist();
    updateCoins();
  }
  if (document.pointerLockElement) document.exitPointerLock();
  $('#end').classList.remove('hidden');
}

// ---------- ปุ่มพักเกม ----------
$('#btnPause').addEventListener('click', () => openModal('pause'));
$('#btnResume').addEventListener('click', () => closeModal($('#pause')));
$('#btnCam').addEventListener('click', () => { game.firstPerson = !game.firstPerson; closeModal($('#pause')); });
$('#btnQuit').addEventListener('click', leaveRoom);

// ---------- ลูปอัปเดต HUD ----------
function uiLoop() {
  requestAnimationFrame(uiLoop);
  if (!inGame) return;
  const now = performance.now();
  const rem = Math.max(0, phaseEnd - now);
  const secs = Math.ceil(rem / 1000);
  $('#timer').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  $('#timer').classList.toggle('urgent', phase === 'hunting' && secs <= 30);
  $('#phaseLabel').textContent = phase === 'hiding' ? '⏳ เวลาซ่อนตัว' : phase === 'hunting' ? '🔎 เวลาล่า' : '🏁 จบรอบ';
  if ((phase === 'hiding' || (phase === 'hunting' && secs <= 10)) && secs <= 5 && secs !== lastTick && secs > 0) {
    lastTick = secs;
    sfx.tick();
  }

  const blind = myTeam === 'hunter' && phase === 'hiding';
  $('#blind').classList.toggle('hidden', !blind);
  if (blind) $('#blindTimer').textContent = secs;

  const lockedOut = !input.touch && !document.pointerLockElement && allModalsClosed()
    && document.activeElement !== $('#chatInput');
  $('#clickHint').classList.toggle('hidden', !lockedOut || blind);

  const me = game.me;
  for (const b of $$('#skills .skill')) {
    const act = b.dataset.act;
    const cd = cooldowns[act];
    let ov = b.querySelector('.cd');
    const left = cd ? cd.until - now : 0;
    if (left > 0) {
      if (!ov) { ov = document.createElement('span'); ov.className = 'cd'; b.append(ov); }
      ov.textContent = Math.ceil(left / 1000);
    } else if (ov) {
      ov.remove();
    }
    if (me) {
      const active = (act === 'invis' && now < me.invisUntil) || (act === 'speed' && now < me.speedUntil)
        || (act === 'lock' && me.lockRot);
      b.classList.toggle('active', !!active);
    }
  }
}
uiLoop();

// ---------- เชื่อมต่อเซิร์ฟเวอร์ ----------
socket = io(serverUrl(), { transports: ['websocket', 'polling'] });

if (IS_APP) {
  $('#serverBox').classList.remove('hidden');
  $('#serverInput').value = serverUrl();
  $('#serverInput').addEventListener('change', () => {
    setServerUrl($('#serverInput').value.trim());
    location.reload();
  });
}

socket.on('connect', () => menuMsg(''));
socket.on('connect_error', () => menuMsg('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กำลังลองใหม่…'));
socket.on('disconnect', () => {
  if (room) {
    toast('หลุดการเชื่อมต่อ 😢');
    room = null;
    stopGame();
    show('#menu');
  }
});

socket.on('room', (r) => {
  const first = !room;
  room = r;
  if (first) {
    $('#chatLog').innerHTML = '';
    history.replaceState(null, '', `?room=${r.code}`);
  }
  game.updateRoster(r.players);
  if (inGame) {
    const me = r.players.find((p) => p.id === socket.id);
    if (me && me.team !== myTeam) {
      myTeam = me.team;
      cooldowns = {};
      renderSkills(myTeam);
    }
    updateCounts();
  } else if (r.phase === 'lobby') {
    show('#lobby');
  }
  renderLobby();
});

socket.on('phase', onPhase);
socket.on('snap', (s) => game.applySnapshot(s));
socket.on('chat', addChat);
socket.on('shot', (d) => game.onShot(d));
socket.on('fx', (d) => game.onFx(d));
socket.on('decoyAdd', (d) => game.addDecoy(d));
socket.on('decoyRemove', (d) => game.removeDecoy(d));
socket.on('hp', (d) => {
  updateHp(d.hp);
  game.onHp(d);
});
socket.on('caught', (d) => {
  game.onCaught(d);
  feed(`🎯 ${d.byName} จับ ${d.name} ได้!`);
  if (d.id === socket.id) toast('โดนจับแล้ว! 😵 ตอนนี้คุณเป็นฝ่ายล่า ไปช่วยตามหาเลย');
  if (d.by === socket.id) toast(`จับ ${d.name} ได้! +20 🪙`);
});
socket.on('roundEnd', showEnd);

updateCoins();
show('#menu');
