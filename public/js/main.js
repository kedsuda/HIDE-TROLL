import { VoiceChat } from './voice.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { COLORS, HATS, CHARACTERS, loadCharacters, isCharLoaded } from './character.js';
import { hatThumb, charThumb } from './thumbs.js';
import { MAPS } from './maps.js';
import { sfx, unlockAudio } from './audio.js';
import { IS_APP, serverUrl, setServerUrl, GOOGLE_CLIENT_ID, GOOGLE_ORIGINS } from './config.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ---------- เซฟข้อมูลผู้เล่น (เหรียญ/สกิน) ในเครื่อง ----------
const DEFAULT_SAVE = { xp: 0, wins: 0, rounds: 0, coins: 2000, owned: [], skin: { char: 'blob', color: 'mint', hat: 'none' }, name: '' };
const save = (() => {
  try {
    return { ...DEFAULT_SAVE, ...JSON.parse(localStorage.getItem('ht_save') || '{}') };
  } catch {
    return { ...DEFAULT_SAVE };
  }
})();
save.skin = { ...DEFAULT_SAVE.skin, ...save.skin };
// เติมทุนเริ่มต้นให้เซฟเก่าครั้งเดียว และบันทึกทันทีเพื่อไม่เติมซ้ำหลังซื้อของ
if (save.startingCoinsAmount !== DEFAULT_SAVE.coins) {
  save.coins = Math.max(DEFAULT_SAVE.coins, Number(save.coins) || 0);
  save.startingCoinsGranted = true;
  save.startingCoinsAmount = DEFAULT_SAVE.coins;
  try { localStorage.setItem('ht_save', JSON.stringify(save)); } catch { /* ignore */ }
}
function persist() {
  try { localStorage.setItem('ht_save', JSON.stringify(save)); } catch { /* ignore */ }
  syncSave();
}

// ล็อกอิน Google แล้ว: ส่งข้อมูลขึ้นบัญชีบนเซิร์ฟเวอร์ด้วย (รวบหลายครั้งเป็นครั้งเดียว)
let gUser = null;
let syncTimer = 0;
function syncSave() {
  if (!gUser || !socket?.connected) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => socket.emit('saveData', save), 400);
}

// slot = ตำแหน่งบนมือถือ (main = ปุ่มใหญ่, s0-s3 = วงในรอบปุ่มใหญ่, u1-u3 = ปุ่มเล็กวงนอก)
// tone = สีปุ่ม, touch = แสดงเฉพาะมือถือ
const SKILL_UI = {
  hider: [
    { act: 'action', icon: '🪄', lbl: 'แปลงร่าง', key: 'E', slot: 'main', tone: 'magic' },
    { act: 'jump', icon: '⤒', lbl: 'กระโดด', key: 'Space', slot: 's0', tone: 'glass', touch: true },
    { act: 'invis', icon: '👻', lbl: 'ล่องหน', key: 'Q', slot: 's1', tone: 'violet' },
    { act: 'decoy', icon: '🎭', lbl: 'ตัวปลอม', key: 'F', slot: 's2', tone: 'amber' },
    { act: 'speed', icon: '⚡', lbl: 'วิ่งเร็ว', key: 'Shift', slot: 's3', tone: 'cyan' },
    { act: 'taunt', icon: '😜', lbl: 'ยั่วยุ', key: 'T', slot: 'u1', tone: 'pink' },
    { act: 'lock', icon: '🔒', lbl: 'ล็อกหมุน', key: 'R', slot: 'u2', tone: 'slate' },
    { act: 'revert', icon: '↩️', lbl: 'กลับร่าง', key: 'Z', slot: 'u3', tone: 'mint' },
  ],
  hunter: [
    { act: 'action', icon: '🎯', lbl: 'ยิง', key: 'คลิก', slot: 'main', tone: 'fire' },
    { act: 'jump', icon: '⤒', lbl: 'กระโดด', key: 'Space', slot: 's0', tone: 'glass', touch: true },
    { act: 'speed', icon: '⚡', lbl: 'วิ่งเร็ว', key: 'Shift', slot: 's1', tone: 'cyan' },
  ],
};

