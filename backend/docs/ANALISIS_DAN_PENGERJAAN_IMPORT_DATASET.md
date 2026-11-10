# Analisis dan Pengerjaan: Endpoint Import Dataset CSV

## 1. Konteks

Proyek Sistem Deteksi Fraud Klik Iklan Digital Menggunakan Machine Learning menggunakan dataset `click_fraud_dataset.csv` dari sumber Kaggle. Dataset sumber memiliki 5.000 event, 21 atribut, dan label `is_fraudulent` dengan nilai 0 atau 1. Bagian pekerjaan ini menambahkan jalur untuk mengirim dataset CSV ke backend Express.js dan menyimpan record yang lolos validasi pada MongoDB melalui service event yang sudah ada.

Endpoint ini melengkapi endpoint `POST /api/events/ingest` yang telah menerima batch event JSON. Keduanya memiliki fungsi berbeda berdasarkan format input; endpoint JSON yang sudah ada tidak dihapus atau diubah perilakunya. Output aktivitas adalah endpoint import dataset beserta validasi sebelum penyimpanan.

## 2. Validasi aktivitas

| Pemeriksaan | Temuan | Penilaian |
|---|---|---|
| Kesesuaian dengan referensi | Dataset sumber berformat CSV dan model `Event` memuat 21 kolomnya. | Sesuai. |
| Relevansi | Backend sebelumnya memiliki CRUD event dan batch ingestion JSON, tetapi belum memiliki endpoint CSV pada daftar endpoint yang diperiksa. | Relevan; menjadi fungsi impor tersendiri. |
| Kesesuaian output | Endpoint dapat menerima CSV, memeriksa header dan struktur setiap record, memvalidasi berdasarkan schema `Event`, lalu meneruskan data valid melalui service yang sudah ada. | Sesuai dengan target “Endpoint import dataset”. |
| Konsistensi | `POST /api/events/ingest` tetap menangani JSON. Import CSV menggunakan schema, service, collection, dan indeks unik `click_id` yang sudah ada. | Tidak ditemukan konflik fungsional dalam referensi yang diperiksa. |
| Batasan | Frontend React belum terbukti terhubung ke API backend. | Kontrak endpoint didokumentasikan; integrasi frontend bukan bagian implementasi ini. |

## 3. Langkah pengerjaan

| Langkah | Tujuan | Yang diperiksa/dikerjakan | Data atau referensi | Hasil yang harus diperoleh |
|---|---|---|---|---|
| 1. Periksa dataset dan schema | Menjaga struktur data tetap konsisten. | Cocokkan nama 21 kolom dataset sumber dengan schema `Event`. | `click_fraud_dataset.csv`, data dictionary, `src/models/Event.js`. | Daftar header kanonis dan aturan validasi mengikuti model yang sudah ada. |
| 2. Buat route terpisah | Mempertahankan endpoint lama. | Tambahkan `POST /api/events/import` sebelum route lain yang berpotensi memakai parameter dinamis; biarkan `/ingest` tetap menerima JSON. | `src/routes/eventRoutes.js`, daftar endpoint backend. | Route import CSV tersedia tanpa mengganti ingestion JSON. |
| 3. Parse CSV | Mengubah isi CSV menjadi record tanpa mengacaukan koma atau tanda kutip di dalam field. | Tangani kutipan, tanda kutip ganda, CRLF/LF, dan baris baru di dalam field yang dikutip; tolak format kutipan yang rusak. | Format CSV dataset sumber. | Kumpulan record yang dapat diperiksa. |
| 4. Validasi struktur | Menolak berkas dengan kontrak kolom yang berbeda. | Periksa header hilang/duplikat/tidak dikenal, jumlah field tiap record, jumlah maksimum 5.000 record, dan isi nonkosong. | Dataset 21 kolom; batas batch JSON sebelumnya 5.000 item. | Kesalahan format dilaporkan sebelum data disimpan; record salah bentuk ditolak per baris. |
| 5. Validasi isi sebelum simpan | Mencegah record yang tidak sesuai schema masuk ke service penyimpanan. | Buat dokumen sementara `Event`, jalankan validasi dan casting Mongoose, kemudian kirim payload tervalidasi ke `eventService.createEvent`. | `src/models/Event.js`, `src/services/eventService.js`. | Hanya record yang lolos validasi schema yang diteruskan ke service. |
| 6. Pisahkan error penyimpanan | Mencegah kegagalan MongoDB dianggap sebagai invalid row. | Error validasi dan duplicate key menjadi hasil per record; error infrastruktur diteruskan sebagai HTTP 503 `IMPORT_PERSISTENCE_FAILED`. | Kontrak error endpoint import dan middleware error handler. | Gangguan penyimpanan tidak dilaporkan sebagai HTTP 200 dengan semua row ditolak. |
| 7. Laporkan hasil secara ringkas | Memudahkan pemeriksaan hasil tanpa respons berlebihan. | Kembalikan jumlah record diterima, berhasil, gagal, serta nomor baris/status/error. Jangan mengirim ulang seluruh dokumen untuk setiap row sukses. | Respons endpoint import. | Respons untuk dataset 5.000 baris lebih ringan dan masih dapat ditelusuri. |
| 8. Uji parser, API mock, dan integrasi aktual | Memeriksa kasus normal, penolakan data, dan persistensi aktual. | Jalankan tes parser, API memakai service tiruan, serta tes integrasi dengan Express, service asli, Mongoose, dan MongoDB aktual. | Skrip test repository dan database pengujian terpisah. | Bukti pemeriksaan logika dan bukti persistensi dapat dilaporkan secara terpisah. |

## 4. Kontrak implementasi

