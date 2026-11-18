import { reedFrequency } from './spore-reed.js';
import { meshNote } from './synth-settings.js';
import { modulateVoice } from './synth.js';

// Native Strudel bus modulators feed AudioParams on the sounding synth and
// effect nodes. These are control signals only; Strudel creates all the audio.
const targets = {
  lowpass: ['cutoff', 1], resonance: ['resonance', .001], highpass: ['hcutoff', 1],
  fm: ['fmi', .001], harmonicity: ['fmh', .001], drive: ['distort', .001],
  delay: ['delay', .001], reverb: ['room', .001], pan: ['pan', .5], gain: ['gain', .001],
};
// FM scales with pitch. Only those two bus signals need a separate lane per note.
const pitched = key => key === 'fm' || key === 'harmonicity';
const busId = (voice, index, body) => 100 + voice * 48 + body * 12 + index;

export function liveSynthValue(value, voice, body) {
  const result = { ...value }, ids = Object.keys(targets);
  result.bmod = { __ids: ids };
  ids.forEach((key, i) => {
    const [control, baseline] = targets[key];
    result[control] = baseline;
    // The engine scales bus input by depthabs / .3. Use unity gain.
    result.bmod[key] = { bus: busId(voice, i, pitched(key) ? body : 0), control, depthabs: .3 };
  });
  return result;
}

export function createLiveModulation(api, context) {
  const sources = [0, 1].map(voice => Object.fromEntries(Object.keys(targets).map((key, i) =>
    [key, (pitched(key) ? [0, 1, 2] : [0]).map(body => {
      const source = context.createConstantSource();
      source.offset.value = 0;
      source.connect(api.getSuperdoughAudioController().getBus(busId(voice, i, body)));
      source.start();
      return source;
    })])));
  let values = [], updates = 0;
  return {
    update(audio, positions, floor) {
      values = audio.voices.map(voice => modulateVoice(voice, positions, floor).parameters);
      values.forEach((p, voice) => {
        // FM gain is multiplied by its initial modulator frequency in Strudel.
        const offsets = { lowpass: p.lowpass - 1, resonance: p.resonance - .001, highpass: p.highpass - 1,
          fm: p.fm * p.harmonicity / .001 - .001, harmonicity: p.harmonicity - .001,
          drive: p.drive - .001, delay: p.delay - .001, reverb: p.reverb - .001, pan: 2 * p.pan - 1,
          gain: (audio.enabled && p.enabled ? audio.volume * p.level * .65 : 0) - .001 };
        for (const [key, value] of Object.entries(offsets)) {
          // Smooth frame-rate steps after the height mapping is clamped.
          sources[voice][key].forEach((source, body) => {
            const scale = key === 'harmonicity' ? reedFrequency(meshNote(audio, body, voice)) : 1;
            source.offset.setTargetAtTime(value * scale, context.currentTime, .015);
          });
        }
      });
      updates++;
    },
    get diagnostics() { return { updates, values: values.map(p => Object.fromEntries(Object.keys(targets).filter(k => k !== 'gain').map(k => [k, p[k]]))) }; },
    dispose() { for (const voice of sources) for (const source of Object.values(voice).flat()) { source.stop(); source.disconnect(); } },
  };
}
