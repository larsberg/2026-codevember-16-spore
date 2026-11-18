import test from 'node:test';
import assert from 'node:assert/strict';
import { createSporeReed } from '../src/spore-reed.js';
import { defaultSetup } from '../src/settings.js';

function parameter() {
  const events = [];
  return { events,
    cancelScheduledValues(time) { this.events = this.events.filter(e => e.time < time); },
    setValueAtTime(value, time) { this.events.push({ value, time }); },
    setTargetAtTime(value, time) { this.events.push({ value, time }); },
    setValueCurveAtTime(curve, time, duration) { this.events.push({ curve, time, duration }); },
  };
}

test('a scheduled note-off preserves the attack and sustain and fades before the sources stop', () => {
  const gains = [], oscillators = [];
  const node = () => ({ connect(destination) { return destination; }, disconnect() {}, start() {},
    stop(time) { this.stopTime = time; } });
  const context = {
    sampleRate: 48000, currentTime: 0,
    createBuffer: () => ({ duration: 2, getChannelData: () => new Float32Array(1) }),
    createBufferSource: node, createWaveShaper: node,
    createGain() { const gain = { ...node(), gain: parameter() }; gains.push(gain); return gain; },
    createBiquadFilter: () => ({ ...node(), frequency: parameter(), Q: parameter() }),
    createOscillator() {
      const osc = { ...node(), frequency: parameter(), detune: parameter() };
      oscillators.push(osc); return osc;
    },
  };
  let trigger;
  const reed = createSporeReed({
    registerSound(_name, fn) { trigger = fn; },
    getOscillator() {
      const source = context.createOscillator();
      return { node: source, nodes: { source: [source] }, stop: time => source.stop(time) };
    },
  }, context);
  const audio = defaultSetup().audio;
  reed.configure(audio);
  for (const duration of [.008, .6]) {
    gains.length = oscillators.length = 0;
    const start = 1, off = start + duration, patch = audio.voices[0];
    const handle = trigger(start, { ...patch, note: 50, reedLayer: 0, reedBody: 0, reedWave: patch.sound,
      reedPressure: .89, reedHeld: false, duration }, () => {});
    const attack = gains.find(n => n.gain.events.some(e => e.curve));
    assert.ok(attack.gain.events.some(e => e.curve?.[0] === 0 && e.curve.at(-1) === 1));
    assert.ok(attack.gain.events.some(e => e.value === patch.sustain));
    assert.notEqual(attack, handle.node);
    const fade = handle.node.gain.events;
    assert.equal(fade[0].time, off);
    assert.equal(fade.at(-1).value, 0);
    assert.ok(fade.at(-1).time > off);
    assert.ok(oscillators.every(osc => osc.stopTime > fade.at(-1).time));
  }
});