- Method dan path: `POST /api/events/import`.
- Input: body mentah berisi CSV dengan `Content-Type: text/csv` atau `application/csv`.
- Batas teknis: body maksimum 10 MB dan maksimum 5.000 record data per request.
- Header: harus mencakup tepat 21 kolom dataset sumber; urutan kolom boleh berbeda karena pemetaan memakai nama header.
- Validasi: format CSV, header, jumlah field, field wajib, tipe data, enum, rentang numerik, timestamp kalender yang valid, IP valid, URL HTTP/HTTPS, bilangan bulat sesuai makna field, dan duplikasi `click_id` saat simpan.
- Hasil: `receivedCount`, `successCount`, `failureCount`, dan `results`.
- Penyimpanan: lewat `eventService.createEvent`; schema dan model tidak diubah.

Pengiriman CSV menggunakan body mentah merupakan keputusan implementasi karena referensi tidak menentukan apakah upload harus memakai `multipart/form-data`. Ini tidak menambah dependensi backend. Jika klien integrasi nantinya mensyaratkan `multipart/form-data`, format transport perlu disepakati sebelum integrasi frontend.

## 5. Hal yang sengaja tidak ditambahkan

Endpoint tidak membuat field dataset baru, tidak mengubah label `is_fraudulent`, tidak melakukan feature engineering, tidak memanggil model Random Forest, tidak menjalankan prediksi, tidak menambahkan IP ke blocked list secara otomatis, dan tidak mengimpor dataset otomatis saat server dimulai. CSV 16 kolom hasil feature engineering bukan input endpoint ini; endpoint menerima CSV sumber 21 kolom.

## 6. Pengujian revisi dan status verifikasi

Paket revisi memperbarui tes otomatis untuk mencakup validasi tanggal kalender, format IP dan URL, field bilangan bulat, respons yang tidak mengirim dokumen event lengkap, serta HTTP 503 apabila service penyimpanan gagal. Suite API mock berisi sembilan skenario; suite parser berisi enam skenario; tes utilitas validasi berisi sembilan skenario, termasuk pemeriksaan seluruh 5.000 baris dataset sumber; dan tes middleware error handler memuat empat skenario.

Verifikasi pada paket revisi: `npm run check:dataset-import` lulus dengan sepuluh berkas sintaks; tes parser, tes utilitas validasi, dan tes error handler lulus dengan total 19 tes dan nol kegagalan. Tes API mock serta tes integrasi MongoDB belum berhasil dijalankan pada lingkungan audit ini karena registry npm tidak dapat dijangkau (`EAI_AGAIN`) sehingga dependensi Express/Mongoose belum tersedia lengkap. Jalankan ulang kedua suite tersebut setelah dependensi dan MongoDB tersedia. Hasil pengujian yang dilaporkan untuk versi ZIP awal tidak otomatis membuktikan bahwa perubahan revisi sudah lulus.

## 7. Penanganan error dan batas penyimpanan

Validasi CSV dilakukan sebelum record diteruskan ke service. Error validasi per record dicatat pada hasil `rejected` sehingga record lain dapat diproses. Sebaliknya, error penyimpanan yang bukan duplicate key atau error validasi Mongoose diteruskan ke middleware sebagai HTTP 503 `IMPORT_PERSISTENCE_FAILED`. Karena proses simpan dalam kelompok konkuren tidak bersifat transaksional, sebagian record pada kelompok terakhir dapat tersimpan ketika kegagalan terjadi; database perlu diperiksa sebelum permintaan import diulang.

Respons hasil sukses berisi jumlah diterima, sukses, gagal, dan status setiap baris. Detail event penuh tidak disertakan pada hasil sukses; `rowNumber`, `click_id`, dan status cukup untuk menelusuri record. Format request tetap menggunakan body CSV mentah karena ketentuan aktivitas tidak mensyaratkan multipart form upload. Autentikasi deployment tidak ditambahkan karena tidak termasuk target import CSV yang dinyatakan.

## 8. Mengapa pengujian mock dan aktual dipisahkan

Tes mock mengganti `eventService` dengan penyimpanan tiruan sehingga skenario input valid, input tidak valid, header salah, CSV rusak, content type, dan batas 5.000 record dapat dijalankan secara terkontrol. Pendekatan ini cepat dan deterministik, tetapi tidak menjalankan persistensi MongoDB dan tidak memverifikasi koneksi atau indeks unik yang sesungguhnya. Tes integrasi aktual menggunakan Express, `eventService` asli, Mongoose, dan database uji untuk membuktikan bahwa route, validasi schema, penyimpanan, serta pembacaan record bekerja bersama.

## 9. Catatan penting dan status akhir

Laporan versi sebelumnya mencatat pengujian HTTP manual yang menghasilkan 5.000 record sukses dan penghitungan 5.000 dokumen di MongoDB pada database `click_fraud_detection_test2`. Itu merupakan bukti untuk versi sebelum perbaikan dalam dokumen revisi ini, bukan hasil pengujian ulang setelah kode berubah. Jangan mengulang impor penuh pada database yang sudah berisi dataset karena `click_id` bersifat unik dan duplikasi dapat ditolak.

Sebelum menyatakan revisi sepenuhnya tervalidasi, jalankan `npm run test:api:dataset-import` dan `npm run test:api:dataset-import:mongo` setelah dependensi selesai dipasang dan MongoDB tersedia. Kemudian lakukan impor manual di database pengujian yang kosong dan hitung ulang dokumen tersimpan. Aktivitas ini tetap terbatas pada endpoint import CSV, validasi data, pemisahan error penyimpanan, dan pelaporan hasil; integrasi frontend React serta autentikasi deployment tidak ditambahkan karena berada di luar target aktivitas yang diberikan.
