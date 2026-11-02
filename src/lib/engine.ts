// Base Frogger DX — Game Engine (Enhanced Graphics)
// Self-contained module. Call `createEngine(canvas, callbacks)` to get an engine instance.

import {
  CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_SIZE, STEP, GOAL_LINE,
  ROAD_TOP, ROAD_HEIGHT, WATER_TOP, WATER_HEIGHT,
  createCars, createInitialFrog, drawCar, drawFrog,
  drawFrogGlow, drawParticles, drawFirefly, drawLilyPad,
  createFireflies, createWaterSparkles, createLilyPads,
  spawnExplosion, spawnSparkles, updateParticles,
} from './sprites.js';
import type { Particle, Firefly, WaterSparkle, LilyPad } from './sprites.js';
import { playSound, setMuted, isMuted } from './audio.js';

// ---- Constants ----
const STATE = { MENU: 0, PLAY: 1, PAUSE: 2, OVER: 3 };
const MAX_LIVES = 3;

// Pre-generate grass decoration positions (deterministic)
const GRASS_FLOWERS: Array<{ x: number; y: number; color: string }> = [];
const GRASS_TUFTS: Array<{ x: number; y: number }> = [];
{
  // Flowers on top grass
  for (let i = 0; i < 6; i++) {
    GRASS_FLOWERS.push({ x: 20 + i * 58, y: 30 + (i % 3) * 12, color: i % 2 === 0 ? '#f472b6' : '#fbbf24' });
  }
  // Flowers on bottom grass
  for (let i = 0; i < 8; i++) {
    GRASS_FLOWERS.push({ x: 15 + i * 44, y: 375 + (i % 3) * 20, color: i % 2 === 0 ? '#c084fc' : '#fb923c' });
  }
  // Tufts
  for (let i = 0; i < 12; i++) {
    GRASS_TUFTS.push({ x: 10 + i * 30, y: i < 6 ? 50 + (i % 3) * 10 : 400 + (i % 4) * 15 });
  }
}

// ---- Factory ----

/**
 * Create a game engine attached to the given canvas.
 * @param canvas - HTMLCanvasElement to render into
 * @param cb - Callbacks:
 *   - onScoreChange(score: number, level: number, lives: number)
 *   - onGameOver(score: number, level: number)
 */
