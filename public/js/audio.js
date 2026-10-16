// เสียงสังเคราะห์ด้วย WebAudio (ไม่ต้องโหลดไฟล์เสียง)
let ctx = null;
let noiseBuf = null;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlockAudio() {
  try { ac(); } catch { /* ไม่มีเสียงก็เล่นได้ */ }
}

function tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
  const c = ac();
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(Math.max(0.0001, vol), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, vol, delay = 0) {
  const c = ac();
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  const g = c.createGain();
  s.buffer = noiseBuf;
  g.gain.setValueAtTime(Math.max(0.0001, vol), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(g).connect(c.destination);
  s.start(t);
  s.stop(t + dur + 0.05);
}

const TAUNTS = [
  () => { tone(500, 0.12, 'square', 0.12, 300); tone(400, 0.2, 'square', 0.12, -200, 0.13); },
  () => [700, 600, 700, 600].forEach((f, i) => tone(f, 0.1, 'triangle', 0.15, 0, i * 0.1)),
  () => tone(200, 0.5, 'sawtooth', 0.1, 400),
  () => { tone(900, 0.08, 'sine', 0.15); tone(1200, 0.08, 'sine', 0.15, 0, 0.1); tone(900, 0.15, 'sine', 0.15, 0, 0.2); },
  () => tone(350, 0.4, 'square', 0.1, -250),
  () => [400, 500, 650, 900].forEach((f, i) => tone(f, 0.09, 'square', 0.1, 0, i * 0.07)),
];

const safe = (fn) => (...a) => { try { fn(...a); } catch { /* ignore */ } };

export const sfx = {
  shoot: safe((v = 1) => { tone(900, 0.12, 'square', 0.07 * v, -650); noise(0.08, 0.08 * v); }),
  poof: safe((v = 1) => { noise(0.25, 0.12 * v); tone(300, 0.2, 'sine', 0.1 * v, 500); }),
  caught: safe(() => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.15, 'triangle', 0.15, 0, i * 0.08))),
  miss: safe(() => tone(220, 0.25, 'sawtooth', 0.08, -120)),
  skill: safe((v = 1) => tone(500, 0.18, 'sine', 0.14 * v, 700)),
  invis: safe((v = 1) => { tone(1200, 0.4, 'sine', 0.1 * v, -900); noise(0.3, 0.05 * v); }),
  taunt: safe((n) => TAUNTS[n % TAUNTS.length]()),
  troll: safe(() => { tone(300, 0.15, 'square', 0.12, 200); tone(250, 0.3, 'square', 0.12, -150, 0.15); }),
  tick: safe(() => tone(1000, 0.05, 'square', 0.05)),
  go: safe(() => { tone(440, 0.15, 'square', 0.12); tone(880, 0.3, 'square', 0.12, 0, 0.16); }),
  win: safe(() => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.2, 'triangle', 0.14, 0, i * 0.11))),
  lose: safe(() => [400, 350, 300, 220].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.08, 0, i * 0.18))),
  click: safe(() => tone(700, 0.05, 'sine', 0.08)),
};
