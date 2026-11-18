import {
  BufferAttribute, BufferGeometry, DataTexture, DoubleSide, FloatType, Mesh,
  MeshBasicMaterial, MeshDepthMaterial, MeshNormalMaterial, MeshStandardMaterial,
  PlaneGeometry, RGBADepthPacking, RGBAFormat,
} from 'three';
import { rows, sectors, ringIndex } from './puffball.js';
import { applyMaterialSettings } from './material-settings.js';

// Uniform cubic B-spline patch with periodic angular knots. Both partial
// derivatives use the same 16 texels as the position, including at the seam.
const surface = `
uniform sampler2D cage;
const int columns = ${sectors}, rings = ${rows};
vec4 basis(float t) {
  float s = 1.-t;
  return vec4(s*s*s, 3.*t*t*t-6.*t*t+4., -3.*t*t*t+3.*t*t+3.*t+1., t*t*t)/6.;
}
vec4 slope(float t) {
  return .5*vec4(-(1.-t)*(1.-t),3.*t*t-4.*t,-3.*t*t+2.*t+1.,t*t);
}
void patchAt(vec2 coord,out vec3 p,out vec3 n) {
  vec2 grid = coord*vec2(columns,rings-1);
  ivec2 base = ivec2(floor(grid))-1;
  vec2 f = fract(grid);
  vec4 wu=basis(f.x), wv=basis(f.y), du=slope(f.x), dv=slope(f.y);
  vec3 pu=vec3(0.), pv=vec3(0.); p=vec3(0.);
  for(int y=0;y<4;y++) for(int x=0;x<4;x++) {
    ivec2 k=ivec2((base.x+x+columns)%columns,clamp(base.y+y,0,rings-1));
    vec3 node=texelFetch(cage,k,0).xyz;
    p+=node*(wu[x]*wv[y]);
    pu+=node*(du[x]*wv[y]); pv+=node*(wu[x]*dv[y]);
  }
  n=normalize(cross(pv,pu));
}
`;

// All pigmentation is attached to periodic material coordinates. Warped
// cell centers form the removable warts and the little ring scars underneath.
const rind = `
float rnd(vec2 p) {
  vec3 h=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));
  h+=dot(h,h.yzx+33.33); return fract((h.x+h.y)*h.z);
}
float tileNoise(vec2 p,float period) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  vec2 a=vec2(mod(i.x,period),i.y), b=vec2(mod(i.x+1.,period),i.y);
  return mix(mix(rnd(a),rnd(b),f.x),mix(rnd(a+vec2(0,1)),rnd(b+vec2(0,1)),f.x),f.y);
}
vec4 rindAt(vec2 q,out vec2 gradient) {
  float stains=tileNoise(q*vec2(11.,8.),11.);
  vec2 warp=vec2(stains,tileNoise(q*vec2(18.,13.)+4.3,18.));
  vec2 g=q*vec2(66.,42.)+.63*warp, cell=floor(g), f=fract(g);
  float nearest=3., seed=0.; vec2 toCell=vec2(0.);
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
    vec2 d=vec2(x,y), id=vec2(mod(cell.x+d.x,66.),cell.y+d.y);
    vec2 o=.18+.64*vec2(rnd(id),rnd(id+51.2));
    float dist=length(d+o-f);
    if(dist<nearest){ nearest=dist; seed=rnd(id+93.7); toCell=f-d-o; }
  }
  float intact=smoothstep(.15,.62,seed+.83*(stains-.5));
  float thorn=pow(max(0.,1.-nearest*(1.7+.9*seed)),1.18)*intact;
  float scar=exp(-135.*(nearest-.33)*(nearest-.33))*(1.-intact);
  float mantle=smoothstep(.19,.33,q.y)*(1.-smoothstep(.72,.87,q.y));
  float fiber=tileNoise(q*vec2(126.,9.)+warp*2.,126.);
  float grit=tileNoise(q*vec2(340.,238.),340.);
  float height=mantle*(thorn*.034+scar*.006)+(.0018+.004*(1.-mantle))*fiber+.0013*grit;
  float slope=-.034*1.18*(1.7+.9*seed)*intact*pow(max(0.,1.-nearest*(1.7+.9*seed)),.18);
  slope-=.006*270.*(nearest-.33)*scar;
  gradient=mantle*slope*toCell/max(nearest,.035)*vec2(66.,42.);
  return vec4(height,thorn*mantle,scar*mantle,stains*.50+fiber*.23+grit*.27);
}
`;

