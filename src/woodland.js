import {
  BackSide, BufferAttribute, BufferGeometry, Color, DoubleSide, FogExp2, Group, Mesh,
  MeshStandardMaterial, MirroredRepeatWrapping, PlaneGeometry, ShaderMaterial, SphereGeometry,
  SRGBColorSpace, TextureLoader, Vector3,
} from 'three';

const canopyFragment = `
uniform vec3 shade, lightColor;
varying vec3 vRay;
float hash(vec2 p){vec3 h=fract(vec3(p.xyx)*.1031);h+=dot(h,h.yzx+33.33);return fract((h.x+h.y)*h.z);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float bokeh(vec2 p,float size) {
  vec2 i=floor(p), f=fract(p); float illum=0.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 o=vec2(x,y), id=i+o;
    vec2 center=vec2(hash(id),hash(id+13.91));
    float r=size*(.56+.6*hash(id+42.31));
    float d=length(f-o-center);
    illum+=(1.-smoothstep(r*.72,r*1.41,d))*pow(hash(id+21.2),4.);
  }
  return illum;
}
void main(){
  vec3 dir=normalize(vRay);
  vec2 q=vec2(atan(dir.x,-dir.z),asin(dir.y));
  float leaves=noise(q*4.1+vec2(7,14))*.56+noise(q*9.+31.)*.28+noise(q*23.1-6.)*.16;
  float canopy=smoothstep(.31,.78,leaves);
  float sunWindow=exp(-3.*pow(q.x+.56,2.)-2.*pow(q.y-.37,2.));
  float glints=bokeh(q*6.7+3.,.56)*.095+bokeh(q*15.6+11.,.44)*.044;
  vec3 c=shade+vec3(.008,.015,.009)*canopy+vec3(.016,.014,.004)*sunWindow*canopy;
  c+=lightColor*(canopy*.15+.065)*glints*sunWindow;
  float horizon=smoothstep(-.11,.12,q.y);
  gl_FragColor=vec4(mix(shade,c,horizon),1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function bedHeight(x,z) {
  const ripple = .07*Math.sin(1.8*x+1.2*z)+.047*Math.sin(3*z-.8*x)+.028*Math.sin(5.2*x+2.3*z);
  const r = Math.sqrt(x*x*.35+z*z);
  const drop = Math.max(0, r-1.8);
  return -.055 - .48*drop + (1-Math.exp(-1.6*(x*x+z*z)))*ripple;
}

function createLitter() {
  let seed = 1610;
  const random = () => ((seed = (Math.imul(seed, 1664525)+1013904223)>>>0)/4294967296);
  const vertices=[], colors=[], faces=[];
  function vertex(p, c) {
    vertices.push(...p); colors.push(c.r,c.g,c.b); return vertices.length/3-1;
  }
  const leafColors=['#48511d','#52612b','#777536','#385028','#8c8542'].map(c=>new Color(c));
  const stems=['#86532e','#6b4126','#8d603d'].map(c=>new Color(c));
  const capsules=['#bb894b','#8b572e','#a57943'].map(c=>new Color(c));
  const twigColors=['#5d4538','#453730','#7e634f'].map(c=>new Color(c));
  function tube(a,b,r0,r1,color,n=5) {
    const axis=b.clone().sub(a).normalize();
    const u=new Vector3().crossVectors(axis,Math.abs(axis.y)<.9?new Vector3(0,1,0):new Vector3(1,0,0)).normalize();
    const v=new Vector3().crossVectors(axis,u);
    const start=vertices.length/3;
    for(const [p,r] of [[a,r0],[b,r1]])for(let j=0;j<n;j++){
      const angle=j*2*Math.PI/n;
      vertex(p.clone().addScaledVector(u,r*Math.cos(angle)).addScaledVector(v,r*Math.sin(angle)),color);
    }
    for(let j=0;j<n;j++){
      const k=start+j, next=start+(j+1)%n;
      faces.push(k,next,k+n,next,next+n,k+n);
    }
  }
  for(let cluster=0;cluster<280;cluster++){
    const cx=(random()-.5)*12, cz=(random()-.5)*8;
    if(cx*cx+cz*cz<.25)continue;
    const height=.035+.105*random();
    for(let j=0;j<30;j++){
      const x=cx+(random()-.5)*.61,z=cz+(random()-.5)*.47;
      const y=bedHeight(x,z)+.006, angle=random()*6.283, h=height*(.46+.89*random()), w=.10*h;
      const c=leafColors[Math.floor(random()*leafColors.length)];
      const nx=Math.cos(angle),nz=Math.sin(angle);
      const a=vertex([x,y,z],c), b=vertex([x+nx*h*.3-nz*w,y+.59*h,z+nz*h*.3+nx*w],c);
      const d=vertex([x+nx*h*.3+nz*w,y+.63*h,z+nz*h*.3-nx*w],c);
      const tip=vertex([x+nx*h*.78,y+h,z+nz*h*.78],c);
      faces.push(a,b,d,b,tip,d);
    }
    if(cluster%4)continue;
    // Slender sporophyte stalks catch the backlight at the edge of moss beds.
    for(let j=0;j<3;j++){
      const x=cx+(random()-.5)*.3,z=cz+(random()-.5)*.3;
      const a=new Vector3(x,bedHeight(x,z),z), h=.12+random()*.27;
      const mid=a.clone().add(new Vector3(.08*h,h*.69,.1*h));
      const tip=mid.clone().add(new Vector3((random()-.2)*.11,.3*h,.03));
      const cap=tip.clone().add(new Vector3(.024,.027,.008));
      const stem=stems[cluster%3], fruit=capsules[j];
      tube(a,mid,.005,.0035,stem);tube(mid,tip,.0035,.003,stem);
      tube(tip,cap,.004,.0105,fruit);tube(cap,cap.clone().add(new Vector3(.027,.013,0)),.0105,.002,fruit);
    }
  }
  for(let i=0;i<95;i++){
    const x=(random()-.5)*13,z=(random()-.5)*8;
    if(x*x+z*z<.7)continue;
    const a=new Vector3(x,bedHeight(x,z)+.018,z), angle=random()*6.283, len=.18+random()**2*1.3;
    const b=a.clone().add(new Vector3(len*Math.cos(angle),.03+random()*.07,len*Math.sin(angle)));
    const c=b.clone().add(new Vector3(.29*len*Math.cos(angle+.36),-.05,.29*len*Math.sin(angle+.36)));
    const width=.008+len*.021, bark=twigColors[i%3];
    tube(a,b,width,width*.68,bark,7);tube(b,c,width*.68,.004,bark,6);
  }
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new BufferAttribute(new Float32Array(vertices),3));
  geometry.setAttribute('color',new BufferAttribute(new Float32Array(colors),3));
  geometry.setIndex(faces); geometry.computeVertexNormals();
  const mesh=new Mesh(geometry,new MeshStandardMaterial({vertexColors:true,side:DoubleSide,roughness:.91}));
  mesh.castShadow=true; mesh.receiveShadow=true; mesh.layers.enable(1);
  return mesh;
}

export function createWoodland(scene,renderer) {
  const root=new Group(), fog=new FogExp2('#0e1613',.095);
  scene.fog=fog;
  const canopy=new Mesh(new SphereGeometry(1,40,18), new ShaderMaterial({
    side:BackSide, depthWrite:false, uniforms:{shade:{value:new Color()},lightColor:{value:new Color()}},
    vertexShader:`varying vec3 vRay; void main(){vRay=position;
      vec4 clip=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);gl_Position=clip.xyww;}`,
    fragmentShader:canopyFragment,
  }));
  canopy.frustumCulled=false; canopy.renderOrder=-10; root.add(canopy);
  const map=new TextureLoader().load(new URL('./assets/duff.webp',import.meta.url).href);
  map.wrapS=map.wrapT=MirroredRepeatWrapping; map.repeat.set(5.2,5.2);
  map.colorSpace=SRGBColorSpace; map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const earth=new MeshStandardMaterial({map,bumpMap:map,bumpScale:.027,roughness:.93,color:0xdcd9be});
  earth.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vBed;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBed=position;');
    shader.fragmentShader='varying vec3 vBed;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float pool=exp(-.10*dot(vBed.xz,vBed.xz));
      float dapple=.74+.26*sin(3.2*vBed.x+.7*sin(4.*vBed.z))*sin(2.*vBed.z+.8*vBed.x);
      float contact=.48+.52*smoothstep(.27,.81,length(vBed.xz));
      diffuseColor.rgb*=mix(.045,1.,pool)*dapple*contact;`);
  };
  const bed=new PlaneGeometry(28,28,192,192); bed.rotateX(-Math.PI/2);
  const pos=bed.getAttribute('position');
  for(let i=0;i<pos.count;i++) pos.setY(i,bedHeight(pos.getX(i),pos.getZ(i)));
  bed.computeVertexNormals();
  const ground=new Mesh(bed,earth); ground.receiveShadow=true; ground.layers.enable(1); root.add(ground);
  const litter=createLitter(); root.add(litter); scene.add(root);
  return {
    configure(settings) {
      const u=canopy.material.uniforms;
      u.shade.value.set(settings.studio.background);
      fog.color.copy(u.shade.value);
      u.lightColor.value.set(settings.lighting.directional.color)
        .multiplyScalar(settings.lighting.directional.enabled?settings.lighting.directional.intensity:0);
    },
    dispose(){map.dispose();root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});scene.remove(root);},
  };
}
