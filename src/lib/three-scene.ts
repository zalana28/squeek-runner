import * as THREE from 'three';
import {
  GAME_WIDTH, GAME_HEIGHT, PLAYER_SIZE, ROAD_TOP, ROAD_HEIGHT,
  WATER_TOP, WATER_HEIGHT, FLOWERS, TUFTS, COIN_PATH,
} from './world.js';
import type {
  Car, Firefly, Hamster, LilyPad, Particle, WaterSparkle,
} from './world.js';

const PX = 0.05;
const toX = (px: number) => (px - GAME_WIDTH / 2) * PX;
const toZ = (py: number) => (py - GAME_HEIGHT / 2) * PX;
const toSize = (px: number) => px * PX;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const HAMSTER_VISUAL_SCALE = 0.58;

type MaterialOptions = {
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  transparent?: boolean;
  map?: THREE.Texture | null;
};

export type SceneSnapshot = {
  hamster: Hamster;
  cars: Car[];
  particles: Particle[];
  fireflies: Firefly[];
  waterSparkles: WaterSparkle[];
  lilyPads: LilyPad[];
  pace: number;
  dashActive: boolean;
  surgeActive: boolean;
  effectHit: number;
  effectSuccess: number;
  gameplayActive: boolean;
};

export type WorldScene = {
  render(snapshot: SceneSnapshot, time: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
};

type CarInstance = {
  group: THREE.Group;
  wheels: THREE.Mesh[];
  headlightMaterial: THREE.MeshPhongMaterial;
};

function shortestAngle(from: number, to: number, amount: number) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * amount;
}

