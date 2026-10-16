import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { io } = require('../node_modules/socket.io/client-dist/socket.io.js');
const delay = ms => new Promise(r => setTimeout(r, ms));
const once = (s, ev) => new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error(`Timeout ${ev}`)), 7000); s.once(ev, d => { clearTimeout(timeout); resolve(d); }); });
const request = (s, ev, d) => new Promise((resolve, reject) => s.timeout(3000).emit(ev, d, (err, res) => err ? reject(err) : resolve(res)));

test('multiplayer traps, ghost choice, progression, horror and room voice isolation', { timeout: 20000 }, async () => {
  const server = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: '3198', HIDE_TIME: '1', HUNT_TIME: '12' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const clients = [];
  try {
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); });
    for (let i = 0; i < 4; i++) {
      const s = io('http://localhost:3198', { transports: ['websocket'], forceNew: true });
      clients.push(s); await once(s, 'connect'); s.on('room', r => { s.room = r; });
    }
    const [a,b,c,outsider] = clients;
    const created = await request(a, 'createRoom', { name: 'A' });
    await request(b, 'joinRoom', { code: created.code, name: 'B' });
    await request(c, 'joinRoom', { code: created.code, name: 'C' });
    await request(outsider, 'createRoom', { name: 'Outside' });
    a.emit('settings', { mapChoice: 'asylum' });
    const phase = once(a, 'phase'); a.emit('start'); assert.equal((await phase).mapId, 'asylum');
    const hunter = clients.find(s => a.room.players.find(p => p.id === s.id)?.team === 'hunter');
    const hiders = clients.filter(s => a.room.players.find(p => p.id === s.id)?.team === 'hider');
    assert.equal(hiders.length, 2);
    const [h1,h2] = hiders;
    h1.emit('state', { p: [0,0,0] }); h2.emit('state', { p: [10,0,0] }); hunter.emit('state', { p: [8,0,0] });
    await delay(100);
    assert.equal((await request(hunter, 'skill', 'banana')).ok, false);
    const added = once(a, 'trapAdd'); assert.equal((await request(h1, 'skill', 'banana')).ok, true); assert.equal((await added).type, 'banana');
    assert.equal((await request(h1, 'skill', 'banana')).ok, false);
    await delay(1100);
    const hit = once(hunter, 'trapHit'); hunter.emit('state', { p: [0,0,0] }); assert.equal((await hit).victim, hunter.id);
    await delay(2300);
    const caught = once(h1, 'caught'); hunter.emit('shoot', { target: h1.id }); await caught;
    assert.equal((await request(hunter, 'afterCaught', 'ghost')).ok, false);
    assert.equal((await request(h1, 'afterCaught', 'ghost')).ok, true);
    assert.equal((await request(h1, 'afterCaught', 'hunter')).ok, false);
    assert.equal((await request(h1, 'skill', 'speed')).ok, false);
    for (const s of clients) s.emit('voiceReady', true);
    await delay(100);
    const peers = await request(a, 'voicePeers', null); assert(!peers.includes(outsider.id)); assert.equal(peers.length, 2);
    let leaked = false; outsider.on('voiceSignal', () => { leaked = true; });
    a.emit('voiceSignal', { to: outsider.id, description: { type: 'offer', sdp: 'test' } });
    const signal = once(b, 'voiceSignal'); a.emit('voiceSignal', { to: b.id, description: { type: 'offer', sdp: 'test' } }); assert.equal((await signal).from, a.id);
    await delay(400); assert.equal(leaked, false);
    const end = once(a, 'roundEnd'); hunter.emit('shoot', { target: h2.id }); const result = await end;
    assert.equal(result.winner, 'hunter'); assert(result.rewards.find(r => r.id === hunter.id).xp > 0);
    assert(result.rewards.find(r => r.id === h1.id).hidden > 0);
  } finally { clients.forEach(s => s.disconnect()); server.kill(); }
});
