# Endpoint Import Dataset CSV

## 1. Tujuan

Endpoint ini menerima dataset CSV mentah dan menyimpan record yang lolos validasi melalui service event yang sudah digunakan backend. Kontrak kolom mengikuti dataset sumber `click_fraud_dataset.csv` dan model Mongoose `Event`, yaitu 21 kolom yang sudah ada. Endpoint ini tidak menggantikan `POST /api/events/ingest`, yang tetap menerima array event berformat JSON.

## 2. Kontrak endpoint

| Keterangan | Nilai |
|---|---|
| Method | `POST` |
| Path | `/api/events/import` |
| Content-Type | `text/csv` atau `application/csv` |
| Body | Isi file CSV mentah, bukan `multipart/form-data` |
| Ukuran body maksimum | 10 MB, mengikuti batas parser pada route |
| Jumlah record data maksimum | 5.000, mengikuti batas batch ingestion yang sudah ada |

Pilihan body CSV mentah menjaga implementasi tetap menggunakan dependensi backend yang sudah ada. Klien yang memakai pemilih file dapat mengirim objek `File` secara langsung sebagai body request dengan `Content-Type: text/csv`.

## 3. Struktur data dan validasi

CSV wajib memuat tepat 21 nama kolom dataset sumber: `click_id`, `timestamp`, `user_id`, `ip_address`, `device_type`, `browser`, `operating_system`, `referrer_url`, `page_url`, `click_duration`, `scroll_depth`, `mouse_movement`, `keystrokes_detected`, `ad_position`, `click_frequency`, `time_since_last_click`, `device_ip_reputation`, `VPN_usage`, `proxy_usage`, `bot_likelihood_score`, dan `is_fraudulent`. Susunan kolom boleh berbeda karena setiap nilai dipetakan berdasarkan nama header, tetapi header yang hilang, berulang, atau tidak dikenal ditolak.

Parser memeriksa struktur kutipan CSV, termasuk koma di dalam tanda kutip, tanda kutip ganda yang di-escape, dan baris baru dalam field yang dikutip. Setiap record harus memiliki jumlah field yang sama dengan header. Sebelum disimpan, setiap record dibuat sebagai dokumen `Event` sementara dan divalidasi serta di-casting oleh schema Mongoose yang sudah ada; hanya record valid yang diteruskan ke `eventService.createEvent`.

Validasi mengikuti aturan model `Event` yang sudah ada, termasuk field wajib, tipe data, nilai enum, dan batas numerik. Validasi khusus import juga memastikan `timestamp` benar-benar merupakan tanggal kalender yang valid dalam format sumber `YYYY-MM-DD HH:mm:ss` (pemisah `T` dan milidetik opsional didukung), `ip_address` merupakan IPv4/IPv6 valid, `referrer_url` dan `page_url` berupa URL HTTP/HTTPS absolut, serta field yang secara makna harus bulat tidak berisi pecahan. Label `is_fraudulent` tetap dibatasi pada 0 atau 1. `click_id` dilindungi oleh indeks unik MongoDB; duplikasi ditolak sebagai kesalahan per record.

## 4. Perilaku hasil import

Kesalahan file seperti CSV rusak, header tidak sesuai, atau jumlah record melebihi batas menyebabkan request ditolak sebelum proses penyimpanan. Kesalahan validasi per record—misalnya jumlah field keliru, timestamp/IP/URL tidak valid, nilai enum tidak valid, nilai pecahan pada field bilangan bulat, atau `click_id` duplikat—dicatat sebagai `rejected`; record lain tetap diproses.

Kesalahan penyimpanan yang bukan kesalahan data, seperti kegagalan koneksi atau kesalahan infrastruktur MongoDB, **tidak** dianggap sebagai penolakan record biasa. Endpoint mengembalikan HTTP 503 dengan kode `IMPORT_PERSISTENCE_FAILED` tanpa membuat ringkasan sukses yang menyesatkan. Karena penyimpanan dilakukan dalam kelompok konkuren, sebagian record pada kelompok terakhir mungkin telah tersimpan saat gangguan terjadi. Periksa database sebelum mengulangi import setelah menerima error tersebut.