const input = new Input($('#c'));
if (input.touch) document.body.classList.add('is-touch');

let socket = null;
let voice = null;
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
loadCharacters().then(() => {
  game.setPreviewSkin(save.skin);
  game.refreshCharacters();
  if (!$('#shop').classList.contains('hidden')) renderShop();
});
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
  requestAnimationFrame(layoutPreview);
}

// จอแนวตั้ง: บอกกล้องว่าเหลือที่ว่างเหนือเมนูเท่าไร (ตัวละครจะไปยืนตรงนั้น)
function layoutPreview() {
  const shop = document.querySelector('#shop:not(.hidden) .panel');
  const panel = shop || document.querySelector('.screen:not(.hidden) > .panel');
  if (panel) game.setPreviewFrame(panel.getBoundingClientRect().top / window.innerHeight);
}
const panelObserver = new ResizeObserver(() => layoutPreview());
for (const el of document.querySelectorAll('.screen > .panel, #shop .panel')) panelObserver.observe(el);
window.addEventListener('resize', layoutPreview);

function updateCoins() {
  const level = 1 + Math.floor((save.xp || 0) / 200);
  $('#progressStats').textContent = `Lv.${level} • ${level >= 10 ? 'เงาไร้ร่องรอย' : level >= 5 ? 'นักซ่อนมือโปร' : 'นักซ่อนฝึกหัด'} • XP ${save.xp || 0} • ชนะ ${save.wins || 0}/${save.rounds || 0}`;
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
  if (id === 'shop') {
    renderShop();
    game.setPreviewShift(true);
    requestAnimationFrame(layoutPreview);
  }
}
function closeModal(el) {
  el.classList.add('hidden');
  if (el.id === 'shop') {
    game.setPreviewShift(false);
    requestAnimationFrame(layoutPreview);
  }
  if (inGame && phase !== 'ended' && allModalsClosed()) input.enabled = true;
}
for (const b of $$('[data-open]')) b.addEventListener('click', () => { sfx.click(); openModal(b.dataset.open); });
for (const b of $$('[data-close]')) b.addEventListener('click', () => closeModal(b.closest('.modal')));
for (const m of $$('.modal')) {
  m.addEventListener('click', (e) => { if (e.target === m && m.id !== 'end' && m.id !== 'caughtChoice') closeModal(m); });
}

// ---------- ทำงานแบบออฟไลน์บางส่วน (service worker) ----------
if (!IS_APP && 'serviceWorker' in navigator && window.isSecureContext) {
  // มีเวอร์ชันใหม่ขึ้นเซิร์ฟเวอร์ → โหลดหน้าใหม่ครั้งเดียวให้เห็นของใหม่ทันที (ยกเว้นกำลังเล่นอยู่)
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !room) location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
}

