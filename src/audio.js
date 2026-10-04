// Plays the recipes of sounds.js through the Web Audio API. Browser only.
import { SOUNDS } from './sounds.js';

export function createAudio(win) {
  let ctx = null;
  let muted = false;
  const played = [];

  // Browsers only allow sound after a key press or a touch, so this is called from every input.
  function unlock() {
    if (!ctx) {
      const AC = win.AudioContext || win.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch (e) { ctx = null; return; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function play(name) {
    const notes = SOUNDS[name];
    if (!notes || muted || !ctx) return false;
    const t0 = ctx.currentTime + 0.01;
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = n.type;
      osc.frequency.value = n.f;
      amp.gain.setValueAtTime(0.0001, t0 + n.at);
      amp.gain.linearRampToValueAtTime(n.gain, t0 + n.at + 0.005);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start(t0 + n.at);
      osc.stop(t0 + n.at + n.dur + 0.02);
    }
    played.push({ name, notes: notes.length });
    if (played.length > 500) played.shift();
    return true;
  }

  return {
    unlock,
    play,
    setMuted(m) { muted = m; },
    isMuted() { return muted; },
    played() { return played.slice(); },
    contextState() { return ctx ? ctx.state : 'none'; },
  };
}
