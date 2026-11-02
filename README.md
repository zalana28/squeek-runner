# squeek-runner

Arcade lane-crossing yang temponya digerakkan kerja nyata seekor hamster di Sepolia.
Dibangun ulang dari [frogger-base-web3](https://github.com/zalana28/frogger-base-web3); lapisan
Base, Farcaster Mini App, OnchainKit, dan Builder Code dibuang.

Status: **M1–M6 selesai + arena 3D arcade malam** — game hamster playable dengan dunia night-city,
skor pil di tengah, panel Squeekchain di samping pada desktop, dan tata letak khusus untuk tablet
serta phone portrait/landscape. Verifikasi deployment, snapshot, Pace/Surge, Charge/Dash, HUD sumber,
dan leaderboard lokal tetap terhubung. M7 (label API opsional) belum dikerjakan. Blueprint lengkap:
lihat `docs/BLUEPRINT.md`.

## Cara kerjanya

Game membaca `SqueekCore` on-chain dan mengubah kerja hamster yang sudah **settled** jadi dua sinyal:

- **24H PACE** — rata-rata Squeek block per round dalam 144 round certified terakhir. Mengatur
  kecepatan lane (`speedMul`), dikunci per level.
- **SURGE** — blok yang selesai di antara dua snapshot. Memberi Charge, flash HUD, dan bonus skor
  sementara. Tidak mengubah kecepatan lane.

Skor, Charge, dan bonus **hanya** berasal dari kontrak. `api.squeekchain.com` dipakai untuk label
saja, dan label disembunyikan bila identitasnya tidak cocok dengan graf yang terverifikasi.

## Aturan yang tidak bisa dinegosiasikan

1. Alamat, hash implementasi, dan konfigurasi diambil dari deployment record yang dipublikasikan
   (`docs.squeekchain.com/assets/deployments/sepolia.json`), disalin saat build lewat
   `scripts/sync-record.ts` — tidak pernah di-fetch saat runtime, tidak pernah dari explorer,
   pencarian, API, atau chat.
2. Verifikasi graf sebelum layer hamster aktif. Gagal satu cek → mode `ARCADE (UNVERIFIED)`,
   game tetap jalan, tidak ada fallback diam-diam.
3. `blockHeight` dihitung dari `cumulativeBlockUnits / blockUnitsPerBlock`, bukan work dibagi difficulty.
4. Round di atas `settledThroughRound` berarti unknown, bukan nol.
5. Tidak ada private key di repo ini, di environment, atau di bundle.

## Jaringan

Sepolia saja, chain ID `11155111`. Testnet: SQK dan Squeek tidak punya nilai uang, dan game ini
tidak membagikan keduanya.

## Menjalankan

```sh
npm install
npm run dev
```

## Catatan sumber data

Dua graf Squeekchain hidup di Sepolia dengan angka yang berbeda. Graf yang tercatat di deployment
record (`0x74665d…`) terakhir menerima settlement pada 2026-10-26 16:20 UTC, sedangkan graf yang
di-index API resmi (`0x980b…`) maju terus. Proyek ini menunggu record resmi untuk graf kedua
dipublikasikan sebelum memakainya; lihat `docs/DISCORD-QUESTION.md`.

## Lisensi

MIT
