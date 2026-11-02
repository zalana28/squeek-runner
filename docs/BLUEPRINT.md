# squeek-runner — Blueprint (final, disetujui 2026-11-02)

Basis: draft v2 + koreksi Pace/Surge. Dokumen ini yang dipakai saat kerja; kalau bertentangan
dengan docs Squeekchain yang live, **docs live yang benar** dan blueprint ini diperbarui.

Sumber aturan: https://docs.squeekchain.com — Developers → Deployments, Quickstart, core.md,
api.md, dan deployment record `sepolia.json`.

---

## 1. Identitas

| Field | Nilai |
|---|---|
| Repo | `squeek-runner` (public, proyek baru) |
| Produk | Squeek Runner — WHEELY9000 Arcade |
| Jaringan | Sepolia saja, chainId `11155111`, read-only |
| Wallet | Tidak ada di v1 |
| Deploy | Vercel (fallback subdomain; domain sendiri ditanyakan) |
| Target badge | The Buildooooor (proyek + atribusi) · The Tester (v2) |
| Basis | engine + sprites + styles dari `frogger-base-web3`; lapisan Base/Farcaster/OnchainKit/Builder Code/kontrak lama dibuang |

**Tujuan**: (1) seru walau hamster IDLE; (2) integrasi yang bisa dipertanggungjawabkan baris per
baris ke 11 integration invariants docs; (3) live di domain sendiri, siap submit.

**Non-goals v1**: tidak ada kontrak baru, transaksi, wallet, atau kebutuhan gas pemain; tidak ada
Farcaster/Base App/OnchainKit/ERC-8021; tidak ada klaim SQK dan tidak ada staking; tidak
menjanjikan nilai ekonomi.

---

## 2. Arsitektur

```
Browser (Vite + React + viem)
  ├─ GameCanvas / engine.ts    ← pace, surge, charge, dash, score
  ├─ hooks/useSqueekPulse.ts   ← snapshot, polling, reorg guard, cache, pause, lag
  ├─ lib/verify.ts             ← verifikasi seluruh graf (Core, Mining, Token, NFT)
  ├─ lib/squeek.ts             ← viem read: state(), roundPage(), configuration()
  ├─ lib/pulse.ts              ← pace, surge, charge, bonus (bigint)
  ├─ lib/api.ts                ← klien api.squeekchain.com — DISPLAY ONLY, M7
  └─ config/record.json        ← hasil sync-record, disalin saat build
        │
        ├── RPC Sepolia (read di blok N = latest − 12)  → satu-satunya sumber skor
        └── api.squeekchain.com/v1                       → label & animasi saja
```

Aturan keras: skor, Charge, dan bonus hanya boleh berasal dari kontrak. Nilai API tidak pernah
masuk logika skor atau fisika game, dan label API disembunyikan bila identitasnya tidak cocok
dengan graf terverifikasi (§3.3).

---

## 3. Data contract

### 3.1 Snapshot dan verifikasi

Blok snapshot `N = latest − 12` (konvensi konfirmasi docs). Ambil `block(N)`, simpan hash, semua
read memakai `blockNumber: N`. Setelah selesai, ambil `block(N)` lagi; bila hash beda → buang
snapshot (reorg) dan ulangi.

Verifikasi graf (saat start, lalu tiap 30 menit atau saat identitas API berubah), semuanya di blok N:

1. `chainId == 11155111`.
2. Untuk SqueekCore (v3) dan SqueekMining (v6): slot EIP-1967 implementation & admin;
   `keccak256(getCode(impl))` == runtime hash record; `implementationCodeAddress()` == impl di slot;
   `implementationCodeVersion()` == versi diharapkan; `implementationStorageLayoutDigest()` == digest
   record; `proxyAdmin()` == admin record; `owner()` admin == `EXPECTED_TIMELOCK`.
   (Versi domain EIP-712 `1` adalah identitas lain, bukan versi implementasi.)
3. Tautan graf: `mining.core() == core`, `token.mining() == mining`,
   `mining.collectionPolicy(0).nft == NFT`.
4. `configuration()` Core: `streamId`, `genesisTimestamp`, `guardian`, `reporter`,
   `maxWorkPerRound` sama dengan record; `blockUnitsPerBlock == 1e9` (`Q`), `roundDuration == 600`;
   simpan `targetBlocksPerActiveRound` (`T`).
