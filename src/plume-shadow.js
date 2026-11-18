import {
  AddEquation, Color, CustomBlending, HalfFloatType, LinearFilter, OneFactor,
  OrthographicCamera, Points, Scene, ShaderMaterial, Vector3, WebGLRenderTarget,
} from 'three';

// Four cumulative optical depths along a light ray, stored in RGBA.
// Additive splats allow independent particles to cast soft shadows on others.
export const shadowSpace = `
uniform vec3 lightOrigin, acrossLight, upLight, sunDir;
vec3 lightSpace(vec3 p) {
  vec3 d=p-lightOrigin;
  return vec3(dot(d,acrossLight)*.16+.5,dot(d,upLight)*.16+.5,dot(d,sunDir));
}
`;
export const shadowLookup = `
uniform sampler2D opticalDepth;
float transmittance(vec3 coord) {
  if(any(lessThan(coord.xy,vec2(0.))) || any(greaterThan(coord.xy,vec2(1.)))) return 1.;
  vec4 layers=texture2D(opticalDepth,coord.xy);
  float bin=clamp((coord.z+1.65)/1.10,0.,3.);
  int i=int(bin);
  float tau=mix(layers[i],layers[min(i+1,3)],fract(bin));
  return exp(-tau);
}
`;
const size = 256;
export function createPlumeShadow(geometry, shading) {
  const target = new WebGLRenderTarget(size,size,{type:HalfFloatType,minFilter:LinearFilter,magFilter:LinearFilter,depthBuffer:false});
  Object.assign(shading,{
    opticalDepth:{value:target.texture},lightOrigin:{value:new Vector3()},
    acrossLight:{value:new Vector3()},upLight:{value:new Vector3()},
  });
  const material = new ShaderMaterial({
    uniforms:shading, depthWrite:false, depthTest:false, transparent:true,
    blending:CustomBlending, blendEquation:AddEquation, blendSrc:OneFactor, blendDst:OneFactor,
    vertexShader:shadowSpace+`uniform sampler2D state;attribute vec2 slot;attribute vec4 grain;
      varying float z, opacity;
      void main(){
        vec4 p=texture2D(state,slot);
        if(p.w<0. || grain.x<.905){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=1.;return;}
        vec3 coord=lightSpace(p.xyz);
        gl_Position=vec4(coord.xy*2.-1.,0.,1.);
        float diameter=(.062+.32*(1.-exp(-1.65*p.w)))*(.68+.9*grain.y);
        gl_PointSize=max(1.,diameter*${size.toFixed(1)}*.16);
        z=coord.z;
        opacity=.20*smoothstep(0.,.055,p.w)*(1.-smoothstep(1.7,4.7,p.w));
      }`,
    fragmentShader:`varying float z,opacity;void main(){
      float r=length(gl_PointCoord*2.-1.);
      float density=opacity*(1.-smoothstep(.07,1.,r));
      vec4 planes=vec4(-1.65,-.55,.55,1.65);
      gl_FragColor=density*smoothstep(planes-.26,planes+.26,vec4(z));
    }`,
  });
  const scene=new Scene(), camera=new OrthographicCamera(), particles=new Points(geometry,material);
  particles.frustumCulled=false;scene.add(particles);
  const originalClear=new Color();
  return {
    render(renderer,mouth) {
      const dir=shading.sunDir.value, across=shading.acrossLight.value, up=shading.upLight.value;
      across.set(0,1,0);
      if(Math.abs(dir.y)>.98)across.set(1,0,0);
      across.cross(dir).normalize();up.crossVectors(dir,across);
      shading.lightOrigin.value.copy(mouth);shading.lightOrigin.value.y+=.92;
      const previous=renderer.getRenderTarget(), alpha=renderer.getClearAlpha();
      renderer.getClearColor(originalClear);
      renderer.setClearColor(0,0);renderer.setRenderTarget(target);
      renderer.clear();renderer.render(scene,camera);
      renderer.setRenderTarget(previous);renderer.setClearColor(originalClear,alpha);
    },
    dispose(){target.dispose();material.dispose();},
  };
}