function deform(material, texture, beauty = false) {
  material.onBeforeCompile = shader => {
    shader.uniforms.cage = { value: texture };
    shader.vertexShader = surface + rind + 'varying vec2 vRind;\n' + shader.vertexShader
      .replace('void main() {', `void main() {
        vec3 smoothP, smoothN; patchAt(uv,smoothP,smoothN);
        vec2 gradient; vRind=uv; smoothP+=smoothN*rindAt(uv,gradient).x;`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = smoothN;')
      .replace('#include <begin_vertex>', 'vec3 transformed = smoothP;');
    if (!beauty) return;
    shader.fragmentShader = 'varying vec2 vRind;\n' + rind + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 gradient; vec4 skin=rindAt(vRind,gradient);
        float patina=tileNoise(vRind*vec2(21.,18.)+5.,21.);
        vec3 rindColor=mix(vec3(.17,.076,.033),vec3(.58,.363,.195),smoothstep(.2,.84,skin.w));
        rindColor=mix(rindColor,vec3(.84,.72,.50),clamp(skin.y*1.15+skin.z*.17,0.,1.));
        float collar=smoothstep(.67,.83,vRind.y);
        rindColor*=mix(1.,.42+.39*patina,collar);
        rindColor*=mix(.68,1.,smoothstep(.01,.23,vRind.y))*(.86+.29*patina);
        rindColor*=1.-.985*smoothstep(.824,.91,vRind.y);
        diffuseColor.rgb*=rindColor;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0 && !defined( FLAT_SHADED )
          vec3 velvetNormal=normalize(vNormal);
          float grazing=pow(1.-max(0.,dot(velvetNormal,normalize(vViewPosition))),3.3);
          float fuzz=.73*grazing*smoothstep(-.25,.72,dot(velvetNormal,directionalLights[0].direction));
          reflectedLight.directDiffuse+=directionalLights[0].color*vec3(.81,.68,.48)*fuzz;
        #endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 sx=dFdx(-vViewPosition), sy=dFdy(-vViewPosition);
        vec3 tx=cross(sy,normal), ty=cross(normal,sx);
        float det=dot(sx,tx);
        normal=normalize(abs(det)*normal-sign(det)*(dot(gradient,dFdx(vRind))*tx+dot(gradient,dFdy(vRind))*ty));`);
  };
  material.customProgramCacheKey = () => 'spore-rind-' + beauty;
}

export function createRind(simulation) {
  const data = new Float32Array(sectors * rows * 4);
  const cage = new DataTexture(data, sectors, rows, RGBAFormat, FloatType);
  const geometry = new PlaneGeometry(1, 1, 256, 144);
  // Increasing v runs up the fungus; increasing u runs clockwise from above.
  // Reverse PlaneGeometry's winding to match dP/dv cross dP/du.
  const index = geometry.index.array;
  for (let i = 0; i < index.length; i += 3) [index[i], index[i + 1]] = [index[i + 1], index[i]];
  const material = new MeshStandardMaterial({ roughness: .91, metalness: 0 });
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  const ao = new MeshNormalMaterial();
  ao.allowOverride = false;
  deform(material, cage, true); deform(depth, cage); deform(ao, cage);
  const mesh = new Mesh(geometry, material);
  mesh.customDepthMaterial = depth; mesh.userData.aoNormalMaterial = ao;
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.layers.enable(1);

  // Raycast the moving low-resolution hull. It is never drawn.
  const pickGeometry = new BufferGeometry(), triangles = [];
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < sectors; c++) {
    const a = ringIndex(r,c), b = ringIndex(r,c+1), d = ringIndex(r+1,c), e = ringIndex(r+1,c+1);
    triangles.push(a,d,b, d,e,b);
  }
  pickGeometry.setAttribute('position', new BufferAttribute(simulation.positions, 3));
  pickGeometry.setIndex(triangles);
  const pickMaterial = new MeshBasicMaterial({ side: DoubleSide });
  const picker = new Mesh(pickGeometry, pickMaterial);
  let revision = -1;
  function update() {
    if (revision === simulation.revision) return;
    revision = simulation.revision;
    const p = simulation.positions;
    for (let i = 0; i < rows * sectors; i++) {
      data[4*i]=p[3*i]; data[4*i+1]=p[3*i+1]; data[4*i+2]=p[3*i+2];
    }
    cage.needsUpdate = true;
    pickGeometry.computeBoundingSphere();
  }
  update();
  return {
    mesh, picker, update, configure(settings) { applyMaterialSettings(material, settings.materials.panels, 'panels'); },
    dispose() {
      cage.dispose(); geometry.dispose(); material.dispose(); depth.dispose(); ao.dispose();
      pickGeometry.dispose(); pickMaterial.dispose();
    },
  };
}
