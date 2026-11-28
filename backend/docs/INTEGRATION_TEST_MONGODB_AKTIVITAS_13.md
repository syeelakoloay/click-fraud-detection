# Panduan Integration Test MongoDB Aktual — Aktivitas 13

## Tujuan

Dokumen ini menjelaskan cara memverifikasi keempat endpoint monitoring dengan Express, service backend asli, Mongoose, dan MongoDB yang benar-benar berjalan. Berbeda dari unit test, suite ini tidak mengganti service dengan mock. Tes mengirim permintaan HTTP ke server Express sementara dan membaca data yang tersimpan dari database pengujian.

## Alasan menggunakan dua jenis pengujian

Unit test dan integration test memeriksa risiko yang berbeda, sehingga keduanya diperlukan dan tidak saling menggantikan. Unit test dengan mock lebih cepat dan deterministik untuk memeriksa perilaku controller secara terisolasi, termasuk parameter yang diteruskan, bentuk respons, serta penerusan error tanpa bergantung pada keadaan jaringan atau database. Keterbatasannya, mock dapat tetap lulus ketika query Mongoose, pipeline agregasi, pendaftaran route, konfigurasi koneksi, atau persistensi MongoDB mengalami masalah.

Integration test aktual melengkapi bukti tersebut dengan menjalankan route Express dan service asli terhadap database MongoDB khusus. Tes ini membuat event melalui `POST /api/events`, menyiapkan satu record blocked IP dan model run yang menjadi fixture pengujian, lalu mengakses endpoint monitoring untuk memeriksa angka agregasi, metrik yang tersimpan, traffic per jam, dan daftar IP. Karena melewati lebih banyak komponen, integration test dapat menemukan kesalahan integrasi yang tidak akan terlihat pada unit test. Sebaliknya, tes integrasi lebih lambat dan memerlukan database aktif, sehingga tidak menggantikan unit test yang lebih terarah.

## Persiapan database

1. Instal dependency dari folder backend:

   ```bash
   npm install
   ```

2. Salin `.env.example` menjadi `.env` jika file konfigurasi lokal belum ada.
3. Atur `TEST_MONGODB_URI` agar menuju database terpisah yang namanya berakhiran `_test` atau `_testing`, misalnya `mongodb://127.0.0.1:27017/click_fraud_detection_test`.
4. Pastikan nama database pada `TEST_MONGODB_URI` berbeda dari nama database pada `MONGODB_URI`.
5. Pastikan MongoDB bisa diakses dengan URI tersebut. Jangan mencantumkan kredensial di screenshot terminal atau laporan.

Skrip membatalkan tes apabila nama database tidak memiliki akhiran yang disyaratkan atau sama dengan nama database utama. Koneksi ke database pengujian tetap merupakan tindakan nyata, jadi periksa `.env` sebelum menjalankan perintah.

## Jalankan pengujian

```bash
npm run check:activity13
npm run test:activity13:unit
npm run test:api:activity13:mongo
```

Perintah pertama memeriksa sintaks file terkait Aktivitas 13. Perintah kedua menjalankan unit test dengan mock. Perintah ketiga menjalankan integration test aktual dan memerlukan MongoDB yang dapat diakses.

## Skenario integration test aktual

| No. | Skenario | Bukti yang diperiksa |
|---|---|---|
| 1 | `GET /api/monitoring/summary` | Ringkasan berisi 2 event uji, 1 fraud, 1 valid, fraud rate 50%, agregasi traffic, catatan model run, dan total blocked IP yang cocok dengan database. |
| 2 | `GET /api/monitoring/metrics` | Field evaluasi yang diambil dari record `ModelRun` aktual cocok dengan data yang tersimpan. |
| 3 | `GET /api/monitoring/traffic` | Agregasi per jam menghasilkan dua bucket dengan total event, fraud, dan valid yang sesuai. |
| 4 | `GET /api/blocked-ips` | Endpoint mengembalikan daftar serta pagination yang benar, dan IP fixture dapat ditemukan dari hasil endpoint. |

## Data uji dan pembersihan

Suite membuat identifier unik di setiap eksekusi agar tidak bertabrakan dengan pengujian lain. Event dikirim melalui API, sedangkan record `BlockedIP` dan `ModelRun` dibuat langsung melalui Mongoose karena aktivitas ini tidak menambahkan endpoint penulisan untuk kedua koleksi tersebut. Nilai metrik, alamat IP dari rentang dokumentasi, dan timestamp masa depan adalah fixture pengujian di database uji saja; nilai ini bukan data aktual proyek, tidak digunakan oleh controller sebagai jawaban hard-coded, dan tidak mewakili hasil evaluasi model sebenarnya.

Pada bagian akhir, suite hanya menghapus event dengan `click_id` unik yang dibuat oleh eksekusi itu, satu `BlockedIP` yang berhasil dibuat oleh eksekusi itu, dan satu `ModelRun` berdasarkan `_id` miliknya. Skrip tidak menghapus seluruh collection, tidak menjalankan `dropDatabase`, dan tidak membersihkan data lain. Gunakan database khusus pengujian tetap merupakan syarat keselamatan; jangan arahkan `TEST_MONGODB_URI` ke database produksi.

## Cara membaca hasil

Suite lulus jika setiap skenario berstatus `ok` dan ringkasan akhir menunjukkan tidak ada tes gagal. Jika koneksi MongoDB tidak tersedia, perintah integration test akan gagal dan harus dilaporkan sebagai belum berhasil dijalankan, bukan dinyatakan lulus berdasarkan unit test. Catat screenshot output aktual setelah menjalankan perintah di lingkungan Anda; screenshot harus menampilkan perintah, database pengujian yang digunakan (tanpa kredensial), nama skenario, dan ringkasan lulus/gagal.
