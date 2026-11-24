# Analisis Arsip AdTruth yang Diunggah

## Kesimpulan

Arsip `adtruth-main.zip` yang diperiksa **bukan dataset mentah AdTruth**. Arsip tersebut adalah source code JavaScript SDK/tracker, dokumentasi, contoh integrasi, dan pengujian.

Pemeriksaan arsip menemukan 103 berkas dengan total konten sekitar 2,35 MB. Tidak ditemukan berkas dataset berformat CSV, Parquet, JSONL, Feather, atau Pickle. Dengan demikian, arsip ini tidak dapat digunakan untuk melatih model ClickGuard sebagai dataset tambahan.

## Perbedaan lisensi

- File `LICENSE` pada akar repositori melisensikan source code SDK dengan MIT License.
- `docs/DATASET_DOCUMENTATION.md` secara terpisah menyatakan lisensi dataset yang direncanakan adalah CC BY-NC 4.0.
- Dokumentasi dataset masih berstatus `Version 1.0.0 (Preview)` dan mencantumkan target rilis publik Q3-Q4 2026.
- Bagian `Early Access for Academic Research` meminta peneliti menghubungi pengelola untuk meminta sampel.
- README SDK menyebut dataset sebagai fitur/future vision dan menautkan dokumentasi preview.

MIT License pada source code SDK **tidak** berarti dataset yang dijelaskan dalam dokumen otomatis tersedia atau berlisensi MIT.

## Apa yang tersedia di arsip

Source code SDK dapat mengumpulkan metadata sesi, parameter UTM/click IDs, informasi browser/perangkat, fingerprint, dan metrik perilaku. File `src/core/tracker.js` menetapkan endpoint default `https://api.adtruth.io/track/`; opsi `endpoint` dapat menggantinya.

Karena endpoint default mengirim telemetry ke layanan eksternal, jangan menanamkan SDK ini ke situs produksi ClickGuard tanpa meninjau endpoint tujuan, kebijakan privasi, dasar pemrosesan data, persetujuan pengguna bila diperlukan, dan keamanan API key. Source code SDK juga belum otomatis terhubung dengan skema `POST /api/events` ClickGuard.

## Keputusan untuk ClickGuard

1. Jangan menambahkan arsip ini sebagai dataset training.
2. Jangan menggabungkannya dengan CPA atau MarTech sebagai baris data.
3. Source code dapat dipelajari sebagai referensi pengumpulan telemetry perilaku, tetapi integrasi memerlukan adapter backend dan tinjauan privasi/keamanan tersendiri.
4. Untuk training model, diperlukan berkas data aktual yang berisi sesi/event beserta label dan dokumentasi label. Arsip yang diperiksa belum menyediakannya.

## Sumber di dalam arsip

- `LICENSE`
- `README.md`, bagian Future Vision dan License
- `docs/DATASET_DOCUMENTATION.md`, bagian TL;DR, Dataset Description, License, Release Timeline, dan Early Access
- `src/core/tracker.js`, bagian default API endpoint, `collectData`, dan `sendViaFetch`
