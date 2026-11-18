import { instruments, meshNote } from './synth-settings.js';

export const reedFrequency = note => 440 * 2 ** ((note - 69) / 12);

const attackCurve = Float32Array.from({ length: 65 }, (_, i) => .5 - .5 * Math.cos(Math.PI * i / 64));

export function createSporeReed(api, context) {
  const voices = new Set();
  let settings;
  // The asymmetric transfer curve supplies the even harmonics of a loose membrane.
  const membraneCurve = Float32Array.from({ length: 1025 }, (_, i) => {
    const x = i / 512 - 1;
    return Math.tanh(4.6 * x + .62) - Math.tanh(.62);
  });
  const airBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const samples = airBuffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

  api.registerSound('spore_reed', (time, value, onended) => {
    const layer = value.reedLayer, body = value.reedBody;
    const hz = reedFrequency(value.note);
    const nodes = [];
    function track(node) { nodes.push(node); return node; }
    const gainNode = () => track(context.createGain());
    function bandpass() {
      const filter = track(context.createBiquadFilter());
      filter.type = 'bandpass';
      return filter;
    }
    const mix = gainNode(), envelope = gainNode(), releaseGate = gainNode();
    const dry = gainNode(), buzz = gainNode(), air = gainNode();
    const mouth = bandpass(), nose = bandpass(), airBand = bandpass();
    const membrane = track(context.createWaveShaper());
    membrane.curve = membraneCurve;
    const exciter = gainNode(), breathDepth = gainNode(), shakeDepth = gainNode();
    const lungs = track(context.createOscillator()), shake = track(context.createOscillator());
    const noise = track(context.createBufferSource());
    noise.buffer = airBuffer; noise.loop = true;
    noise.start(time, (layer * .39 + body * .21 + time) % airBuffer.duration);
    const reed = api.getOscillator(value.reedWave, time, {
      freq: hz, fmi: value.fmi, fmh: value.fmh,
    }, () => {
      voices.delete(voice);
      nodes.forEach(node => node.disconnect());
      onended();
    });
    const carrier = reed.nodes.source[0];
    reed.node.connect(dry).connect(mix);
    reed.node.connect(exciter).connect(membrane).connect(mouth).connect(buzz).connect(mix);
    membrane.connect(nose).connect(buzz);
    noise.connect(airBand).connect(air).connect(mix);
    // Breathing air hitting the membrane gives its buzz a frayed edge.
    air.connect(exciter);
    lungs.connect(breathDepth).connect(mix.gain);
    shake.connect(shakeDepth).connect(mouth.frequency);
    lungs.start(time); shake.start(time); mix.connect(envelope).connect(releaseGate);

    const gain = envelope.gain;
    const attack = Math.max(.032, value.attack);
    gain.value = 0;
    gain.setValueCurveAtTime(attackCurve, time, attack);
    gain.setTargetAtTime(value.sustain, time + attack, Math.max(.01, value.decay / 3));
    const pitch = carrier.detune;
    pitch.setValueAtTime(-instruments[settings.instrument].scoop, time);
    let silentAt = Infinity, force = value.reedPressure;
    function shape(at = context.currentTime, initial = false) {
      if (silentAt !== Infinity) return;
      at = Math.max(at, time);
      const p = settings, timbre = instruments[p.instrument];
      const squeeze = Math.max(0, Math.min(1, (force - .3) / .85));
      // Start the breath oscillators at their sub-audio rates and the air path
      // at its actual mix. Glide only changes made to an already sounding reed.
      const tune = (param, target) => initial ? param.setValueAtTime(target, at) : param.setTargetAtTime(target, at, .045);
      carrier.type = p.voices[layer].sound;
      tune(carrier.frequency, reedFrequency(meshNote(p, body, layer)));
      pitch.setTargetAtTime((squeeze - (.89 - .3) / .85) * 200 * p.bend, at, .065);
      tune(dry.gain, timbre.dry);
      tune(exciter.gain, .8 + 2.9 * p.buzz);
      tune(buzz.gain, timbre.reed * p.buzz * (layer ? .76 : 1.06));
      tune(air.gain, timbre.air * p.breath * (.30 + .78 * squeeze));
      tune(airBand.Q, .72); tune(airBand.frequency, 950 + 2400 * p.vowel);
      tune(mouth.Q, timbre.q); tune(nose.Q, timbre.q * .82);
      const opening = (.53 + .72 * p.vowel + .19 * squeeze) * (layer ? .86 : 1);
      tune(mouth.frequency, timbre.mouth * opening); tune(nose.frequency, timbre.nose * opening);
      tune(lungs.frequency, p.breathRate / 60); tune(mix.gain, .81);
      tune(breathDepth.gain, .47 * p.breath);
      tune(shake.frequency, 7.3 + squeeze * 4 + layer * .6);
      tune(shakeDepth.gain, timbre.mouth * .18 * p.flutter);
    }
    function release(immediate = false, at = context.currentTime) {
      const tail = immediate ? .020 : Math.max(.10, value.release);
      const end = at <= time ? at : at + tail;
      if (end >= silentAt || (!immediate && silentAt !== Infinity)) return;
      silentAt = end;
      // A separate gate can close during attack, decay or a previously
      // scheduled preview without cancelling the envelope under the note.
      const gate = releaseGate.gain;
      gate.cancelScheduledValues(at);
      if (at <= time) {
        gate.setValueAtTime(0, at);
      } else {
        gate.setTargetAtTime(0, at, tail * .28);
        gate.setTargetAtTime(0, at + tail * .65, tail * .04);
        gate.setValueAtTime(0, end);
        pitch.setTargetAtTime(-instruments[settings.instrument].scoop, at, tail * .45);
      }
      // Give the downstream filters a few render quanta to drain before
      // Strudel disconnects the note and its effect sends.
      const stop = end + .016;
      lungs.stop(stop); shake.stop(stop); noise.stop(stop); reed.stop(stop);
    }
    const voice = { held: value.reedHeld, body, shape, release,
      pressure(next) { force = next; shape(); }, get sounding() { return silentAt === Infinity; } };
    voices.add(voice);
    shape(time, true);
    if (!voice.held) release(false, time + value.duration);
    return { node: releaseGate, nodes: reed.nodes, stop: at => release(true, at) };
  }, { type: 'synth' });

  return {
    configure(next) { settings = next; for (const voice of voices) voice.shape(); },
    play(patch, layer, pressure, duration, body, offset = 0) {
      return api.superdough({ ...patch, s: 'spore_reed', reedBody: body,
        reedWave: patch.s, reedLayer: layer, reedHeld: duration === undefined, reedPressure: pressure },
      context.currentTime + .035 + offset, duration ?? 0);
    },
    pressure(force, body) { for (const v of voices) if (v.held && v.body === body) v.pressure(force); },
    release(immediate, body) {
      for (const v of voices) if (body === undefined || (v.held && v.body === body)) v.release(immediate);
    },
    get heldVoices() { return [...voices].filter(v => v.held && v.sounding).length; },
  };
}
