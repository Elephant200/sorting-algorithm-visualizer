// "Sound of Sorting"-style audio: short pitched blips whose frequency tracks
// the value being touched, with a distinct voice per op type. The AudioContext
// is created lazily on the first blip so it always starts inside a user
// gesture (play/step/toggle are all click- or key-driven).

const VOICES = {
  compare: { type: 'sine', dur: 0.055, gain: 0.9 },
  swap: { type: 'triangle', dur: 0.07, gain: 1.1 },
  write: { type: 'triangle', dur: 0.06, gain: 0.85 },
  shuffle: { type: 'sawtooth', dur: 0.05, gain: 0.35 },
};

const MIN_FREQ = 140;
const MAX_FREQ = 1320;
const MAX_ACTIVE_VOICES = 12; // hard polyphony cap so fast playback never piles up

export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = false;
  let activeVoices = 0;

  function ensureContext() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.16;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  // t in [0,1] -> frequency. Squaring t spreads the low values out so small
  // arrays don't cluster at the top of the scale.
  function frequencyFor(t) {
    const clamped = Math.max(0, Math.min(1, t));
    return MIN_FREQ + (MAX_FREQ - MIN_FREQ) * clamped * clamped;
  }

  function playTone(freq, { type, dur, gain }, when = 0, force = false) {
    // The polyphony cap counts scheduled-but-unfinished voices, which would
    // wrongly reject notes scheduled into the future (the finish arpeggio).
    if (!force && activeVoices >= MAX_ACTIVE_VOICES) return;
    const now = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.5 * gain, now + 0.006);
    env.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(env).connect(master);
    activeVoices++;
    osc.addEventListener('ended', () => {
      activeVoices--;
      osc.disconnect();
      env.disconnect();
    });
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  // One blip for a playback op. `t` is the touched value normalized to [0,1].
  function blip(t, voice = 'compare') {
    if (!enabled || !ensureContext()) return;
    playTone(frequencyFor(t), VOICES[voice] ?? VOICES.compare);
  }

  // Quick ascending arpeggio when a sort finishes.
  function finish() {
    if (!enabled || !ensureContext()) return;
    const notes = 18;
    for (let k = 0; k < notes; k++) {
      playTone(frequencyFor(k / (notes - 1)), { type: 'sine', dur: 0.09, gain: 0.7 }, k * 0.024, true);
    }
  }

  function setEnabled(on) {
    enabled = on;
    if (on) ensureContext();
  }

  return {
    blip,
    finish,
    setEnabled,
    get enabled() {
      return enabled;
    },
  };
}