5. Konsistensi `state()`: `blockHeight == cumulativeBlockUnits / Q` dan
   `blockProgress == cumulativeBlockUnits % Q`; `roundPage(f, f, 0).end` cocok dengan `state()`.
6. Simpan `{blockNumber, blockHash, verifiedAt}` untuk HUD.

Gagal salah satu → `ARCADE (UNVERIFIED)` dengan alasan singkat di HUD. Tidak pernah fallback ke
alamat atau nilai default lain.

### 3.2 Pembacaan berkala

| Apa | Kapan | Catatan |
|---|---|---|
| `SqueekCore.state()` | tiap 15 detik (jeda saat tab tersembunyi) | `settledThroughRound` (f), `cumulativeBlockUnits`, `blockHeight`, `workPerThousandBlocks`, `paused` |
| `roundPage(r, r, 0).end` | hanya saat frontier maju | point read untuk f, f−3, f−24, f−144; posisi certified tidak berubah → cache per round, buang saat reorg |
| `currentRound` | tiap snapshot | `floor((ts_N − genesis) / 600) + 1` dari timestamp blok N (V3 tidak punya `currentRound()`) |
| `/v1/core` | start + tiap 5 menit | hanya cek identitas (§3.3) — M7 |
| `/v1/status` | tiap 30 detik | label SHIFT, PENDING, ETA — M7 |
| `/v1/measurement/blocks` | tiap 30 detik, maks 2 rps | animasi reveal-once per height — M7 |

`uint64` ke atas tetap `bigint`; `workPerThousandBlocks` (uint32) datang sebagai `number` dari viem.
Round di atas frontier = unknown, bukan nol.

### 3.3 Aturan klien API (M7)

Cek `schemaVersion` per endpoint (integer di `/v1/status`, string `game-block-projection.v1` di
`/v1/measurement/blocks`) dan tolak versi tak dikenal. `"status": "unavailable"` dengan HTTP 200
berarti unknown. Respons di luar skema = error. Hormati 429 + `Retry-After`; pakai ETag bila ada.
`/v1/core` `identities.core` dan `implementation.codeVersion` harus cocok dengan record + hasil
verifikasi; bila beda, semua label API disembunyikan. Catatan: `blocks[].completingAt` adalah waktu
passage yang melewati threshold, **bukan ETA**.

### 3.4 Profil graf

v1 memakai satu profil: `docs-record` (Core `0x74665dAecA35A2303e767E76a2FF1FB6F93e119f`).
Profil kedua (`stream-game`, Core `0x980b4424…`) **ditunda** sampai tim mempublikasikan record
resminya. Identitas on-chain graf kedua sudah dibaca dan dilampirkan di `DISCORD-QUESTION.md`, dan
**tidak boleh** dijadikan `expected` di kode: mem-verifikasi graf terhadap nilai yang dibaca dari
graf itu sendiri adalah circular. HUD selalu menampilkan `SOURCE` + blok.

---

## 4. Gameplay

### 4.1 Loop inti (warisan Frogger, skill-based)

Cross lane → skor per baris → combo → 3 lives → naik level tiap ambang skor (sudah ada di
`engine.ts`). `rawScore` = skor engine **sebelum** scoreMul, surge, Tailwind, dan bonus.

### 4.2 Pace (fisika dunia)

```
Q = blockUnitsPerBlock (1e9)   T = targetBlocksPerActiveRound (40)   // dari configuration()
f = settledThroughRound        a = max(0, f − 144)                   // jendela 144 round ≈ harian
U(r) = roundPage(r, r, 0).end.cumulativeBlockUnits
Δblocks = U(f)/Q − U(a)/Q                                            // floor dulu, baru kurang
blocksPerRound = Δblocks / (f − a)                                   // bigint → permille
pacePermille = min(1000, blocksPerRound × 1000 / PACE_CEILING)       // PACE_CEILING = 10 blok/round
pace = pacePermille / 1000
speedMul = 1 + 0.8 × pace        // dikunci saat level dimulai, di-lerp 2 detik, tidak berubah di tengah level
```

`f − a == 0` → pace unknown (bukan nol). **PACE adalah rata-rata harian, bukan "hamster sedang
lari"** — label HUD `24H PACE`. Surge tidak pernah mengubah kecepatan lane.

