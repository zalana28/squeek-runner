// Squeek Runner — WHEELY9000 Arcade engine

import {
  GAME_WIDTH, GAME_HEIGHT, PLAYER_SIZE, STEP, GOAL_LINE, WATER_TOP, WATER_HEIGHT,
  createCars, createInitialHamster, createFireflies, createWaterSparkles, createLilyPads,
  spawnExplosion, spawnSparkles, updateParticles,
} from './world.js';
import type { Particle } from './world.js';
import { createWorldScene, type WorldScene } from './three-scene.js';
import { playSound } from './audio.js';
import {
  calculateFinalScore,
  hasWarmWheel,
  isTailwindActive,
  settledBlocksSince,
  type PaceSignal,
  type SurgeSignal,
} from './pulse.js';
import type { SqueekSnapshot } from './squeek.js';

export type EngineHud = {
  score: number;
  rawScore: number;
  level: number;
  lives: number;
  highScore: number;
  charges: number;
  dashActive: boolean;
  surgeActive: boolean;
  tailwind: boolean;
};

export type RunResult = {
  rawScore: number;
  finalScore: number;
  level: number;
  pacePermille: number | null;
  surgeBlocks: string;
  snapshotBlock: string | null;
};

export type EnginePulse = {
  status: 'loading' | 'verified' | 'unverified' | 'stale' | 'unknown';
  snapshot: SqueekSnapshot | null;
  pace: PaceSignal | null;
  surge: SurgeSignal | null;
  surgeUntil: number;
};

// ---- Constants ----
const STATE = { MENU: 0, PLAY: 1, PAUSE: 2, OVER: 3 };
const MAX_LIVES = 3;

// ---- Factory ----

