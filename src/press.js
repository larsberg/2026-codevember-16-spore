import { Matrix4, Raycaster, Vector2, Vector3 } from 'three';

export function bindPress(canvas, camera, orbit, bodies, running, audio) {
  const ray = new Raycaster(), ndc = new Vector2(), inward = new Vector3(), inverse = new Matrix4();
  const pickers = bodies.map(body => body.drawing.picker);
  const contacts = new Map(), occupied = new Set();
  const pressure = event => event.pointerType === 'pen' ? .45 + .68 * event.pressure : .89;
  function down(event) {
    if (event.button !== 0 || contacts.has(event.pointerId) || !running()) return;
    const rect = canvas.getBoundingClientRect();
    ndc.set(2 * (event.clientX - rect.left) / rect.width - 1, 1 - 2 * (event.clientY - rect.top) / rect.height);
    camera.updateMatrixWorld(); ray.setFromCamera(ndc, camera);
    for (const picker of pickers) picker.updateWorldMatrix(true, false);
    const hit = ray.intersectObjects(pickers, false)[0];
    if (!hit) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const body = pickers.indexOf(hit.object);
    if (occupied.has(body)) return;
    contacts.set(event.pointerId, { body, startY: event.clientY });
    occupied.add(body); orbit.enabled = false; canvas.setPointerCapture(event.pointerId);
    inverse.copy(hit.object.matrixWorld).invert();
    inward.copy(ray.ray.direction).transformDirection(inverse).multiplyScalar(.32)
      .addScaledVector(hit.face.normal, -.68);
    inward.y -= .28;
    const force = pressure(event);
    bodies[body].simulation.press(hit.point.applyMatrix4(inverse), inward, force);
    void audio.press(force, body);
  }
  function move(event) {
    const contact = contacts.get(event.pointerId);
    if (!contact) return;
    event.stopPropagation();
    const force = pressure(event) + (event.clientY - contact.startY) / Math.max(100, canvas.clientHeight * .40);
    bodies[contact.body].simulation.setPressure(force);
    audio.pressure(force, contact.body);
  }
  function end(id, cancelled) {
    const contact = contacts.get(id);
    if (!contact) return;
    contacts.delete(id); occupied.delete(contact.body);
    bodies[contact.body].simulation.release(cancelled);
    audio.release(cancelled, contact.body);
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    orbit.enabled = !contacts.size;
  }
  function finish(event, cancelled) {
    if (!contacts.has(event.pointerId)) return;
    event.stopPropagation();
    end(event.pointerId, cancelled);
  }
  const up = event => finish(event, false);
  const cancel = event => finish(event, true);
  const cancelAll = () => { for (const id of contacts.keys()) end(id, true); };
  canvas.addEventListener('pointerdown', down, true);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('lostpointercapture', cancel);
  window.addEventListener('blur', cancelAll);
  return {
    cancel: cancelAll,
    dispose() {
      cancelAll(); window.removeEventListener('blur', cancelAll);
      canvas.removeEventListener('pointerdown', down, true); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('lostpointercapture', cancel);
    },
  };
}
