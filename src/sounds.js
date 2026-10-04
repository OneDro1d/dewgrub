// The sounds, made here: each one is a short list of oscillator notes.
// f = frequency in Hz, at = start in seconds, dur = length in seconds, gain = peak volume (0..1).

export const SOUNDS = {
  start: [
    { f: 330, at: 0, dur: 0.07, type: 'square', gain: 0.1 },
    { f: 494, at: 0.07, dur: 0.07, type: 'square', gain: 0.1 },
    { f: 659, at: 0.14, dur: 0.12, type: 'square', gain: 0.1 },
  ],
  turn: [{ f: 196, at: 0, dur: 0.03, type: 'triangle', gain: 0.08 }],
  eat: [
    { f: 784, at: 0, dur: 0.05, type: 'sine', gain: 0.2 },
    { f: 1175, at: 0.05, dur: 0.09, type: 'sine', gain: 0.2 },
  ],
  'spore-appear': [
    { f: 1319, at: 0, dur: 0.06, type: 'triangle', gain: 0.14 },
    { f: 1568, at: 0.08, dur: 0.06, type: 'triangle', gain: 0.14 },
  ],
  spore: [
    { f: 523, at: 0, dur: 0.06, type: 'square', gain: 0.1 },
    { f: 659, at: 0.06, dur: 0.06, type: 'square', gain: 0.1 },
    { f: 784, at: 0.12, dur: 0.06, type: 'square', gain: 0.1 },
    { f: 1047, at: 0.18, dur: 0.16, type: 'square', gain: 0.1 },
  ],
  'spore-gone': [{ f: 220, at: 0, dur: 0.12, type: 'sine', gain: 0.12 }],
  over: [
    { f: 392, at: 0, dur: 0.14, type: 'sawtooth', gain: 0.12 },
    { f: 311, at: 0.14, dur: 0.14, type: 'sawtooth', gain: 0.12 },
    { f: 233, at: 0.28, dur: 0.14, type: 'sawtooth', gain: 0.12 },
    { f: 147, at: 0.42, dur: 0.3, type: 'sawtooth', gain: 0.12 },
  ],
};

export function soundLength(notes) {
  return Math.max(...notes.map((n) => n.at + n.dur));
}
