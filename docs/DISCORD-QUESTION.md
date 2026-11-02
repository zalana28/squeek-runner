# Pertanyaan untuk tim Squeekchain (kirim hari ini)

## 1. Graf mana yang dipakai proyek builder — dan tolong publikasikan record-nya

Dua graf Squeekchain hidup di Sepolia dan angkanya berbeda jauh. Yang tercatat di deployment record
(`sepolia.json`, release `squeeks-sepolia-core3-mining6-001`) **tidak menerima settlement lagi sejak
2026-10-26 16:20 UTC** — frontier-nya berhenti di round 1973, sekarang tertinggal 990 round.
Sementara itu `api.squeekchain.com/v1` meng-index graf lain (release `stream-game-sepolia-test-20261026-01`,
Core `0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44`) yang frontier-nya maju terus (lag 0 round).

Docs internal tidak konsisten: tabel Developers → Deployments menulis genesis `1791847800`,
streamId `0xa018…`, indeks dari blok `11902282`, Mining v6; sedangkan contoh respons di api.md menulis
genesis `1793022600`, streamId `0x52e4…`, deployment block `11998937`, dan `/v1/economy/state`
melaporkan Mining implementationVersion `9` — padahal alamat Core di contoh itu sama.

**Yang kami minta**: record resmi (address + implementation + runtime hash + storage layout digest +
proxy admin + owner proxy admin + configuration) untuk graf yang sedang aktif, supaya bisa
diverifikasi fail-closed. Kami sengaja **tidak** memakai nilai yang kami baca sendiri dari graf itu
sebagai nilai yang diharapkan — itu circular, dan docs sendiri melarangnya (Safety rule #1).

## 2. Atribusi proyek

Apakah subdomain hosting (mis. `squeek-runner.vercel.app`) diterima untuk verifikasi atribusi, atau
wajib domain pribadi dengan DNS record yang kalian berikan?

---

## Lampiran: identitas on-chain graf aktif (dibaca 2026-11-02, blok 12048441)

Nilai ini **tidak** dipakai sebagai `expected` di kode kami. Disertakan supaya tim bisa mengoreksi
bila ada yang salah, dan supaya record yang dipublikasikan bisa langsung dibandingkan.

```
network                 sepolia (11155111)
latest block            12048441  2026-11-02T13:27:36Z

SqueekCore (proxy)      0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44
  implementation (slot) 0x284747C4664AF2203E7A90a2Ee76f22b6B5e6889
  implementationCodeAddress 0x284747C4664AF2203E7A90a2Ee76f22b6B5e6889   (cocok dengan slot)
  runtimeHash           0xd8f2fb3c7dcf63e6dc0378ce5f85ceea52a876ae1f0cd66ac8631c3103371f8a
  codeVersion           3
  layoutDigest          0x9a9c008e029460808209571703fbf2679785874e0e6d3232f16a864d12abcb20
  proxyAdmin            0x4a8Ea91a43eEeCb8cFFC73631627A7d6F973FdBf
  proxyAdmin.owner()    0xA68A2Fa1ffCFf79a8E143F05DDcdC48fbAeaafcB
  streamId              0x52e443e4e0d236ff0c07f4cdc518c594a3d680d20abb1481510efbed0ec73633
  genesisTimestamp      1793022600  (2026-10-26T13:50:00Z)
  roundDuration 600  maxWorkPerRound 10000  maxRoundsPerBatch 16  blockUnitsPerBlock 1e9
  initialWorkPerThousandBlocks 10000  targetBlocksPerActiveRound 40  difficultySmoothingRounds 30
  guardian              0x3C4C2BA9a5DFBfc5e48dcEABdd3B004131a04BE6
  reporter              0xB317AB7Cc24fD5d94EA120B3b189bc6527a7d0Aa   (sama dengan record)
  state()               settledThroughRound 1005 · blockHeight 6808 · workPerThousandBlocks 10170 · paused false

Kontrak lain yang dilaporkan API untuk release ini (belum kami verifikasi on-chain):
  mining.proxy          0xcd46990f8349057335289ef282c276204b6cdc62  implementationVersion 9
  token                 0x5501e1fa81be1c3f49225fa7668da0245d07db60
  staking.proxy         0x4b67b739dfd832f4eac67a7aa3bc244fb74cea4f  implementationVersion 2
  genesis               0xcb98349c134ab983da5bfd80527dfe2552bdb70f
  launch                0x1ff6485abfbb2d183cd673d78e1ab31c098e04dd
  tokenFactory          0x779a302adbaa9c8a3da45ef48ad67e6a45fcef29
```

Perbandingan singkat dengan `docs-record` (yang ada di `sepolia.json`):

| | docs-record | graf aktif |
|---|---|---|
| Core proxy | `0x74665d…119f` | `0x980b44…3d44` |
| Core runtime hash | `0xe8a5a5aa…` | `0xd8f2fb3c…` |
| Core layout digest | `0x9a9c008e…` | `0x9a9c008e…` (sama) |
| Core codeVersion | 3 | 3 |
| ProxyAdmin owner | `0x6B35AB6E…` (timelock) | `0xA68A2Fa1…` |
| Mining version | 6 | 9 (per API) |
| frontier / last settle | 1973 · 2026-10-26 16:20 UTC | 1005 · 2026-11-02 13:20 UTC |
| pace 144 round | 5,13 blok/round | 5,80 blok/round |

Kabar baiknya: karena `SqueekCore` kedua graf sama-sama versi 3 dengan layout digest identik,
kode pembacaan kami tidak berubah — hanya `record.json` yang perlu diganti, dan itu terjadi
otomatis lewat `sync-record` begitu record kalian diperbarui.