Kalibrasi (diukur 2026-11-02): docs-record 5,13 blok/round → pace 0,51; stream-game 5,80 → 0,58.
`PACE_CEILING = 10` ditinjau ulang tiap beberapa minggu; datanya baru dua minggu.

### 4.3 Surge (sesaat)

```
ΔblocksSnap = U(f_now)/Q − U(f_prev)/Q                       // antar snapshot yang sama-snapshot valid
surgePermille = min(1000, ΔblocksSnap × 1000 / T)
```

| ΔblocksSnap | Charge |
|---|---|
| 1–19 | +1 |
| 20–39 | +2 |
| ≥ T (40) | +3 |

Cap Charge 5. Surge memicu flash HUD `SETTLEMENT SURGE` dan jendela skor **30 detik**.

**Guard anti-surge palsu**: snapshot pertama sebuah sesi hanya jadi baseline, bukan surge; bila
polling terjeda (tab tersembunyi) atau jeda antar snapshot > ~60 detik, reset baseline, jangan
hitung selisihnya; reorg juga mereset baseline.

### 4.4 Charge, Dash, Tailwind, Warm Wheel

- **Charge skill**: +1 tiap 8 baris diseberangi. Tidak bergantung hamster.
- **Charge settlement**: dari tabel surge di atas.
- **Squeek Dash** (1 Charge): kebal 3,0 detik, skor ×2, cooldown 1,5 detik, tombol/spasi.
- **Tailwind** (turunan kontrak): aktif bila `U(f) > U(f−3)`, dikunci saat run mulai, bonus ×1,25.
  Tidak ada hubungannya dengan label SHIFT dari API.
- **Warm Wheel**: mulai dengan 1 Charge bila **pace ≥ 0,3** (bukan sekadar Δ > 0, karena pace
  normal ~0,55 akan selalu aktif).

### 4.5 Skor akhir (stacking dibatasi)

```
surgeMul = jendela surge aktif ? 2 : 1
effMul   = min(3.0, scoreMul × surgeMul)      // scoreMul = 1 + pace  (maks 2,0)
base     = rawScore × effMul
bonus     = min( min(settledBlocksDuringSession, 40) × 10 , 0.25 × base )
finalScore = (base + bonus) × (Tailwind ? 1.25 : 1.0)
```

Poin yang terkumpul selama jendela surge dicatat terpisah. Simpan per skor:
`{rawScore, finalScore, pacePermille, surgeBlocks, snapshotBlock}`. Leaderboard lokal diurut
berdasarkan **rawScore**; finalScore ditampilkan sebagai info.

### 4.6 Degradasi

| Kondisi | Deteksi | Perilaku |
|---|---|---|
| Verifikasi gagal | salah satu cek §3.1 | `ARCADE (UNVERIFIED)`, alasan di HUD, game jalan |
| Settlement lag | `lag = currentRound − 1 − f > 3` (ambang awal, dikalibrasi M3) | label `SETTLEMENT LAG`, pace ditahan, Charge settlement berhenti |
| Core paused | `state().paused == true` | label `PAUSED`, Charge settlement berhenti, game jalan |
| Reorg saat baca | hash blok N berbeda saat dibaca ulang | buang snapshot + cache round, reset baseline surge |
| RPC gagal | error/timeout | tahan nilai terakhir ≤ 5 menit, lalu pace netral 0,3 berlabel `UNKNOWN` |
| API unavailable / identitas beda / skema asing | §3.3 | sembunyikan label API saja; kontrak tetap jalan |
| Belum ada blok | `blockHeight == 0` | arcade normal, bonus 0 |
| Upgrade di tengah sesi | verifikasi ulang gagal | turun ke UNVERIFIED, tanpa fallback |

Prinsip: **unknown ≠ nol**.

### 4.7 HUD

`24H PACE ▮▮▯` + trend (24 vs 144) · `CHARGES n/5` · `SETTLED +n` · `SETTLED THROUGH hh:mm UTC`
(= `genesis + f × 600`) + `LAG n round` · `SURGE` flash · `SOURCE docs-record · blk N` ·
ETA blok berikutnya hanya sebagai "perkiraan", disembunyikan saat pace 0. Tombol `?` membuka
panel "What this means": settled vs pending, testnet tanpa nilai uang, dan cara memverifikasi sendiri.
Lapisan kosmetik yang selalu aktif (pengganti label API): roda latar berputar sebanding pace, pose
hamster ikut pace, ticker "last settlement".