// ---------- ร้านสกิน ----------
function owns(kind, id, price) {
  return price === 0 || save.owned.includes(`${kind}:${id}`);
}
function renderShop() {
  updateCoins();
  const mk = (kind, list, box, countEl, visual) => {
    box.innerHTML = '';
    const entries = Object.entries(list);
    if (countEl) countEl.textContent = `ทั้งหมด ${entries.length} แบบ`;
    for (const [id, it] of entries) {
      const owned = owns(kind, id, it.price);
      const equipped = save.skin[kind] === id;
      const el = document.createElement('button');
      el.className = `shop-item${equipped ? ' equipped' : ''}${owned ? '' : ' locked'}`;
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      thumb.append(visual(id, it));
      const name = document.createElement('div');
      name.className = 'nm';
      name.textContent = it.name;
      const foot = document.createElement('div');
      foot.className = 'foot';
      if (equipped) foot.textContent = '✓ ใส่อยู่';
      else if (owned) foot.textContent = 'กดเพื่อใส่';
      else {
        const coin = document.createElement('span');
        coin.className = 'coin-ic';
        foot.append(coin, document.createTextNode(` ${it.price}`));
      }
      el.append(thumb, name, foot);
      if (equipped) {
        const check = document.createElement('span');
        check.className = 'check';
        check.textContent = '✓';
        el.append(check);
      }
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
        game.previewPop();
        if (room) socket.emit('setSkin', save.skin);
        renderShop();
        const what = kind === 'hat' ? (id === 'none' ? 'ถอดหมวกแล้ว' : `ใส่${it.name}แล้ว 🎩`)
          : kind === 'char' ? `เปลี่ยนเป็น${it.name}แล้ว` : `เปลี่ยนสีเป็น${it.name}แล้ว 🎨`;
        toast(owned ? what : `ซื้อ${it.name}แล้ว! ${what}`);
      });
      box.append(el);
    }
  };
  // รูปไอคอน: วาดจากโมเดล 3D จริง (ถ้าวาดไม่ได้ ใช้อีโมจิแทน)
  const img = (url, fallback) => {
    if (!url) {
      const d = document.createElement('div');
      d.className = 'ic';
      d.textContent = fallback;
      return d;
    }
    const im = document.createElement('img');
    im.src = url;
    im.alt = '';
    return im;
  };
  const safe = (fn) => { try { return fn(); } catch { return null; } };
  mk('effect', EFFECTS, $('#shopEffects'), null, (id, it) => img(null, it.icon));
  mk('char', CHARACTERS, $('#shopChars'), $('#cntChars'), (id, it) => img(
    (id === 'blob' || isCharLoaded(id)) ? safe(() => charThumb(id)) : null, it.icon,
  ));
  mk('color', COLORS, $('#shopColors'), $('#cntColors'), (id, it) => {
    const d = document.createElement('div');
    d.className = 'sw';
    d.style.background = `#${it.hex.toString(16).padStart(6, '0')}`;
    return d;
  });
  mk('hat', HATS, $('#shopHats'), $('#cntHats'), (id) => {
    if (id === 'none') {
      const d = document.createElement('div');
      d.className = 'none-ic';
      return d;
    }
    return img(safe(() => hatThumb(id)), '🎩');
  });
}

const EFFECTS = { none: { name: 'ไม่มีเอฟเฟกต์', price: 0, icon: '⚪' }, stars: { name: 'ประกายดาว', price: 150, icon: '✨' }, aura: { name: 'ออร่าสีม่วง', price: 150, icon: '🔮' }, frost: { name: 'เกล็ดน้ำแข็ง', price: 150, icon: '❄️' } };
$('#lootBox').onclick = () => {
  const pool = [['hat', HATS], ['color', COLORS], ['effect', EFFECTS]].flatMap(([kind, list]) => Object.entries(list).filter(([id, it]) => it.price > 0 && !owns(kind, id, it.price)).map(([id, it]) => ({ kind, id, name: it.name })));
  if (!pool.length) return toast('สะสมครบแล้ว! ไม่หักเหรียญ');
  if (save.coins < 100) return toast('ต้องมีอย่างน้อย 100 เหรียญ');
  const item = pool[Math.floor(Math.random() * pool.length)];
  save.coins -= 100; save.owned.push(`${item.kind}:${item.id}`); save.skin[item.kind] = item.id;
  persist(); renderShop(); game.setPreviewSkin(save.skin);
  if (room) socket.emit('setSkin', save.skin);
  $('#lootResult').textContent = `🎁 ได้ ${item.name} และใส่ให้แล้ว!`; sfx.win();
};
for (const b of $$('[data-trap]')) b.onclick = () => input.push(b.dataset.trap);
for (const [id, choice] of [['beGhost', 'ghost'], ['beHunter', 'hunter']]) $( '#' + id).onclick = () => {
  socket.emit('afterCaught', choice, res => { if (res?.ok) closeModal($('#caughtChoice')); else toast('รอบนี้จบแล้ว'); });
};

