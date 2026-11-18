import { applyStudioPalette } from './studio-palettes.js';
import { defaultLighting, validateLighting } from './lighting-settings.js';
import { defaultMaterials, validateMaterials } from './material-settings.js';
import { defaultPaletteLibrary, validatePaletteLibrary, libraryPalettes } from './palette-library.js';
import { audioChoices, audioFields, defaultVoices, validateVoices } from './synth-settings.js';

export const DEFAULT_CAMERA = { yaw: 7, elevation: 8, distance: 6.38, offsetX: .40, offsetY: 1.76, offsetZ: 0 };
export const fields = {
  motion: { playing: ['Playing', true] },
  physics: {
    gravity: ['Gravity', 3, 0, 1000, .1], friction: ['Ground friction', 1.1, 0, 10, .01],
  },
  studio: { background: ['Background', '#101915'], exposure: ['Exposure', 1.05, .1, 3, .01], shadowOpacity: ['Ground shadow opacity', .83, 0, 1, .01] },
  bloom: { enabled: ['Enable bloom', false], strength: ['Bloom strength', .85, 0, 4, .05], radius: ['Bloom radius', .45, 0, 1, .01], threshold: ['Bloom threshold', 1.4, 0, 3, .01] },
  focus: { enabled: ['Tilt blur', false], tilt: ['Sharp band angle °', 0, -85, 85, 1], band: ['Sharp band half-width', .18, .02, .5, .01], strength: ['Blur amount', 1.5, 0, 8, .1], offset: ['Band vertical offset', 0, -.5, .5, .01] },
  audio: audioFields,
  visibility: { fps: ['Show frame-rate meter', false] },
  camera: {
    yaw: ['Yaw', DEFAULT_CAMERA.yaw, -360, 360, .1], elevation: ['Elevation', DEFAULT_CAMERA.elevation, -85, 85, .1],
    distance: ['Distance', DEFAULT_CAMERA.distance, 1, 600, .1], offsetX: ['Target X', DEFAULT_CAMERA.offsetX, -200, 200, .01],
    offsetY: ['Target Y', DEFAULT_CAMERA.offsetY, -200, 200, .01], offsetZ: ['Target Z', 0, -200, 200, .01],
  },
};


export function defaultSetup() {
  const result = Object.fromEntries(Object.entries(fields).map(([group, entries]) => [group,
    Object.fromEntries(Object.entries(entries).map(([key, [, initial]]) => [key, initial]))]));
  result.version = 2;
  result.sketch = '16-spore';
  result.audio.voices = defaultVoices();
  result.lighting = defaultLighting(); result.materials = defaultMaterials();
  result.paletteLibrary = defaultPaletteLibrary();
  result.paletteId = 'woodland';
  result.lighting = applyStudioPalette(result.lighting, result.paletteId);
  Object.assign(result.lighting.directional, { enabled: true, intensity: 3.65, offsetX: -3.8,
    height: 4.5, offsetZ: -4.3, softness: 2.4, normalBias: .009 });
  Object.assign(result.lighting.hemisphere, { intensity: .57 });
  Object.assign(result.lighting.fill, { enabled: true, color: '#cbd4cb', intensity: .64,
    offsetX: 3, height: 2.3, offsetZ: 4 });
  Object.assign(result.lighting.spotlight, { enabled: true, color: '#ffe1ac', intensity: 42,
    height: 3.6, offsetX: -2.1, offsetZ: 2.4, angle: 31, penumbra: .98, castShadow: false });
  result.lighting.environment.intensity = .17;
  result.lighting.occlusion.enabled = false;
  return result;
}
export function validateSetup(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid setup.');
  if (value.sketch !== undefined && value.sketch !== '16-spore') throw Error('Expected a 16-spore setup.');
  if (value.version !== undefined && ![0, 1, 2].includes(value.version)) throw Error('Unsupported setup version.');
  const result = defaultSetup();
  // Unversioned files retain edits and acquire missing studio defaults.
  for (const [group, entries] of Object.entries(fields)) for (const [key, [, initial, min, max]] of Object.entries(entries)) {
    const x = value[group]?.[key] ?? result[group][key];
    const valid = typeof initial === 'number' ? Number.isFinite(x) && x >= min && x <= max
      : group === 'audio' && audioChoices[key] ? typeof x === 'string' && Object.hasOwn(audioChoices[key], x)
      : typeof initial === 'boolean' ? typeof x === 'boolean' : typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x);
    if (!valid) throw Error(`Invalid ${group}.${key}.`);
    result[group][key] = x;
  }
  result.audio.voices = validateVoices(value.audio?.voices);
  result.lighting = validateLighting(Object.fromEntries(Object.entries(result.lighting).map(([key, defaults]) => [key, { ...defaults, ...value.lighting?.[key] }])));
  result.materials = validateMaterials(value.materials);
  result.paletteLibrary = validatePaletteLibrary(value.paletteLibrary ?? result.paletteLibrary);
  result.paletteId = value.paletteId ?? result.paletteId;
  if (!libraryPalettes(result.paletteLibrary).some(p => p.id === result.paletteId)) throw Error('Invalid palette.');
  return result;
}
