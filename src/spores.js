import {
  BufferAttribute, BufferGeometry, Color, HalfFloatType, Points, ShaderMaterial, Vector3,
} from 'three';
import { createPlumeShadow, shadowSpace, shadowLookup } from './plume-shadow.js';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

const side = 112;
export const particleCapacity = side * side;
const common = `
uniform float tick, clockTime, first, births, impulse;
uniform vec3 mouth, axis;
float hash(vec2 p){
  vec3 h=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); h+=dot(h,h.yzx+33.33);
  return fract((h.x+h.y)*h.z);
}
bool born(vec2 pixel){
  float id=floor(pixel.y)*resolution.x+floor(pixel.x);
  return mod(id-first+resolution.x*resolution.y,resolution.x*resolution.y)<births;
}
float lifetime(vec2 uv){return 3.3+2.1*hash(uv*719.+.231);}
`;

// Each transverse wave is the analytic curl of a sinusoidal vector
// potential. Their sum stays divergence-free, even as the phases advance.
const velocityShader = common + `
vec3 eddy(vec3 p,float t){
  vec3 f=cross(vec3(.43,1.38,.69),vec3(.6,-.4,.35))*cos(dot(p,vec3(.43,1.38,.69))+.32*t)
        +cross(vec3(-1.3,.7,1.1),vec3(.45,.45,.70))*cos(dot(p,vec3(-1.3,.7,1.1))-.22*t+.7)
        +cross(vec3(1.9,-.84,1.4),vec3(.2,.4,-.1))*cos(dot(p,vec3(1.9,-.84,1.4))+.36*t+2.4);
  return f;
}
void main(){
  vec2 pixel=gl_FragCoord.xy, uv=pixel/resolution.xy;
  vec4 p=texture2D(particlePosition,uv), v=texture2D(particleVelocity,uv);
  if(born(pixel)){
    float a=6.283185*hash(uv*912.7+clockTime), r=sqrt(hash(uv*231.8));
    vec3 radial=normalize(cross(axis,vec3(1,0,0)))*cos(a);
    radial+=normalize(cross(axis,normalize(cross(axis,vec3(1,0,0)))))*sin(a);
    vec3 jet=axis*(.77+.94*(1.-r*r)+.37*impulse);
    float wobble=.27*sin(7.5*clockTime);
    gl_FragColor=vec4(jet+radial*r*(.28+.50*r)+vec3(wobble,0.,wobble*.38),0.); return;
  }
  if(p.w<0.){gl_FragColor=vec4(0.);return;}
  float age=p.w;
  vec3 offset=p.xyz-mouth;
  vec3 radial=offset-axis*dot(offset,axis);
  vec3 outward=radial/max(length(radial),.05);
  // Entrain air around the head of the pulse. The outer curtain rolls
  // back down while the narrow jet still carries material up its center.
  float front=exp(-3.5*(age-.67)*(age-.67));
  float rim=smoothstep(.11,.48,length(radial));
  vec3 ambient=vec3(.38,.42,-.11)+.58*eddy(p.xyz*2.2,clockTime);
  ambient.x+=.42*sin(5.1*dot(offset,axis)+clockTime*1.3);
  ambient+=front*(outward*(.76-.64*rim)+axis*(.45-1.56*rim));
  ambient+=.34*eddy(p.xyz*5.1+vec3(6,13,-4),clockTime*.73);
  // Small eddies couple faster than the jet's bulk velocity so they
  // stretch the cloud into filaments before the whole puff drifts away.
  float entrainment=smoothstep(.08,.60,age);
  ambient+=entrainment*.44*eddy(p.xyz*6.9+vec3(-2.,7.,1.),clockTime*.52);
  gl_FragColor=vec4(mix(v.xyz,ambient,1.-exp(-tick*(1.25+4.2*entrainment))),0.);
}`;

const positionShader = common + `
void main(){
  vec2 pixel=gl_FragCoord.xy, uv=pixel/resolution.xy;
  vec4 p=texture2D(particlePosition,uv);
  if(born(pixel)){
    float a=6.283185*hash(uv*912.7+clockTime), r=.043*sqrt(hash(uv*231.8));
    vec3 u=normalize(cross(axis,vec3(1,0,0))), v=cross(axis,u);
    gl_FragColor=vec4(mouth+axis*.006+r*(u*cos(a)+v*sin(a)),0.);return;
  }
  if(p.w<0. || p.w>lifetime(uv)){gl_FragColor=vec4(0.,0.,0.,-1.);return;}
  gl_FragColor=vec4(p.xyz+texture2D(particleVelocity,uv).xyz*tick,p.w+tick);
}`;

