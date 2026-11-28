# LAPORAN AKTIVITAS 15 - REVISI IMPLEMENTASI

## MongoDB & Express.js - Bagian 1/2 Backend

**Nama proyek:** Sistem Deteksi Fraud Klik Iklan Digital Menggunakan Machine Learning  
**Kelompok:** 2  
**Nama mahasiswa:** Koloay, Syeela Michelle Putri  
**NIM/NPM:** 105012310070  
**Nomor absen:** 5  
**Repository:** https://github.com/syeelakoloay/click-fraud-detection.git  
**Aktivitas:** Membuat endpoint import/upload CSV beserta validasi sebelum data disimpan atau diproses  
**Target:** Endpoint import dataset  
**Tanggal revisi:** 22 Oktober 2026

## Ringkasan Eksekutif

Revisi ini mempertahankan endpoint `POST /api/events/import` dan mekanisme pengiriman CSV sebagai body mentah. Perbaikan difokuskan pada kebutuhan Aktivitas 15: memeriksa data sebelum penyimpanan, membedakan kesalahan data dari kegagalan penyimpanan, dan merampingkan respons import. Endpoint ingestion JSON `POST /api/events/ingest` tidak digantikan.

Perubahan utama:

1. Kesalahan validasi atau duplikasi pada sebuah record dilaporkan sebagai `rejected`. Kegagalan penyimpanan yang bersifat infrastruktur dikembalikan sebagai HTTP 503 dengan kode `IMPORT_PERSISTENCE_FAILED`, bukan dilaporkan sebagai respons import biasa.
2. Validasi import ditingkatkan untuk tanggal kalender, IPv4/IPv6, URL HTTP/HTTPS, serta bilangan bulat pada field yang secara makna harus bulat. Validasi schema Mongoose tetap dijalankan.
3. Respons sukses tidak lagi mengembalikan dokumen event lengkap untuk setiap record, tetapi tetap menyediakan nomor baris, `click_id`, status, dan rincian error bila ada.

Pemeriksaan sintaks lulus untuk sepuluh berkas. Tes parser, tes utilitas validasi, dan tes error handler lulus dengan total 19 tes, termasuk pemeriksaan aturan semantik pada seluruh 5.000 baris dataset sumber. Tes API dengan service tiruan dan tes integrasi MongoDB aktual belum dapat dijalankan dalam lingkungan audit ini karena registry npm tidak dapat dijangkau (`EAI_AGAIN`) dan dependensi belum terpasang lengkap. Hasil import 5.000 record yang dicatat dalam laporan versi sebelumnya merupakan bukti untuk versi sebelum revisi; hasil itu perlu diulang untuk memvalidasi versi baru.

## 1. Kesesuaian dengan Ketentuan Aktivitas

| Ketentuan | Implementasi | Penilaian |
|---|---|---|
| MongoDB & Express.js - Bagian 1/2 backend | Express route, controller import, Mongoose schema, service event, dan MongoDB yang sudah ada digunakan kembali. | Sesuai |
| Import/upload CSV dan pemeriksaan data | Parser CSV, pemeriksaan header dan lebar record, validasi semantik, casting dan validasi schema dilakukan sebelum record diteruskan ke service. | Sesuai |
| Target endpoint import dataset | `POST /api/events/import` disediakan terpisah dari ingestion JSON. | Sesuai |

## 2. Keputusan atas Lima Rekomendasi Audit

| Rekomendasi | Keputusan | Alasan |
|---|---|---|
| Pisahkan kesalahan validasi dan kesalahan database | Diterapkan | Error per-record dipisahkan dari error infrastruktur penyimpanan; error infrastruktur menghasilkan HTTP 503. |
| Pastikan mekanisme upload sesuai ketentuan | Dipertahankan dengan penjelasan | Spesifikasi yang diberikan tidak mewajibkan `multipart/form-data`. Endpoint menerima body CSV mentah, yang dapat dikirim langsung dari file yang dipilih pengguna. |
| Tingkatkan validasi semantik | Diterapkan | Tanggal, IP, URL, dan nilai bilangan bulat diperiksa selain validasi model. |
| Tambahkan perlindungan akses sebelum deployment | Tidak diterapkan pada aktivitas ini | Autentikasi adalah penguatan deployment yang tidak disebut sebagai target Aktivitas 15. Jangan menganggap endpoint sudah siap dipublikasikan hanya berdasarkan pekerjaan ini. |
| Ringankan respons untuk dataset besar | Diterapkan | Properti `data` berisi event lengkap dihapus dari tiap hasil sukses; jumlah sukses/gagal dan status tiap baris tetap tersedia. |

