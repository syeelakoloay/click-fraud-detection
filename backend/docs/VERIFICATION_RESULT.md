# Catatan Hasil Pemeriksaan Proyek

Dokumen ini membedakan pemeriksaan database dari progres sebelumnya dan hasil tes Aktivitas 10. Hasil terminal Aktivitas 10 di bawah ditranskripsikan dari output yang diberikan pengguna pada 16 Oktober 2026; bukan klaim bahwa penyusun paket menjalankan ulang tes tersebut secara independen.

## 1. Verifikasi database tahap sebelumnya

Pada 8 Oktober 2026, hasil pengujian pengguna terhadap paket backend MongoDB tahap 1 menunjukkan koneksi berhasil, collection `events`, `blocked_ips`, dan `model_runs` tersedia, serta index yang dicatat pada laporan sebelumnya tersedia. Rincian historis itu dipertahankan sebagai catatan tahap database sebelumnya dan tidak dihitung sebagai tes Aktivitas 10.

## 2. Output Aktivitas 10 yang diberikan pengguna

- `npm install`: 85 paket ditambahkan, 86 paket diaudit, dan 0 vulnerabilities dilaporkan.
- `npm run dev`: MongoDB berhasil terhubung; Express API berjalan di `http://localhost:5000`; health check tersedia pada `/health` dan event API pada `/api/events`.
- `npm run check:activity10`: 8 file menampilkan `OK`; pemeriksaan sintaks Aktivitas 10 lulus.
- `npm run test:api:activity10`: 8 tes lulus, 0 gagal, 0 dibatalkan, 0 dilewati, dan 0 todo. Suite ini menggunakan fake service.
- `npm run test:api:activity10:mongo`: 7 tes lulus, 0 gagal, 0 dibatalkan, 0 dilewati, dan 0 todo. Database uji yang ditampilkan adalah `click_fraud_detection_test`; output menyatakan tidak ada collection atau database utama yang dihapus.

## 3. Mengapa dua suite tes dipertahankan

Kedua suite tidak duplikat karena memeriksa lapisan berbeda. `test:api:activity10` menggunakan fake service untuk menguji kontrak HTTP yang dapat diisolasi, seperti CORS yang diterima/ditolak, preflight, health check saat database disimulasikan terputus, validasi, JSON tidak valid, serta respons CRUD dan batch. Suite tersebut sengaja tidak membuktikan persistensi MongoDB.

`test:api:activity10:mongo` menggunakan MongoDB aktual pada database khusus pengujian untuk memeriksa koneksi, menyimpan event melalui POST, membacanya melalui GET, memperbarui melalui PATCH, menyimpan item batch yang valid dan menolak item tidak valid, menghapus event melalui DELETE, serta memeriksa dokumen langsung melalui Mongoose. Tes ini memberi bukti integrasi/persistensi yang tidak dapat diberikan fake service. Karena tujuan dan cakupan keduanya saling melengkapi, dua suite tes tetap diperlukan untuk Progres 10.

## 4. Batas bukti

Hasil di atas mendokumentasikan output yang diberikan pengguna. Keduanya tidak mengklaim bahwa penyusun laporan menjalankan tes pada lingkungan pengguna. Hasil lulus berlaku untuk skenario yang secara eksplisit dicakup oleh skrip; tidak menggantikan uji beban, pengujian keamanan deployment, atau verifikasi seluruh skenario produksi.
