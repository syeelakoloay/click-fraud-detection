# Panduan Pengujian — Aktivitas 10

## 1. Persiapan

Dari direktori root proyek yang berisi `package.json`, pasang dependency:

```bash
npm install
```

Jika belum memiliki file `.env`, salin `.env.example` menjadi `.env`. Pada Bash:

```bash
cp .env.example .env
```

Atur `MONGODB_URI` untuk database utama yang dipakai aplikasi. Untuk tes integrasi MongoDB, atur `TEST_MONGODB_URI` ke database khusus pengujian yang namanya berakhiran `_test` atau `_testing`, contohnya:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/click_fraud_detection
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/click_fraud_detection_test
```

Jangan memakai nama database yang sama untuk kedua URI. Skrip integrasi menolak URI uji yang tidak memiliki nama database dengan akhiran `_test` atau `_testing`, serta menolak nama yang sama dengan database utama. Jangan menaruh kredensial database pada dokumen yang akan dibagikan.

Pastikan MongoDB berjalan dan dapat diakses dengan `TEST_MONGODB_URI` sebelum menjalankan tes integrasi.

## 2. Pemeriksaan sintaks dan tes kontrak HTTP

```bash
npm run check:activity10
npm run test:api:activity10
```

`check:activity10` memeriksa sintaks file Aktivitas 10, termasuk skrip tes integrasi. `test:api:activity10` menggunakan fake service sehingga tidak menulis ke MongoDB; suite itu menguji kontrak HTTP seperti health check, simulasi kondisi database terputus, CORS, preflight, CRUD pada lapisan API, validasi, JSON tidak valid, dan respons batch. Karena dependency database diisolasi, suite ini berguna untuk mendeteksi regresi perilaku HTTP secara cepat dan konsisten.

## 3. Tes integrasi dengan MongoDB aktual

Jalankan perintah berikut dari root proyek:

```bash
npm run test:api:activity10:mongo
```

Tes ini menggunakan `TEST_MONGODB_URI`, membuka server Express pada port sementara, lalu memeriksa:

1. health check melaporkan database tersambung;
2. `POST /api/events` menyimpan event dan dokumen benar-benar ditemukan melalui model Mongoose;
3. `GET /api/events/:clickId` membaca event yang tersimpan;
4. `PATCH /api/events/:clickId` memperbarui field dan perubahan diverifikasi langsung di MongoDB;
5. `POST /api/events/ingest` menyimpan event valid serta menolak item yang tidak valid;
6. `DELETE /api/events/:clickId` menghapus event dan keberadaan dokumennya diperiksa ulang.

Skrip hanya membuat record dengan `click_id` berawalan `activity10-it-...` pada database uji dan menghapus record yang dibuat oleh eksekusi itu. Skrip tidak menjalankan `dropDatabase()` serta tidak menghapus collection atau data database utama. Tetap pastikan `TEST_MONGODB_URI` benar sebelum menjalankannya.

Kriteria lulus: semua subtes menunjukkan status lulus dan tidak ada error koneksi MongoDB. Jika koneksi gagal, periksa layanan MongoDB, izin jaringan, URI, nama database uji, dan kredensial.

## 4. Menjalankan API untuk pemeriksaan manual

Jika collection/index database utama belum diinisialisasi, verifikasi `MONGODB_URI` lebih dahulu sebelum menjalankan:

```bash
npm run init:db
npm run verify:db
npm run dev
```

Server secara default tersedia di `http://localhost:5000`. Periksa health check melalui `http://localhost:5000/health` atau:

```bash
curl -i http://localhost:5000/health
curl -i 'http://localhost:5000/api/events?page=1&limit=10'
```

Jangan menjalankan tes destructive terhadap record utama yang tidak dikenal. Gunakan database khusus pengujian untuk semua tes integrasi yang menulis atau menghapus data.

## 5. Interpretasi bukti

Kedua perintah dibutuhkan karena tujuan pengujiannya berbeda. Tes fake service memeriksa kontrak HTTP secara terisolasi dan dapat mensimulasikan keadaan database terputus maupun jalur respons error tanpa menyentuh database; tes integrasi memeriksa bahwa API, service, Mongoose, dan MongoDB aktual bekerja bersama serta bahwa perubahan benar-benar persisten. Tes fake service tidak membuktikan penyimpanan database, sedangkan tes integrasi tidak menggantikan semua skenario isolasi seperti CORS yang ditolak atau JSON invalid.

Berdasarkan output terminal terbaru yang diberikan pengguna, `npm run check:activity10` lulus untuk 8 file, `npm run test:api:activity10` lulus 8/8 tes, dan `npm run test:api:activity10:mongo` lulus 7/7 tes pada database `click_fraud_detection_test`. Catatan ini merekam hasil dari output pengguna; jika kode atau konfigurasi berubah setelah tes tersebut, jalankan ulang perintah yang relevan.