export function createEngine(
  canvas: HTMLCanvasElement,
  cb: {
    onScoreChange?: (score: number, level: number, lives: number, highScore: number) => void;
    onGameOver?: (score: number, level: number) => void;
  } = {},
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get 2d context');

  let state = STATE.MENU;
  let animFrameId: number | null = null;

  // Player
  const frogRef = createInitialFrog();
  let cars = createCars(1);
  let score = 0;
  let level = 1;
  let lives = MAX_LIVES;
  let combo = 0; // consecutive goals without dying

  // Effects
  let effectHit = 0;
  let effectSuccess = 0;
  let effectTime = 0;

  // Particles
  let particles: Particle[] = [];

  // Ambient
  let fireflies: Firefly[] = [];
  let waterSparkles: WaterSparkle[] = [];
  let lilyPads: LilyPad[] = [];

  // Input
  type Direction = 'up' | 'down' | 'left' | 'right';
  const keys = { up: false, down: false, left: false, right: false };

  // High score (read once from localStorage)
  let highScore = 0;
  try {
    const raw = localStorage.getItem('frogger-base-high-score');
    if (raw) highScore = Number(raw) || 0;
  } catch { /* ignore */ }

  // Cached gradient (rebuilt on resize)
  let bgGradient: CanvasGradient | null = null;
  function ensureGradient() {
    if (bgGradient) return bgGradient;
    const g = ctx!.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    g.addColorStop(0, '#0f3f2f');
    g.addColorStop(0.35, '#22635d');
    g.addColorStop(0.36, '#2a2f37');
    g.addColorStop(1, '#12203f');
    bgGradient = g;
    return g;
  }

  // ---- Helpers ----

  function notifyHUD() {
    cb.onScoreChange?.(score, level, lives, highScore);
  }

  function initAmbient() {
    fireflies = createFireflies();
    waterSparkles = createWaterSparkles();
    lilyPads = createLilyPads();
  }

  function loseLife() {
    lives--;
    effectHit = 380;
    playSound('hit');
    navigator.vibrate?.([30, 20, 30]);

    // Explosion particles on death
    spawnExplosion(
      particles,
      frogRef.x + PLAYER_SIZE / 2,
      frogRef.y + PLAYER_SIZE / 2,
      ['#ff6b6b', '#ffd93d', '#ff6b6b', '#fff'],
    );

    if (lives <= 0) {
      finishGame();
    } else {
      // Reset frog to start but keep score/level
      const startX = CANVAS_WIDTH / 2 - PLAYER_SIZE / 2;
      frogRef.x = startX;
      frogRef.y = CANVAS_HEIGHT - PLAYER_SIZE - 14;
      frogRef.targetX = startX;
      frogRef.targetY = CANVAS_HEIGHT - PLAYER_SIZE - 14;
      frogRef.hopTimer = 0;
      frogRef.facing = 'up';
      frogRef.squash = 0;
      combo = 0;
      notifyHUD();
    }
  }

  function finishGame() {
    state = STATE.OVER;
    lives = 0;
    if (score > highScore) {
      highScore = score;
      try { localStorage.setItem('frogger-base-high-score', String(highScore)); } catch { /* ignore */ }
    }
    setTimeout(() => {
      cb.onGameOver?.(score, level);
    }, 200);
  }

  // ---- Movement ----

  function movePlayer(direction: Direction) {
    if (state !== STATE.PLAY) return;

    const frog = frogRef;
    if (frog.hopTimer > 0) return;

    let nextX = frog.targetX;
    let nextY = frog.targetY;

    if (direction === 'up') nextY = Math.max(0, frog.targetY - STEP);
    if (direction === 'down') nextY = Math.min(CANVAS_HEIGHT - PLAYER_SIZE, frog.targetY + STEP);
    if (direction === 'left') nextX = Math.max(0, frog.targetX - STEP);
    if (direction === 'right') nextX = Math.min(CANVAS_WIDTH - PLAYER_SIZE, frog.targetX + STEP);

    if (nextX === frog.targetX && nextY === frog.targetY) return;

    frog.targetX = nextX;
    frog.targetY = nextY;
    frog.facing = direction;
    frog.hopTimer = frog.hopDuration;
    frog.startX = frog.x;
    frog.startY = frog.y;
    frog.squash = 1;
    playSound('move');
    navigator.vibrate?.(8);
  }

  // ---- Render ----

  function drawScene(time: number) {
    ctx!.imageSmoothingEnabled = false;
    ctx!.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 1. Background gradient (cached)
    ctx!.fillStyle = ensureGradient();
    ctx!.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. Grass zones
    ctx!.fillStyle = '#3f9b45';
    ctx!.fillRect(0, 0, CANVAS_WIDTH, 78);
    ctx!.fillRect(0, 362, CANVAS_WIDTH, 118);

    // 2b. Grass tufts
    for (const tuft of GRASS_TUFTS) {
      ctx!.fillStyle = '#2f855a';
      ctx!.fillRect(tuft.x, tuft.y, 2, 4);
      ctx!.fillRect(tuft.x + 3, tuft.y - 1, 2, 3);
      ctx!.fillRect(tuft.x - 2, tuft.y + 1, 2, 3);
    }

    // 2c. Grass flowers
    for (const flower of GRASS_FLOWERS) {
      ctx!.fillStyle = flower.color;
      ctx!.fillRect(flower.x, flower.y, 3, 3);
      ctx!.fillStyle = '#fde68a';
      ctx!.fillRect(flower.x + 1, flower.y + 1, 1, 1);
    }

    // 3. Road + road dashes + road edge lines
    ctx!.fillStyle = '#15191e';
    ctx!.fillRect(0, ROAD_TOP, CANVAS_WIDTH, ROAD_HEIGHT);

    // Road edge lines (top and bottom)
    ctx!.fillStyle = '#fbbf24';
    ctx!.fillRect(0, ROAD_TOP, CANVAS_WIDTH, 2);
    ctx!.fillRect(0, ROAD_TOP + ROAD_HEIGHT - 2, CANVAS_WIDTH, 2);

    // Road dashes
    for (let y = ROAD_TOP + 36; y < ROAD_TOP + ROAD_HEIGHT; y += 48) {
      for (let x = 8; x < CANVAS_WIDTH; x += 32) {
        ctx!.fillStyle = '#fbbf24';
        ctx!.fillRect(x, y, 16, 3);
      }
    }

    // 4. Water + water sparkles + lily pads
    ctx!.fillStyle = '#1d4ed8';
    ctx!.fillRect(0, WATER_TOP, CANVAS_WIDTH, WATER_HEIGHT);

    // Water wave shimmer
    for (let x = 0; x < CANVAS_WIDTH; x += 6) {
      const waveAlpha = (Math.sin(time / 300 + x / 20) + 1) / 2 * 0.12;
      ctx!.fillStyle = `rgba(147,197,253,${waveAlpha})`;
      ctx!.fillRect(x, WATER_TOP + Math.sin(time / 500 + x / 15) * 2, 6, 2);
    }

    // Water sparkles
    for (const sp of waterSparkles) {
      const alpha = (Math.sin(time / 350 + sp.phase) + 1) / 2;
      if (alpha > 0.3) {
        ctx!.fillStyle = `rgba(255,255,255,${alpha * 0.7})`;
        ctx!.fillRect(Math.round(sp.x), Math.round(sp.y), 2, 2);
      }
    }

    // Lily pads
    for (const pad of lilyPads) {
      drawLilyPad(ctx!, pad, time);
    }

    // 5. Grass edge tiles (bottom)
    for (let x = 0; x < CANVAS_WIDTH; x += 12) {
      ctx!.fillStyle = x % 24 === 0 ? '#2f855a' : '#256d48';
      ctx!.fillRect(x, 0, 12, 12);
      ctx!.fillRect(x, 468, 12, 12);
    }

    // 6. Fireflies
    for (const fly of fireflies) {
      drawFirefly(ctx!, fly, time);
    }

    // 7. Cars
    for (const car of cars) drawCar(ctx!, car, time);

    // 8. Frog glow (under frog, only during play)
    if (state === STATE.PLAY) {
      drawFrogGlow(ctx!, frogRef, time);
    }

    // 9. Frog
    drawFrog(ctx!, frogRef, effectTime);

    // 10. Particles (on top of everything)
    drawParticles(ctx!, particles);

    // 11. Success flash
    if (effectSuccess > 0) {
      ctx!.fillStyle = `rgba(255,255,255,${Math.min(0.65, effectSuccess / 240)})`;
      ctx!.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx!.fillStyle = '#22c55e';
      ctx!.font = "bold 20px 'Press Start 2P', monospace";
      ctx!.textAlign = 'center';
      const bonusText = combo > 1 ? `+${combo} COMBO!` : '+1 NICE!';
      ctx!.fillText(bonusText, CANVAS_WIDTH / 2, 56);
    }

    // 11b. Hit ring
    if (effectHit > 0) {
      const r = 20 + (380 - effectHit) * 0.1;
      ctx!.strokeStyle = `rgba(248,113,113,${effectHit / 420})`;
      ctx!.lineWidth = 3;
      ctx!.beginPath();
      ctx!.arc(frogRef.x + 12, frogRef.y + 12, r, 0, Math.PI * 2);
      ctx!.stroke();
    }
  }

  // ---- Update ----

  function update(time: number, delta: number) {
    effectTime += delta;

    // Update particles
    updateParticles(particles, delta);

    // Update fireflies
    for (const fly of fireflies) {
      fly.x = fly.baseX + Math.sin(time / 1000 * fly.speed + fly.phase) * 20;
      fly.y = fly.baseY + Math.cos(time / 1300 * fly.speed + fly.phase) * 8;
    }

    const frog = frogRef;
    if (frog.hopTimer > 0) {
      const progress = Math.min(1, 1 - frog.hopTimer / frog.hopDuration);
      const eased = 1 - Math.pow(1 - progress, 3);
      frog.x = frog.startX + (frog.targetX - frog.startX) * eased;
      frog.y = frog.startY + (frog.targetY - frog.startY) * eased;
      frog.hopTimer = Math.max(0, frog.hopTimer - delta);
      frog.squash = Math.max(0, frog.squash - delta / 160);
      if (frog.hopTimer <= 0) {
        frog.x = frog.targetX;
        frog.y = frog.targetY;
      }
    }

    if (state !== STATE.PLAY) return;

    // Move cars
    for (const car of cars) {
      car.x += car.speed * (delta / 16.67);
      if (car.speed > 0 && car.x > CANVAS_WIDTH + 8) car.x = -car.width - 8;
      if (car.speed < 0 && car.x + car.width < -8) car.x = CANVAS_WIDTH + 8;
    }

    // Collision detection — car hit
    const hit = cars.some(
      (car) =>
        frog.x + 3 < car.x + car.width - 3 &&
        frog.x + PLAYER_SIZE - 3 > car.x + 3 &&
        frog.y + 5 < car.y + car.height - 4 &&
        frog.y + PLAYER_SIZE - 5 > car.y + 3,
    );

    // Water hazard — frog in water zone and not on a lily pad
    const frogCenterX = frog.x + PLAYER_SIZE / 2;
    const frogCenterY = frog.y + PLAYER_SIZE / 2;
    const inWater = frogCenterY > WATER_TOP + 2 && frogCenterY < WATER_TOP + WATER_HEIGHT - 2;
    const onLilyPad = lilyPads.some(
      (pad) => Math.abs(frogCenterX - pad.x) < pad.size + 4 &&
               Math.abs(frogCenterY - pad.y) < pad.size + 4,
    );

    if (hit) {
      loseLife();
    } else if (inWater && !onLilyPad && frog.hopTimer <= 0) {
      // Drowned in water!
      playSound('hit');
      loseLife();
    } else if (frog.y <= GOAL_LINE) {
      // Reached goal!
      effectSuccess = 220;
      playSound('score');
      navigator.vibrate?.(15);
      combo++;

      // Score bonus: base + combo bonus + level bonus
      const baseScore = 10;
      const comboBonus = Math.min(combo - 1, 5) * 5; // +5 per combo, max +25
      const levelBonus = (level - 1) * 3;
      const totalGained = baseScore + comboBonus + levelBonus;
      score += totalGained;

      // Sparkle particles on score
      spawnSparkles(
        particles,
        frog.x + PLAYER_SIZE / 2,
        frog.y + PLAYER_SIZE / 2,
        ['#22c55e', '#4ade80', '#fbbf24', '#fff'],
      );

      if (score >= level * 30) {
        level = Math.min(9, level + 1);
        cars = createCars(level);
        playSound('levelup');
      }

      // Reset frog to start
      const startX = CANVAS_WIDTH / 2 - PLAYER_SIZE / 2;
      frog.x = startX;
      frog.y = CANVAS_HEIGHT - PLAYER_SIZE - 14;
      frog.targetX = startX;
      frog.targetY = CANVAS_HEIGHT - PLAYER_SIZE - 14;
      frog.hopTimer = 0;
      frog.facing = 'up';
      frog.squash = 0;
      notifyHUD();
    }

    // Decay effects
    effectHit = Math.max(0, effectHit - delta);
    effectSuccess = Math.max(0, effectSuccess - delta);
  }

  // ---- Loop ----

  let lastTime = performance.now();

  function loop(time: number) {
    const delta = Math.min(32, time - lastTime);
    lastTime = time;

    update(time, delta);
    drawScene(time);

    animFrameId = requestAnimationFrame(loop);
  }

  function resetGame() {
    const newFrog = createInitialFrog();
    frogRef.x = newFrog.x;
    frogRef.y = newFrog.y;
    frogRef.targetX = newFrog.targetX;
    frogRef.targetY = newFrog.targetY;
    frogRef.hopTimer = 0;
    frogRef.startX = newFrog.startX;
    frogRef.startY = newFrog.startY;
    frogRef.facing = 'up';
    frogRef.squash = 0;

    cars = createCars(1);
    score = 0;
    level = 1;
    lives = MAX_LIVES;
    combo = 0;
    effectHit = 0;
    effectSuccess = 0;
    effectTime = 0;
    particles = [];
    bgGradient = null; // reset cached gradient

    // Initialize ambient elements on each game start
    initAmbient();

    notifyHUD();
  }

  // ---- Public API ----

  return {
    /** Start / resume the game loop and begin a new session */
    start() {
      state = STATE.PLAY;
      resetGame();
      playSound('start');
      if (!animFrameId) {
        lastTime = performance.now();
        loop(lastTime);
      }
    },

    /** Pause the game */
    pause() {
      if (state === STATE.PLAY) state = STATE.PAUSE;
    },

    /** Resume from pause */
    resume() {
      if (state === STATE.PAUSE) state = STATE.PLAY;
    },

    /** Stop the loop and reset to menu state */
    stop() {
      state = STATE.MENU;
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
    },

    /** @returns true if the engine is currently in PLAY state */
    isPlaying() {
      return state === STATE.PLAY;
    },

    /** @returns true if game is over */
    isGameOver() {
      return state === STATE.OVER;
    },

    // Keyboard input bindings
    keyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') { keys.up = true; movePlayer('up'); }
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') { keys.down = true; movePlayer('down'); }
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') { keys.left = true; movePlayer('left'); }
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') { keys.right = true; movePlayer('right'); }
    },

    keyUp(e: KeyboardEvent) {
      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') keys.up = false;
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') keys.down = false;
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keys.left = false;
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keys.right = false;
    },

    // Touch helpers — for mobile D-pad controls
    touchUp()   { movePlayer('up'); },
    touchDown()  { movePlayer('down'); },
    touchLeft()  { movePlayer('left'); },
    touchRight() { movePlayer('right'); },

    /** Get current score */
    getScore() { return score; },
    /** Get current level */
    getLevel() { return level; },
    /** Get high score */
    getHighScore() { return highScore; },
    /** Get current lives */
    getLives() { return lives; },
  };
}