export function createWorldScene(canvas: HTMLCanvasElement): WorldScene {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  const boxCache = new Map<string, THREE.BoxGeometry>();
  const sphereCache = new Map<string, THREE.SphereGeometry>();
  const cylinderCache = new Map<string, THREE.CylinderGeometry>();
  const materialCache = new Map<string, THREE.MeshPhongMaterial>();

  function box(width: number, height: number, depth: number) {
    const key = `${width.toFixed(3)}:${height.toFixed(3)}:${depth.toFixed(3)}`;
    const existing = boxCache.get(key);
    if (existing) return existing;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    geometries.add(geometry);
    boxCache.set(key, geometry);
    return geometry;
  }

  function sphere(radius: number, detail = 18) {
    const key = `${radius.toFixed(3)}:${detail}`;
    const existing = sphereCache.get(key);
    if (existing) return existing;
    const geometry = new THREE.SphereGeometry(radius, detail, Math.max(10, detail - 4));
    geometries.add(geometry);
    sphereCache.set(key, geometry);
    return geometry;
  }

  function cylinder(radiusTop: number, radiusBottom: number, height: number, segments = 16) {
    const key = `${radiusTop.toFixed(3)}:${radiusBottom.toFixed(3)}:${height.toFixed(3)}:${segments}`;
    const existing = cylinderCache.get(key);
    if (existing) return existing;
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
    geometries.add(geometry);
    cylinderCache.set(key, geometry);
    return geometry;
  }

  function material(color: string, options: MaterialOptions = {}) {
    const cacheKey = `${color}:${options.map?.uuid ?? ''}:${JSON.stringify({ ...options, map: undefined })}`;
    const existing = materialCache.get(cacheKey);
    if (existing) return existing;
    const roughness = options.roughness ?? 0.72;
    const result = new THREE.MeshPhongMaterial({
      color,
      map: options.map ?? null,
      shininess: clamp((1 - roughness) * 90, 4, 92),
      specular: new THREE.Color('#71644a'),
      emissive: options.emissive ?? '#000000',
      emissiveIntensity: options.emissiveIntensity ?? 0,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
    });
    materials.add(result);
    materialCache.set(cacheKey, result);
    return result;
  }

  function basicMaterial(color: string, map: THREE.Texture | null = null, opacity = 1) {
    const result = new THREE.MeshBasicMaterial({
      color,
      map,
      transparent: opacity < 1,
      opacity,
    });
    materials.add(result);
    return result;
  }

  function mesh(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    standard: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
  ) {
    const result = new THREE.Mesh(geometry, standard);
    result.position.set(x, y, z);
    parent.add(result);
    return result;
  }

  function canvasTexture(
    width: number,
    height: number,
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  ) {
    const surface = document.createElement('canvas');
    surface.width = width;
    surface.height = height;
    const ctx = surface.getContext('2d');
    if (!ctx) throw new Error('Canvas texture context unavailable');
    draw(ctx, width, height);
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 2;
    texture.needsUpdate = true;
    textures.add(texture);
    return texture;
  }

  function drawHamsterFace(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff7ed';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.25, size * 0.62, size * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
    [-1, 1].forEach((side) => {
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(side * size * 0.68, -size * 0.72, size * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fda4af';
      ctx.beginPath();
      ctx.arc(side * size * 0.68, -size * 0.72, size * 0.17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f2937';
      ctx.beginPath();
      ctx.arc(side * size * 0.28, -size * 0.1, size * 0.13, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.arc(0, size * 0.18, size * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const skyTexture = canvasTexture(4, 256, (ctx, width, height) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#050b1d');
    gradient.addColorStop(0.42, '#10214f');
    gradient.addColorStop(0.72, '#24447d');
    gradient.addColorStop(1, '#111b32');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });

  const windowTexture = canvasTexture(64, 128, (ctx, width, height) => {
    ctx.fillStyle = '#0b1530';
    ctx.fillRect(0, 0, width, height);
    for (let y = 12; y < height - 12; y += 18) {
      for (let x = 10; x < width - 10; x += 16) {
        ctx.fillStyle = Math.random() > 0.48 ? '#ffd166' : '#182a50';
        ctx.fillRect(x, y, 7, 10);
      }
    }
  });

  function billboardTexture(title: string, subtitle: string) {
    return canvasTexture(512, 256, (ctx, width, height) => {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#0b46b8');
      gradient.addColorStop(1, '#1d7cf4');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 10;
      ctx.strokeRect(12, 12, width - 24, height - 24);
      drawHamsterFace(ctx, 112, height / 2, 62);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(title, 210, 95);
      ctx.fillStyle = '#ffe16a';
      ctx.font = 'bold 54px sans-serif';
      ctx.fillText(subtitle, 210, 165);
      ctx.fillStyle = '#fff8b0';
      ctx.beginPath();
      ctx.arc(430, 50, 18, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  const coinTexture = canvasTexture(128, 128, (ctx, width, height) => {
    ctx.fillStyle = '#f6b400';
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff2a8';
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.fillStyle = '#fff3a3';
    ctx.beginPath();
    ctx.arc(width / 2 - 12, height / 2 - 12, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b86800';
    [0, 1, 2, 3].forEach((index) => {
      ctx.beginPath();
      ctx.arc(width / 2 + Math.cos(index * 1.25 - 0.7) * 20, height / 2 + Math.sin(index * 1.25 - 0.7) * 20, 8, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.beginPath();
    ctx.ellipse(width / 2, height / 2 + 22, 20, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  const arrowTexture = canvasTexture(128, 128, (ctx, width, height) => {
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#d6a85f';
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, width - 24, height - 24);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(width / 2, 24);
    ctx.lineTo(width - 30, 64);
    ctx.lineTo(width / 2 + 18, 64);
    ctx.lineTo(width / 2 + 18, 104);
    ctx.lineTo(width / 2 - 18, 104);
    ctx.lineTo(width / 2 - 18, 64);
    ctx.lineTo(30, 64);
    ctx.closePath();
    ctx.fill();
  });

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = skyTexture;
  scene.fog = new THREE.Fog('#0b1530', 22, 48);

  const camera = new THREE.PerspectiveCamera(41, GAME_WIDTH / GAME_HEIGHT, 0.6, 60);
  const cameraBase = new THREE.Vector3(0, 14.2, 23.8);
  const cameraTarget = new THREE.Vector3(0, 0.4, 1.0);
  camera.position.copy(cameraBase);
  camera.lookAt(cameraTarget);

  const hemi = new THREE.HemisphereLight('#8fb8ff', '#111827', 1.35);
  scene.add(hemi);

  const moonLight = new THREE.DirectionalLight('#cfe5ff', 1.25);
  moonLight.position.set(8, 14, -8);
  scene.add(moonLight);

  const warmLight = new THREE.DirectionalLight('#ffb347', 1.1);
  warmLight.position.set(-5, 8, 10);
  scene.add(warmLight);

  const goalLight = new THREE.PointLight('#ffd166', 80, 20, 1.8);
  goalLight.position.set(0, 4, -10.5);
  scene.add(goalLight);

  const worldGroup = new THREE.Group();
  const entityGroup = new THREE.Group();
  scene.add(worldGroup, entityGroup);

  // Distant city and moon.
  const moon = mesh(
    worldGroup,
    sphere(1.45, 20),
    basicMaterial('#f8f3d3'),
    8.2, 12.2, -22,
  );
  moon.visible = true;

  const starGeometry = new THREE.BufferGeometry();
  const starPositions = new Float32Array(160 * 3);
  for (let index = 0; index < 160; index++) {
    starPositions[index * 3] = (Math.random() - 0.5) * 42;
    starPositions[index * 3 + 1] = 7 + Math.random() * 16;
    starPositions[index * 3 + 2] = -24 - Math.random() * 6;
  }
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  geometries.add(starGeometry);
  const starMaterial = new THREE.PointsMaterial({
    color: '#ffffff', size: 0.16, transparent: true, opacity: 0.85, depthWrite: false,
  });
  materials.add(starMaterial);
  const stars = new THREE.Points(starGeometry, starMaterial);
  worldGroup.add(stars);

  const buildingGeometry = box(1, 1, 1);
  const buildingMaterial = material('#101d40', {
    roughness: 0.82, metalness: 0.16, emissive: '#172b5d', emissiveIntensity: 0.28, map: windowTexture,
  });
  const buildings = new THREE.InstancedMesh(buildingGeometry, buildingMaterial, 34);
  const buildingDummy = new THREE.Object3D();
  for (let index = 0; index < 34; index++) {
    const width = 0.8 + Math.random() * 1.9;
    const height = 2.4 + Math.random() * 7.2;
    buildingDummy.position.set(-21 + index * 1.28 + Math.random() * 0.7, height / 2, -18 - Math.random() * 4);
    buildingDummy.scale.set(width, height, width * 0.7);
    buildingDummy.rotation.set(0, Math.random() * 0.25, 0);
    buildingDummy.updateMatrix();
    buildings.setMatrixAt(index, buildingDummy.matrix);
  }
  buildings.instanceMatrix.needsUpdate = true;
  buildings.frustumCulled = false;
  worldGroup.add(buildings);

  // Elevated night train behind the goal.
  const trainMaterial = material('#58a9ff', {
    roughness: 0.16, metalness: 0.72, emissive: '#1d7cf4', emissiveIntensity: 0.82,
  });
  for (let index = 0; index < 3; index++) {
    const car = mesh(
      worldGroup,
      box(5.2, 1.25, 1.15),
      trainMaterial,
      -5.4 + index * 5.4,
      3.45,
      -15.4,
    );
    car.visible = true;
    mesh(
      worldGroup,
      box(4.5, 0.34, 0.08),
      basicMaterial('#d8f0ff'),
      -5.4 + index * 5.4,
      3.7,
      -14.8,
    );
  }

  // Billboards.
  function addBillboard(x: number, z: number, yaw: number, title: string, subtitle: string) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    worldGroup.add(group);

    const texture = billboardTexture(title, subtitle);
    const panel = mesh(group, box(3.6, 1.75, 0.18), basicMaterial('#ffffff', texture), 0, 3.0, 0);
    panel.visible = true;
    mesh(group, box(3.85, 0.14, 0.25), material('#10203f', { emissive: '#38bdf8', emissiveIntensity: 0.55 }), 0, 3.95, 0);
    [-1.35, 1.35].forEach((postX) => {
      mesh(group, box(0.14, 2.15, 0.14), material('#253045', { roughness: 0.78, metalness: 0.5 }), postX, 1.08, 0);
    });
  }
  addBillboard(-10.8, -14.4, 0.22, 'KEEP', 'GOING!');
  addBillboard(10.8, -14.4, -0.22, 'YOU GOT', 'THIS!');

  // Street lamps line the road.
  const lampMaterial = basicMaterial('#ffd166');
  const poleMaterial = material('#263147', { roughness: 0.55, metalness: 0.72 });
  [-10.8, -5.6, -0.4, 4.8, 10.2].forEach((z) => {
    [-9.25, 9.25].forEach((x) => {
      mesh(worldGroup, cylinder(0.055, 0.07, 2.7, 8), poleMaterial, x, 1.35, z);
      mesh(worldGroup, box(0.52, 0.07, 0.18), poleMaterial, x + (x < 0 ? 0.24 : -0.24), 2.66, z);
      mesh(worldGroup, sphere(0.12, 10), lampMaterial, x + (x < 0 ? 0.46 : -0.46), 2.52, z);
    });
  });

  // Bright park zones.
  const grassMaterial = material('#38a64b', { roughness: 0.94, metalness: 0.02, emissive: '#0f5122', emissiveIntensity: 0.12 });
  const darkGrassMaterial = material('#2f8b3f', { roughness: 0.95, metalness: 0.02, emissive: '#0f5122', emissiveIntensity: 0.03 });
  mesh(worldGroup, box(GAME_WIDTH * PX, 0.16, WATER_TOP * PX), grassMaterial, 0, 0.05, toZ(WATER_TOP / 2));
  mesh(worldGroup, box(GAME_WIDTH * PX, 0.16, (GAME_HEIGHT - (GAME_HEIGHT - 118)) * PX), grassMaterial, 0, 0.05, toZ(GAME_HEIGHT - 59));
  for (let index = 0; index < 8; index++) {
    mesh(worldGroup, box(GAME_WIDTH * PX, 0.012, 0.22), darkGrassMaterial, 0, 0.135, -10.8 + index * 1.25);
    mesh(worldGroup, box(GAME_WIDTH * PX, 0.012, 0.22), darkGrassMaterial, 0, 0.135, 7.4 + index * 1.25);
  }

  // Fences and start arrow.
  const fenceMaterial = material('#a86b35', { roughness: 0.86, metalness: 0.04 });
  [-8.4, -6.3, 6.3, 8.4].forEach((x) => {
    mesh(worldGroup, box(0.16, 0.72, 0.16), fenceMaterial, x, 0.36, 9.5);
    mesh(worldGroup, box(0.16, 0.72, 0.16), fenceMaterial, x, 0.36, -9.5);
  });
  [-7.35, -5.25, 5.25, 7.35].forEach((x) => {
    mesh(worldGroup, box(2.4, 0.11, 0.11), fenceMaterial, x, 0.56, 9.5);
    mesh(worldGroup, box(2.4, 0.11, 0.11), fenceMaterial, x, 0.56, -9.5);
  });
  const arrowSign = mesh(
    worldGroup,
    box(0.82, 0.82, 0.12),
    basicMaterial('#ffffff', arrowTexture),
    -5.2, 0.82, 9.6,
  );
  arrowSign.visible = true;
  mesh(worldGroup, box(0.18, 1.05, 0.18), fenceMaterial, -5.2, 0.45, 9.6);

  // Road.
  const road = mesh(
    worldGroup,
    box(GAME_WIDTH * PX, 0.08, ROAD_HEIGHT * PX),
    material('#252a38', { roughness: 0.62, metalness: 0.38 }),
    0, 0, toZ(ROAD_TOP + ROAD_HEIGHT / 2),
  );
  road.visible = true;

  const laneGlowMaterial = material('#f6b400', {
    roughness: 0.08, metalness: 0.55, emissive: '#ffb703', emissiveIntensity: 1.15,
  });
  const laneYs = [122, 170, 218, 266, 314];
  const laneHeights = [22, 24, 22, 24, 22];
  for (let index = 0; index < laneYs.length; index++) {
    const laneCenter = toZ(laneYs[index] + laneHeights[index] / 2);
    const laneDepth = toSize(laneHeights[index]);
    mesh(worldGroup, box(GAME_WIDTH * PX, 0.045, 0.032), laneGlowMaterial, 0, 0.082, laneCenter - laneDepth / 2);
    mesh(worldGroup, box(GAME_WIDTH * PX, 0.045, 0.032), laneGlowMaterial, 0, 0.082, laneCenter + laneDepth / 2);
  }

  const dashGeometry = box(0.24, 0.018, 0.13);
  const dashMaterial = material('#f8fafc', {
    roughness: 0.22, metalness: 0.1, emissive: '#ffffff', emissiveIntensity: 0.35,
  });
  const dashMesh = new THREE.InstancedMesh(dashGeometry, dashMaterial, laneYs.length * 13);
  const dashDummy = new THREE.Object3D();
  let dashIndex = 0;
  for (let index = 0; index < laneYs.length; index++) {
    for (let column = 0; column < 13; column++) {
      dashDummy.position.set(-8.4 + column * 1.4, 0.075, toZ(laneYs[index] + laneHeights[index] / 2));
      dashDummy.rotation.set(0, 0, 0);
      dashDummy.scale.setScalar(1);
      dashDummy.updateMatrix();
      dashMesh.setMatrixAt(dashIndex++, dashDummy.matrix);
    }
  }
  dashMesh.count = dashIndex;
  dashMesh.instanceMatrix.needsUpdate = true;
  dashMesh.frustumCulled = false;
  worldGroup.add(dashMesh);

  // Hazard canal replaces the old water strip but keeps its collision role.
  const waterChannel = mesh(
    worldGroup,
    box(GAME_WIDTH * PX, 0.12, WATER_HEIGHT * PX),
    material('#073f62', {
      roughness: 0.08, metalness: 0.82, emissive: '#0ea5b7',
      emissiveIntensity: 0.92, opacity: 0.9, transparent: true,
    }),
    0, -0.08, toZ(WATER_TOP + WATER_HEIGHT / 2),
  );
  waterChannel.visible = true;

  const rippleMaterial = material('#9ff4e6', {
    roughness: 0.04, metalness: 0.9, emissive: '#5eead4',
    emissiveIntensity: 0.45, opacity: 0.2, transparent: true,
  });
  const ripples = Array.from({ length: 7 }, (_, index) => {
    const result = mesh(
      worldGroup,
      box(GAME_WIDTH * PX, 0.02, 0.07),
      rippleMaterial,
      0,
      0,
      toZ(WATER_TOP + 3 + index * 3.4),
    );
    return { mesh: result, offset: index * 0.83 };
  });

  const padGeometry = cylinder(1, 0.9, 0.08, 18);
  const padMaterial = material('#16a34a', {
    roughness: 0.48, metalness: 0.22, emissive: '#22c55e', emissiveIntensity: 0.48,
  });
  const padMeshes = Array.from({ length: 4 }, () => {
    const result = new THREE.Mesh(padGeometry, padMaterial);
    result.position.set(0, -0.01, toZ(90));
    worldGroup.add(result);
    return result;
  });

  const goalBand = mesh(
    worldGroup,
    box(GAME_WIDTH * PX, 0.07, 0.25),
    material('#ffd166', {
      roughness: 0.08, metalness: 0.5, emissive: '#ffb703', emissiveIntensity: 1.5,
    }),
    0, 0.11, toZ(45),
  );
  goalBand.visible = true;

  // Decorative coin trail. It is visual rhythm only and never enters collision.
  const coinGroups = COIN_PATH.map((coin) => {
    const group = new THREE.Group();
    group.position.set(toX(coin.x), 0.78, toZ(coin.y));
    worldGroup.add(group);
    const body = mesh(
      group,
      cylinder(0.42, 0.42, 0.12, 20),
      basicMaterial('#ffffff', coinTexture),
    );
    body.rotation.x = Math.PI / 2;
    mesh(
      group,
      new THREE.TorusGeometry(0.47, 0.055, 6, 24),
      material('#f6b400', { roughness: 0.08, emissive: '#f6b400', emissiveIntensity: 1.7 }),
    );
    return group;
  });

  // Scenery.
  const tuftGeometry = new THREE.ConeGeometry(0.14, 0.36, 5);
  geometries.add(tuftGeometry);
  const tuftMesh = new THREE.InstancedMesh(tuftGeometry, material('#22c55e', { emissive: '#0f5122', emissiveIntensity: 0.18 }), TUFTS.length);
  const sceneryDummy = new THREE.Object3D();
  TUFTS.forEach((tuft, index) => {
    sceneryDummy.position.set(toX(tuft.x), 0.24, toZ(tuft.y));
    sceneryDummy.rotation.set(0, index * 0.55, (index % 3 - 1) * 0.12);
    sceneryDummy.scale.setScalar(0.8 + (index % 4) * 0.12);
    sceneryDummy.updateMatrix();
    tuftMesh.setMatrixAt(index, sceneryDummy.matrix);
  });
  tuftMesh.instanceMatrix.needsUpdate = true;
  tuftMesh.frustumCulled = false;
  worldGroup.add(tuftMesh);

  FLOWERS.forEach((flower) => {
    mesh(worldGroup, sphere(0.1, 8), material(flower.color, {
      roughness: 0.28, emissive: flower.color, emissiveIntensity: 0.55,
    }), toX(flower.x), 0.27, toZ(flower.y));
  });

  // Hamster.
  const hamsterRoot = new THREE.Group();
  const hamsterVisual = new THREE.Group();
  hamsterRoot.add(hamsterVisual);
  entityGroup.add(hamsterRoot);

  const shadowGeometry = new THREE.CircleGeometry(0.75, 24);
  geometries.add(shadowGeometry);
  const hamsterShadowMaterial = new THREE.MeshBasicMaterial({
    color: '#000000', transparent: true, opacity: 0.34, depthWrite: false,
  });
  materials.add(hamsterShadowMaterial);
  const hamsterShadow = new THREE.Mesh(shadowGeometry, hamsterShadowMaterial);
  hamsterShadow.rotation.x = -Math.PI / 2;
  hamsterShadow.position.y = 0.02;
  hamsterRoot.add(hamsterShadow);

  const orangeFur = material('#f97316', { roughness: 0.48, metalness: 0.12, emissive: '#9a3412', emissiveIntensity: 0.24 });
  const creamFur = material('#fff4d8', { roughness: 0.56, metalness: 0.08 });
  const darkEye = material('#111827', { roughness: 0.05, metalness: 0.3 });
  const pinkAccent = material('#fda4af', { roughness: 0.38, emissive: '#fb7185', emissiveIntensity: 0.3 });
  const outlineMaterial = new THREE.MeshBasicMaterial({ color: '#23120a', side: THREE.BackSide });
  materials.add(outlineMaterial);

  const hamsterBodyGeometry = sphere(0.64, 28);
  const hamsterBody = new THREE.Mesh(hamsterBodyGeometry, orangeFur);
  hamsterBody.scale.set(1.02, 0.97, 0.82);
  hamsterVisual.add(hamsterBody);

  const hamsterOutline = new THREE.Mesh(hamsterBodyGeometry, outlineMaterial);
  hamsterOutline.scale.set(1.08, 1.03, 0.88);
  hamsterVisual.add(hamsterOutline);

  const hamsterRump = new THREE.Mesh(sphere(0.43, 22), creamFur);
  hamsterRump.position.set(0, -0.18, -0.34);
  hamsterRump.scale.set(0.82, 0.72, 0.48);
  hamsterVisual.add(hamsterRump);

  const hamsterHead = new THREE.Mesh(sphere(0.37, 24), orangeFur);
  hamsterHead.position.set(0, 0.24, 0.42);
  hamsterVisual.add(hamsterHead);

  const headOutline = new THREE.Mesh(sphere(0.37, 18), outlineMaterial);
  headOutline.position.copy(hamsterHead.position);
  headOutline.scale.setScalar(1.1);
  hamsterVisual.add(headOutline);

  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(sphere(0.18, 14), orangeFur);
    ear.position.set(side * 0.27, 0.55, 0.22);
    hamsterVisual.add(ear);

    const innerEar = new THREE.Mesh(sphere(0.1, 12), pinkAccent);
    innerEar.position.set(side * 0.28, 0.54, 0.28);
    hamsterVisual.add(innerEar);

    const eye = new THREE.Mesh(sphere(0.075, 12), darkEye);
    eye.position.set(side * 0.2, 0.3, 0.67);
    hamsterVisual.add(eye);

    const cheek = new THREE.Mesh(sphere(0.11, 12), pinkAccent);
    cheek.position.set(side * 0.27, 0.12, 0.54);
    cheek.scale.set(1, 0.65, 0.6);
    hamsterVisual.add(cheek);

    const paw = new THREE.Mesh(sphere(0.13, 10), creamFur);
    paw.position.set(side * 0.31, -0.43, 0.12);
    paw.scale.set(0.8, 0.55, 0.8);
    hamsterVisual.add(paw);
  });

  const hamsterTail = new THREE.Mesh(sphere(0.13, 12), creamFur);
  hamsterTail.position.set(0, -0.22, -0.62);
  hamsterTail.scale.set(0.68, 0.68, 0.55);
  hamsterVisual.add(hamsterTail);

  const shieldGeometry = new THREE.TorusGeometry(1.18, 0.14, 8, 30);
  geometries.add(shieldGeometry);
  const shieldMaterial = new THREE.MeshBasicMaterial({
    color: '#fff1b8', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  materials.add(shieldMaterial);
  const dashShield = new THREE.Mesh(shieldGeometry, shieldMaterial);
  dashShield.rotation.x = Math.PI / 2;
  dashShield.position.y = 0.54;
  dashShield.visible = false;
  hamsterRoot.add(dashShield);

  const dashAura = new THREE.Mesh(sphere(1.12, 18), new THREE.MeshBasicMaterial({
    color: '#fbbf24', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  materials.add(dashAura.material);
  dashAura.position.y = 0.56;
  dashAura.visible = false;
  hamsterRoot.add(dashAura);

  const pointMaterial = (color: string, size: number) => {
    const result = new THREE.PointsMaterial({
      color, size, sizeAttenuation: true, transparent: true, opacity: 0.92,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    materials.add(result);
    return result;
  };

  const createPointCloud = (capacity: number, color: string, size: number) => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(capacity * 3);
    const colors = new Float32Array(capacity * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setDrawRange(0, 0);
    geometries.add(geometry);
    const points = new THREE.Points(geometry, pointMaterial(color, size));
    points.frustumCulled = false;
    entityGroup.add(points);
    return { geometry, positions, colors, points, capacity };
  };

  const particleCloud = createPointCloud(180, '#fde68a', 0.2);
  const fireflyCloud = createPointCloud(12, '#ffd166', 0.28);
  const sparkleCloud = createPointCloud(12, '#5eead4', 0.18);
  const scratchColor = new THREE.Color();

  const carGroups = new Map<Car, CarInstance>();

  function addCarWheel(
    parent: THREE.Group,
    wheelRadius: number,
    x: number,
    z: number,
    wheelMaterial: THREE.Material,
  ) {
    const holder = new THREE.Group();
    holder.position.set(x, -0.24, z);
    holder.rotation.x = Math.PI / 2;
    const wheel = new THREE.Mesh(cylinder(wheelRadius, wheelRadius, 0.14, 10), wheelMaterial);
    holder.add(wheel);
    parent.add(holder);
    return wheel;
  }

  function createCarInstance(car: Car): CarInstance {
    const group = new THREE.Group();
    const length = toSize(car.width);
    const bodyMaterial = material(car.color, {
      roughness: 0.18, metalness: 0.66, emissive: car.color, emissiveIntensity: 0.16,
    });
    const darkMaterial = material('#171b22', { roughness: 0.4, metalness: 0.62 });
    const glassMaterial = material('#0c172b', {
      roughness: 0.04, metalness: 0.92, emissive: '#1d4ed8', emissiveIntensity: 0.24,
      opacity: 0.86, transparent: true,
    });
    const wheelMaterial = material('#111827', { roughness: 0.82, metalness: 0.22 });
    const headlightMaterial = material('#fff0a8', {
      roughness: 0.02, emissive: '#ffd166', emissiveIntensity: 3.0,
    });
    const taillightMaterial = material('#ff5d5d', { roughness: 0.06, emissive: '#ef4444', emissiveIntensity: 2.2 });

    const chassis = new THREE.Mesh(box(length, 0.22, 0.58), bodyMaterial);
    chassis.position.y = 0.04;
    group.add(chassis);
    const skirt = new THREE.Mesh(box(length * 0.9, 0.12, 0.5), darkMaterial);
    skirt.position.y = -0.12;
    group.add(skirt);

    const wheels: THREE.Mesh[] = [];
    const wheelRadius = 0.17;

    if (car.kind === 'sedan') {
      const cabin = new THREE.Mesh(box(length * 0.44, 0.27, 0.5), glassMaterial);
      cabin.position.y = 0.27;
      group.add(cabin);
      wheels.push(
        addCarWheel(group, wheelRadius, -length * 0.32, 0.27, wheelMaterial),
        addCarWheel(group, wheelRadius, -length * 0.32, -0.27, wheelMaterial),
        addCarWheel(group, wheelRadius, length * 0.32, 0.27, wheelMaterial),
        addCarWheel(group, wheelRadius, length * 0.32, -0.27, wheelMaterial),
      );
    } else if (car.kind === 'boxTruck') {
      const cab = new THREE.Mesh(box(length * 0.3, 0.38, 0.54), material('#d7dde7', { roughness: 0.25, metalness: 0.58 }));
      cab.position.set(length * 0.32, 0.22, 0);
      group.add(cab);
      const cargo = new THREE.Mesh(box(length * 0.6, 0.52, 0.62), material('#f1f5f9', { roughness: 0.34, metalness: 0.22 }));
      cargo.position.set(-length * 0.16, 0.32, 0);
      group.add(cargo);
      wheels.push(
        addCarWheel(group, wheelRadius, -length * 0.38, 0.28, wheelMaterial),
        addCarWheel(group, wheelRadius, -length * 0.38, -0.28, wheelMaterial),
        addCarWheel(group, wheelRadius, length * 0.28, 0.28, wheelMaterial),
        addCarWheel(group, wheelRadius, length * 0.28, -0.28, wheelMaterial),
      );
    } else if (car.kind === 'bus') {
      const shell = new THREE.Mesh(box(length * 0.94, 0.52, 0.58), bodyMaterial);
      shell.position.y = 0.24;
      group.add(shell);
      const windowStrip = new THREE.Mesh(box(length * 0.82, 0.22, 0.61), glassMaterial);
      windowStrip.position.y = 0.34;
      group.add(windowStrip);
      wheels.push(
        addCarWheel(group, wheelRadius, -length * 0.34, 0.28, wheelMaterial),
        addCarWheel(group, wheelRadius, -length * 0.34, -0.28, wheelMaterial),
        addCarWheel(group, wheelRadius, length * 0.34, 0.28, wheelMaterial),
        addCarWheel(group, wheelRadius, length * 0.34, -0.28, wheelMaterial),
      );
    } else if (car.kind === 'minivan') {
      const shell = new THREE.Mesh(box(length * 0.92, 0.48, 0.58), bodyMaterial);
      shell.position.y = 0.24;
      group.add(shell);
      const windows = new THREE.Mesh(box(length * 0.64, 0.22, 0.61), glassMaterial);
      windows.position.set(-length * 0.05, 0.32, 0);
      group.add(windows);
      wheels.push(
        addCarWheel(group, wheelRadius, -length * 0.34, 0.28, wheelMaterial),
        addCarWheel(group, wheelRadius, -length * 0.34, -0.28, wheelMaterial),
        addCarWheel(group, wheelRadius, length * 0.34, 0.28, wheelMaterial),
        addCarWheel(group, wheelRadius, length * 0.34, -0.28, wheelMaterial),
      );
    } else {
      const cabin = new THREE.Mesh(box(length * 0.42, 0.27, 0.5), glassMaterial);
      cabin.position.y = 0.27;
      group.add(cabin);
      const roofSign = new THREE.Mesh(box(0.24, 0.12, 0.3), material('#ffd166', { emissive: '#f6b400', emissiveIntensity: 1.8 }));
      roofSign.position.y = 0.46;
      group.add(roofSign);
      wheels.push(
        addCarWheel(group, wheelRadius, -length * 0.32, 0.27, wheelMaterial),
        addCarWheel(group, wheelRadius, -length * 0.32, -0.27, wheelMaterial),
        addCarWheel(group, wheelRadius, length * 0.32, 0.27, wheelMaterial),
        addCarWheel(group, wheelRadius, length * 0.32, -0.27, wheelMaterial),
      );
    }

    [0.2, -0.2].forEach((z) => {
      const headlight = new THREE.Mesh(box(0.05, 0.1, 0.1), headlightMaterial);
      headlight.position.set(length * 0.49, 0.11, z);
      group.add(headlight);
      const taillight = new THREE.Mesh(box(0.05, 0.08, 0.1), taillightMaterial);
      taillight.position.set(-length * 0.49, 0.11, z);
      group.add(taillight);

      const beamGeometry = new THREE.ConeGeometry(0.12, 0.75, 8, 1, true);
      geometries.add(beamGeometry);
      const beam = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({
        color: '#ffe28a', transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      materials.add(beam.material);
      beam.position.set(length * 0.49 + 0.38, 0.08, z);
      beam.rotation.z = -Math.PI / 2;
      group.add(beam);
    });

    const carShadow = new THREE.Mesh(box(length * 1.08, 0.02, 0.66), new THREE.MeshBasicMaterial({
      color: '#000000', transparent: true, opacity: 0.32, depthWrite: false,
    }));
    materials.add(carShadow.material);
    carShadow.position.y = -0.34;
    group.add(carShadow);

    entityGroup.add(group);
    return { group, wheels, headlightMaterial };
  }

  const overlayScene = new THREE.Scene();
  const overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const flashGeometry = new THREE.PlaneGeometry(2, 2);
  geometries.add(flashGeometry);
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  materials.add(flashMaterial);
  overlayScene.add(new THREE.Mesh(flashGeometry, flashMaterial));

  let hamsterYaw = Math.PI;
  const updateHamster = (snapshot: SceneSnapshot, time: number) => {
    const hamster = snapshot.hamster;
    const progress = hamster.hopTimer > 0
      ? clamp(1 - hamster.hopTimer / hamster.hopDuration, 0, 1)
      : 1;
    const hop = hamster.hopTimer > 0 ? Math.sin(progress * Math.PI) * 0.58 : 0;
    const idle = hamster.hopTimer <= 0
      ? Math.sin(time / (245 - snapshot.pace * 85)) * (0.035 + snapshot.pace * 0.04)
      : 0;

    hamsterRoot.position.set(toX(hamster.x + PLAYER_SIZE / 2), 0, toZ(hamster.y + PLAYER_SIZE / 2));
    hamsterVisual.position.y = (0.73 + hop + idle) * HAMSTER_VISUAL_SCALE;

    const targetYaw = hamster.facing === 'up'
      ? Math.PI
      : hamster.facing === 'down'
        ? 0
        : hamster.facing === 'left'
          ? -Math.PI / 2
          : Math.PI / 2;
    hamsterYaw = shortestAngle(hamsterYaw, targetYaw, 0.31);
    hamsterVisual.rotation.y = hamsterYaw;

    const pulse = Math.sin(time / (190 - snapshot.pace * 80)) * (0.025 + snapshot.pace * 0.055);
    const squash = hamster.squash;
    hamsterVisual.scale.set(
      HAMSTER_VISUAL_SCALE * (1 + squash * 0.18 + pulse * 0.35),
      HAMSTER_VISUAL_SCALE * (1 - squash * 0.21 + pulse * 0.2),
      HAMSTER_VISUAL_SCALE * (1 + squash * 0.18 + pulse * 0.35),
    );
    hamsterShadow.scale.setScalar(clamp(1 - hop * 0.55, 0.45, 1.05));
    hamsterShadowMaterial.opacity = clamp(0.34 - hop * 0.14, 0.08, 0.36);

    const dashVisible = snapshot.gameplayActive && snapshot.dashActive;
    dashShield.visible = dashVisible;
    dashAura.visible = dashVisible;
    if (dashVisible) {
      dashShield.rotation.z = time * 0.004;
      const shieldScale = HAMSTER_VISUAL_SCALE * (1 + Math.sin(time / 80) * 0.09);
      dashShield.scale.set(shieldScale, shieldScale, HAMSTER_VISUAL_SCALE);
      dashAura.scale.setScalar(HAMSTER_VISUAL_SCALE * (1.04 + Math.sin(time / 110) * 0.08));
      shieldMaterial.opacity = 0.68 + Math.sin(time / 90) * 0.18;
    }
  };

  const usedCars = new Set<Car>();
  const updateCars = (snapshot: SceneSnapshot, time: number) => {
    for (const car of snapshot.cars) {
      usedCars.add(car);
      let instance = carGroups.get(car);
      if (!instance) {
        instance = createCarInstance(car);
        carGroups.set(car, instance);
      }
      const centerX = car.x + car.width / 2;
      const centerY = car.y + car.height / 2;
      const bounce = Math.sin(time / 110 + car.y) * 0.013;
      instance.group.position.set(toX(centerX), 0.32 + bounce, toZ(centerY));
      instance.group.scale.set(0.76, 0.68, 0.72);
      instance.group.rotation.y = car.direction > 0 ? 0 : Math.PI;
      for (const wheel of instance.wheels) wheel.rotation.y = time * car.speed * 0.023;
      instance.headlightMaterial.emissiveIntensity = snapshot.surgeActive
        ? 3.8 + Math.sin(time / 90) * 0.6
        : 2.7 + Math.sin(time / 280) * 0.18;
    }

    for (const [car, instance] of carGroups) {
      if (usedCars.has(car)) continue;
      entityGroup.remove(instance.group);
      carGroups.delete(car);
    }
    usedCars.clear();
  };

  const updatePointCloud = (
    cloud: typeof particleCloud,
    values: Array<Particle | Firefly | WaterSparkle>,
    project: (item: (typeof values)[number], index: number, time: number) => [number, number, number, number],
    colorFor: (item: (typeof values)[number]) => string,
    time: number,
  ) => {
    const count = Math.min(cloud.capacity, values.length);
    for (let index = 0; index < count; index++) {
      const item = values[index];
      const [x, y, z, intensity] = project(item, index, time);
      cloud.positions[index * 3] = x;
      cloud.positions[index * 3 + 1] = y;
      cloud.positions[index * 3 + 2] = z;
      scratchColor.set(colorFor(item));
      cloud.colors[index * 3] = scratchColor.r * intensity;
      cloud.colors[index * 3 + 1] = scratchColor.g * intensity;
      cloud.colors[index * 3 + 2] = scratchColor.b * intensity;
    }
    cloud.geometry.setDrawRange(0, count);
    cloud.geometry.attributes.position.needsUpdate = true;
    cloud.geometry.attributes.color.needsUpdate = true;
  };

  const syncAmbient = (snapshot: SceneSnapshot, time: number) => {
    updatePointCloud(
      particleCloud,
      snapshot.particles,
      (particle) => {
        const p = particle as Particle;
        const alpha = clamp(p.life / p.maxLife, 0, 1);
        return [toX(p.x), 0.22 + alpha * 0.8, toZ(p.y), alpha];
      },
      (particle) => (particle as Particle).color,
      time,
    );
    updatePointCloud(
      fireflyCloud,
      snapshot.fireflies,
      (fly, index) => {
        const f = fly as Firefly;
        const brightness = (Math.sin(time / 400 + f.phase) + 1) / 2;
        return [toX(f.x), 0.8 + Math.sin(time / 700 + index) * 0.2, toZ(f.y), 0.15 + brightness * 0.85];
      },
      () => '#ffd166',
      time,
    );
    updatePointCloud(
      sparkleCloud,
      snapshot.waterSparkles,
      (sparkle) => {
        const s = sparkle as WaterSparkle;
        const brightness = (Math.sin(time / 350 + s.phase) + 1) / 2;
        return [toX(s.x), -0.01, toZ(s.y), 0.2 + brightness * 0.8];
      },
      () => '#a5f3fc',
      time,
    );

    for (let index = 0; index < padMeshes.length; index++) {
      const pad = snapshot.lilyPads[index];
      const padMesh = padMeshes[index];
      if (!pad) continue;
      const radius = Math.max(0.28, toSize(pad.size));
      padMesh.position.set(toX(pad.x), -0.01, toZ(pad.y));
      padMesh.scale.set(radius, 1, radius);
      padMesh.rotation.y = pad.rotation + Math.sin(time / 900 + pad.phase) * 0.1;
    }

    for (const ripple of ripples) {
      const center = toZ(WATER_TOP + WATER_HEIGHT / 2);
      const halfDepth = toSize(WATER_HEIGHT) / 2 - 0.08;
      const offset = ((time / 1400 + ripple.offset) % 1) * 2 - 1;
      ripple.mesh.position.z = center + offset * halfDepth;
      ripple.mesh.scale.x = 1 + Math.sin(time / 450 + ripple.offset) * 0.04;
    }

    for (let index = 0; index < coinGroups.length; index++) {
      const coin = coinGroups[index];
      coin.rotation.y = 0;
      coin.rotation.z = Math.sin(time / 600 + index) * 0.12;
      coin.position.y = 0.52 + Math.sin(time / 360 + index * 0.8) * 0.06;
      coin.scale.setScalar(0.5);
    }

    goalLight.intensity = snapshot.surgeActive ? 145 : 70 + snapshot.pace * 45;
    dashMaterial.emissiveIntensity = 1.55 + snapshot.pace * 1.2;
    goalBand.scale.y = 1 + Math.sin(time / 260) * 0.08;
    stars.rotation.z = time * 0.000012;
    const waterMaterial = waterChannel.material as THREE.MeshPhongMaterial;
    waterMaterial.emissiveIntensity = 0.65 + snapshot.pace * 0.85;
  };

  const render = (snapshot: SceneSnapshot, time: number) => {
    updateHamster(snapshot, time);
    updateCars(snapshot, time);
    syncAmbient(snapshot, time);

    const hit = clamp(snapshot.effectHit / 380, 0, 1);
    camera.position.set(
      cameraBase.x + (Math.random() - 0.5) * 0.18 * hit,
      cameraBase.y + (Math.random() - 0.5) * 0.13 * hit,
      cameraBase.z + (Math.random() - 0.5) * 0.08 * hit,
    );
    camera.lookAt(cameraTarget);

    if (hit > 0) flashMaterial.color.set('#ff8a4f');
    else flashMaterial.color.set('#7ff3dd');
    flashMaterial.opacity = clamp(
      snapshot.effectSuccess > 0 ? snapshot.effectSuccess / 220 * 0.42 : hit * 0.24,
      0,
      0.44,
    );

    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.render(overlayScene, overlayCamera);
    renderer.autoClear = true;
  };

  const resize = (width: number, height: number) => {
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };

  const dispose = () => {
    for (const geometry of geometries) geometry.dispose();
    for (const item of materials) item.dispose();
    for (const texture of textures) texture.dispose();
    geometries.clear();
    materials.clear();
    textures.clear();
    scene.clear();
    entityGroup.clear();
    worldGroup.clear();
    renderer.dispose();
  };

  resize(canvas.clientWidth || GAME_WIDTH, canvas.clientHeight || GAME_HEIGHT);
  return { render, resize, dispose };
}
