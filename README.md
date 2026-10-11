# Click Fraud Detection - Aktivitas 6 + Aktivitas 8

## Gambaran proyek

**Sistem Deteksi Fraud Klik Iklan Digital Menggunakan Machine Learning**. Paket ini menggabungkan fondasi database Aktivitas 6 dengan lapisan service database Aktivitas 8 berdasarkan repository yang diunggah.

## Hubungan Aktivitas 6 dan Aktivitas 8

- **Aktivitas 6 (fondasi yang dipertahankan):** konfigurasi koneksi Mongoose, model `Event`, `BlockedIP`, `ModelRun`, collection dan index, serta skrip `init:db` dan `verify:db`.
- **Aktivitas 8 (tambahan):** service untuk operasi data event, daftar IP yang diblokir, catatan hasil model run, dan perhitungan data monitoring.
- Model dan index dari Aktivitas 6 tidak ditulis ulang sebagai output Aktivitas 8. Service menggunakan model yang sudah ada.

## Persiapan

Gunakan Node.js 18 atau lebih baru. Dari folder yang berisi `package.json`:

```powershell
Copy-Item .env.example .env
notepad .env
npm install
```

Isi `MONGODB_URI` di `.env` dengan URI MongoDB milik lingkungan uji kelompok. Jangan membagikan URI, password, atau isi `.env`. Sebaiknya jalankan integration test terhadap database uji, bukan database produksi.

## Urutan pemeriksaan dan pengujian

Jalankan setiap perintah satu per satu dan periksa hasilnya sebelum lanjut:

```powershell
npm run check:activity8
npm run test:activity8:unit
npm run init:db
npm run verify:db
npm run test:activity8
```

Panduan rinci beserta kriteria lulus ada di [`docs/PANDUAN_PENGUJIAN_AKTIVITAS_8.md`](docs/PANDUAN_PENGUJIAN_AKTIVITAS_8.md). Ringkasan fungsi dan batasan service ada di [`docs/AKTIVITAS_8_SERVICE_DATABASE.md`](docs/AKTIVITAS_8_SERVICE_DATABASE.md).

## Service Aktivitas 8

Import melalui `require("./src/services")`. Module ini mengekspor `eventService`, `blockedIPService`, `modelRunService`, dan `monitoringService`.

- `eventService`: create/read/list/count event, pencarian menurut IP, filter waktu, dan pagination.
- `blockedIPService`: menambah, memeriksa, mengambil, mendaftar, serta menghapus blocked IP.
- `modelRunService`: menyimpan dan membaca catatan hasil model run sesuai schema baseline Aktivitas 6 serta menunjukkan apakah catatan tersedia.
- `monitoringService`: overview total/fraud/valid, fraud rate, traffic per jam/hari, dan snapshot monitoring gabungan.

## Batasan dan catatan keakuratan

- Belum ada Express route/controller, training, atau prediksi yang ditambahkan oleh Aktivitas 8 ini.
- `is_fraudulent` adalah label yang tersimpan pada event; nilai itu tidak dihitung ulang sebagai prediksi model oleh service.
- Status model run hanya menjelaskan keberadaan catatan di `model_runs`; tidak membuktikan model aktif atau telah di-deploy.
- Service blocked IP tidak otomatis memblokir alamat berdasarkan aturan fraud karena threshold/policy tersebut belum ditetapkan pada referensi utama.
- Schema ModelRun masih menggunakan baseline Aktivitas 6; service tidak menghasilkan metrik training proyek secara otomatis.
- Skrip integration test membuat dokumen sementara dengan penanda unik dan berusaha membersihkannya. Pastikan koneksi menunjuk pada database yang tepat sebelum menjalankan test.

## Status verifikasi paket

Pemeriksaan lokal terhadap sumber saat paket disusun:

- Pemeriksaan sintaks 8 file JavaScript: **lulus**.
- Unit test utilitas (13 assertion checks): **lulus**.
- Koneksi dan integration test terhadap MongoDB pengguna: **belum diverifikasi dalam paket ini**. Bukti final perlu berasal dari output `npm run init:db`, `npm run verify:db`, dan `npm run test:activity8` di lingkungan kelompok.
