const KEYMAP = {
  Space: 'jump', KeyE: 'action', KeyQ: 'invis', KeyF: 'decoy',
  ShiftLeft: 'speed', ShiftRight: 'speed', KeyT: 'taunt', KeyR: 'lock',
  KeyV: 'camera', KeyZ: 'revert',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.look = { dx: 0, dy: 0 };
    this.joy = { x: 0, y: 0 };
    this.actions = [];
    this.enabled = false;
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.keys.add(e.code);
      const a = KEYMAP[e.code];
      if (this.enabled && a && !e.repeat) this.actions.push(a);
      if (this.enabled && (e.code === 'Space' || e.code === 'Tab')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.touch) return;
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
        return;
      }
      if (e.button === 0) this.actions.push('action');
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
      }
    });

    this.setupTouch();
  }

  setupTouch() {
    const zone = document.getElementById('joyZone');
    const base = document.getElementById('joyBase');
    const knob = document.getElementById('joyKnob');
    let joyId = null;
    let ox = 0;
    let oy = 0;
    const R = 55;

    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joyId = t.identifier;
      ox = t.clientX;
      oy = t.clientY;
      base.style.left = `${ox}px`;
      base.style.top = `${oy}px`;
      base.classList.add('on');
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        let dx = t.clientX - ox;
        let dy = t.clientY - oy;
        const len = Math.hypot(dx, dy);
        if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.joy.x = dx / R;
        this.joy.y = -dy / R;
      }
    }, { passive: false });
    const endJoy = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        joyId = null;
        this.joy.x = this.joy.y = 0;
        knob.style.transform = '';
        base.classList.remove('on');
      }
    };
    zone.addEventListener('touchend', endJoy);
    zone.addEventListener('touchcancel', endJoy);

    // ลากนิ้วบนจอ (นอกจอยสติ๊ก) = หมุนกล้อง
    const looks = new Map();
    this.canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) looks.set(t.identifier, [t.clientX, t.clientY]);
    }, { passive: true });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const p = looks.get(t.identifier);
        if (!p) continue;
        this.look.dx += (t.clientX - p[0]) * 1.8;
        this.look.dy += (t.clientY - p[1]) * 1.8;
        looks.set(t.identifier, [t.clientX, t.clientY]);
      }
    }, { passive: false });
    const endLook = (e) => { for (const t of e.changedTouches) looks.delete(t.identifier); };
    this.canvas.addEventListener('touchend', endLook);
    this.canvas.addEventListener('touchcancel', endLook);
  }

  push(action) {
    if (this.enabled) this.actions.push(action);
  }

  move() {
    let x = this.joy.x;
    let z = this.joy.y;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) z += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) z -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return { x, z };
  }

  consumeLook() {
    const l = { dx: this.look.dx, dy: this.look.dy };
    this.look.dx = this.look.dy = 0;
    return l;
  }

  consumeActions() {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  reset() {
    this.keys.clear();
    this.actions = [];
    this.look.dx = this.look.dy = 0;
  }
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
}
