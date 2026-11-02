# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Pemain arcade kasual dan anggota komunitas Squeekchain yang ingin memahami kerja hamster on-chain melalui permainan lane-crossing singkat di desktop maupun mobile.

## Product Purpose
Squeek Runner adalah game hamster lane-crossing yang mengubah data settled Squeekchain menjadi tempo lintasan, Charge, dan bonus skor. Keberhasilan berarti game tetap menyenangkan saat hamster IDLE, sumber dan status data selalu jelas, dan pemain dapat membedakan skor mentah dari multiplier tanpa memerlukan wallet.

## Positioning
Tempo dan ekonomi skill arcade berasal dari kerja hamster yang telah settled pada graf Squeekchain yang diverifikasi fail-closed, bukan dari animasi roda live atau label API. Pace hanya menggerakkan lane; Surge hanya memberi Charge, flash, dan multiplier skor.

## Operating Context
Game berjalan sebagai situs publik Vite/React pada desktop dan layar sentuh mobile. Pemain memakai keyboard atau D-pad, dapat pause, membaca HUD Squeekchain, melihat hasil run, dan membandingkan leaderboard lokal. v1 tidak memiliki wallet, transaksi, atau kebutuhan gas.

## Capabilities and Constraints
- Sepolia-only; graf kontrak berasal dari deployment record resmi yang disalin saat build, tanpa fallback alamat atau graf lain.
- Satu mismatch verifikasi menghasilkan `ARCADE (UNVERIFIED)` sementara game tetap playable.
- Semua skor, bonus, dan Charge berbasis kontrak settled. API hanya untuk display dan tidak memengaruhi fisika maupun skor.
- Frontier setelah `settledThroughRound` adalah unknown, bukan nol. Snapshot pertama, jeda panjang, tab hidden, lag, pause, dan reorg tidak boleh menciptakan Surge palsu.
- Identitas `stream-game` tidak boleh menjadi expected verification dan hanya boleh masuk setelah record resmi diterbitkan tim.
- Tidak ada private key di repo, environment, atau bundle. Tidak ada klaim nilai ekonomi; SQK dan Squeek testnet tidak bernilai uang dan tidak dibagikan game.
- Metadata atau SVG Squeek diperlakukan sebagai data tidak tepercaya; jangan inline SVG.
- Logika lane, collision, kontrol, Pace, Surge, Charge/Dash, skor, HUD, dan leaderboard lokal adalah fungsi incumbent yang harus dipertahankan selama redesign visual in-game.
- M7 API opsional dikerjakan terakhir. Submit final dan profil graf kedua menunggu record atau jawaban resmi tim.

## Brand Commitments
Nama produk Squeek Runner dan mesin WHEELY9000. Dunia hamster memakai aksen amber dengan status Squeekchain teal. HUD Squeekchain, terminology Pace/Surge/Charge/Dash, dan sumber data harus tetap terbaca. Arah terbaru pengguna: visual in-game harus terasa 3D dan lebih polished, bukan flat pixel art.

## Evidence on Hand
Implementasi game dan unit test di repo; blueprint di `docs/BLUEPRINT.md`; deployment record di `src/config/record.json`; ABI resmi di `src/abi/`; screenshot desktop/mobile incumbent di `/tmp/squeek-runner-screenshots/`; hasil verifikasi kontrak dan perbandingan HUD melalui script repo. Tidak ada testimoni, token reward, atau profil `stream-game` yang boleh direkayasa.

## Product Principles
1. Data kontrak menentukan mekanik; tampilan menjelaskan data, tidak mengarangnya.
2. Arcade harus tetap responsif dan menyenangkan dalam kondisi IDLE maupun UNVERIFIED.
3. Skill pemain melalui Charge dan Dash tetap bermakna terlepas dari aktivitas hamster.
4. Kejelasan lane, hazard, pemain, dan kontrol lebih penting daripada detail visual.
5. Mobile adalah target penuh, bukan versi yang dikorbankan.
