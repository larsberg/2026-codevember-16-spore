// The inherited Audio tab and setup file own the complete synth configuration.
export const instruments = {
  kazoo: { label: 'Breathing kazoo', air: .54, reed: 1, dry: .26, mouth: 940, nose: 2400, q: 3.8, scoop: 93 },
  bassoon: { label: 'Rubber bassoon', air: .17, reed: .68, dry: .55, mouth: 480, nose: 1350, q: 3.2, scoop: 560 },
  bottle: { label: 'Blown bottle', air: .92, reed: .08, dry: .68, mouth: 630, nose: 1860, q: 8, scoop: 42 },
  harmonium: { label: 'Moth harmonium', air: .12, reed: .84, dry: .39, mouth: 1520, nose: 3160, q: 1.35, scoop: 25 },
};
export const noteSets = {
  minor: { label: 'D minor · D3 F3 A3', notes: [50, 53, 57] },
  major: { label: 'C major · C3 E3 G3', notes: [48, 52, 55] },
  suspended: { label: 'Open fifths · C3 G3 D4', notes: [48, 55, 62] },
  seventh: { label: 'G7 shell · G2 B2 F3', notes: [43, 47, 53] },
  cluster: { label: 'Spore cluster · E3 F3 B♭3', notes: [52, 53, 58] },
  hollow: { label: 'A sus2 · A2 B2 E3', notes: [45, 47, 52] },
};
export const audioChoices = { instrument: instruments, chord: noteSets };
export const layerTuningCenters = [77, 43];
export function meshNote(audio, body, layer) {
  return noteSets[audio.chord].notes[body] + audio.voices[layer].note - layerTuningCenters[layer];
}
export const audioFields = {
  instrument: ['Instrument', 'kazoo'], chord: ['Notes · left / center / right', 'minor'],
  breath: ['Breath mix', .67, 0, 1, .01], buzz: ['Membrane buzz', .73, 0, 1, .01],
  vowel: ['Mouth opening', .53, 0, 1, .01], flutter: ['Breath flutter', .39, 0, 1, .01],
  breathRate: ['Breaths per minute', 16, 4, 60, 1], bend: ['Pressure bend (semitones)', 2, 0, 12, .1],
  enabled: ['Sound', true], volume: ['Volume', .3, 0, 1, .01], tempo: ['Delay tempo (BPM)', 120, 20, 200, 1],
};
export const waveforms = ['triangle', 'sine', 'sawtooth', 'square'];
export const VOICE_NAMES = ['A', 'B'];
export const voiceFields = {
  level: ['Level', .6, 0, 1, .01], gate: ['Preview gate', .7, .1, 1, .01],
  attack: ['Attack (s)', .006, .001, 1, .001], decay: ['Decay (s)', .15, .01, 2, .01],
  sustain: ['Sustain', .8, 0, 1, .01], release: ['Release (s)', .025, .01, 2, .01],
  lowpass: ['Low-pass cutoff (Hz)', 4800, 20, 16000, 10], resonance: ['Filter resonance', .7, .1, 12, .1],
  highpass: ['High-pass cutoff (Hz)', 20, 10, 2000, 10],
  fm: ['FM depth', .1, 0, 12, .05], harmonicity: ['FM ratio', 2, .25, 8, .05],
  drive: ['Drive', .04, 0, 3, .01], pan: ['Pan', .5, 0, 1, .01],
  reverb: ['Reverb send', .12, 0, 1, .01], roomSize: ['Room size', .6, .1, 4, .1],
  delay: ['Delay send', .06, 0, 1, .01], delayTime: ['Delay spacing (beats)', .75, .125, 2, .125],
  delayFeedback: ['Delay feedback', .25, 0, .75, .01],
};
// Editable output endpoints bound the height mapping, including inverted ranges.
export const modulationTargets = {
  lowpass: ['Low-pass cutoff', 'Hz', 120, 4800], resonance: ['Filter resonance', '', .4, 6],
  highpass: ['High-pass cutoff', 'Hz', 15, 180], fm: ['FM depth', '', .1, 5],
  harmonicity: ['FM ratio', '', .5, 4], drive: ['Drive', '', .02, 1.5],
  delay: ['Delay send', '', .02, .65], reverb: ['Reverb send', '', .03, .8],
  pan: ['Pan', '', .2, .8],
};
export function defaultVoices() {
  return [0, 1].map(index => ({
    ...Object.fromEntries(Object.entries(voiceFields).map(([key, [, initial]]) => [key, initial])),
    enabled: true, sound: index ? 'triangle' : 'sine', note: layerTuningCenters[index],
    rhythm: 'x',
    lowpass:index?7000:2600,fm:index?1:.18,attack:index?.006:.003,release:index?.14:.06,reverb:.02,delay:0,
    level: index ? .42 : .6, pan: index ? .65 : .35, gate: .88,
    modulations: Object.fromEntries(Object.entries(modulationTargets).map(([key, [,, min, max]], i) => [key, {
      enabled: false,
      corner: index ? 15 - i : i, heightMin: 0, heightMax: 4, min, max,
    }])),
  }));
}

export function validateVoices(value = defaultVoices()) {
  if (!Array.isArray(value) || value.length !== 2) throw Error('Use two synth voices.');
  return value.map((voice, i) => {
    const result = defaultVoices()[i], fail = key => { throw Error(`Invalid audio.voices.${i}.${key}.`); };
    if (!voice || typeof voice !== 'object') fail('voice');
    for (const [key, [,, min, max]] of Object.entries(voiceFields)) {
      const x = voice[key] ?? result[key];
      if (!Number.isFinite(x) || x < min || x > max) fail(key);
      result[key] = x;
    }
    result.enabled = voice.enabled ?? result.enabled; if (typeof result.enabled !== 'boolean') fail('enabled');
    result.sound = voice.sound ?? result.sound; if (!waveforms.includes(result.sound)) fail('sound');
    result.note = voice.note ?? result.note; if (!Number.isInteger(result.note) || result.note < 24 || result.note > 96) fail('note');
    result.rhythm = voice.rhythm ?? result.rhythm;
    if (typeof result.rhythm !== 'string' || !/^[xX.\-]{1,32}$/.test(result.rhythm)) fail('rhythm');
    result.rhythm = result.rhythm.toLowerCase().replaceAll('-', '.');
    for (const key of Object.keys(modulationTargets)) {
      const route = { ...result.modulations[key], ...voice.modulations?.[key] };
      if (typeof route.enabled !== 'boolean' || !Number.isInteger(route.corner) || route.corner < 0 || route.corner > 15
        || !['heightMin', 'heightMax', 'min', 'max'].every(field => Number.isFinite(route[field]))
        || route.heightMin === route.heightMax) fail(`modulations.${key}`);
      result.modulations[key] = route;
    }
    return result;
  });
}
