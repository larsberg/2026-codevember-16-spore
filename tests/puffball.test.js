import test from 'node:test';
import assert from 'node:assert/strict';
import { Raycaster, Vector3 } from 'three';
import { initPhysics } from '../src/physics.js';
import { createPuffball, ringIndex, sectors } from '../src/puffball.js';
import { createRind } from '../src/rind.js';
import { defaultSetup, validateSetup } from '../src/settings.js';

await initPhysics();
const step = (body, ticks) => { for (let i = 0; i < ticks; i++) body.step(1/60); };

test('a local squeeze depresses the rind, expels spores and rebounds to its resting cage', () => {
  const body = createPuffball(defaultSetup().physics);
  try {
    step(body, 90);
    assert.equal(body.takeEmission(), 0);
    const before = body.positions.slice();
    const nozzle = body.nozzle.clone();
    const index = ringIndex(6, 3);
    const hit = new Vector3().fromArray(before,index*3);
    const direction = new Vector3(-.08,-.46,-1).normalize();
    body.press(hit,direction,.9); step(body, 36);
    const dent = new Vector3().fromArray(body.positions,index*3).sub(hit).dot(direction);
    assert.ok(dent > .15 && dent < .65);
    assert.ok(body.nozzle.y < nozzle.y - .025);
    assert.ok(body.takeEmission() > .2);
    assert.deepEqual(body.positions.slice(0,sectors*3),before.slice(0,sectors*3));
    step(body, 100); body.takeEmission(); step(body, 30);
    assert.ok(body.takeEmission() < .002, 'a static hold cannot pump a continuous stream');
    body.release(); step(body, 180);
    assert.equal(body.takeEmission(),0);
    assert.ok(body.positions.every((v,i) => Math.abs(v-before[i]) < .006));
  } finally { body.dispose(); }
});

test('a short tap survives the next fixed tick, and cancelling or resetting clears an unfinished press', () => {
  const body = createPuffball(defaultSetup().physics);
  try {
    const rind = createRind(body);
    try {
      assert.ok(rind.mesh.geometry.attributes.position.count > body.rest.length * 100);
      assert.equal(rind.picker.geometry.attributes.position.array,body.positions);
      step(body, 60);
      const hit = new Vector3().fromArray(body.positions,ringIndex(5,3)*3);
      const push = new Vector3(0,-.3,-1);
      body.press(hit,push,1); body.release(); step(body, 8);
      assert.ok(body.takeEmission() > .05);
      body.reset(); body.press(hit,push,.85); body.release(true); step(body, 10);
      assert.equal(body.takeEmission(),0);
      body.press(hit,push,.85); step(body, 4); body.reset(); step(body, 30); rind.update();
      assert.equal(body.takeEmission(),0);
      assert.ok(Math.abs(body.time-.5)<1e-8);
    } finally { rind.dispose(); }
  } finally { body.dispose(); }
});

test('partial legacy saves acquire the woodland lighting and retain the edited studio controls', () => {
  const saved = validateSetup({version:1, camera:{yaw:-43}, studio:{exposure:.72}, lighting:{fill:{intensity:.46}}});
  assert.equal(saved.sketch,'16-spore');
  assert.equal(saved.camera.yaw,-43); assert.equal(saved.studio.exposure,.72);
  assert.equal(saved.lighting.fill.intensity,.46);
  assert.equal(saved.lighting.directional.color,defaultSetup().lighting.directional.color);
  assert.equal(saved.audio.instrument, 'kazoo');
  assert.equal(saved.audio.chord, 'minor');
  assert.deepEqual(validateSetup(saved),saved);
  assert.throws(() => validateSetup({audio: {instrument: ['kazoo']}}));
  assert.throws(() => validateSetup({audio: {chord: 'unknown'}}));
  assert.throws(()=>validateSetup({sketch:'14-tension'}));
});

test('each transformed rind carries its picking cage into world space', () => {
  const body = createPuffball(defaultSetup().physics);
  const rind = createRind(body);
  try {
    rind.mesh.position.set(2.1, .3, -1.2);
    rind.mesh.rotation.set(.16, .84, -.39);
    rind.mesh.scale.setScalar(.68);
    rind.mesh.updateMatrixWorld(true);
    const point = new Vector3().fromArray(body.positions, 3 * ringIndex(6, 3));
    const worldPoint = point.clone().applyMatrix4(rind.mesh.matrixWorld);
    const ray = new Raycaster(worldPoint.clone().add(new Vector3(0, 0, 2)), new Vector3(0, 0, -1));
    const hit = ray.intersectObject(rind.picker, false)[0];
    assert.ok(hit);
    assert.ok(rind.picker.worldToLocal(worldPoint).distanceTo(point) < 1e-6);
    assert.ok(hit.point.x > 1.5);
  } finally { rind.dispose(); body.dispose(); }
});
