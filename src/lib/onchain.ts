// ---- Leaderboard helpers (local storage) ----
const LB_KEY = 'frogger-base-leaderboard-v2';

export interface LocalEntry {
  name: string;
  score: number;
  level: number;
  ts: number;
}

export function loadLocalLB(): LocalEntry[] {
  try { return JSON.parse(localStorage.getItem(LB_KEY) || '[]'); }
  catch { return []; }
}

export function saveLocalScore(name: string, score: number, level: number) {
  const lb = loadLocalLB();
  lb.push({ name, score, level, ts: Date.now() });
  lb.sort((a, b) => b.score - a.score);
  localStorage.setItem(LB_KEY, JSON.stringify(lb.slice(0, 20)));
}

/** Escape HTML to prevent XSS in leaderboard names */
export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
