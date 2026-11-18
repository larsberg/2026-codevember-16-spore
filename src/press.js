import { Raycaster, Vector2, Vector3 } from 'three';

export function bindPress(canvas, camera, orbit, picker, simulation, running, onPress) {
  const ray = new Raycaster(), ndc = new Vector2(), inward = new Vector3();
  let pointer = null, startY = 0;
  function down(event) {
    if (event.isPrimary === false || event.button !== 0 || pointer !== null || !running()) return;
    const rect = canvas.getBoundingClientRect();
    ndc.set(2*(event.clientX-rect.left)/rect.width-1, 1-2*(event.clientY-rect.top)/rect.height);
    camera.updateMatrixWorld(); ray.setFromCamera(ndc,camera);
    const hit = ray.intersectObject(picker,false)[0];
    if (!hit) return;
    pointer=event.pointerId; startY=event.clientY;
    orbit.enabled=false; canvas.setPointerCapture(pointer);
    event.preventDefault(); event.stopImmediatePropagation();
    // A grazing press still dents the visible outline; a central press also
    // pushes downward as a fingertip would on the shoulder of a puffball.
    inward.copy(hit.face.normal).negate().multiplyScalar(.68)
      .addScaledVector(ray.ray.direction,.32);
    inward.y-=.28;
    simulation.press(hit.point,inward,event.pointerType==='pen' ? .45+.68*event.pressure : .89);
    onPress();
  }
  function move(event) {
    if (event.pointerId !== pointer) return;
    const pressure=event.pointerType==='pen' ? .45+.68*event.pressure : .89;
    simulation.setPressure(pressure+(event.clientY-startY)/Math.max(100,canvas.clientHeight*.40));
  }
  function release(cancel = false) {
    if (pointer===null) return;
    const id=pointer; pointer=null;
    simulation.release(cancel); orbit.enabled=true;
    if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
  }
  function up(event){if(event.pointerId===pointer)release();}
  function cancel(event){if(event.pointerId===pointer)release(true);}
  canvas.addEventListener('pointerdown',down,true);
  canvas.addEventListener('pointermove',move);
  canvas.addEventListener('pointerup',up);
  canvas.addEventListener('pointercancel',cancel);
  canvas.addEventListener('lostpointercapture',cancel);
  const blur=()=>release(true); window.addEventListener('blur',blur);
  return {
    cancel:blur,
    dispose(){
      blur();window.removeEventListener('blur',blur);
      canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move);
      canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);
      canvas.removeEventListener('lostpointercapture',cancel);
    },
  };
}