## 3. Kontrak Endpoint

| Properti | Nilai |
|---|---|
| Method dan path | `POST /api/events/import` |
| Content-Type | `text/csv` atau `application/csv` |
| Bentuk body | Isi CSV mentah; bukan `multipart/form-data` |
| Batas ukuran body | 10 MB |
| Batas record | Maksimum 5.000 baris data, tidak termasuk header |
| Kolom | Tepat 21 header kanonis dataset sumber; urutan header boleh berbeda |
| Penyimpanan | `eventService.createEvent()` memakai model `Event` yang ada |
| Endpoint JSON lama | `POST /api/events/ingest` tetap dipertahankan |

## 4. Validasi Sebelum Penyimpanan

### 4.1 Tingkat file

- Memastikan request diterima sebagai buffer CSV dengan content type yang didukung.
- Menolak body kosong atau CSV yang rusak secara sintaks.
- Menolak header yang hilang, duplikat, atau tidak dikenal.
- Memastikan setiap record mempunyai jumlah field yang sama dengan header.
- Menolak request yang berisi lebih dari 5.000 baris data.

### 4.2 Tingkat record

- Menjalankan validasi dan casting menggunakan schema `Event`, termasuk field wajib, tipe data, enum, serta batas numerik.
- Memeriksa `timestamp` sebagai tanggal kalender valid dengan format `YYYY-MM-DD HH:mm:ss`; pemisah `T` dan milidetik opsional juga didukung.
- Memeriksa `ip_address` sebagai IPv4 atau IPv6 valid.
- Memeriksa `referrer_url` dan `page_url` sebagai URL absolut dengan protokol HTTP atau HTTPS.
- Memastikan `scroll_depth`, `mouse_movement`, `keystrokes_detected`, `click_frequency`, `time_since_last_click`, `VPN_usage`, `proxy_usage`, dan `is_fraudulent` bernilai bilangan bulat. Batas, enum, dan label 0/1 tetap mengikuti schema.
- Menggunakan indeks unik `click_id` di MongoDB untuk mencegah ID event yang sama tersimpan lebih dari sekali.

Hanya record yang lolos validasi diteruskan ke service penyimpanan. Validasi record bersifat individual sehingga satu record tidak valid tidak otomatis menghalangi record lain dalam berkas yang sama.

## 5. Penanganan Hasil dan Error

| Kondisi | Respons/perilaku |
|---|---|
| CSV rusak, header salah, body kosong, atau batas record terlampaui | Request ditolak sebelum penyimpanan, dengan status 4xx yang sesuai. |
| Validasi suatu record gagal | Status record `rejected` disertai kode dan pesan kesalahan; record lain dapat diproses. |
| `click_id` duplikat | Record tersebut ditolak sebagai `DUPLICATE_CLICK_ID`. |
| Koneksi atau operasi penyimpanan gagal karena masalah infrastruktur | HTTP 503 dan kode `IMPORT_PERSISTENCE_FAILED`; bukan ringkasan sukses palsu. |
| Ukuran request melebihi batas body | HTTP 413. |

Penyimpanan dilakukan dalam kelompok konkuren dan bukan transaksi atomik atas seluruh CSV. Jika terjadi kegagalan penyimpanan, beberapa record dari kelompok terakhir mungkin sudah tersimpan. Periksa kondisi database sebelum mengulang import agar tidak menimbulkan duplikasi.

## 6. Bentuk Respons Sukses

Respons memuat `receivedCount`, `successCount`, `failureCount`, dan `results`. Setiap hasil menyebut `rowNumber`, status `created` atau `rejected`, serta `click_id` jika tersedia. Hasil yang ditolak mencakup `error.code` dan `error.message`. Indeks internal dan dokumen event lengkap tidak dikirim dalam respons publik.

Contoh ringkas:

```json
{
  "receivedCount": 2,
  "successCount": 1,
  "failureCount": 1,
  "results": [
    { "rowNumber": 2, "click_id": "click-001", "status": "created" },
    {
      "rowNumber": 3,
      "click_id": "click-002",
      "status": "rejected",
      "error": {
        "code": "INVALID_IP_ADDRESS",
        "message": "ip_address harus berisi alamat IPv4 atau IPv6 yang valid."
      }
    }
  ]
}
```

## 7. Berkas yang Diperbarui

