// Local, deterministic scene assets. The controller owns time, rendering and input.
const PALETTE = { ink: 0x07101e, blue: 0x214b9e, cyan: 0x67eaff, ice: 0xeafbff, gold: 0xe2bb85, violet: 0x9568ff };

function random(seed = 29) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
}

function disposeGroup(group) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      for (const uniform of Object.values(material.uniforms || {})) if (uniform.value?.isTexture) textures.add(uniform.value);
    }
  });
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
  group.clear();
}

function mesh(THREE, group, geometry, material, position = [0, 0, 0]) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  group.add(object);
  return object;
}

function gasTexture(THREE) {
  const width = 768, height = 384, data = new Uint8Array(width * height * 4);
  const mix = (a, b, t) => a + (b - a) * t;
  const noise = (x, y, z) => Math.sin(x * 2.13 + Math.sin(z * 1.71)) * Math.cos(y * 2.37 + Math.sin(x * 1.37));
  for (let y = 0; y < height; y++) {
    const latitude = Math.PI * (y / (height - 1) - 0.5), sy = Math.sin(latitude), cy = Math.cos(latitude);
    for (let x = 0; x < width; x++) {
      const longitude = x / width * Math.PI * 2, sx = cy * Math.cos(longitude), sz = cy * Math.sin(longitude);
      let turbulence = 0, amplitude = 0.5, frequency = 2.7;
      for (let octave = 0; octave < 5; octave++) {
        turbulence += amplitude * noise(sx * frequency, sy * frequency, sz * frequency);
        frequency *= 2.03; amplitude *= 0.5;
      }
      const warp = sy * 48 + turbulence * 1.25;
      const broad = Math.sin(sy * 22 + turbulence * 0.7) * 0.5 + 0.5;
      const filament = Math.sin(warp * 4.8 + turbulence * 3) * 0.5 + 0.5;
      const highCloud = Math.pow(Math.max(0, Math.sin(warp * 1.6 + turbulence * 2.2)), 5);
      const brightness = 0.32 + broad * 0.28 + filament * 0.055 + highCloud * 0.105;
      const polar = Math.pow(Math.abs(sy), 7) * 0.35;
      const offset = (y * width + x) * 4;
      data[offset] = mix(12, 82, brightness) + polar * 20;
      data[offset + 1] = mix(28, 165, brightness) + polar * 18;
      data[offset + 2] = mix(69, 212, brightness);
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function glow(THREE, color, strength = 0.65) {
  return new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(color) }, strength: { value: strength } },
    vertexShader: `varying vec3 vNormal; varying vec3 vView;
      void main() { vec4 view = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal); vView = -view.xyz;
        gl_Position = projectionMatrix * view; }`,
    fragmentShader: `uniform vec3 tint; uniform float strength; varying vec3 vNormal; varying vec3 vView;
      void main() { float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.3);
        gl_FragColor = vec4(tint, rim * strength); }`,
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending
  });
}

function atmosphere(THREE) {
  return new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vNormal; varying vec3 vView; varying vec3 vWorldNormal;
      void main() { vec4 view = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal); vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vView = -view.xyz; gl_Position = projectionMatrix * view; }`,
    fragmentShader: `varying vec3 vNormal; varying vec3 vView; varying vec3 vWorldNormal;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float limb = exp(-pow((facing - 0.24) / 0.17, 2.0)) * smoothstep(0.0, 0.13, facing);
        float sunlight = max(0.0, dot(normalize(vWorldNormal), normalize(vec3(-4.5, 3.0, 3.0))));
        vec3 tint = mix(vec3(0.15, 0.3, 0.7), vec3(0.34, 0.73, 0.95), sunlight);
        gl_FragColor = vec4(tint, limb * (0.07 + sunlight * 0.58));
      }`,
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending
  });
}

function particles(THREE, positions, colors, size) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { size: { value: size } }, vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float size; varying vec3 vColor;
      void main() { vColor = color; vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(size / max(0.1, -view.z), 1.0, 4.0); gl_Position = projectionMatrix * view; }`,
    fragmentShader: `varying vec3 vColor; void main() { float r = length(gl_PointCoord - 0.5) * 2.0;
      if (r > 1.0) discard; gl_FragColor = vec4(vColor, pow(1.0 - r, 1.5) * 0.8); }`
  });
  return new THREE.Points(geometry, material);
}

