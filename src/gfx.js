// Visual layer: sky, water, lava, grass, wind, ambient particles, post-processing.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { H, slope, smooth, VOLCANO, PLATEAU_EDGE, tunnelInfo, isLagoon, OCEAN_R, fbm } from './terrain.js';

export const SUN_DIR = new THREE.Vector3(0.55, 0.62, 0.36).normalize();
export const SKY = { zenith: new THREE.Color(0x2f6fd0), horizon: new THREE.Color(0xbfe0f5), sun: new THREE.Color(0xfff1c8) };
export const shared = { time: { value: 0 }, wind: { value: new THREE.Vector2(1, 0.4) } };

const NOISE_GLSL = /* glsl */`
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
float fbm3(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=.5; } return s; }
`;

// ---------------------------------------------------------------- Sky
export function createSky(scene) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTime: shared.time, uSun: { value: SUN_DIR }, uZen: { value: SKY.zenith }, uHor: { value: SKY.horizon }, uSunCol: { value: SKY.sun },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uSun, uZen, uHor, uSunCol; varying vec3 vDir;
      ${NOISE_GLSL}
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.);
        vec3 col = mix(uHor, uZen, pow(h, .55));
        col = mix(col, uHor*vec3(1.05,1.0,.95), smoothstep(.0,-.08,d.y)); // below horizon haze
        float sd = max(dot(d, uSun), 0.);
        col += uSunCol * (pow(sd, 900.)*6. + pow(sd, 18.)*.35 + pow(sd,3.)*.08);
        // painterly clouds on a dome
        if (d.y > 0.02) {
          vec2 uv = d.xz / (d.y + .18) * 1.3 + vec2(uTime*.006, uTime*.002);
          float c = fbm3(uv*1.4) ; c = smoothstep(.52, .8, c);
          float lit = .75 + .25*dot(normalize(vec3(uv,1.)), uSun);
          vec3 cc = mix(vec3(.82,.86,.95), vec3(1.), lit) + uSunCol*pow(sd,6.)*.4;
          col = mix(col, cc, c * smoothstep(.02,.25,d.y) * .9);
        }
        gl_FragColor = vec4(col, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
  sky.frustumCulled = false; sky.renderOrder = -1;
  scene.add(sky);
  return sky;
}