---

## 5. Struktur berkas & dependensi

```
squeek-runner/
  index.html  package.json  vite.config.ts  tsconfig*.json  eslint.config.js  vercel.json
  README.md  LICENSE  docs/BLUEPRINT.md  docs/DISCORD-QUESTION.md
  scripts/sync-record.ts        # sepolia.json → src/config/record.json (build time) + CI diff
  scripts/verify-cli.ts         # verifikasi graf dari terminal / CI
  scripts/compare-hud.ts        # HUD vs eth_call langsung di blok sama
  .github/workflows/ci.yml      # check, test, build
  .github/workflows/verify-daily.yml
  src/
    config/record.json   abi/ (SqueekCore.json resmi + Mining/Token/NFT; hash ABI dites)
    lib/ squeek.ts verify.ts pulse.ts api.ts engine.ts sprites.ts storage.ts audio.ts
    hooks/useSqueekPulse.ts
    components/ GameCanvas HUD PulseMeter SurgeFlash ChargeIndicator UnverifiedNotice
                GameOverOverlay Leaderboard InfoPanel
  test/ pulse verify degradation api
```

Dibuang dari template: `contracts/`, `wrangler.jsonc`, `src/config/wagmi.ts`, `src/config/chain.ts`
(ganti), `src/hooks/useBuilderCodeTransaction.ts`, `src/hooks/useMiniApp.ts`, `src/abi/FroggerLeaderboard.json`,
`src/components/WalletGate.tsx`, `@coinbase/onchainkit`, `@farcaster/miniapp-sdk`, `ox`, `wagmi`,
`@tanstack/react-query`, `base:app_id`, `fc:miniapp`, `fc:frame`.

Tetap: `react`, `react-dom`, `viem`, `vite`, `typescript`, `eslint`. Tambah: `vitest`.

Environment: `VITE_RPC_URL` (opsional; jangan isi URL berkunci API — terekspos di bundle),
`VITE_API_BASE_URL`. **Tidak ada private key di mana pun.** Record disalin saat build, tidak pernah
di-fetch saat runtime.

---

## 6. Peta invariants docs → implementasi

| # | Aturan | Penegakan |
|---|---|---|
| 1 | Verify before reading | `verify.ts` (§3.1), sebelum layer hamster + tiap 30 menit |
| 2 | One block per snapshot | semua read `blockNumber: N`, hash dicek ulang |
| 3 | bigint | `pulse.ts` hanya bigint; permille (≤1000) baru dikonversi |
| 4 | Block dari block units | `Δblocks` = selisih floor(U/Q), bukan work/difficulty |
| 5 | Harga difficulty sebelumnya | tidak dipakai v1 (kita tidak mem-price round) — dicatat di README |
| 6 | Hormati frontier | semua read ≤ `settledThroughRound`; di atasnya unknown |
| 7 | ownerOf live | v2 |
| 8 | Prepare, don't sign | v2; v1 tanpa tx dan tanpa wallet |
| 9 | Count supply once | v2 / analytics |
| 10 | Reorg | cek hash snapshot; cache round dibuang; baseline surge direset |
| 11 | Metadata untrusted | bila art Squeek ditampilkan: `<img>` terisolasi, bukan inline SVG |
| + | API display only, unavailable ≠ nol, cek schemaVersion | `api.ts` (§3.3) |
| + | Pin ABI, record dari sumber resmi saat build | `sync-record` + CI diff + verify harian |

---

## 7. Milestone

