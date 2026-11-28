# Tes Integrasi MongoDB Aktual — Aktivitas 10

## Tujuan

Memeriksa integrasi end-to-end antara Express API, service event, model Mongoose, dan MongoDB aktual. Tes menggunakan database khusus pengujian dan tidak menggunakan database utama untuk menghindari perubahan pada data proyek.

## Konfigurasi

Atur `TEST_MONGODB_URI` pada file `.env`, misalnya:

```text
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/click_fraud_detection_test
```

Nama database harus berakhiran `_test` atau `_testing`. Pastikan URI uji menunjuk ke instance MongoDB yang dapat diakses. Jangan samakan nama database uji dengan database di `MONGODB_URI`.

## Jalankan

```bash
npm install
npm run check:activity10
npm run test:api:activity10:mongo
```

## Yang diperiksa

- Status `/health` ketika aplikasi tersambung dengan MongoDB.
- Pembuatan event melalui `POST` dan verifikasi dokumen langsung menggunakan model Mongoose.
- Pembacaan event melalui `GET` dan verifikasi bahwa dokumen tetap ada di MongoDB.
- Perubahan nilai melalui `PATCH` dan verifikasi nilai yang tersimpan.
- Batch ingestion: event yang valid tersimpan dan event tidak valid ditolak.
- Penghapusan melalui `DELETE` dan verifikasi bahwa dokumen tidak lagi ada.

Semua ID yang dibuat skrip memakai prefix unik `activity10-it-`. Saat selesai, skrip hanya menghapus record dengan ID yang dibuat oleh eksekusi tersebut, lalu menutup server sementara dan koneksi. Skrip tidak menghapus seluruh database.

## Status bukti

Output terminal yang dilaporkan untuk suite `npm run test:api:activity10:mongo` menunjukkan tujuh tes lulus dan nol kegagalan pada database pengujian `click_fraud_detection_test`. Output juga menyatakan bahwa skrip tidak menghapus collection atau database utama. Hasil ini merupakan catatan atas output terminal yang diberikan, bukan klaim bahwa tes dijalankan ulang secara independen oleh penyusun dokumentasi. Jika kode atau konfigurasi tes berubah, jalankan kembali suite ini.

---

# Tes Integrasi MongoDB Aktual — Aktivitas 15 (Import Dataset CSV)

## Tujuan dan konfigurasi

Suite Aktivitas 15 memverifikasi endpoint `POST /api/events/import` menggunakan Express, `eventService` asli, Mongoose, dan MongoDB aktual. Skrip membaca `TEST_MONGODB_URI` untuk menentukan database pengujian. Pada sesi yang dilaporkan, variabel tersebut menunjuk ke `click_fraud_detection_test`. Jika variabel tidak ditentukan, skrip menggunakan database bawaan `click_fraud_activity15_test`.

Di Git Bash, variabel dapat ditetapkan dengan perintah berikut:

```bash
export TEST_MONGODB_URI='mongodb://127.0.0.1:27017/click_fraud_detection_test'
npm run test:api:dataset-import:mongo
```

Gunakan URI yang menunjuk ke database pengujian yang berbeda dari database utama. Jangan masukkan kredensial koneksi ke laporan atau pesan yang dibagikan.

## Hasil aktual yang dilaporkan

Output terminal yang dilaporkan pada 21 Oktober 2026 menyatakan database pengujian aktual adalah `click_fraud_detection_test`. Ringkasan pengujian Node.js menunjukkan lima tes lulus, nol gagal, dan nol dilewati; suite menggunakan Express, `eventService`, Mongoose, dan MongoDB aktual tanpa mock.

Skenario yang dilaporkan lulus meliputi penolakan record tidak valid sambil menyimpan record valid, pembacaan record valid melalui API serta respons 404 untuk record invalid, penolakan header tidak sesuai sebelum penyimpanan, dan penolakan CSV rusak tanpa menyimpan record. Skrip menyatakan pembersihan hanya menargetkan `click_id` unik yang dibuat oleh pengujian, tanpa menghapus database atau seluruh collection.

## Mengapa mock dan tes aktual dipisahkan

Tes `npm run test:api:dataset-import` mengganti `eventService` dengan mock untuk memeriksa kontrak HTTP dan skenario validasi secara deterministik. Tes `npm run test:api:dataset-import:mongo` menggunakan service asli dan MongoDB aktual untuk menguji route, schema Mongoose, koneksi, serta persistensi bersama. Kedua hasil dilaporkan terpisah karena keberhasilan mock tidak membuktikan penyimpanan aktual, sedangkan tes integrasi aktual lebih bergantung pada kesiapan dan konfigurasi database.

Catatan ini merangkum output terminal yang diberikan dan tidak menyatakan tes dijalankan ulang secara independen oleh penyusun dokumentasi.
