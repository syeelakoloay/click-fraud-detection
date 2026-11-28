# Aktivitas 13 - Endpoint Monitoring

Dokumen ini merangkum perubahan yang terkait langsung dengan endpoint monitoring Aktivitas 13. Uraian mempertahankan batas schema dan service yang sudah ada pada backend. Status pengujian runtime dibedakan dari pemeriksaan sintaks dan tes unit yang telah dijalankan.

## Konteks

Aktivitas 13 melanjutkan backend Express.js yang memiliki koneksi MongoDB, model Mongoose, event API dari Aktivitas 10, serta service database dan monitoring dari aktivitas sebelumnya. Tujuan khususnya adalah menambahkan endpoint yang menyajikan ringkasan dashboard, metrik evaluasi model, agregasi traffic, dan daftar IP yang diblokir untuk kebutuhan monitoring. Implementasi menggunakan service yang tersedia agar logika akses data tidak diduplikasi.

## File baru

File baru diperlukan untuk memisahkan penanganan permintaan monitoring dari logika service yang sudah tersedia. Controller meneruskan parameter dan hasil service, sedangkan route menyediakan alamat endpoint yang dibutuhkan dashboard. Skrip pemeriksaan, tes unit, dan integration test membantu memeriksa sintaks, logika controller secara terisolasi, serta keterhubungan komponen dengan MongoDB aktual. Unit test tidak menggantikan integration test; keduanya memeriksa jenis risiko yang berbeda.

- `src/controllers/monitoringController.js`
- `src/controllers/blockedIPController.js`
- `src/routes/monitoringRoutes.js`
- `src/routes/blockedIPRoutes.js`
- `scripts/checkActivity13Syntax.js`
- `tests/monitoringController.test.js`
- `tests/blockedIPController.test.js`
- `scripts/testMonitoringIntegrationActivity13.js`: integration test terhadap Express, service, Mongoose, dan MongoDB aktual tanpa mock.

## File yang diubah

Perubahan file lama dibuat seminimal mungkin untuk mengaktifkan endpoint baru dan mendokumentasikannya. Registrasi route dilakukan pada aplikasi Express yang sudah ada, dan skrip npm ditambahkan tanpa dependency produksi baru. Schema model dan service lama tetap dipertahankan.

- `src/app.js`: mendaftarkan route monitoring dan blocked IP sebelum handler 404.
- `package.json`: menambahkan perintah `check:activity13`, `test:activity13:unit`, dan `test:api:activity13:mongo`.
- `README.md`: mendokumentasikan endpoint Aktivitas 13, perintah pengujian, dan tautan dokumentasi.

Tidak ada dependency produksi baru dan tidak ada perubahan pada schema Event, BlockedIP, atau ModelRun. Implementasi menggunakan service yang telah diekspor oleh `src/services/index.js`. Dengan pendekatan ini, perubahan Aktivitas 13 terfokus pada lapisan HTTP dan tidak mengubah proses data sebelumnya.

## Endpoint

Daftar ini mencatat endpoint baru yang disediakan untuk kebutuhan monitoring dashboard. Endpoint menggunakan data yang disediakan service yang ada dan tidak membangkitkan hasil prediksi baru. Detail parameter dan respons dipisahkan dalam dokumentasi endpoint agar mudah diverifikasi.

- `GET /api/monitoring/summary`
- `GET /api/monitoring/metrics`
- `GET /api/monitoring/traffic`
- `GET /api/blocked-ips`

Detail query parameter dan bentuk respons tersedia pada `docs/ENDPOINTS_AKTIVITAS_13.md`. Struktur respons mengikuti service yang tersedia dan mempertahankan nilai yang belum ada sebagai null atau daftar kosong jika sesuai hasil sumber. Pengujian HTTP aktual tetap perlu dijalankan setelah server aktif.

## Batasan

Tes unit menggunakan service tiruan dan hasilnya terbatas pada perilaku controller yang diuji. Tes integrasi aktual kini disediakan melalui `scripts/testMonitoringIntegrationActivity13.js` dan menggunakan Express, service, Mongoose, serta MongoDB nyata pada database khusus pengujian. Tes integrasi tersebut harus dijalankan dengan `npm run test:api:activity13:mongo`; status kelulusannya hanya boleh dicatat setelah output aktual diperoleh pada lingkungan yang memiliki akses MongoDB. Karena lingkungan penyusunan paket ini tidak menyediakan URI kredensial atau instance MongoDB yang terhubung, kelulusan integration test tidak diklaim sebelum Anda menjalankan perintah tersebut.

## Pemeriksaan folder `ml/` dan hard-coded data

Perbandingan checksum pada arsip baseline Aktivitas 10 dan ZIP Aktivitas 13 menunjukkan 12 file di dalam `ml/` memiliki jalur dan isi yang sama. Tidak ada perubahan, penambahan, atau penghapusan file di folder tersebut pada patch Aktivitas 13. Daftar checksum SHA-256 per file disimpan pada `docs/AUDIT_FOLDER_ML_AKTIVITAS_13.txt`. Perbandingan ini berlaku untuk kedua arsip lokal yang tersedia; tidak ada commit atau push ke repository GitHub remote yang dilakukan dalam sesi ini. Hasil ini tidak menggantikan pemeriksaan independen terhadap kondisi remote terbaru.

Controller produksi Aktivitas 13 tidak menambahkan nilai contoh statis sebagai respons API, karena data dibaca melalui service yang sudah ada. Namun, tes unit menggunakan fixture tetap seperti angka ringkasan, metrik, dan contoh IP untuk memeriksa perilaku controller secara deterministik. Repository juga memiliki dataset, artefak hasil ML, nilai konfigurasi, serta contoh data dalam tes dan dokumentasi; itu tidak sama dengan hard-coded data demo yang disajikan endpoint produksi.

## Alasan menggunakan unit test dan integration test aktual

Unit test menggunakan mock untuk memisahkan controller dari database, sehingga pemetaan parameter, bentuk respons, dan penerusan error dapat diuji cepat dan berulang dengan hasil deterministik. Mock juga memudahkan pembuatan kondisi yang sulit dikontrol di database nyata, seperti error service tertentu atau belum adanya model run. Namun, unit test tidak membuktikan bahwa route Express terpasang, query Mongoose valid, agregasi MongoDB berhasil, atau dokumen benar-benar terbaca dari database.

Integration test aktual ditambahkan melalui `scripts/testMonitoringIntegrationActivity13.js` untuk melengkapi batas tersebut. Suite menjalankan `createApp()` dengan service asli, menyimpan event melalui HTTP, membuat record fixture blocked IP dan model run di database uji, lalu menguji empat endpoint monitoring melalui permintaan HTTP. Karena itu, unit test memeriksa logika bagian kecil, sedangkan integration test menilai kerja sama komponen dan persistensi data.

Integration test Aktivitas 13 belum berhasil dijalankan sampai selesai di lingkungan penyusunan paket ini karena proses `npm ci --ignore-scripts` mengalami timeout dan tidak tersedia koneksi MongoDB pengujian yang dapat diakses. Perintah aktual sudah ditambahkan pada `package.json` sebagai `npm run test:api:activity13:mongo`, dan hasilnya harus dilaporkan hanya setelah output tes aktual diperoleh. Suite membatasi koneksi ke database bernama dengan akhiran `_test` atau `_testing`, menolak database dengan nama yang sama seperti `MONGODB_URI`, dan hanya menghapus record uji yang dibuatnya.
