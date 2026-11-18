import { BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, Vector3 } from 'three';

// Slow transverse waves carry fine airborne dust across the backlit clearing.
// Near-camera flecks spread the same light over a wider, softer disc.
export function createAirborne(renderer) {
  const count = 1850;
  let seed = 78316;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const positions = new Float32Array(count * 3), grains = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    positions.set([(random() - .5) * 13, .2 + random() * 5.6, -5.8 + random() * 9.5], 3 * i);
    grains.set([random(), random()], 2 * i);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('grain', new BufferAttribute(grains, 2));
  const uniforms = { clock: {value: 0}, pixels: {value: 1}, key: {value: new Color()},
    fill: {value: new Color()}, sun: {value: new Vector3()} };
  const material = new ShaderMaterial({ uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      uniform float clock, pixels; uniform vec3 sun, key, fill;
      attribute vec2 grain; varying vec3 radiance; varying float opacity;
      void main(){
        vec3 p=position;
        // Recycle only the distant ends of the volume, outside the clearing.
        p.x=mod(p.x+6.5+clock*(.037+.044*grain.x),13.)-6.5;
        float phase=6.283*grain.y+.28*clock;
        p+=vec3(.23*sin(.7*p.y+phase),.20*sin(.95*p.x+phase)+.09*cos(p.z+.62*phase),
                .19*cos(.85*p.y+.42*p.x+phase));
        vec4 mv=modelViewMatrix*vec4(p,1.);
        float depth=max(.1,-mv.z);
        gl_Position=projectionMatrix*mv;
        float d=(.010+.026*pow(grain.x,3.))*pixels/depth;
        float blur=min(3.,abs(p.z-.3)*.50);
        gl_PointSize=clamp(d+blur,1.5,20.);
        float shaft=exp(-.14*pow(p.x+.45*p.y-.6,2.));
        float scatter=pow(max(0.,dot(normalize(cameraPosition-p),-sun)),2.);
        radiance=fill*.24+key*vec3(.92,.80,.59)*(.42+.83*scatter);
        opacity=(.23+.47*grain.y)*(.22+.78*shaft)*min(1.,d*d/(gl_PointSize*gl_PointSize));
      }`,
    fragmentShader: `
      varying vec3 radiance; varying float opacity;
      void main(){
        vec2 q=2.*gl_PointCoord-1.; float r=dot(q,q); if(r>1.) discard;
        gl_FragColor=vec4(radiance,opacity*exp(-2.4*r)*(1.-smoothstep(.60,1.,r)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points = new Points(geometry, material); points.frustumCulled = false; points.renderOrder = 1;
  return { points, count,
    update(time) { uniforms.clock.value = time; },
    resize(height, camera) { uniforms.pixels.value = .5 * height * renderer.getPixelRatio() * camera.projectionMatrix.elements[5]; },
    configure({directional, hemisphere, fill}) {
      uniforms.sun.value.set(directional.offsetX, directional.height, directional.offsetZ).normalize();
      uniforms.key.value.set(directional.color).multiplyScalar(directional.enabled ? directional.intensity : 0);
      uniforms.fill.value.set(hemisphere.skyColor).multiplyScalar(hemisphere.enabled ? hemisphere.intensity : 0);
      if (fill.enabled) uniforms.fill.value.add(new Color(fill.color).multiplyScalar(fill.intensity));
    },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
