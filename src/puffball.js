import { Vector3 } from 'three';
import { createPhysics } from './physics.js';

export const sectors = 14;
// Radius and height follow the rind up and over the ostiole, then down its throat.
const profile = [
  [.34, -.10], [.35, .09], [.31, .38], [.38, .60], [.66, .79], [.84, 1.07],
  [.87, 1.38], [.77, 1.68], [.55, 1.91], [.28, 2.01], [.164, 2.12],
  [.106, 2.18], [.084, 2.09], [.048, 1.94],
];
export const rows = profile.length;
export const ringIndex = (row, column) => row * sectors + (column + sectors) % sectors;

export function createCage() {
  return profile.flatMap(([radius, height], row) => Array.from({ length: sectors }, (_, i) => {
    const a = i * Math.PI * 2 / sectors;
    const ragged = row >= 10 ? .085 * Math.sin(5 * a + .3) : 0;
    const r = radius * (1 + .055 * Math.sin(3 * a + height * 1.4) + .035 * Math.cos(5 * a - height) + ragged);
    return new Vector3(
      r * Math.cos(a) - .10 * height + .085 * Math.sin(height * 2.2),
      height + radius * .07 * Math.cos(a + .55 * row) + ragged * .24
        - (row >= 10 ? .39 * r * Math.sin(a) : 0),
      r * Math.sin(a) * .91 + .045 * height * height + .024 * Math.max(0, row - 8),
    );
  }));
}

export function createPuffball(settings) {
  const physics = createPhysics(settings);
  const rest = createCage();
  const nodes = rest.map((position, i) => physics.addBody({
    body: { type: i < sectors ? 'static' : 'dynamic', position, linearDamping: 2.8,
      motionLocks: { angularX: true, angularY: true, angularZ: true } },
    shapes: [{ type: 'sphere', radius: .036, density: 100, filter: { groupIndex: -1 } }],
  }));
  const mass = nodes[sectors].body.getMass();
  function spring(a, b, length, hz, damping, localAnchorA) {
    const { joint } = physics.addDistanceJoint(a, b, { length, collideConnected: false, ...(localAnchorA && { localFrameA: { position: localAnchorA } }) });
    joint.enableSpring(true);
    joint.setSpringHertz(hz);
    joint.setSpringDampingRatio(damping);
  }
  // The anchored pith supports each ring. Circumferential, longitudinal and
  // diagonal springs transmit the local dimple into the surrounding skin.
  const pith = physics.addBody({ body: { type: 'static' } });
  const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
  for (let row = 1; row < rows; row++) {
    for (let col = 0; col < sectors; col++) {
      const i = ringIndex(row, col);
      const link = (j, hz) => spring(nodes[i], nodes[j], rest[i].distanceTo(rest[j]), hz, .48);
      link(ringIndex(row, col + 1), 5.8);
      link(ringIndex(row - 1, col), 6.2);
      link(ringIndex(row - 1, col + (row % 2 ? 1 : -1)), 3.6);
      for (const axis of axes) {
        const anchor = rest[i].clone().addScaledVector(axis, -2);
        spring(pith, nodes[i], 2, row > 9 ? 3.0 : 2.4, .35, anchor);
      }
    }
  }
  physics.addBody({ body: { type: 'static', position: { x: 0, y: -.15, z: 0 } },
    shapes: [{ type: 'box', halfExtents: { x: 3, y: .055, z: 3 } }] });

  const positions = new Float32Array(rest.length * 3);
  const nozzle = new Vector3(), axis = new Vector3(), inside = new Vector3();
  const push = new Vector3(), force = new Vector3(), delta = new Vector3();
  const contact = new Float32Array(nodes.length), baseline = new Float32Array(nodes.length);
  let time = 0, holdTime = 0, strength = 0, weightSum = 0, previousDent = 0, ejected = 0;
  let held = false, sleeping = false, revision = 0;
  const point = new Vector3();
  function sync() {
    const awake = physics.world.getAwakeBodyCount() > 0;
    if (sleeping && !awake) return;
    sleeping = !awake;
    revision++;
    nozzle.set(0, 0, 0); inside.set(0, 0, 0);
    nodes.forEach(({ body }, i) => {
      point.copy(body.getPosition()).toArray(positions, i * 3);
      const row = Math.floor(i / sectors);
      if (row === 11) nozzle.add(point);
      if (row === 13) inside.add(point);
    });
    nozzle.divideScalar(sectors);
    axis.copy(nozzle).sub(inside.divideScalar(sectors)).normalize();
  }
  physics.onSync(sync);
  physics.onBeforeStep(dt => {
    time += dt;
    const pressing = held || holdTime > 0;
    holdTime -= dt;
    if (!pressing) return;
    let dent = 0;
    for (let i = sectors; i < nodes.length; i++) {
      const weight = contact[i];

      const body = nodes[i].body;
      const p = point.copy(body.getPosition());
      dent += (p.dot(push) - baseline[i]) * weight;
      force.copy(push).multiplyScalar(mass * weight * 91 * strength);
      // Collapse of the air chamber also pulls the crown down as a unit.
      force.y -= mass * strength * 26 * Math.min(1, Math.max(0, rest[i].y - .43));
      body.applyForce(force, p, true);
    }
    dent /= weightSum;
    // Expelled volume only grows as the pressed patch travels inward.
    ejected += Math.max(0, dent - previousDent) * 2.8;
    previousDent = Math.max(dent, previousDent);
  });
  sync();
  return {
    rest, positions, nozzle, axis, get revision() { return revision; }, get time() { return time; },
    step: physics.step, configure: physics.configure, dispose: physics.dispose,
    press(hit, direction, pressure) {
      held = true; holdTime = .10; previousDent = 0; weightSum = 0;
      push.copy(direction).normalize();
      nodes.forEach(({ body }, i) => {
        const p = point.copy(body.getPosition());
        const d2 = delta.copy(p).sub(hit).lengthSq();
        const weight = i < sectors || d2 > 1.2 ? 0 : Math.exp(-d2 / .22);
        contact[i] = weight; baseline[i] = p.dot(push); weightSum += weight;
      });
      weightSum = Math.max(.0001, weightSum);
      this.setPressure(pressure);
    },
    setPressure(value) { strength = Math.max(.3, Math.min(1.15, value)); },
    release(cancel = false) { held = false; if (cancel) holdTime = 0; },
    takeEmission() { const amount = ejected; ejected = 0; return amount; },
    reset() {
      held = false; holdTime = 0; time = 0; ejected = 0; previousDent = 0;
      physics.reset();
    },
  };
}