| Berkas | Perubahan |
|---|---|
| `src/controllers/datasetImportController.js` | Memisahkan validasi, penyimpanan, error per record, dan error infrastruktur; menggunakan respons hasil yang ringkas. |
| `src/utils/datasetImportValidation.js` | Utilitas validasi tanggal, IP, URL, dan bilangan bulat khusus import. |
| `src/middleware/errorHandler.js` | Mengembalikan kode error import yang stabil, termasuk HTTP 503 `IMPORT_PERSISTENCE_FAILED`. |
| `scripts/testApiDatasetImport.js` | Menambah skenario validasi semantik, respons ringan, dan kegagalan penyimpanan. Suite memuat sembilan skenario. |
| `scripts/testDatasetImportValidation.js` | Tes mandiri validasi semantik, termasuk semua 5.000 baris dataset sumber. |
| `scripts/testDatasetImportErrorHandler.js` | Tes status/kode error validasi, error penyimpanan 503, dan batas request. |
| `scripts/testDatasetImportMongoIntegration.js` | Memastikan respons sukses tidak mengandung dokumen event lengkap. |
| `scripts/checkDatasetImportSyntax.js` | Memeriksa sepuluh berkas terkait implementasi dan tes. |
| `package.json` | Menambahkan perintah `test:dataset-import-validation`. |
| `README.md` dan `docs/` | Memperbarui kontrak, batasan, prosedur, dan status pengujian versi revisi. |

## 8. Hasil Verifikasi pada Lingkungan Audit

| Pemeriksaan | Hasil | Catatan |
|---|---|---|
| `npm run check:dataset-import` | Lulus, 10 berkas `OK` | Pemeriksaan sintaks berhasil. |
| `node --test scripts/testCsvParser.js scripts/testDatasetImportValidation.js scripts/testDatasetImportErrorHandler.js` | Lulus, 19 tes, 0 gagal | Mencakup parser, validasi semantik, error handler, dan 5.000 baris dataset sumber. |
| `npm run test:api:dataset-import` | Belum dijalankan sampai selesai | Dependensi Express/Mongoose belum terpasang lengkap karena registry npm tidak dapat diakses (`EAI_AGAIN`). |
| `npm run test:api:dataset-import:mongo` | Belum dijalankan | Memerlukan dependensi yang lengkap dan MongoDB aktual yang dapat diakses. |
| Import HTTP 5.000 baris pada versi revisi | Belum diverifikasi ulang | Catatan sukses 5.000 baris dalam laporan versi lama mendahului perubahan ini. |

## 9. Perintah untuk Verifikasi Lanjutan

Setelah koneksi registry npm tersedia, jalankan dari direktori proyek:

```bash
npm ci
npm run check:dataset-import
node --test scripts/testCsvParser.js scripts/testDatasetImportValidation.js scripts/testDatasetImportErrorHandler.js
npm run test:api:dataset-import
```

Untuk tes integrasi, pastikan MongoDB aktif dan `TEST_MONGODB_URI` menunjuk ke database khusus yang berbeda dari database utama serta berakhiran `_test` atau `_testing`, lalu jalankan:

```bash
npm run test:api:dataset-import:mongo
```

Untuk mengulangi import manual, gunakan database uji kosong yang terpisah, jalankan server dengan `npm run dev`, kemudian kirim dataset:

```bash
curl -X POST http://localhost:5000/api/events/import \
  -H "Content-Type: text/csv" \
  --data-binary @dataset/click_fraud_dataset.csv
```

Verifikasi hasil respons dan hitung ulang dokumen di database yang sama. Jangan mengulangi impor penuh pada database yang telah memuat dataset dengan `click_id` yang sama.

## 10. Kesimpulan

Revisi meningkatkan kesesuaian endpoint dengan target Aktivitas 15 dengan membedakan kegagalan data dari kegagalan penyimpanan, memperketat pemeriksaan isi CSV sebelum penyimpanan, dan membuat respons hasil lebih ringan tanpa menghilangkan ringkasan sukses/gagal maupun status setiap baris. Mekanisme CSV mentah dipertahankan karena bentuk `multipart/form-data` tidak diwajibkan oleh ketentuan yang diberikan. Autentikasi deployment tidak ditambahkan karena berada di luar ruang lingkup aktivitas ini.

Verifikasi sintaks serta tes parser dan validasi semantik berhasil. Tes API dan integrasi perlu dijalankan setelah dependensi tersedia agar revisi dapat dinyatakan tervalidasi sampai ke kontrak HTTP dan MongoDB aktual.
