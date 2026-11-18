import { Vector2 } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Use the opaque beauty pass's depth attachment. The far sky already
// carries optical bokeh, so fine translucent dust against it stays sharp.
export function createMacroFocus(camera) {
  return new ShaderPass({
    uniforms: { tDiffuse:{value:null}, sceneDepth:{value:null}, nearClip:{value:camera.near},
      farClip:{value:camera.far}, subjectDistance:{value:6}, pixel:{value:new Vector2()} },
    vertexShader:`varying vec2 sampleUv;void main(){sampleUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform sampler2D tDiffuse,sceneDepth;
      uniform float nearClip,farClip,subjectDistance;uniform vec2 pixel;varying vec2 sampleUv;
      float depthAt(vec2 uv){float z=texture2D(sceneDepth,uv).x;
        return nearClip*farClip/(farClip-z*(farClip-nearClip));}
      void main(){
        vec2 uv=sampleUv; float depth=depthAt(uv);
        float coc=clamp(4.3*(abs(depth-subjectDistance)-.68)/max(depth,1.),0.,1.);
        if(depth>farClip*.94)coc=0.;
        vec3 color=texture2D(tDiffuse,uv).rgb;
        if(coc>.015){
          vec3 sum=color;float total=1.;
          for(int i=1;i<=16;i++){
            float k=float(i),a=k*2.39996;
            vec2 tap=uv+pixel*6.5*coc*sqrt(k/16.)*vec2(cos(a),sin(a));
            float z=depthAt(tap);
            float w=smoothstep(-.6,-.04,z-depth);
            sum+=texture2D(tDiffuse,tap).rgb*w;total+=w;
          }
          color=sum/total;
        }
        vec2 frame=uv-.5;
        color*=1.-.23*smoothstep(.07,.54,dot(frame,frame));
        gl_FragColor=vec4(color,1.);
      }`,
  });
}