const vertex = shadowSpace + `
uniform sampler2D state;
uniform float screenScale, maxPoint;
attribute vec2 slot;
attribute vec4 grain;
varying vec4 vGrain;
varying vec3 vSight, vLightCoord;
varying float vAge, vCloud, vLife, vCoverage;
void main(){
  vec4 p=texture2D(state,slot);
  if(p.w<0.){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;return;}
  vec3 h=fract(vec3((slot*719.+.231).xyx)*vec3(.1031,.1030,.0973));
  h+=dot(h,h.yzx+33.33); vLife=3.3+2.1*fract((h.x+h.y)*h.z);
  vAge=p.w; vCloud=step(.905,grain.x); vGrain=grain;
  vec4 mv=modelViewMatrix*vec4(p.xyz,1.);
  gl_Position=projectionMatrix*mv;
  vSight=normalize(cameraPosition-p.xyz); vLightCoord=lightSpace(p.xyz);
  float width=mix(.003+.006*grain.y,(.062+.32*(1.-exp(-1.65*p.w)))*(.68+.9*grain.y),vCloud);
  float pixels=width*screenScale/-mv.z; vCoverage=min(1.,pixels*pixels);
  gl_PointSize=clamp(pixels,1.,maxPoint);
}`;
const fragment = shadowLookup + `
uniform vec3 sunDir, keyColor, fillColor;
varying vec4 vGrain;
varying vec3 vSight, vLightCoord;
varying float vAge, vCloud, vLife, vCoverage;
float rand(vec2 p){vec3 h=fract(vec3(p.xyx)*.1031);h+=dot(h,h.yzx+33.33);return fract((h.x+h.y)*h.z);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(rand(i),rand(i+vec2(1,0)),f.x),mix(rand(i+vec2(0,1)),rand(i+1.),f.x),f.y);}
void main(){
  vec2 q=gl_PointCoord*2.-1.;
  float rr=dot(q,q); if(rr>=1.)discard;
  float alpha,grainLight=1.;
  if(vCloud>.5){
    float ang=6.283*vGrain.w+(.4-vGrain.y)*vAge;
    q=mat2(cos(ang),-sin(ang),sin(ang),cos(ang))*q;
    vec2 p=q*2.35+vGrain.zw*63.;
    float n=noise(p)*.57+noise(p*2.1+.2*vAge)*.28+noise(p*4.3)*.15;
    float radius=length(q)+.55*(.5-n);
    alpha=(1.-smoothstep(.08,1.,radius))*(.016+.055*n)*smoothstep(.18,.76,n);
    grainLight=.48+.65*n+.21*q.y-.13*q.x;
  }else{
    alpha=(1.-smoothstep(.05,1.,rr))*(.065+.18*vGrain.z);
  }
  float life=vLife;
  alpha*=vCoverage*smoothstep(0.,.055,vAge)*(1.-smoothstep(life*.38,life,vAge));
  if(alpha<.001)discard;
  float forwardScatter=pow(max(dot(-sunDir,normalize(vSight)),0.),3.);
  vec3 albedo=mix(vec3(.22,.14,.085),vec3(.84,.80,.69),.36+.55*smoothstep(.03,1.3,vAge));
  float sun=transmittance(vLightCoord);
  vec3 radiance=albedo*(.28*fillColor+keyColor*(.55+1.15*forwardScatter)*(.06+.94*sun))*grainLight;
  gl_FragColor=vec4(radiance,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSpores(renderer) {
  const gpu = new GPUComputationRenderer(side, side, renderer);
  gpu.setDataType(HalfFloatType);
  const empty = gpu.createTexture(), still = gpu.createTexture();
  for (let i = 3; i < empty.image.data.length; i += 4) empty.image.data[i] = -1;
  const position = gpu.addVariable('particlePosition', positionShader, empty);
  const velocity = gpu.addVariable('particleVelocity', velocityShader, still);
  const uniforms = {
    tick: {value: 0}, clockTime: {value: 0}, first: {value: 0}, births: {value: 0}, impulse: {value: 0},
    mouth: {value: new Vector3()}, axis: {value: new Vector3(0, 1, 0)},
  };
  for (const variable of [position, velocity]) {
    gpu.setVariableDependencies(variable, [position, velocity]);
    Object.assign(variable.material.uniforms, uniforms);
  }
  const error = gpu.init(); if (error) { gpu.dispose(); throw Error(error); }
  const slots = new Float32Array(particleCapacity * 2), seeds = new Float32Array(particleCapacity * 4);
  let seed = 161118;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < particleCapacity; i++) {
    slots[2*i] = (i % side + .5) / side; slots[2*i+1] = (Math.floor(i/side) + .5) / side;
    for (let k = 0; k < 4; k++) seeds[i*4+k] = random();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(particleCapacity * 3), 3));
  geometry.setAttribute('slot', new BufferAttribute(slots, 2)); geometry.setAttribute('grain', new BufferAttribute(seeds, 4));
  const gl = renderer.getContext();
  const shading = {
    state: {value: gpu.getCurrentRenderTarget(position).texture}, screenScale: {value: 1},
    maxPoint: {value: gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1]},
    sunDir: {value: new Vector3()}, keyColor: {value: new Color()}, fillColor: {value: new Color()},
  };
  const shadow = createPlumeShadow(geometry,shading);
  const material = new ShaderMaterial({ uniforms: shading, vertexShader: vertex, fragmentShader: fragment,
    transparent: true, depthWrite: false });
  const cloud = new Points(geometry, material); cloud.frustumCulled = false; cloud.renderOrder = 2;
  let cursor = 0, reserve = 0, carry = 0, sinceBirth = Infinity, total = 0;
  let shadowDirty = false;
  cloud.visible = false;
  return {
    cloud, get emitted() { return total; },
    configure({ directional, hemisphere, fill, spotlight }) {
      shadowDirty = true;
      shading.sunDir.value.set(directional.offsetX, directional.height, directional.offsetZ).normalize();
      shading.keyColor.value.set(directional.color).multiplyScalar(directional.enabled ? directional.intensity : 0);
      const ambient = shading.fillColor.value.set(hemisphere.skyColor).multiplyScalar(hemisphere.enabled ? hemisphere.intensity*.55 : 0);
      if (fill.enabled) ambient.add(new Color(fill.color).multiplyScalar(.5*fill.intensity));
      const dist2 = spotlight.offsetX**2 + spotlight.height**2 + spotlight.offsetZ**2;
      if (spotlight.enabled) ambient.add(new Color(spotlight.color).multiplyScalar(.55*spotlight.intensity/dist2));
    },
    light(mouth) {
      if (!cloud.visible || !shadowDirty) return;
      shadow.render(renderer, mouth);
      shadowDirty = false;
    },
    resize(height, camera) {
      shading.screenScale.value = height*renderer.getPixelRatio()*camera.projectionMatrix.elements[5]*.5;
    },
    step(dt, time, amount, mouth, axis) {
      if (!(dt > 0)) return;
      reserve = Math.min(.95, reserve + amount);
      const out = reserve * (1-Math.exp(-dt*(3.2+1.8*Math.sin(time*14)))); reserve -= out;
      carry += out * 10600;
      const births = Math.floor(carry); carry -= births;
      sinceBirth = births ? 0 : sinceBirth + dt;
      cloud.visible = sinceBirth < 5.5;
      if (!cloud.visible) return;
      uniforms.first.value=cursor; uniforms.births.value=births; uniforms.tick.value=dt;
      uniforms.clockTime.value=time; uniforms.impulse.value=Math.min(1.,out/dt*.44);
      uniforms.mouth.value.copy(mouth); uniforms.axis.value.copy(axis);
      cursor=(cursor+births)%particleCapacity; total+=births;
      gpu.compute();
      shading.state.value = gpu.getCurrentRenderTarget(position).texture;
      shadowDirty = true;
    },
    reset() {
      for (const variable of [position,velocity]) for (const rt of variable.renderTargets)
        gpu.renderTexture(variable.initialValueTexture,rt);
      sinceBirth=Infinity; reserve=carry=cursor=total=0; cloud.visible=false;
    },
    dispose() { shadow.dispose(); gpu.dispose(); geometry.dispose(); material.dispose(); },
  };
}
