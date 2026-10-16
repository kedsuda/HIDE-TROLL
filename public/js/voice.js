// Opt-in room voice. Only the lower socket ID creates offers, preventing glare.
export class VoiceChat {
  constructor(socket, game, status) {
    Object.assign(this, { socket, game, status, peers: new Map(), players: [], muted: new Set(), proximity: true, deaf: false, epoch: 0 });
    socket.on('voiceReady', ({ id, ready }) => {
      if (!ready) this.remove(id);
      else if (this.stream && socket.id < id) this.offer(id);
    });
    socket.on('voiceSignal', d => {
      this.signalQueue = (this.signalQueue || Promise.resolve()).then(() => this.signal(d)).catch(() => status('เชื่อมต่อเสียงไม่ได้ ลองปิดแล้วเปิดไมค์ใหม่'));
    });
    this.timer = setInterval(() => this.volumes(), 100);
  }
  async toggle() {
    if (this.busy) return;
    if (this.stream) {
      this.micMuted = !this.micMuted;
      this.stream.getAudioTracks().forEach(t => { t.enabled = !this.micMuted; });
      document.querySelector('#micToggle').textContent = this.micMuted ? 'เปิดไมค์' : 'ปิดไมค์';
      this.status(this.micMuted ? 'ปิดไมค์แล้ว • ยังได้ยินเพื่อน' : 'เปิดไมค์แล้ว');
      return;
    }
    const epoch = this.epoch;
    this.busy = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('ต้องใช้ HTTPS หรือ localhost เพื่อเปิดไมค์');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (epoch !== this.epoch) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream; this.micMuted = false;
      this.socket.emit('voiceReady', true);
      this.socket.emit('voicePeers', null, ids => {
        if (!this.stream) return;
        for (const id of ids) if (this.socket.id < id) this.offer(id);
      });
      document.querySelector('#micToggle').textContent = 'ปิดไมค์';
      this.status('เปิดไมค์แล้ว • เพื่อนต้องเปิดไมค์เพื่อเข้าร่วมเสียง');
    } catch (e) { this.status(e.name === 'NotAllowedError' ? 'ไม่ได้รับสิทธิ์ไมค์ เปิดสิทธิ์ในเบราว์เซอร์แล้วลองใหม่' : e.message); }
    finally { this.busy = false; }
  }
  peer(id) {
    if (this.peers.has(id)) return this.peers.get(id);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    const audio = document.createElement('audio'); audio.autoplay = true; audio.setAttribute('playsinline', '');
    document.body.append(audio);
    const p = { pc, audio, pending: [] }; this.peers.set(id, p);
    for (const track of this.stream.getTracks()) pc.addTrack(track, this.stream);
    pc.onicecandidate = e => { if (e.candidate) this.socket.emit('voiceSignal', { to: id, candidate: e.candidate.toJSON() }); };
    pc.ontrack = e => { audio.srcObject = e.streams[0]; audio.play().catch(() => this.status('แตะเปิดไมค์อีกครั้งหากเบราว์เซอร์บล็อกเสียง')); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') this.status('เชื่อมต่อเสียงไม่ได้ เครือข่ายนี้อาจต้องใช้ TURN'); };
    return p;
  }
  async offer(id) {
    if (!this.stream || this.peers.has(id)) return;
    try {
      const { pc } = this.peer(id);
      await pc.setLocalDescription(await pc.createOffer());
      this.socket.emit('voiceSignal', { to: id, description: pc.localDescription.toJSON() });
    } catch { this.remove(id); }
  }
  async signal(d) {
    if (!this.stream || !this.players.some(p => p.id === d.from)) return;
    const p = this.peer(d.from), pc = p.pc;
    if (d.description) {
      await pc.setRemoteDescription(d.description);
      for (const c of p.pending.splice(0)) await pc.addIceCandidate(c);
      if (d.description.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        this.socket.emit('voiceSignal', { to: d.from, description: pc.localDescription.toJSON() });
      }
    } else if (d.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(d.candidate);
      else p.pending.push(d.candidate);
    }
  }
  roster(players) {
    this.players = players;
    for (const id of this.peers.keys()) if (!players.some(p => p.id === id)) this.remove(id);
    const box = document.querySelector('#voicePeople'); box.replaceChildren();
    for (const p of players.filter(p => p.id !== this.socket.id)) {
      const b = document.createElement('button'); b.className = 'btn';
      const render = () => { b.textContent = `${this.muted.has(p.id) ? '🔇' : '🔊'} ${p.name}`; b.setAttribute('aria-pressed', String(this.muted.has(p.id))); };
      b.onclick = () => { if (this.muted.has(p.id)) this.muted.delete(p.id); else this.muted.add(p.id); render(); };
      render(); box.append(b);
    }
  }
  volumes() {
    for (const [id, p] of this.peers) {
      let volume = this.deaf || this.muted.has(id) ? 0 : 1;
      const me = this.game.me, remote = this.game.remotes.get(id);
      if (this.game.active) {
        // Ghosts cannot reveal hiding spots to living players through voice.
        const team = this.players.find(p => p.id === id)?.team;
        if (team === 'ghost' && me?.team !== 'ghost') volume = 0;
        if (this.proximity) volume *= me && remote ? Math.max(0, 1 - me.pos.distanceTo(remote.root.position) / 25) : 0;
      }
      p.audio.volume = volume;
    }
  }
  remove(id) {
    const p = this.peers.get(id); if (!p) return;
    p.pc.close(); p.audio.srcObject = null; p.audio.remove(); this.peers.delete(id);
  }
  stop() {
    this.epoch++;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    for (const id of this.peers.keys()) this.remove(id);
    if (this.socket.connected) this.socket.emit('voiceReady', false);
    document.querySelector('#micToggle').textContent = 'เปิดไมค์';
    this.status('ปิดไมค์แล้ว');
  }
}