| M | Isi | Acceptance criteria | Estimasi |
|---|---|---|---|
| M0 | Repo public, README, LICENSE, template frogger masuk, build jalan | `npm run build` hijau | 0,5 h ✅ |
| M1 | Buang Base/Farcaster/OnchainKit/wagmi/kontrak lama; viem saja | `check` + `build` hijau, tak ada import tersisa | 0,5–1 h |
| M2 | `sync-record`, `record.json`, ABI, `verify.ts` (graf penuh) + `verify-cli` | lulus di graf record; satu field sengaja salah → UNVERIFIED | 1,5–2 h |
| M3 | `squeek.ts` + `useSqueekPulse` (snapshot N, reorg, cache, pause, lag) | HUD == `compare-hud`; tanpa `number` untuk total | 2 h |
| M4 | `pulse.ts` (pace, surge, guards, charge, bonus) + kalibrasi ceiling | unit test: 0/1/56 blok sekali settle, batas floor 1e9, f−a=0, jeda >60 s, reorg, cap Charge 5, cap bonus 25% | 1,5 h |
| M5 | Reskin sprites + tema WHEELY9000 + HUD/panel + kosmetik | main 3 sesi, terasa seperti game hamster | 1–1,5 h |
| M6 | Wiring engine: Charge skill/settlement, Dash, Tailwind, Warm Wheel, lock tempo per level | tabel §4.6 diuji lewat simulasi | 1,5–2 h |
| M7 | `api.ts` + label SHIFT/PENDING/reveal + cek identitas **(opsional, terakhir)** | unavailable / skema asing / identitas beda → label hilang | 1 h |
| M8 | CI + verify harian + deploy Vercel + domain + materi submit | URL publik, screenshot HUD dengan SOURCE + blok | 1 h |

Total ± 10,5–12,5 jam. **M0–M6 tidak butuh API dan tidak menunggu jawaban tim.** Yang menunggu
jawaban tim: M7 dan submit final.

v2 (belakangan): wallet + Squeek Bond via `balanceOf` · kontrak leaderboard Sepolia (The Tester) ·
mode prediksi round (resolve settled-only) · indexer kecil bila polling berat · profil kedua setelah
record dipublikasikan.

---

## 8. Rencana uji

1. Unit `pulse.ts`: fixture block units (0, 1, 56 blok sekali settle, persis di batas 1e9), f−a=0,
   pace permille, surge → Charge (+1/+2/+3, cap 5), guard jeda >60 s dan reorg, bonus ≤25%, cap effMul 3,0.
2. Unit `verify.ts`: tiap mismatch (impl, runtime hash, layout digest, admin, owner, tautan graf,
   config, konsistensi state) → UNVERIFIED, tanpa fallback.
3. Unit `api.ts`: schemaVersion asing, unavailable HTTP 200, identitas beda, 429.
4. Degradasi via mock RPC: lag > ambang, paused, ganti block hash, timeout, upgrade di tengah sesi.
5. Kontrak-read: `compare-hud.ts` di blok yang sama; output ditempel di PR.
6. Manual QA: main tanpa API, panel `?`, kontras & gerak Dash, mobile touch.
7. Pre-submit: screenshot HUD dengan SOURCE + blok + `SETTLED THROUGH`.

---

## 9. Risiko & mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| **Frontier `docs-record` berhenti** (terukur: f=1973, last settle 2026-10-26 16:20 UTC, lag 990 round) | pace beku, surge tidak pernah fires | HUD `SETTLED THROUGH` + `LAG` menampilkan keaslian keadaan; profil kedua menunggu record resmi; `verify-daily` di CI memberi sinyal |
| Docs tidak konsisten soal graf resmi | data terlihat salah di mata tim | satu profil, fail-closed, cek identitas API, tanya Discord |
| Kontrak bisa di-upgrade (timelock 60 detik) | layer hamster mati | UNVERIFIED tetap playable; verifikasi ulang 30 menit; pin ABI v3 |
| Hamster IDLE berjam-jam | tempo datar | Charge skill + Warm Wheel + lapisan kosmetik; pace harian tetap ~0,5 |
| RPC publik rate-limit | HUD basi | cache point read, jeda polling saat tab tersembunyi, `VITE_RPC_URL` tanpa key |
| Charge/bonus mendominasi | bukan skill lagi | effMul cap 3,0, bonus cap 25%, leaderboard rawScore |
| Atribusi butuh domain + DNS | badge tertunda | deploy Vercel dulu, tanya tim; IMD cadangan |
| Kesan "main dapat duit" | masalah trust | copy tegas: testnet, tanpa nilai uang, tidak ada SQK di game |

---

## 10. Keputusan final

Blueprint v2 + Pace/Surge dengan lima penyesuaian (pace hanya fisika; surge bernomor; guard
anti-surge palsu; cap stacking; label jujur) · tanpa wallet di v1 · repo public · domain ditanyakan,
fallback subdomain Vercel · estimasi 10,5–12,5 jam · M0 dimulai sekarang.
