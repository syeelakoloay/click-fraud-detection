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

Output terminal terbaru yang diberikan pengguna menunjukkan suite `npm run test:api:activity10:mongo` lulus dengan 7 tes dan 0 kegagalan pada database pengujian `click_fraud_detection_test`. Output juga menyatakan bahwa skrip tidak menghapus collection atau database utama. Hasil ini merupakan catatan atas output terminal pengguna, bukan klaim bahwa penyusun dokumentasi menjalankan ulang tes tersebut secara independen. Jika kode atau konfigurasi tes berubah, jalankan kembali suite ini.
