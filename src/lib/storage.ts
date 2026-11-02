import type { RunResult } from './engine.js';

const LB_KEY = 'squeek-runner-leaderboard-v2';

export type LocalEntry = RunResult & { ts: number };

export function loadLocalLB(): LocalEntry[] {
  try { return JSON.parse(localStorage.getItem(LB_KEY) || '[]'); }
  catch { return []; }
}

export function saveLocalScore(result: RunResult) {
  const lb = loadLocalLB();
  lb.push({ ...result, ts: Date.now() });
  lb.sort((a, b) => b.rawScore - a.rawScore || b.finalScore - a.finalScore);
  localStorage.setItem(LB_KEY, JSON.stringify(lb.slice(0, 20)));
}