// Environment map for PBR ambient light
export function makeEnvironment(renderer) {
  const envScene = new THREE.Scene();
  const s = createSky(envScene);
  s.scale.setScalar(0.01);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(20, 16), new THREE.MeshBasicMaterial({ color: 0x4a6a3a }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.5; envScene.add(ground);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(envScene, 0.02);
  pm.dispose();
  return rt.texture;
}

// ---------------------------------------------------------------- Heightmap texture (for water depth/foam)
export const HMAP = { size: 620, res: 512, min: -12, max: 20 };
export function heightTexture() {
  const n = HMAP.res, data = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * HMAP.size, z = (j / (n - 1) - 0.5) * HMAP.size;
    const h = H(x, z);
    data[j * n + i] = Math.max(0, Math.min(255, ((h - HMAP.min) / (HMAP.max - HMAP.min)) * 255));
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- Water
export function createWaterMaterial(hTex, level) {
  return new THREE.ShaderMaterial({
    transparent: true, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uSun: { value: SUN_DIR }, uH: { value: null }, uLevel: { value: level },
      uDeep: { value: new THREE.Color(0x0b4a7a) }, uShallow: { value: new THREE.Color(0x3fd6d0) }, uSky: { value: SKY.horizon },
      uSunCol: { value: SKY.sun },
    }]),
    vertexShader: /* glsl */`
      uniform float uTime; varying vec3 vW; varying vec3 vView;
      #include <fog_pars_vertex>
      void main(){
        vec4 w = modelMatrix * vec4(position,1.);
        w.y += sin(w.x*.08 + uTime*1.1)*.12 + cos(w.z*.07 + uTime*.9)*.12;
        vW = w.xyz; vView = cameraPosition - w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uLevel; uniform vec3 uSun, uDeep, uShallow, uSky, uSunCol; uniform sampler2D uH;
      varying vec3 vW; varying vec3 vView;
      #include <fog_pars_fragment>
      ${NOISE_GLSL}
      float waves(vec2 p){ return fbm3(p*.25 + vec2(uTime*.12, uTime*.07)) + .5*fbm3(p*.6 - vec2(uTime*.18, -uTime*.1)); }
      void main(){
        vec2 p = vW.xz;
        float e = .35;
        float h0 = waves(p), hx = waves(p+vec2(e,0.)), hz = waves(p+vec2(0.,e));
        vec3 n = normalize(vec3((h0-hx)*2.2, 1., (h0-hz)*2.2));
        vec3 v = normalize(vView);
        float fres = pow(1. - max(dot(n, v), 0.), 4.);
        vec2 uv = p / ${HMAP.size.toFixed(1)} + .5;
        float th = mix(${HMAP.min.toFixed(1)}, ${HMAP.max.toFixed(1)}, texture2D(uH, uv).r);
        bool inside = uv.x > 0. && uv.x < 1. && uv.y > 0. && uv.y < 1.;
        float depth = inside ? max(uLevel - th, 0.) : 12.;
        vec3 col = mix(uShallow, uDeep, smoothstep(.2, 7., depth));
        col = mix(col, uSky*1.1, fres*.65);
        vec3 r = reflect(-v, n);
        col += uSunCol * pow(max(dot(r, uSun), 0.), 180.) * 2.2;
        // shoreline foam bands
        float foam = smoothstep(1.1, 0., depth) * (.55 + .45*sin(depth*9. - uTime*2.5 + fbm3(p*.5)*6.));
        foam *= smoothstep(.35, .7, fbm3(p*1.3 + uTime*.2));
        col = mix(col, vec3(1.), clamp(foam, 0., 1.)*.85 + smoothstep(.25,0.,depth)*.6);
        float a = mix(.62, .93, smoothstep(0., 4., depth)) ;
        a = max(a, fres*.9);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

// ---------------------------------------------------------------- Lava
export function createLavaMaterial() {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: /* glsl */`
      uniform float uTime; varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix*vec4(position,1.); w.y += sin(w.x*.2+uTime)*.08; vW=w.xyz;
        vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec3 vW;
      #include <fog_pars_fragment>
      ${NOISE_GLSL}
      void main(){
        vec2 p = vW.xz*.09;
        vec2 q = vec2(fbm3(p + uTime*.05), fbm3(p + vec2(5.2,1.3) - uTime*.04));
        float f = fbm3(p*1.8 + q*2.5 + uTime*.03);
        float crust = smoothstep(.42, .62, f);
        vec3 hot = mix(vec3(.9,.18,.02), vec3(1.5,.6,.1), smoothstep(.1,.45,f) * (1.-crust));
        vec3 col = mix(hot, vec3(.12,.05,.04), crust*.92);
        col += vec3(.5,.12,.0) * pow(1.-crust, 3.) * (.6+.4*sin(uTime*2.+f*20.));
        gl_FragColor = vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

// ---------------------------------------------------------------- Wind (patch any material)
export function windify(material, { strength = 0.35, heightScale = 0.08, instanced = true } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 wp = ${instanced ? 'modelMatrix * instanceMatrix' : 'modelMatrix'} * vec4(position, 1.0);
          float k = max(position.y, 0.) * ${heightScale.toFixed(3)};
          float ph = wp.x * .05 + wp.z * .04;
          transformed.x += sin(uTime * 1.6 + ph) * ${strength.toFixed(3)} * k;
          transformed.z += cos(uTime * 1.3 + ph * 1.3) * ${strength.toFixed(3)} * k * .7;
        }`);
  };
  material.customProgramCacheKey = () => 'wind' + strength + heightScale + instanced;
  return material;
}

// Terrain: add fine procedural detail & macro variation on top of vertex colours
export function terrainMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\n' + NOISE_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float macro = fbm3(vWPos.xz * .015);
          float micro = vnoise(vWPos.xz * 1.7) * .5 + vnoise(vWPos.xz * 4.1) * .5;
          float strata = vnoise(vec2(vWPos.y * 1.5, (vWPos.x + vWPos.z) * .08));
          vec3 N = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
          float steep = 1. - N.y;
          diffuseColor.rgb *= .82 + macro * .32;
          diffuseColor.rgb *= .9 + micro * .2;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (.75 + strata * .45), smoothstep(.25, .5, steep));
        }`);
  };
  m.customProgramCacheKey = () => 'terrain-detail';
  return m;
}