export function createEngine(
  canvas: HTMLCanvasElement | null,
  cb: {
    onScoreChange?: (hud: EngineHud) => void;
    onGameOver?: (result: RunResult) => void;
  } = {},
  options: { scene?: WorldScene } = {},
) {
  if (!canvas && !options.scene) throw new Error('A canvas or scene renderer is required');
  const renderer = options.scene ?? createWorldScene(canvas!);

  let state = STATE.MENU;
  let animFrameId: number | null = null;

  // Player
  const hamsterRef = createInitialHamster();
  let cars = createCars(1);
  let rawScore = 0;
  let level = 1;
  let lives = MAX_LIVES;
  let combo = 0;
  let charges = 0;
  let rowsCrossed = 0;
  let latestPulse: EnginePulse = { status: 'loading', snapshot: null, pace: null, surge: null, surgeUntil: 0 };
  let runPacePermille: number | null = null;
  let levelPacePermille: number | null = null;
  let tailwind = false;
  let runStartSnapshot: SqueekSnapshot | null = null;
  let lastSettlementEventId: string | null = null;
  let settledBlocks = 0n;
  let surgeBlocks = 0n;
  let surgeUntil = 0;
  let dashUntil = 0;
  let dashCooldownUntil = 0;
  let currentSpeedMul = 1;
  let targetSpeedMul = 1;
  let lastDashActive = false;
  let lastSurgeActive = false;

  // Effects
  let effectHit = 0;
  let effectSuccess = 0;

  // Particles
  let particles: Particle[] = [];

  // Ambient
  let fireflies = createFireflies();
  let waterSparkles = createWaterSparkles();
  let lilyPads = createLilyPads();

  // Input
  type Direction = 'up' | 'down' | 'left' | 'right';
  const keys = { up: false, down: false, left: false, right: false };

  // High score (read once from localStorage)
  let highScore = 0;
  try {
    const raw = localStorage.getItem('squeek-runner-high-score-v1');
    if (raw) highScore = Number(raw) || 0;
  } catch { /* ignore */ }

  // ---- Helpers ----

  function hasVerifiedPulse() {
    return (latestPulse.status === 'verified' || latestPulse.status === 'stale') && latestPulse.snapshot !== null;
  }

  function dashActiveNow() {
    return performance.now() < dashUntil;
  }

  function surgeActiveNow() {
    return performance.now() < surgeUntil;
  }

  function scoreState() {
    return calculateFinalScore({
      rawScore,
      pacePermille: runPacePermille,
      surgeActive: surgeActiveNow(),
      tailwind,
      settledBlocks,
    });
  }

  function runResult(): RunResult {
    return {
      rawScore,
      finalScore: scoreState().finalScore,
      level,
      pacePermille: runPacePermille,
      surgeBlocks: surgeBlocks.toString(),
      snapshotBlock: latestPulse.snapshot?.blockNumber.toString() ?? null,
    };
  }

  function notifyHUD() {
    cb.onScoreChange?.({
      score: scoreState().finalScore,
      rawScore,
      level,
      lives,
      highScore,
      charges,
      dashActive: dashActiveNow(),
      surgeActive: surgeActiveNow(),
      tailwind,
    });
  }

  function lockLevelPace() {
    levelPacePermille = hasVerifiedPulse() ? latestPulse.pace?.pacePermille ?? null : null;
    targetSpeedMul = 1 + 0.8 * ((levelPacePermille ?? 300) / 1000);
  }

  function updatePulse(pulse: EnginePulse) {
    latestPulse = pulse;
    surgeUntil = pulse.surgeUntil;
    if (state !== STATE.PLAY) return;
    if (!runStartSnapshot && pulse.snapshot) runStartSnapshot = pulse.snapshot;
    if (runStartSnapshot && pulse.snapshot) settledBlocks = settledBlocksSince(runStartSnapshot, pulse.snapshot);
    const event = pulse.surge;
    if (event && event.eventId !== lastSettlementEventId) {
      lastSettlementEventId = event.eventId;
      if (pulse.status === 'verified') {
        charges = Math.min(5, charges + event.chargeAward);
        surgeBlocks += event.deltaBlocks;
      }
    }
    notifyHUD();
  }

  function activateDash() {
    const now = performance.now();
    if (state !== STATE.PLAY || charges === 0 || now < dashCooldownUntil) return;
    charges--;
    dashUntil = now + 3000;
    dashCooldownUntil = now + 1500;
    playSound('levelup');
    navigator.vibrate?.(20);
    notifyHUD();
  }

  function loseLife() {
    lives--;
    effectHit = 380;
    playSound('hit');
    navigator.vibrate?.([30, 20, 30]);

    spawnExplosion(
      particles,
      hamsterRef.x + PLAYER_SIZE / 2,
      hamsterRef.y + PLAYER_SIZE / 2,
      ['#ff6b6b', '#ffd93d', '#ff6b6b', '#fff'],
    );

    if (lives <= 0) {
      finishGame();
    } else {
      const startX = GAME_WIDTH / 2 - PLAYER_SIZE / 2;
      hamsterRef.x = startX;
      hamsterRef.y = GAME_HEIGHT - PLAYER_SIZE - 14;
      hamsterRef.targetX = startX;
      hamsterRef.targetY = GAME_HEIGHT - PLAYER_SIZE - 14;
      hamsterRef.hopTimer = 0;
      hamsterRef.facing = 'up';
      hamsterRef.squash = 0;
      combo = 0;
      notifyHUD();
    }
  }

  function finishGame() {
    state = STATE.OVER;
    lives = 0;
    const result = runResult();
    if (result.finalScore > highScore) {
      highScore = result.finalScore;
      try { localStorage.setItem('squeek-runner-high-score-v1', String(highScore)); } catch { /* ignore */ }
    }
    notifyHUD();
    setTimeout(() => {
      cb.onGameOver?.(result);
    }, 200);
  }

  // ---- Movement ----

  function movePlayer(direction: Direction) {
    if (state !== STATE.PLAY) return;

    const hamster = hamsterRef;
    if (hamster.hopTimer > 0) return;

    let nextX = hamster.targetX;
    let nextY = hamster.targetY;

    if (direction === 'up') nextY = Math.max(0, hamster.targetY - STEP);
    if (direction === 'down') nextY = Math.min(GAME_HEIGHT - PLAYER_SIZE, hamster.targetY + STEP);
    if (direction === 'left') nextX = Math.max(0, hamster.targetX - STEP);
    if (direction === 'right') nextX = Math.min(GAME_WIDTH - PLAYER_SIZE, hamster.targetX + STEP);

    if (nextX === hamster.targetX && nextY === hamster.targetY) return;

    hamster.targetX = nextX;
    hamster.targetY = nextY;
    hamster.facing = direction;
    hamster.hopTimer = hamster.hopDuration;
    hamster.startX = hamster.x;
    hamster.startY = hamster.y;
    hamster.squash = 1;
    if (direction === 'up') {
      rowsCrossed++;
      if (rowsCrossed % 8 === 0 && charges < 5) {
        charges++;
        notifyHUD();
      }
    }
    playSound('move');
    navigator.vibrate?.(8);
  }

  function moveCars(delta: number, multiplier: number) {
    for (const car of cars) {
      car.x += car.speed * multiplier * (delta / 16.67);
      if (car.speed > 0 && car.x > GAME_WIDTH + 8) car.x = -car.width - 8;
      if (car.speed < 0 && car.x + car.width < -8) car.x = GAME_WIDTH + 8;
    }
  }

  // ---- Update ----

  function update(time: number, delta: number) {
    updateParticles(particles, delta);

    for (const fly of fireflies) {
      fly.x = fly.baseX + Math.sin(time / 1000 * fly.speed + fly.phase) * 20;
      fly.y = fly.baseY + Math.cos(time / 1300 * fly.speed + fly.phase) * 8;
    }

    const hamster = hamsterRef;
    if (hamster.hopTimer > 0) {
      const progress = Math.min(1, 1 - hamster.hopTimer / hamster.hopDuration);
      const eased = 1 - Math.pow(1 - progress, 3);
      hamster.x = hamster.startX + (hamster.targetX - hamster.startX) * eased;
      hamster.y = hamster.startY + (hamster.targetY - hamster.startY) * eased;
      hamster.hopTimer = Math.max(0, hamster.hopTimer - delta);
      hamster.squash = Math.max(0, hamster.squash - delta / 160);
      if (hamster.hopTimer <= 0) {
        hamster.x = hamster.targetX;
        hamster.y = hamster.targetY;
      }
    }

    if (state !== STATE.PLAY) {
      moveCars(delta, 0.42);
      effectHit = Math.max(0, effectHit - delta);
      effectSuccess = Math.max(0, effectSuccess - delta);
      return;
    }

    currentSpeedMul += (targetSpeedMul - currentSpeedMul) * Math.min(1, delta / 2000);
    moveCars(delta, currentSpeedMul);

    const hit = cars.some(
      (car) =>
        hamster.x + 3 < car.x + car.width - 3 &&
        hamster.x + PLAYER_SIZE - 3 > car.x + 3 &&
        hamster.y + 5 < car.y + car.height - 4 &&
        hamster.y + PLAYER_SIZE - 5 > car.y + 3,
    );

    const hamsterCenterX = hamster.x + PLAYER_SIZE / 2;
    const hamsterCenterY = hamster.y + PLAYER_SIZE / 2;
    const inWater = hamsterCenterY > WATER_TOP + 2 && hamsterCenterY < WATER_TOP + WATER_HEIGHT - 2;
    const onLilyPad = lilyPads.some(
      (pad) => Math.abs(hamsterCenterX - pad.x) < pad.size + 4 &&
               Math.abs(hamsterCenterY - pad.y) < pad.size + 4,
    );

    if (hit && !dashActiveNow()) {
      loseLife();
    } else if (inWater && !onLilyPad && hamster.hopTimer <= 0 && !dashActiveNow()) {
      playSound('hit');
      loseLife();
    } else if (hamster.y <= GOAL_LINE) {
      effectSuccess = 220;
      playSound('score');
      navigator.vibrate?.(15);
      combo++;

      const baseScore = 10;
      const comboBonus = Math.min(combo - 1, 5) * 5;
      const levelBonus = (level - 1) * 3;
      const totalGained = (baseScore + comboBonus + levelBonus) * (dashActiveNow() ? 2 : 1);
      rawScore += totalGained;

      spawnSparkles(
        particles,
        hamster.x + PLAYER_SIZE / 2,
        hamster.y + PLAYER_SIZE / 2,
        ['#22c55e', '#4ade80', '#fbbf24', '#fff'],
      );

      if (rawScore >= level * 30) {
        level = Math.min(9, level + 1);
        cars = createCars(level);
        lockLevelPace();
        playSound('levelup');
      }

      const startX = GAME_WIDTH / 2 - PLAYER_SIZE / 2;
      hamster.x = startX;
      hamster.y = GAME_HEIGHT - PLAYER_SIZE - 14;
      hamster.targetX = startX;
      hamster.targetY = GAME_HEIGHT - PLAYER_SIZE - 14;
      hamster.hopTimer = 0;
      hamster.facing = 'up';
      hamster.squash = 0;
      notifyHUD();
    }

    const dashActive = dashActiveNow();
    const surgeActive = surgeActiveNow();
    if (dashActive !== lastDashActive || surgeActive !== lastSurgeActive) {
      lastDashActive = dashActive;
      lastSurgeActive = surgeActive;
      notifyHUD();
    }

    effectHit = Math.max(0, effectHit - delta);
    effectSuccess = Math.max(0, effectSuccess - delta);
  }

  function renderScene(time: number) {
    renderer.render({
      hamster: hamsterRef,
      cars,
      particles,
      fireflies,
      waterSparkles,
      lilyPads,
      pace: (levelPacePermille ?? 300) / 1000,
      dashActive: dashActiveNow(),
      surgeActive: surgeActiveNow(),
      effectHit,
      effectSuccess,
      gameplayActive: state === STATE.PLAY,
    }, time);
  }

  // ---- Loop ----

  let lastTime = performance.now();

  function loop(time: number) {
    const delta = Math.min(32, time - lastTime);
    lastTime = time;

    update(time, delta);
    renderScene(time);

    animFrameId = requestAnimationFrame(loop);
  }

  function ensureLoop() {
    if (animFrameId !== null) return;
    lastTime = performance.now();
    animFrameId = requestAnimationFrame(loop);
  }

  function resetGame() {
    const newHamster = createInitialHamster();
    hamsterRef.x = newHamster.x;
    hamsterRef.y = newHamster.y;
    hamsterRef.targetX = newHamster.targetX;
    hamsterRef.targetY = newHamster.targetY;
    hamsterRef.hopTimer = 0;
    hamsterRef.startX = newHamster.startX;
    hamsterRef.startY = newHamster.startY;
    hamsterRef.facing = 'up';
    hamsterRef.squash = 0;

    cars = createCars(1);
    rawScore = 0;
    level = 1;
    lives = MAX_LIVES;
    combo = 0;
    rowsCrossed = 0;
    runPacePermille = hasVerifiedPulse() ? latestPulse.pace?.pacePermille ?? null : null;
    levelPacePermille = runPacePermille;
    tailwind = hasVerifiedPulse() && latestPulse.snapshot !== null && isTailwindActive(latestPulse.snapshot);
    charges = hasVerifiedPulse() && hasWarmWheel(runPacePermille) ? 1 : 0;
    runStartSnapshot = latestPulse.snapshot;
    lastSettlementEventId = latestPulse.surge?.eventId ?? null;
    settledBlocks = 0n;
    surgeBlocks = 0n;
    surgeUntil = latestPulse.surgeUntil;
    dashUntil = 0;
    dashCooldownUntil = 0;
    currentSpeedMul = 1;
    targetSpeedMul = 1 + 0.8 * ((levelPacePermille ?? 300) / 1000);
    lastDashActive = false;
    lastSurgeActive = false;
    effectHit = 0;
    effectSuccess = 0;
    particles = [];
    fireflies = createFireflies();
    waterSparkles = createWaterSparkles();
    lilyPads = createLilyPads();

    notifyHUD();
  }

  ensureLoop();

  // ---- Public API ----

  return {
    /** Start / resume the game loop and begin a new session */
    start() {
      state = STATE.PLAY;
      resetGame();
      playSound('start');
      ensureLoop();
    },

    /** Freeze the run without disposing its 3D world. */
    pause() {
      if (state === STATE.PLAY) state = STATE.PAUSE;
    },

    /** Resume from pause */
    resume() {
      if (state === STATE.PAUSE) state = STATE.PLAY;
    },

    /** Return to the ambient menu presentation. */
    stop() {
      state = STATE.MENU;
    },

    /** @returns true if the engine is currently in PLAY state */
    isPlaying() {
      return state === STATE.PLAY;
    },

    /** @returns true if game is over */
    isGameOver() {
      return state === STATE.OVER;
    },

    resize(width: number, height: number) {
      renderer.resize(width, height);
    },

    dispose() {
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      renderer.dispose();
    },

    // Keyboard input bindings
    keyDown(e: KeyboardEvent) {
      if (e.key === ' ') { e.preventDefault(); activateDash(); }
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
    touchDash() { activateDash(); },
    updatePulse,

    /** Get current score */
    getScore() { return scoreState().finalScore; },
    getRawScore() { return rawScore; },
    getCharges() { return charges; },
    /** Get current level */
    getLevel() { return level; },
    /** Get high score */
    getHighScore() { return highScore; },
    /** Get current lives */
    getLives() { return lives; },
  };
}
