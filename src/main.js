import { attachPlayerBridge } from './player-bridge.js';
// Studio shell inherited from 14-tension.
import './style.css';
import './mesh-style.css';
import {
  ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, PCFShadowMap,
  MOUSE, TOUCH, PerspectiveCamera, PMREMGenerator, Scene, SpotLight, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { applyCameraView, captureCameraView, configureOrbitInputs } from './camera.js';
import { initPhysics } from './physics.js';
import { createPuffball } from './puffball.js';
import { createRind } from './rind.js';
import { createWoodland } from './woodland.js';
import { createSpores, particleCapacity } from './spores.js';
import { bindPress } from './press.js';
import { createControls } from './controls.js';
import { defaultSetup, validateSetup, DEFAULT_CAMERA } from './settings.js';
import { requestSetup } from './persistence.js';
import { libraryPalettes } from './palette-library.js';

import { createShadowFollow } from './shadows.js';
import { applyStudioLighting, bindLightingControls } from './lighting-controls.js';
import { drawerRequested } from './drawer-url.js';
import { bindMaterialControls } from './material-controls.js';
import { applyStudioPalette } from './studio-palettes.js';
import { createSceneEffects } from './scene-effects.js';
import { createAudio } from './score.js';
let settings = defaultSetup(), setupLoadError;
try { settings = await requestSetup(); } catch (error) { setupLoadError = error.message; console.warn(error.message); }
await initPhysics();
const canvas = document.querySelector('canvas');
const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
const scene = new Scene(); scene.background = new Color(settings.studio.background);
// Preserve the studio camera range.
const camera = new PerspectiveCamera(37, innerWidth / innerHeight, .1, 900);
const orbit = new OrbitControls(camera, canvas);
configureOrbitInputs(orbit);
orbit.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
orbit.enablePan = true; orbit.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
orbit.minDistance = 1; orbit.maxDistance = 600; orbit.minPolarAngle = Math.PI / 36; orbit.maxPolarAngle = Math.PI * 35 / 36;
orbit.enableDamping = true; orbit.dampingFactor = .07;
const focus = new Vector3();
const rindFocus = new Vector3(-.11, 1.16, .27);
const pmrem = new PMREMGenerator(renderer), room = new RoomEnvironment();
let environmentBlur = settings.lighting.environment.blur;
let environment = pmrem.fromScene(room, environmentBlur); scene.environment = environment.texture;
function configureEnvironment() {
  const blur = settings.lighting.environment.blur;
  if (blur === environmentBlur) return;
  const previous = environment;
  environment = pmrem.fromScene(room, blur); environmentBlur = blur;
  scene.environment = environment.texture;
  previous.dispose();
}
const hemisphere = new HemisphereLight('#fff8ed', '#7e8b9d', 1.4); scene.add(hemisphere);
const light = new DirectionalLight('#fff5df', 3.1);
light.position.set(-8, 18, 10); light.castShadow = true; light.shadow.mapSize.set(2048, 2048);
Object.assign(light.shadow.camera, { left: -4.7, right: 4.7, top: 4.7, bottom: -4.7, near: .1, far: 320 });
light.shadow.camera.updateProjectionMatrix();
light.shadow.bias = -.00015; light.shadow.normalBias = .04; light.shadow.radius = 3;
scene.add(light, light.target);
const lightOffset = new Vector3();
const followShadow = createShadowFollow(light, () => { const l = settings.lighting.directional; return lightOffset.set(l.offsetX, l.height, l.offsetZ); });
const fill = new DirectionalLight('#c0e4ff', 1.1); fill.position.set(12, 8, -10);
fill.shadow.mapSize.set(2048, 2048); Object.assign(fill.shadow.camera, { left: -4.7, right: 4.7, top: 4.7, bottom: -4.7, near: .1, far: 320 });
fill.shadow.camera.updateProjectionMatrix();
scene.add(fill, fill.target);
const spotlight = new SpotLight(); spotlight.shadow.mapSize.set(2048, 2048);
spotlight.shadow.camera.near = 1; spotlight.shadow.camera.far = 240; scene.add(spotlight, spotlight.target);
const effects = createSceneEffects(renderer, scene, camera, { clampBeauty: false });
const simulation = createPuffball(settings.physics);
const drawing = createRind(simulation);
const spores = createSpores(renderer);
const woodland = createWoodland(scene, renderer);
scene.add(drawing.mesh, spores.cloud);

let controls, lightingControls, materialControls;
let audioStatus;
const audio = createAudio({ onStatus(state) {
  audioStatus = state;
  controls?.audioStatus(state);
} });
const lights = { directional: light, hemisphere, spotlight, fill };
const running = () => settings.motion.playing && !document.hidden;

let pressSerial = 0;
const press = bindPress(canvas, camera, orbit, drawing.picker, simulation, running, () => {
  if (settings.audio.enabled) {
    void audio.unlock().then(() => {
      if (audio.unlocked) audio.update(0, running(), undefined, 0, [
        { from: -1e-9, to: 0, duration: 60 / settings.audio.tempo, serial: ++pressSerial },
      ]);
    });
  }
});

function configure(restoreCamera = false) {
  simulation.configure(settings.physics);
  drawing.configure(settings);
  woodland.configure(settings);
  spores.configure(settings.lighting);
  if (!settings.motion.playing) press.cancel();
  scene.background.set(settings.studio.background);
  renderer.toneMappingExposure = settings.studio.exposure;
  materialControls?.set(settings.materials);
  configureEnvironment();
  const env = settings.lighting.environment;
  scene.environmentRotation.y = env.rotation * Math.PI / 180;
  scene.environmentIntensity = env.enabled ? env.intensity : 0;
  applyStudioLighting(settings.lighting, lights, focus);
  lightingControls?.set(settings.lighting);
  for (const source of [light, fill, spotlight]) source.shadow.intensity = settings.studio.shadowOpacity;
  effects.configure(settings.lighting.occlusion);
  effects.configureBloom(settings.bloom);
  effects.configureFocus(settings.focus);
  audio.update(0, running());
  audio.configure(settings.audio);
  if (restoreCamera) applyCameraView(settings.camera, camera, orbit, focus);
  if (settings.visibility.fps && !controls) mountControls();
  controls?.set(settings);
}

function restore(value) {
  settings = validateSetup(value);
  press.cancel();
  simulation.reset();
  spores.reset();
  drawing.update();
  document.activeElement?.blur();
  configure(true);
  controls?.syncPalette();
}

function change(group, key, value) {
  const next = { ...settings, [group]: { ...settings[group], [key]: value } };
  settings = validateSetup(next);
  configure(group === 'camera');
  controls?.status('Unsaved changes');
}

function render() {
  spores.light(simulation.nozzle);
  followShadow(focus);
  effects.render(rindFocus);
}

const actions = {
  change,
  async save() {
    settings.camera = captureCameraView(camera, orbit, focus);
    const saved = await requestSetup('PUT', settings);
    controls?.status(import.meta.env.PROD ? 'Saved on this device.' : 'Saved to public/settings.json.');
    return saved;
  },
  async reload() {
    restore(await requestSetup());
    controls?.status('Settings reloaded.');
    return structuredClone(settings);
  },
  reset() {
    restore(defaultSetup());
    controls?.status('Defaults restored.');
  },
  resetView() { settings.camera = { ...DEFAULT_CAMERA }; configure(true); },
  togglePlaying() { change('motion', 'playing', !settings.motion.playing); },
  toggleSound() { actions.setSoundEnabled(!settings.audio.enabled); },
  setSoundEnabled(value) {
    change('audio', 'enabled', value);
    if (value) return audio.unlock();
  },
  async audition() {
    if (!running()) return;
    await actions.setSoundEnabled(true);
    if (audio.unlocked) audio.update(0, running(), undefined, 0, [
      { from: -1e-9, to: 0, duration: 60 / settings.audio.tempo, serial: 0 },
    ]);
  },
  selectPalette(id) {
    settings.lighting = applyStudioPalette(settings.lighting, id, libraryPalettes(settings.paletteLibrary));
    settings.paletteId = id;
    configure();
    controls?.status('Unsaved changes');
  },
  changeLibrary(library) {
    settings.paletteLibrary = library;
    controls?.set(settings);
    controls?.syncPalette();
    controls?.status('Unsaved changes');
  },
  exportDrawing() {
    render();
    canvas.toBlob(blob => {
      if (!blob) return controls?.status('PNG export failed.', true);
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url;
      link.download = '16-spore.png';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  },
};
function mountControls() {
  if (controls) return;
  controls = createControls({ ...actions, settings });
  lightingControls = bindLightingControls(controls.element, (group, key, value) => {
    change('lighting', group, { ...settings.lighting[group], [key]: value });
  });
  materialControls = bindMaterialControls(controls.element, (group, key, value) => {
    change('materials', group, { ...settings.materials[group], [key]: value });
  });
  lightingControls.set(settings.lighting);
  materialControls.set(settings.materials);
  controls.set(settings);
  controls.showControls(false);
  if (audioStatus) controls.audioStatus(audioStatus);
  if (setupLoadError) controls.status(setupLoadError, true);
}

let uiVisible = false;
function showControls(show) {
  if (show) mountControls();
  uiVisible = show;
  controls?.showControls(show);
}
let urlFlag = drawerRequested(location.href);
configure(true);
showControls(urlFlag);
window.addEventListener('hashchange', () => {
  const next = drawerRequested(location.href);
  if (next !== urlFlag) showControls(next);
  urlFlag = next;
});
document.addEventListener('keydown', event => {
  if (!document.hasFocus() || event.repeat || event.isComposing || event.metaKey || event.ctrlKey || event.altKey ||
      event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  switch (event.code) {
    case 'KeyH': event.preventDefault(); showControls(!uiVisible); break;
    case 'Escape': controls?.close(); break;
    case 'KeyP': event.preventDefault(); actions.togglePlaying(); break;
    case 'KeyM': actions.toggleSound(); break;
    case 'KeyF': void actions.audition(); break;
  }
});

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  effects.resize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.zoom = Math.min(1, camera.aspect / .84);
  camera.updateProjectionMatrix();
  spores.resize(innerHeight, camera);
}
window.addEventListener('resize', resize);
resize();
orbit.addEventListener('end', () => {
  settings.camera = captureCameraView(camera, orbit, focus);
  controls?.set(settings);
});
canvas.addEventListener('pointerdown', () => {
  if (settings.audio.enabled) void audio.unlock();
});

let previousTime;
renderer.setAnimationLoop(now => {
  const dt = (now - (previousTime ?? now)) / 1000;
  previousTime = now;
  const before = simulation.time;
  if (running() && simulation.step(dt)) {
    drawing.update();
    spores.step(simulation.time - before, simulation.time, simulation.takeEmission(), simulation.nozzle, simulation.axis);
  }
  audio.update(dt, running());
  orbit.update();
  render();
  controls?.frame(audio);
});
document.addEventListener('visibilitychange', () => {
  previousTime = undefined;
  if (document.hidden) press.cancel();
  audio.update(0, running());
});

const sketch = {
  getSetup: () => structuredClone(settings),
  getState: () => ({ playing: settings.motion.playing, physics: 'Box3D', time: simulation.time,
    cageVertices: simulation.rest.length, particleCapacity, emitted: spores.emitted, audio: audio.diagnostics }),
  setup(value) { restore(value); return sketch.getSetup(); },
  play() { if (!settings.motion.playing) actions.togglePlaying(); },
  pause() { if (settings.motion.playing) actions.togglePlaying(); },
  reset: actions.reset, saveSetup: actions.save, loadSetup: actions.reload,
};
window.__sporeSketch = sketch;
const detachPlayer = attachPlayerBridge(sketch);
window.addEventListener('pagehide', () => {
  renderer.setAnimationLoop(null);
  detachPlayer();
  audio.dispose();
  press.dispose();
  spores.dispose();
  woodland.dispose();
  drawing.dispose();
  simulation.dispose();
  orbit.dispose();
  effects.dispose();
  for (const source of [light, fill, spotlight]) source.shadow.dispose();
  environment.dispose();
  room.dispose();
  pmrem.dispose();
  renderer.dispose();
  window.removeEventListener('resize', resize);
}, { once: true });