// ---------------------------------------------------------------- Grass (follows the player)
export class Grass {
  constructor(scene, count) {
    this.count = count;
    const g = new THREE.BufferGeometry();
    // 3 crossed tapered blades per instance
    const pos = [], col = [];
    for (let b = 0; b < 3; b++) {
      const a = (b / 3) * Math.PI + 0.3, ox = Math.cos(a) * 0.12, oz = Math.sin(a) * 0.12;
      const w = 0.07, h = 0.45 + b * 0.1, lean = 0.1 * (b - 1);
      const dx = Math.cos(a + 1.57) * w, dz = Math.sin(a + 1.57) * w;
      const v = [
        [ox - dx, 0, oz - dz], [ox + dx, 0, oz + dz], [ox + dx * 0.5 + lean, h * 0.55, oz + dz * 0.5],
        [ox - dx, 0, oz - dz], [ox + dx * 0.5 + lean, h * 0.55, oz + dz * 0.5], [ox - dx * 0.5 + lean, h * 0.55, oz - dz * 0.5],
        [ox - dx * 0.5 + lean, h * 0.55, oz - dz * 0.5], [ox + dx * 0.5 + lean, h * 0.55, oz + dz * 0.5], [ox + lean * 2, h, oz],
      ];
      const tri = (arr) => { for (const p of arr) { pos.push(...p); const t = p[1] / h; col.push(0.62 + t * 0.45, 0.62 + t * 0.45, 0.62 + t * 0.45); } };
      tri(v);
      // back faces as real geometry so both sides get the same upward normal
      const back = [];
      for (let k = 0; k < v.length; k += 3) back.push(v[k], v[k + 2], v[k + 1]);
      tri(back);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    windify(m, { strength: 0.35, heightScale: 1.0 });
    // point normals up for soft, uniform lighting
    const nrm = g.attributes.normal;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    this.mesh = new THREE.InstancedMesh(g, m, count);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this.cx = 1e9; this.cz = 1e9;
    this.radius = Math.sqrt(count) * 0.62;
  }
  static grassy(x, z, h) {
    if (h < 0.4) return 0;
    if (Math.hypot(x - VOLCANO.x, z - VOLCANO.z) < 92) return 0;
    if (z < PLATEAU_EDGE - 4 && fbm(x * 0.1, z * 0.1) < 0.45) return 0;
    if (slope(x, z).m > 0.75) return 0;
    if (tunnelInfo(x, z).d < 5.5) return 0;
    if (isLagoon(x, z)) return 0;
    if (Math.hypot(x, z) > OCEAN_R - 14) return 0;
    return 1;
  }
  update(px, pz) {
    if (Math.hypot(px - this.cx, pz - this.cz) < this.radius * 0.25) return;
    this.cx = Math.round(px / 4) * 4; this.cz = Math.round(pz / 4) * 4;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    const side = Math.ceil(Math.sqrt(this.count * 1.35));
    const cell = (this.radius * 2) / side;
    let n = 0;
    for (let j = 0; j < side && n < this.count; j++) for (let i = 0; i < side && n < this.count; i++) {
      const gx = Math.floor(this.cx / cell) + i - (side >> 1), gz = Math.floor(this.cz / cell) + j - (side >> 1);
      const r1 = hash(gx, gz), r2 = hash(gz + 17, gx - 3), r3 = hash(gx * 3, gz * 7);
      const x = (gx + r1) * cell, z = (gz + r2) * cell;
      const d = Math.hypot(x - this.cx, z - this.cz);
      if (d > this.radius) continue;
      const h = H(x, z);
      const ok = Grass.grassy(x, z, h);
      if (!ok) continue;
      const jungle = smooth(-50, -90, x);
      const sc = (0.7 + r3 * 0.6) * (1 + jungle * 0.5) * Math.min(1, (this.radius - d) / 6 + 0.3);
      q.setFromAxisAngle(up, r1 * 6.28);
      m.compose(v.set(x, h - 0.05, z), q, s.set(sc, sc * (0.8 + r2 * 0.6), sc));
      this.mesh.setMatrixAt(n, m);
      const base = z < PLATEAU_EDGE - 4 ? 0xb8c860 : (jungle > 0.5 ? 0x3a9a3a : 0x7ac84a);
      c.set(base).offsetHSL((r2 - 0.5) * 0.05, 0, (r3 - 0.5) * 0.12);
      this.mesh.setColorAt(n, c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }

// ---------------------------------------------------------------- Flowers & bushes (static decoration)
export function scatterFlora(scene, count, rng, okFn) {
  const flowerGeo = new THREE.IcosahedronGeometry(0.14, 0); flowerGeo.scale(1, 0.6, 1); flowerGeo.translate(0, 0.42, 0);
  const stemGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 3); stemGeo.translate(0, 0.2, 0);
  const petals = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true }), count);
  const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshStandardMaterial({ color: 0x3a8a2a }), count);
  const bushGeo = new THREE.IcosahedronGeometry(1, 1);
  const bushes = new THREE.InstancedMesh(bushGeo, windify(new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), { strength: 0.15, heightScale: 0.6 }), Math.floor(count / 2));
  bushes.castShadow = true; bushes.receiveShadow = true;
  const cols = [0xff4a6a, 0xffc82a, 0xf0e8ff, 0xa06aff, 0xff7a2a];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  let nf = 0, nb = 0;
  for (let i = 0; i < count * 6 && (nf < count || nb < bushes.count); i++) {
    const x = -280 + rng() * 560, z = -280 + rng() * 560;
    const h = H(x, z);
    if (!Grass.grassy(x, z, h) || !okFn(x, z)) continue;
    if (rng() < 0.5 && nf < count) {
      const cluster = 1 + Math.floor(rng() * 4);
      const col = cols[Math.floor(rng() * cols.length)];
      for (let k = 0; k < cluster && nf < count; k++) {
        const fx = x + (rng() - 0.5) * 2, fz = z + (rng() - 0.5) * 2;
        const sc = 0.7 + rng() * 0.6;
        m.compose(v.set(fx, H(fx, fz), fz), q.identity(), s.set(sc, sc, sc));
        petals.setMatrixAt(nf, m); stems.setMatrixAt(nf, m);
        petals.setColorAt(nf, c.set(col)); nf++;
      }
    } else if (nb < bushes.count) {
      const sc = 0.45 + rng() * 0.6;
      m.compose(v.set(x, h + sc * 0.3, z), q.setFromEuler(new THREE.Euler(0, rng() * 6, 0)), s.set(sc * 1.3, sc * 0.9, sc * 1.3));
      bushes.setMatrixAt(nb, m);
      const jungle = smooth(-50, -90, x);
      bushes.setColorAt(nb, c.set(jungle > 0.5 ? 0x2a7a32 : 0x4a9a3a).offsetHSL((rng() - 0.5) * 0.05, 0, (rng() - 0.5) * 0.1));
      nb++;
    }
  }
  petals.count = stems.count = nf; bushes.count = nb;
  scene.add(petals, stems, bushes);
}

