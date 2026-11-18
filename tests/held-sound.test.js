import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../src/score.js';
import { defaultSetup } from '../src/settings.js';

function rig() {
  const resume = Promise.withResolvers(), notes = [];
  const context = { currentTime: 0, state: 'running', async suspend() {}, async close() {} };
  const pattern = { compress() { return this; }, withValue() { return this; } };
  const api = {
    getAudioContext: () => context, initAudio() {}, resetGlobalEffects() {},
    initStrudel: () => ({ setPattern() {}, start() {}, pause() {}, stop() {} }),
    pure: () => pattern, stack: () => pattern,
  };
  const instrument = {
    play(patch, index, pressure, duration, body) { notes.push({ index, body, note: patch.note, pressure, duration, sounding: true }); },
    pressure(value, body) { notes.filter(n => n.sounding && n.body === body).forEach(n => { n.pressure = value; }); },
    release(_immediate, body) { notes.filter(n => body === undefined || n.body === body).forEach(n => { n.sounding = false; }); },
  };
  const audio = createAudio({ load: async () => api, createInstrument: () => instrument,
    resumeContext: () => ({ ready: resume.promise, cancel() {} }),
    createModulation: () => ({ update() {}, dispose() {} }),
  });
  const settings = defaultSetup().audio;
  audio.configure(settings);
  return { audio, notes, resume, settings, context };
}

test('releasing or replacing a press while Strudel unlocks cannot sound an old note', async () => {
  const { audio, notes, resume } = rig();
  try {
    const first = audio.press(.4);
    audio.release();
    const second = audio.press(.7);
    audio.pressure(1.1);
    resume.resolve(true);
    await Promise.all([first, second]);
    assert.deepEqual(notes.map(n => n.pressure), [1.1, 1.1]);
    assert.ok(notes.every(n => n.duration === undefined));
    audio.release(true);
    assert.ok(notes.every(n => !n.sounding));
  } finally { audio.dispose(); }
});

test('one pair of reeds can sustain across minutes, bend, release and mute without retriggering', async () => {
  const { audio, notes, resume, settings, context } = rig();
  try {
    resume.resolve(true);
    await audio.press(.6);
    context.currentTime = 600;
    audio.update(.016, true);
    audio.pressure(.95);
    assert.equal(notes.length, 2);
    assert.ok(notes.every(n => n.sounding && n.pressure === .95));
    audio.release();
    await audio.press(.55);
    assert.deepEqual(notes.map(n => n.sounding), [false, false, true, true]);
    audio.configure({ ...settings, enabled: false });
    assert.ok(notes.every(n => !n.sounding));
    await audio.press(.7);
    assert.equal(notes.length, 4);
  } finally { audio.dispose(); }
});

test('three fingers hold one chord, with independent bends and note-offs on shared layers', async () => {
  const { audio, notes, resume, settings } = rig();
  try {
    const pending = [0, 1, 2].map(body => audio.press(.89, body));
    resume.resolve(true);
    await Promise.all(pending);
    assert.deepEqual(notes.map(n => n.note), [50, 50, 53, 53, 57, 57]);
    audio.pressure(1.1, 2);
    assert.deepEqual(notes.map(n => n.pressure), [.89, .89, .89, .89, 1.1, 1.1]);
    audio.release(false, 1);
    assert.deepEqual(notes.filter(n => n.sounding).map(n => n.body), [0, 0, 2, 2]);
    audio.configure({ ...settings, chord: 'major', instrument: 'bottle' });
    await audio.press(.8, 1);
    assert.deepEqual(notes.slice(-2).map(n => n.note), [52, 52]);
    audio.update(0, false);
    assert.ok(notes.every(n => !n.sounding));
  } finally { audio.dispose(); }
});