export function createExterior(THREE) {
  const group = new THREE.Group();
  group.name = 'Ringed world';
  const axis = new THREE.Group();
  group.add(axis);
  const planet = mesh(THREE, axis, new THREE.SphereGeometry(1.5, 80, 48), new THREE.MeshStandardMaterial({
    map: gasTexture(THREE), roughness: 0.95, metalness: 0.02, emissive: 0x071329, emissiveIntensity: 0.2
  }));
  planet.name = 'Enter the planet';
  mesh(THREE, axis, new THREE.SphereGeometry(1.56, 64, 40), atmosphere(THREE));

  const rings = new THREE.Group();
  rings.rotation.set(1.18, -0.36, 0);
  axis.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1).applyEuler(rings.rotation));
  group.add(rings);
  const ringMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vLocal; varying vec3 vWorld;
      void main() { vLocal = position; vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz; gl_Position = projectionMatrix * viewMatrix * world; }`,
    fragmentShader: `varying vec3 vLocal; varying vec3 vWorld;
      void main() {
        float r = length(vLocal.xy); float t = (r - 1.82) / 1.18;
        float striation = sin(r * 287.0) * 0.07 + sin(r * 91.0) * 0.1 + sin(r * 617.0) * 0.04;
        float gap = 1.0 - smoothstep(0.022, 0.038, abs(r - 2.48));
        float density = (0.53 + striation) * (1.0 - gap * 0.92);
        density *= smoothstep(0.0, 0.07, t) * (1.0 - smoothstep(0.87, 1.0, t));
        vec3 dust = mix(vec3(0.37, 0.56, 0.68), vec3(0.88, 0.72, 0.49), smoothstep(0.12, 0.8, t));
        vec3 sun = normalize(vec3(-4.5, 3.0, 3.0)); float ray = dot(-vWorld, sun);
        float clearance = length(vWorld + sun * max(0.0, ray));
        float shadow = mix(0.16, 1.0, smoothstep(1.46, 1.62, clearance));
        gl_FragColor = vec4(dust * shadow * (0.84 + striation), density * 0.95);
      }`
  });
  mesh(THREE, rings, new THREE.RingGeometry(1.82, 3, 192), ringMaterial);
  const rand = random(813), positions = [], colors = [];
  for (let i = 0; i < 1700; i++) {
    const angle = rand() * Math.PI * 2, radius = 1.88 + rand() * 1.1;
    positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, (rand() - 0.5) * 0.016);
    const light = 0.45 + rand() * 0.35;
    colors.push(light, light * 0.83, light * 0.61);
  }
  const dust = particles(THREE, positions, colors, 10);
  rings.add(dust);
  const asteroids = new THREE.Group();
  asteroids.name = 'Orbiting asteroids';
  rings.add(asteroids);
  const rockGeometry = new THREE.IcosahedronGeometry(1, 0);
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x9b9182, roughness: 1 });
  for (let i = 0; i < 48; i++) {
    const angle = rand() * Math.PI * 2, radius = 2.65 + rand() * 0.42;
    const rock = mesh(THREE, asteroids, rockGeometry, rockMaterial,
      [Math.cos(angle) * radius, Math.sin(angle) * radius, (rand() - 0.5) * 0.18]);
    const size = 0.018 + rand() * 0.035;
    rock.scale.set(size, size * (0.6 + rand() * 0.7), size * 0.7);
    rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
  }
  const sunlight = new THREE.DirectionalLight(0xffe2bb, 2.7);
  sunlight.position.set(-4.5, 3, 3);
  group.add(sunlight, new THREE.HemisphereLight(0x628bda, 0x02040c, 0.32));
  const edgeLight = new THREE.DirectionalLight(0x2767db, 0.35);
  edgeLight.position.set(3, -1, -3);
  group.add(edgeLight);
  return { group, planet, update(time) { planet.rotation.y = time * 0.025; dust.rotation.z = time * 0.008; asteroids.rotation.z = time * 0.045; }, dispose() { disposeGroup(group); } };
}

export function createInterior(THREE) {
  const group = new THREE.Group();
  group.name = 'Planetary observatory';
  const metal = new THREE.MeshStandardMaterial({ color: 0x132e49, roughness: 0.39, metalness: 0.78 });
  const dark = new THREE.MeshStandardMaterial({ color: PALETTE.ink, roughness: 0.65, metalness: 0.5 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x759ba6, roughness: 0.32, metalness: 0.83 });
  const signal = color => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.1, metalness: 0.2, roughness: 0.28 });
  const cyan = signal(PALETTE.cyan), gold = signal(PALETTE.gold), violet = signal(PALETTE.violet);
  const torus = (parent, radius, tube, material, position, rotation = [Math.PI / 2, 0, 0]) => {
    const object = mesh(THREE, parent, new THREE.TorusGeometry(radius, tube, 8, 96), material, position);
    object.rotation.set(...rotation);
    return object;
  };
  const dome = mesh(THREE, group, new THREE.SphereGeometry(24, 48, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vDirection; void main() { vDirection = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vDirection;
      void main() {
        vec3 d = normalize(vDirection); float longitude = atan(d.z, d.x); float latitude = asin(d.y);
        float mist = sin(longitude * 3.0 + latitude * 4.0) * sin(longitude * 5.0 - latitude * 2.0) * 0.5 + 0.5;
        float horizon = pow(max(0.0, 1.0 - abs(d.y + 0.08)), 5.0);
        float ribs = pow(max(0.0, cos(longitude * 18.0)), 180.0);
        float parallels = pow(max(0.0, cos(latitude * 16.0)), 180.0);
        vec3 color = mix(vec3(0.004, 0.009, 0.025), vec3(0.018, 0.048, 0.087), horizon * (0.4 + mist * 0.6));
        color += vec3(0.015, 0.058, 0.075) * (ribs + parallels * 0.55) * (0.25 + horizon * 0.75);
        color += vec3(0.028, 0.012, 0.05) * pow(mist, 4.0) * (1.0 - horizon);
        gl_FragColor = vec4(color, 1.0);
      }`
  }));
  dome.name = 'Enclosed atmospheric shell';

  const rand = random(218), starsPosition = [], starsColor = [];
  for (let i = 0; i < 1050; i++) {
    const azimuth = rand() * Math.PI * 2, elevation = rand() * 2 - 1, radius = 15 + rand() * 7;
    const radial = Math.sqrt(1 - elevation * elevation) * radius;
    starsPosition.push(Math.cos(azimuth) * radial, elevation * radius, Math.sin(azimuth) * radial);
    const intensity = 0.3 + rand() * 0.7;
    starsColor.push(intensity * 0.55, intensity * 0.78, intensity);
  }
  group.add(particles(THREE, starsPosition, starsColor, 31));

  const armillary = new THREE.Group();
  group.add(armillary);
  const core = mesh(THREE, armillary, new THREE.IcosahedronGeometry(0.66, 4), new THREE.MeshStandardMaterial({
    color: 0xb5f6ff, emissive: 0x50bfe4, emissiveIntensity: 2.9, roughness: 0.2, metalness: 0.15
  }), [0, 0.2, 0]);
  mesh(THREE, core, new THREE.SphereGeometry(0.88, 40, 24), glow(THREE, PALETTE.cyan, 0.6));
  const coreLattice = mesh(THREE, core, new THREE.IcosahedronGeometry(0.79, 1), new THREE.MeshBasicMaterial({
    color: PALETTE.ice, wireframe: true, transparent: true, opacity: 0.26
  }));
  const gimbals = [
    torus(armillary, 1.17, 0.027, gold, [0, 0.2, 0], [0.55, 0.15, 0.2]),
    torus(armillary, 1.48, 0.021, trim, [0, 0.2, 0], [1.18, 0.55, 0]),
    torus(armillary, 1.72, 0.009, cyan, [0, 0.2, 0], [0.8, -0.6, -0.3])
  ];
  const pedestal = mesh(THREE, group, new THREE.CylinderGeometry(0.88, 1.18, 0.24, 48), metal, [0, -1.53, 0]);
  torus(pedestal, 0.86, 0.018, cyan, [0, 0.13, 0]);
  mesh(THREE, group, new THREE.CylinderGeometry(0.52, 0.75, 0.46, 32), dark, [0, -1.27, 0]);
  torus(group, 0.52, 0.016, gold, [0, -1.02, 0]);
  const beam = mesh(THREE, group, new THREE.CylinderGeometry(0.075, 0.21, 0.96, 24, 1, true), new THREE.MeshBasicMaterial({
    color: PALETTE.cyan, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  }), [0, -0.62, 0]);
  torus(group, 4.54, 0.026, metal, [0, -1.62, 0]);
  torus(group, 4.49, 0.009, cyan, [0, -1.6, 0]);
  torus(group, 2.43, 0.012, trim, [0, -1.67, 0]);
  for (let i = 0; i < 24; i++) {
    const angle = i * Math.PI / 12;
    const marker = mesh(THREE, group, new THREE.BoxGeometry(0.025, 0.018, i % 3 === 0 ? 0.23 : 0.1), i % 3 === 0 ? gold : trim,
      [Math.sin(angle) * 4.34, -1.61, Math.cos(angle) * 4.34]);
    marker.rotation.y = angle;
  }

  const nodes = [], floats = [];
  const nodeSpecs = [
    { id: 'archives', at: [-3.25, -0.42, 0.35], color: PALETTE.cyan, material: cyan },
    { id: 'latest', at: [0.45, 0.28, -3.32], color: PALETTE.gold, material: gold },
    { id: 'games', at: [3.14, -0.25, 0.85], color: PALETTE.violet, material: violet }
  ];
  nodeSpecs.forEach((spec, index) => {
    const platform = new THREE.Group();
    platform.position.set(...spec.at);
    group.add(platform);
    floats.push({ object: platform, y: spec.at[1], phase: index * 2.1 });
    mesh(THREE, platform, new THREE.CylinderGeometry(0.76, 0.48, 0.2, 6), metal, [0, -0.67, 0]);
    mesh(THREE, platform, new THREE.CylinderGeometry(0.48, 0.1, 0.31, 6), dark, [0, -0.91, 0]);
    torus(platform, 0.59, 0.019, spec.material, [0, -0.55, 0]);
    torus(platform, 0.44, 0.009, spec.material, [0, -1.04, 0]);
    const geometry = index === 0 ? new THREE.CylinderGeometry(0.26, 0.36, 0.76, 6)
      : index === 1 ? new THREE.IcosahedronGeometry(0.43, 1) : new THREE.OctahedronGeometry(0.5, 0);
    const target = mesh(THREE, platform, geometry, new THREE.MeshStandardMaterial({
      color: spec.color, emissive: spec.color, emissiveIntensity: 0.62, metalness: 0.55, roughness: 0.28
    }), [0, 0.04, 0]);
    target.name = spec.id;
    target.userData.nodeId = spec.id;
    nodes.push({ object: target, id: spec.id });
    if (index === 0) {
      for (const side of [-1, 1]) {
        mesh(THREE, platform, new THREE.BoxGeometry(0.14, 0.61, 0.32), trim, [side * 0.4, -0.04, 0]);
        mesh(THREE, platform, new THREE.BoxGeometry(0.018, 0.47, 0.34), spec.material, [side * 0.48, -0.02, 0]);
      }
    } else if (index === 1) {
      torus(platform, 0.59, 0.016, gold, [0, 0.05, 0], [0.45, 0, 0.2]);
      torus(platform, 0.68, 0.01, trim, [0, 0.05, 0], [1.1, -0.3, 0]);
    } else {
      const cage = mesh(THREE, platform, new THREE.OctahedronGeometry(0.69), new THREE.MeshBasicMaterial({
        color: PALETTE.violet, wireframe: true, transparent: true, opacity: 0.46
      }), [0, 0.04, 0]);
      cage.rotation.y = Math.PI / 4;
    }
    const connection = new THREE.CatmullRomCurve3([
      new THREE.Vector3(spec.at[0] * 0.25, -1.53, spec.at[2] * 0.25),
      new THREE.Vector3(spec.at[0] * 0.6, -1.73, spec.at[2] * 0.6),
      new THREE.Vector3(spec.at[0], spec.at[1] - 1.08, spec.at[2])
    ]);
    mesh(THREE, group, new THREE.TubeGeometry(connection, 24, 0.008, 4, false), spec.material);
  });

  const motePositions = [], moteColors = [];
  for (let i = 0; i < 360; i++) {
    const angle = rand() * Math.PI * 2, radius = 1.1 + rand() * 2.9;
    motePositions.push(Math.cos(angle) * radius, (rand() - 0.5) * 3.3, Math.sin(angle) * radius);
    moteColors.push(0.24, 0.68, 0.85);
  }
  const motes = particles(THREE, motePositions, moteColors, 13);
  group.add(motes, new THREE.HemisphereLight(0x629ccc, 0x111126, 2.0));
  const coreLight = new THREE.PointLight(PALETTE.cyan, 18, 12, 2);
  coreLight.position.set(0, 1, 0);
  const warmLight = new THREE.DirectionalLight(PALETTE.gold, 1.5);
  warmLight.position.set(-4, 5, 3);
  const fillLight = new THREE.DirectionalLight(0x3868d8, 1.2);
  fillLight.position.set(2, 1, -4);
  group.add(coreLight, warmLight, fillLight);
  return {
    group, nodes,
    update(time) {
      coreLattice.rotation.set(time * 0.06, time * 0.09, 0);
      core.scale.setScalar(1 + Math.sin(time * 0.9) * 0.018);
      gimbals[0].rotation.y = 0.15 + time * 0.06;
      gimbals[1].rotation.z = time * -0.035;
      gimbals[2].rotation.y = -0.6 + time * 0.025;
      motes.rotation.y = time * 0.015;
      beam.material.opacity = 0.12 + Math.sin(time * 0.9) * 0.025;
      floats.forEach(({ object, y, phase }) => { object.position.y = y + Math.sin(time * 0.65 + phase) * 0.055; });
      nodes.forEach(({ object }, index) => { object.rotation.y = time * (index === 2 ? 0.18 : 0.1); });
    },
    dispose() { disposeGroup(group); }
  };
}