// ---------------------------------------------------------------- Ambient particles (fireflies, pollen, embers)
export class Ambient {
  constructor(scene, count) {
    this.count = count;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.seed = new Float32Array(count);
    for (let i = 0; i < count; i++) this.seed[i] = Math.random() * 100;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const tex = glowTexture();
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.28, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.home = [];
    for (let i = 0; i < count; i++) this.home.push({ x: 0, y: 0, z: 0, set: false });
  }
  update(t, px, py, pz) {
    const R = 28;
    const c = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      const h = this.home[i];
      if (!h.set || Math.abs(h.x - px) > R || Math.abs(h.z - pz) > R) {
        h.x = px + (Math.random() * 2 - 1) * R; h.z = pz + (Math.random() * 2 - 1) * R;
        h.set = true;
        const dv = Math.hypot(h.x - VOLCANO.x, h.z - VOLCANO.z);
        const tun = tunnelInfo(h.x, h.z).d < 5 && py < H(h.x + 30, h.z) - 2;
        h.kind = dv < 70 ? 'ember' : (h.x < -60 ? 'firefly' : 'pollen');
        h.y = (tun ? py : H(h.x, h.z)) + 0.5 + Math.random() * (h.kind === 'ember' ? 2 : 5);
        if (h.kind === 'ember') c.setRGB(3, 0.9, 0.2);
        else if (h.kind === 'firefly') c.setRGB(1.6, 2.4, 0.5);
        else c.setRGB(0.55, 0.52, 0.4);
        this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
      }
      const s = this.seed[i];
      if (h.kind === 'ember') { h.y += 0.02; if (h.y > py + 14) h.set = false; }
      const blink = h.kind === 'firefly' ? (0.5 + 0.5 * Math.sin(t * 3 + s * 7)) : 1;
      this.pos[i * 3] = h.x + Math.sin(t * 0.7 + s) * 0.8;
      this.pos[i * 3 + 1] = h.y + Math.sin(t * 1.1 + s * 2) * 0.4 - (1 - blink) * 1000;
      this.pos[i * 3 + 2] = h.z + Math.cos(t * 0.6 + s) * 0.8;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
export function glowTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x = cv.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- Post-processing
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.28 }, uSat: { value: 1.12 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uVig, uSat; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(.299,.587,.114));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb *= vec3(1.02, 1.0, .97);
      vec2 d = vUv - .5; c.rgb *= 1. - dot(d,d) * uVig * 2.2;
      gl_FragColor = c;
    }`,
};
export function createComposer(renderer, scene, camera, tier) {
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: tier === 'high' ? 4 : 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), tier === 'high' ? 0.55 : 0.45, 0.5, 1.0);
  composer.addPass(bloom);
  composer.addPass(new ShaderPass(GradeShader));
  composer.addPass(new OutputPass());
  composer.bloom = bloom;
  return composer;
}