// ---------- เมนูหลัก ----------
$('#nameInput').value = save.name;
$('#nameInput').addEventListener('change', () => { save.name = $('#nameInput').value.trim(); persist(); });
// พิมพ์รหัสด้วยคีย์บอร์ดภาษาไทย (เกษมณี) ก็ได้: แปลงเป็นตัวอังกฤษบนปุ่มเดียวกัน
const THAI_KEYS = {
  'ๆ': 'Q', 'ไ': 'W', 'ำ': 'E', 'พ': 'R', 'ะ': 'T', 'ั': 'Y', 'ี': 'U', 'ร': 'I', 'น': 'O', 'ย': 'P',
  'ฟ': 'A', 'ห': 'S', 'ก': 'D', 'ด': 'F', 'เ': 'G', '้': 'H', '่': 'J', 'า': 'K', 'ส': 'L',
  'ผ': 'Z', 'ป': 'X', 'แ': 'C', 'อ': 'V', 'ิ': 'B', 'ื': 'N', 'ท': 'M',
  '/': '2', '-': '3', 'ภ': '4', 'ถ': '5', 'ุ': '6', 'ึ': '7', 'ค': '8', 'ต': '9',
};
function normalizeCode(s) {
  return [...String(s)].map((ch) => THAI_KEYS[ch] || ch).join('').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}
$('#codeInput').addEventListener('input', (e) => {
  const v = normalizeCode(e.target.value);
  if (v !== e.target.value) e.target.value = v;
});

const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) $('#codeInput').value = normalizeCode(urlRoom);

// ข้อความเตือนแสดงทั้งในเมนูและแบบลอยกลางจอ (จอมือถือแนวนอนอาจมองไม่เห็นด้านล่างเมนู)
function menuMsg(t) {
  $('#menuMsg').textContent = t;
  if (t) toast(t);
}

// ส่งคำขอพร้อมสถานะ "กำลัง…" และตัดจบถ้าเซิร์ฟเวอร์ไม่ตอบ
function request(btn, busyText, ev, data, onFail) {
  if (btn.disabled) return;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyText;
  if (!socket.connected) toast('กำลังปลุกเซิร์ฟเวอร์… อาจใช้เวลาสักครู่ ⏳');
  socket.timeout(45000).emit(ev, data, (err, res) => {
    btn.disabled = false;
    btn.textContent = label;
    if (err) menuMsg('เซิร์ฟเวอร์ไม่ตอบ ลองใหม่อีกครั้ง');
    else if (!res?.ok) menuMsg(res?.msg || onFail);
    else menuMsg('');
  });
}

$('#btnCreate').addEventListener('click', () => {
  unlockAudio();
  sfx.click();
  save.name = $('#nameInput').value.trim();
  persist();
  request($('#btnCreate'), '⏳ กำลังสร้าง…', 'createRoom',
    { name: myName(), skin: save.skin, maxPlayers: $('#maxSelect').value }, 'สร้างห้องไม่สำเร็จ');
});