Respons sukses berisi `receivedCount`, `successCount`, `failureCount`, dan daftar `results`. Setiap hasil mencakup `rowNumber` (baris pertama adalah header), status `created` atau `rejected`, serta `click_id` jika tersedia. Detail error disertakan untuk record yang ditolak. Objek event lengkap tidak dikembalikan pada setiap hasil sukses agar respons untuk 5.000 record tetap lebih ringan.

## 5. Contoh permintaan

Jalankan perintah berikut dari direktori root backend:

```bash
curl -X POST http://localhost:5000/api/events/import \
  -H "Content-Type: text/csv" \
  --data-binary @dataset/click_fraud_dataset.csv
```

Untuk klien berbasis browser, isi file dapat dikirim sebagai body langsung. Endpoint ini belum menghubungkan atau mengubah repository frontend React.

## 6. Batasan ruang lingkup

- Endpoint mengimpor data mentah 21 kolom, bukan `ml/click_fraud_features.csv` yang merupakan hasil feature engineering dengan 16 kolom.
- Import tidak menjalankan `prepare_data.py`, feature engineering, training, prediksi Random Forest, atau pemblokiran IP otomatis.
- Server tidak otomatis mengimpor dataset saat dimulai.
- Pengujian API dengan service tiruan memeriksa kontrak endpoint dan validasi tanpa membuktikan penyimpanan pada MongoDB aktual. Pengujian integrasi MongoDB harus dijalankan ulang setelah revisi ini pada database uji `click_fraud_detection_test`; hasil dari versi sebelum revisi bukan bukti bahwa perubahan terbaru sudah lulus.

## Pengujian API dengan mock dan MongoDB aktual

Pengujian dibedakan menjadi dua jenis karena keduanya membuktikan hal yang berbeda. Tes `npm run test:api:dataset-import` menggunakan Express nyata tetapi mengganti `eventService` dengan service tiruan, sehingga pengujian dapat memeriksa hasil validasi dan skenario input salah tanpa mengandalkan database. Pada versi revisi, suite mock terdiri atas sembilan skenario, termasuk validasi semantik, respons lebih ringan, dan pemisahan kegagalan penyimpanan dari kesalahan input. Jalankan ulang perintah tersebut untuk memperoleh hasil eksekusi dari lingkungan Anda; tes mock tidak membuktikan penyimpanan aktual.

Untuk mengulang verifikasi persistensi, jalankan tes integrasi berikut pada Git Bash setelah dependensi terpasang dan MongoDB lokal aktif:

```bash
export TEST_MONGODB_URI='mongodb://127.0.0.1:27017/click_fraud_detection_test'
npm run test:api:dataset-import:mongo
```

Skrip menggunakan `TEST_MONGODB_URI`, memeriksa bahwa nama database berakhiran `_test` atau `_testing`, serta menolak database dengan nama yang sama seperti `MONGODB_URI` di `.env`. Skrip membuat ID pengujian acak, mengirim CSV melalui route Express, memverifikasi jumlah record yang dibuat, memastikan record valid dapat dibaca dan record invalid tidak tersimpan, lalu menghapus hanya record dengan ID unik milik tes. Skrip tidak menghapus database atau collection.

Laporan versi sebelum revisi mencatat lima tes integrasi lulus pada database `click_fraud_detection_test`. Hasil lama ini bukan bukti bahwa perubahan terbaru telah lulus. Suite memakai Express, `eventService` asli, Mongoose, dan MongoDB aktual tanpa mock; skenarionya mencakup penyimpanan record valid, penolakan record tidak valid, penolakan header yang salah, penolakan CSV rusak, dan kontrak respons ringkas. Setelah revisi, jalankan ulang suite di lingkungan dengan dependensi lengkap dan MongoDB aktual. Skrip hanya menghapus record dengan `click_id` unik milik tes dan tidak menghapus database.
