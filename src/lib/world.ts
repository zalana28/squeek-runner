// Squeek Runner — WHEELY9000 game model
// Collision, entity, and ambient logic are intentionally independent from rendering.

export const GAME_WIDTH = 360;
export const GAME_HEIGHT = 480;
export const PLAYER_SIZE = 24;
export const STEP = 24;
export const GOAL_LINE = 42;
export const START_Y = GAME_HEIGHT - PLAYER_SIZE - 14;
export const ROAD_TOP = 112;
export const ROAD_HEIGHT = 248;
export const WATER_TOP = 80;
export const WATER_HEIGHT = 26;

export const CAR_COLORS = ['#e11d2e', '#f6b400', '#2f55d4', '#8c96a3', '#22b45b'];

export type CarKind = 'sedan' | 'boxTruck' | 'bus' | 'minivan' | 'taxi';

export type Car = {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  color: string;
  wheelColor: string;
  direction: 1 | -1;
  kind: CarKind;
};

export type Hamster = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  startX: number;
  startY: number;
  hopTimer: number;
  hopDuration: number;
  facing: 'up' | 'down' | 'left' | 'right';
  squash: number;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

export type Firefly = {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  phase: number;
  speed: number;
};

export type WaterSparkle = {
  x: number;
  y: number;
  phase: number;
};

export type LilyPad = {
  x: number;
  y: number;
  size: number;
  phase: number;
  rotation: number;
};

export type Decoration = { x: number; y: number; color: string };

const CAR_LANES: Array<{
  y: number;
  height: number;
  dir: 1 | -1;
  width: number;
  baseSpeed: number;
  colorIdx: number;
  kind: CarKind;
}> = [
  { y: 122, height: 22, dir: 1, width: 58, baseSpeed: 1.4, colorIdx: 0, kind: 'sedan' },
  { y: 170, height: 24, dir: -1, width: 54, baseSpeed: 1.8, colorIdx: 1, kind: 'boxTruck' },
  { y: 218, height: 22, dir: 1, width: 62, baseSpeed: 2.2, colorIdx: 2, kind: 'bus' },
  { y: 266, height: 24, dir: -1, width: 56, baseSpeed: 2.1, colorIdx: 3, kind: 'minivan' },
  { y: 314, height: 22, dir: 1, width: 60, baseSpeed: 2.6, colorIdx: 4, kind: 'taxi' },
];

export const FLOWERS: Decoration[] = [
  ...Array.from({ length: 6 }, (_, i) => ({
    x: 20 + i * 58,
    y: 30 + (i % 3) * 12,
    color: i % 2 === 0 ? '#f472b6' : '#fbbf24',
  })),
  ...Array.from({ length: 8 }, (_, i) => ({
    x: 15 + i * 44,
    y: 375 + (i % 3) * 20,
    color: i % 2 === 0 ? '#5eead4' : '#fb923c',
  })),
];

export const TUFTS = Array.from({ length: 12 }, (_, i) => ({
  x: 10 + i * 30,
  y: i < 6 ? 50 + (i % 3) * 10 : 400 + (i % 4) * 15,
}));

export const TELEMETRY_WHEEL = { x: 316, y: 38, radius: 25 };

export const COIN_PATH = [
  { x: 180, y: 332 },
  { x: 180, y: 284 },
  { x: 180, y: 236 },
  { x: 180, y: 188 },
  { x: 180, y: 140 },
];

export function createCars(difficulty = 1): Car[] {
  const speedBoost = 1 + difficulty * 0.08;
  return CAR_LANES.map((lane) => ({
    x: Math.random() * (GAME_WIDTH - lane.width),
    y: lane.y,
    width: lane.width,
    height: lane.height,
    speed: lane.baseSpeed * speedBoost * lane.dir,
    color: CAR_COLORS[lane.colorIdx],
    wheelColor: '#111827',
    direction: lane.dir,
    kind: lane.kind,
  }));
}

export function createInitialHamster(): Hamster {
  const startX = GAME_WIDTH / 2 - PLAYER_SIZE / 2;
  return {
    x: startX,
    y: START_Y,
    targetX: startX,
    targetY: START_Y,
    startX,
    startY: START_Y,
    hopTimer: 0,
    hopDuration: 130,
    facing: 'up',
    squash: 0,
  };
}

export function createFireflies(): Firefly[] {
  return Array.from({ length: 10 }, (_, i) => {
    const topGrass = i < 5;
    const baseX = Math.random() * GAME_WIDTH;
    const baseY = topGrass ? 8 + Math.random() * 60 : 370 + Math.random() * 90;
    return {
      x: baseX,
      y: baseY,
      baseX,
      baseY,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.5,
    };
  });
}

export function createWaterSparkles(): WaterSparkle[] {
  return Array.from({ length: 8 }, () => ({
    x: 10 + Math.random() * (GAME_WIDTH - 20),
    y: WATER_TOP + 2 + Math.random() * (WATER_HEIGHT - 4),
    phase: Math.random() * Math.PI * 2,
  }));
}

export function createLilyPads(): LilyPad[] {
  return [
    { x: 40, y: 90, size: 10, phase: 0, rotation: 0.3 },
    { x: 160, y: 86, size: 12, phase: 1.5, rotation: 1.1 },
    { x: 280, y: 92, size: 9, phase: 3.0, rotation: 2.2 },
    { x: 110, y: 100, size: 8, phase: 4.5, rotation: 0.8 },
  ];
}

export function spawnExplosion(
  particles: Particle[],
  x: number,
  y: number,
  colors: string[],
) {
  const count = 15 + Math.floor(Math.random() * 10);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.8 + Math.random() * 2.5;
    const life = 400 + Math.random() * 300;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 2 + Math.random() * 3,
    });
  }
}

export function spawnSparkles(
  particles: Particle[],
  x: number,
  y: number,
  colors: string[],
) {
  const count = 10 + Math.floor(Math.random() * 5);
  for (let i = 0; i < count; i++) {
    const life = 300 + Math.random() * 400;
    particles.push({
      x: x - 10 + Math.random() * 20,
      y: y - 5 + Math.random() * 10,
      vx: (Math.random() - 0.5) * 0.8,
      vy: -0.5 - Math.random() * 1.5,
      life,
      maxLife: life,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 1.5 + Math.random() * 2,
    });
  }
}

export function updateParticles(particles: Particle[], delta: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * (delta / 16.67);
    p.y += p.vy * (delta / 16.67);
    p.life -= delta;
    if (p.life <= 0) {
      particles[i] = particles[particles.length - 1];
      particles.pop();
    }
  }
}
