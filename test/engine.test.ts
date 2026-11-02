import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/audio.js', () => ({ playSound: vi.fn() }));

vi.mock('../src/lib/world.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/world.js')>();
  return {
    ...actual,
    createCars: () => [],
    createFireflies: () => [],
    createWaterSparkles: () => [],
    createLilyPads: () => [
      { x: 180, y: 84, size: 14, phase: 0, rotation: 0 },
      { x: 180, y: 93, size: 14, phase: 0, rotation: 0 },
      { x: 180, y: 102, size: 14, phase: 0, rotation: 0 },
    ],
  };
});

import { createEngine } from '../src/lib/engine.js';
import type { SceneSnapshot } from '../src/lib/three-scene.js';

function createHarness() {
  const snapshots: SceneSnapshot[] = [];
  let callbacks: Array<(time: number) => void> = [];
  let now = 0;
  let nextFrameId = 1;

  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
    callbacks.push(callback);
    return nextFrameId++;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    callbacks = [];
  });
  vi.stubGlobal('performance', { now: () => now });
  vi.stubGlobal('navigator', { vibrate: vi.fn() });

  const scene = {
    render: (snapshot: SceneSnapshot) => { snapshots.push(snapshot); },
    resize: vi.fn(),
    dispose: vi.fn(),
  };

  const pump = (frames: number, step = 16) => {
    for (let index = 0; index < frames; index++) {
      now += step;
      const pending = callbacks;
      callbacks = [];
      for (const callback of pending) callback(now);
    }
  };

  return { scene, snapshots, pump, engine: createEngine(null, {}, { scene }) };
}

describe('3D engine integration', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('scores a goal and preserves the raw-score contract', () => {
    const harness = createHarness();
    harness.engine.start();
    harness.pump(5);

    for (let row = 0; row < 18; row++) {
      harness.engine.touchUp();
      harness.pump(12);
    }

    expect(harness.engine.getRawScore()).toBeGreaterThanOrEqual(10);
    expect(harness.engine.getLives()).toBe(3);
    expect(harness.snapshots.at(-1)?.gameplayActive).toBe(true);
  });

  it('consumes a Charge and exposes Dash to the renderer', () => {
    const harness = createHarness();
    harness.engine.start();
    harness.pump(5);

    for (let row = 0; row < 16; row++) {
      harness.engine.touchUp();
      harness.pump(12);
    }

    const before = harness.engine.getCharges();
    expect(before).toBeGreaterThan(0);

    harness.engine.touchDash();
    harness.pump(2);

    expect(harness.engine.getCharges()).toBe(before - 1);
    expect(harness.snapshots.at(-1)?.dashActive).toBe(true);
  });

  it('pauses and resumes without resetting the run', () => {
    const harness = createHarness();
    harness.engine.start();
    harness.pump(5);
    harness.engine.touchUp();
    harness.pump(12);

    harness.engine.pause();
    harness.pump(3);
    expect(harness.snapshots.at(-1)?.gameplayActive).toBe(false);

    harness.engine.resume();
    harness.pump(3);
    expect(harness.snapshots.at(-1)?.gameplayActive).toBe(true);
    expect(harness.engine.getLives()).toBe(3);
  });
});
