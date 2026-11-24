# Laporan Verifikasi ClickGuard

Tanggal pemeriksaan: 23 November 2026. File ini mencatat pemeriksaan yang benar-benar dijalankan pada workspace sebelum ZIP dibagikan.

## Hasil yang lulus

| Pemeriksaan | Hasil |
|---|---:|
| JavaScript backend `check:syntax` | 64/64 file lulus |
| Kontrak API `check:activity28` | 28/28 pemeriksaan lulus |
| Unit test backend tanpa server Express/MongoDB | 35/35 lulus |
| Frontend traffic chart/activity16 | 15/15 lulus |
| Frontend API/Activity28 | 7/7 lulus |
| Python ML compileall | Lulus |
| Python ML unit tests | 5/5 lulus |
| Training Web Robot | Lulus; holdout accuracy 98,08% |
| Python Web Robot API smoke test | Lulus; health model loaded dan `/predict/web-robot` merespons |
| JSX parse/transpile check `App.jsx` | Lulus |
| Integritas data CPA dan artefak model CPA terhadap ZIP basis | SHA-256 identik |
| Frontend terhadap ZIP basis | Hanya `src/App.jsx` berubah untuk metrics dan polling; file frontend lainnya identik |

## Metrik model

- Web Robot Detection (Human/Robot pada sesi web): accuracy 98,08%, balanced accuracy 96,91%, precision Robot 95,46%, recall Robot 94,96%, F1 Robot 95,21%, ROC-AUC 99,70%; test holdout 13.471 sesi.
- CPA (Valid/Fraud pada event klik): accuracy 75,10%, precision/recall/F1 Fraud 0%, ROC-AUC 53,07%. Model masih `shadow_only`.
- Twitter Human Bots dan MarTech tetap benchmark terpisah, bukan data pelatihan/label untuk mengganti target CPA.

## Pemeriksaan yang belum dapat dijalankan di lingkungan kerja ini

Dependensi Node belum tersedia secara lengkap pada container pemeriksaan (`express`, `mongoose`, `vite`, dan `react` tidak terpasang). Percobaan instalasi dependency Node berakhir timeout. Oleh karena itu:

- Full backend integration test yang membuat Express app belum dijalankan.
- Vite production build belum dijalankan.
- End-to-end browser dengan MongoDB dan Express belum dijalankan pada container ini.
- Mutasi Google Ads belum diuji karena memerlukan OAuth credential, project access, permission akun, serta campaign yang dapat dimutasi.

Setelah ZIP diekstrak pada komputer pengguna dan dependency tersedia, jalankan `docs/RUNBOOK_WINDOWS.md`, terutama `npm.cmd run install:all`, `npm.cmd run test:backend`, `npm.cmd run build:frontend`, dan skrip `backend/scripts/testRealtimeMitigation.js`.

## Interpretasi terhadap tiga hasil yang diharapkan

1. Dashboard, grafik traffic, pemantauan event, deteksi burst, serta blocklist internal tersedia. Data dashboard diperbarui dengan polling (10 detik untuk event dan 15 detik untuk blocklist ketika halaman terkait dibuka).
2. Angka di atas 95% berlaku pada klasifikasi sesi web Human/Robot, bukan pada label klik iklan Valid/Fraud. Dengan data klik CPA saat ini, hasil nomor 2 belum terbukti tercapai untuk target fraud klik.
3. Rule burst dapat memblokir IP secara internal segera setelah ambang terpenuhi. Pengiriman pengecualian IP ke Google Ads bersyarat pada konfigurasi OAuth, akses API, campaign ID yang cocok, IP publik, dan pengaktifan dua flag mutasi. Penghematan biaya produksi belum dibuktikan oleh akun Test.

## Keamanan dan skala

Endpoint penulisan memakai `EVENT_INGESTION_API_KEY`; production menolak endpoint tulis jika key belum dikonfigurasi. Key hanya ditempatkan di backend dan server-side collector. Alamat IP harus berasal dari collector/proxy tepercaya. Serialisasi burst saat ini berlaku dalam satu proses Express; deployment multi-instance memerlukan distributed lock/rate-limit store.