function join() {
  unlockAudio();
  sfx.click();
  const code = normalizeCode($('#codeInput').value);
  $('#codeInput').value = code;
  if (code.length !== 4) { menuMsg('ใส่รหัสห้องให้ครบ 4 ตัวก่อนนะ'); return; }
  $('#codeInput').blur();
  save.name = $('#nameInput').value.trim();
  persist();
  request($('#btnJoin'), '⏳ กำลังเข้า…', 'joinRoom', { code, name: myName(), skin: save.skin }, 'เข้าห้องไม่สำเร็จ');
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
    let dot;
    if (p.pic) {
      dot = document.createElement('img');
      dot.className = 'avatar';
      dot.referrerPolicy = 'no-referrer';
      dot.src = p.pic;
      dot.alt = '';
    } else {
      dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = `#${(COLORS[p.skin.color] || COLORS.mint).hex.toString(16).padStart(6, '0')}`;
    }
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
  voice?.stop();
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
    if (s.touch && !input.touch) continue;
    const b = document.createElement('button');
    b.className = `skill tone-${s.tone}${s.slot === 'main' ? ' main' : ''}${s.slot[0] === 'u' ? ' mini' : ''}`;
    b.dataset.act = s.act;
    b.dataset.slot = s.slot;
    b.innerHTML = `<span class="ic">${s.icon}</span><span class="lbl">${s.lbl}</span><span class="key">${s.key}</span><span class="cd"></span>`;
    const fire = (e) => {
      e.preventDefault();
      input.push(s.act);
      b.classList.add('pressed');
      setTimeout(() => b.classList.remove('pressed'), 140);
      if (navigator.vibrate && input.touch) navigator.vibrate(8);
    };
    b.addEventListener('touchstart', fire, { passive: false });
    b.addEventListener('click', fire);
    box.append(b);
  }
  $('#crosshair').classList.toggle('hunter', team === 'hunter');
  $('#hpBar').classList.toggle('hidden', team !== 'hunter');
  const badge = $('#teamBadge');
  badge.className = `badge ${team}`;
  badge.textContent = team === 'ghost' ? '👻 ผี' : team === 'caught' ? '💀 ถูกจับ' : team === 'hunter' ? '🔦 ฝ่ายล่า' : '🫥 ฝ่ายซ่อน';
  $('#trapControls').classList.toggle('hidden', team !== 'hider');
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
  $('#trapControls').classList.add('hidden');
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
    for (const trap of info.traps || []) game.addTrap(trap);
    if (info.blackout > 0) game.blackout(info.blackout);
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
    b.textContent = `🪙 +${r.coins} • XP +${r.xp || 0} • ซ่อน ${r.hidden || 0}s`;
    li.append(a, b);
    list.append(li);
  }
  if (mine) {
    save.xp = (save.xp || 0) + (mine.xp || 0);
    if (mine.ranked) { save.rounds++; if (mine.won) save.wins++; }
    save.coins += mine.coins;
    persist();
    updateCoins();
  }
  if (document.pointerLockElement) document.exitPointerLock();
  $('#caughtChoice').classList.add('hidden');
  input.enabled = false;
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
    const left = cd ? cd.until - now : 0;
    const cooling = left > 0;
    b.classList.toggle('cooling', cooling);
    if (cooling) {
      b.style.setProperty('--cd', (left / cd.total).toFixed(3));
      b.querySelector('.cd').textContent = Math.ceil(left / 1000);
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

function netStatus(ok) {
  const host = new URL(serverUrl()).host;
  $('#netStatus').textContent = ok ? `🟢 ออนไลน์ • ${host}` : `🟡 กำลังเชื่อมต่อ… • ${host}`;
}
netStatus(false);
socket.on('connect', () => {
  netStatus(true);
  $('#menuMsg').textContent = '';
  // เซิร์ฟเวอร์ลืมการล็อกอินเมื่อหลุด → ล็อกอินซ้ำด้วย token เดิม (ถ้ายังไม่หมดอายุ)
  const cred = loadCred();
  if (cred) googleLogin(cred, true);
});

// ---------- ล็อกอิน Google ----------
const GOOGLE_OK = !IS_APP && GOOGLE_ORIGINS.includes(location.origin);

function tokenExp(token) {
  try {
    const part = token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
    return JSON.parse(atob(part)).exp || 0;
  } catch {
    return 0;
  }
}
function loadCred() {
  try {
    const c = JSON.parse(localStorage.getItem('ht_gcred') || 'null');
    if (c && c.exp > Date.now() / 1000 + 60) return c.token;
  } catch { /* ignore */ }
  return null;
}
function storeCred(token) {
  try {
    if (token) localStorage.setItem('ht_gcred', JSON.stringify({ token, exp: tokenExp(token) }));
    else localStorage.removeItem('ht_gcred');
  } catch { /* ignore */ }
}

function showGoogleUser() {
  $('#gSignedIn').classList.toggle('hidden', !gUser);
  $('#gSignedOut').classList.toggle('hidden', !!gUser);
  if (gUser) {
    $('#gName').textContent = gUser.name;
    $('#gPic').src = gUser.picture || 'icon.svg';
  }
}

// รวมข้อมูลในเครื่องกับในบัญชี: เหรียญเอาค่ามากกว่า ของที่ซื้อรวมกัน สกิน/ชื่อใช้ของบัญชี
function mergeSave(server) {
  if (server) {
    for (const key of ['xp', 'wins', 'rounds']) save[key] = Math.max(save[key] || 0, server[key] || 0);
    save.coins = Math.max(save.coins, server.coins || 0);
    save.owned = [...new Set([...save.owned, ...(server.owned || [])])];
    save.skin = { ...save.skin, ...(server.skin || {}) };
    if (server.name) save.name = server.name;
  }
  if (!save.name) save.name = gUser.name.slice(0, 14);
  $('#nameInput').value = save.name;
  persist();
  updateCoins();
  game.setPreviewSkin(save.skin);
}

function googleLogin(token, silent = false) {
  socket.emit('login', token, (res) => {
    if (!res?.ok) {
      storeCred(null);
      gUser = null;
      showGoogleUser();
      if (!silent) toast(res?.msg || 'ล็อกอินไม่สำเร็จ');
      return;
    }
    const first = !gUser;
    gUser = res.user;
    storeCred(token);
    showGoogleUser();
    if (first) mergeSave(res.save);
    else syncSave();
    if (!silent) toast(`สวัสดี ${gUser.name} 👋 ข้อมูลของคุณถูกเก็บในบัญชีแล้ว`);
  });
}

function initGoogle(tries = 0) {
  if (!GOOGLE_OK) return;
  const g = window.google?.accounts?.id;
  if (!g) {
    if (tries < 50) setTimeout(() => initGoogle(tries + 1), 200);
    return;
  }
  $('#googleBox').classList.remove('hidden');
  g.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (r) => { unlockAudio(); googleLogin(r.credential); },
    auto_select: true,
    cancel_on_tap_outside: true,
    use_fedcm_for_prompt: true,
  });
  g.renderButton($('#gBtn'), {
    theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', locale: 'th', width: 260,
  });
  showGoogleUser();
  if (!loadCred()) g.prompt();
}
initGoogle();

$('#btnLogout').addEventListener('click', () => {
  window.google?.accounts?.id.disableAutoSelect();
  socket.emit('logout');
  storeCred(null);
  gUser = null;
  showGoogleUser();
  toast('ออกจากระบบแล้ว (เหรียญ/สกินยังอยู่ในบัญชี)');
});
socket.on('connect_error', () => netStatus(false));
socket.io.on('reconnect_attempt', () => netStatus(false));
socket.on('disconnect', () => {
  voice?.stop();
  netStatus(false);
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
  voice?.roster(r.players);
  $('#roomRanks').replaceChildren(...[...r.players].sort((a,b) => (b.stats?.hidden || 0) - (a.stats?.hidden || 0)).map(p => {
    const li = document.createElement('li'); li.textContent = `${p.name} • ซ่อน ${p.stats?.hidden || 0}s • ชนะ ${p.stats?.wins || 0}`; return li;
  }));
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
  if (d.id === socket.id) openModal('caughtChoice');
  if (d.by === socket.id) toast(`จับ ${d.name} ได้! +20 🪙`);
});
socket.on('roundEnd', showEnd);
socket.on('trapAdd', d => game.addTrap(d));
socket.on('trapRemove', d => game.removeTrap(d));
socket.on('trapHit', d => game.trapHit(d));
socket.on('blackout', d => game.blackout(d.duration));
voice = new VoiceChat(socket, game, text => { $('#voiceStatus').textContent = text; });
$('#micToggle').onclick = async () => {
  if (!room) return toast('เข้าห้องก่อนเปิดไมค์');
  await voice.toggle();
};
$('#deafen').onclick = () => { voice.deaf = !voice.deaf; $('#deafen').textContent = voice.deaf ? 'เปิดเสียงทุกคน' : 'ปิดเสียงทุกคน'; };
$('#proximity').onchange = e => { voice.proximity = e.target.checked; };


updateCoins();
show('#menu');
