# LAPORAN AKTIVITAS 28

## Express.js & ML Integration - Bagian 2/2 Backend
### Penyelarasan Endpoint Utama dengan Kebutuhan Dashboard React dan Finalisasi API Contract

| Identitas | Keterangan |
|---|---|
| Nama Proyek | Sistem Deteksi Fraud Klik Iklan Digital Menggunakan Machine Learning |
| Kelompok | 2 (Dua) |
| Nama Mahasiswa | [Isi sesuai anggota pelaksana Aktivitas 28] |
| NIM/NPM | [Isi sesuai identitas mahasiswa] |
| Nomor Absen | [Isi sesuai identitas mahasiswa] |
| Aktivitas | Express.js & ML integration - Bagian 2/2 backend |
| Branch acuan | `finkly/task27-integration` |
| Commit awal snapshot | `cc8f37e` |

## 1. Ringkasan Eksekutif

Aktivitas 28 melanjutkan pengembangan backend Express.js dengan fokus pada penyelarasan endpoint utama terhadap kebutuhan dashboard React dan finalisasi API contract yang digunakan frontend. Pemeriksaan dilakukan terhadap snapshot repository backend pada branch `finkly/task27-integration`, kemudian dibandingkan dengan laporan tahapan dan aktivitas sebelumnya yang terdapat dalam dokumen referensi proyek.

Hasil pemeriksaan menunjukkan bahwa endpoint utama untuk event, traffic, metrics, summary, health check, dan daftar blocked IP telah tersedia. Kontrak API disusun terpusat dalam `docs/API_CONTRACT_AKTIVITAS_28.md`. README diperbarui agar sesuai dengan implementasi branch yang sebenarnya, terutama karena README sebelumnya masih menyatakan integrasi real-time prediction dan mitigasi IP belum aktif, sedangkan laporan Aktivitas 27 dan source branch sudah memperlihatkan route uji history, pemeriksaan blocked IP, serta pencatatan log.

Skrip pemeriksaan statis `scripts/checkApiContractActivity28.js` ditambahkan untuk memeriksa kesesuaian route, service, field respons, dan dokumentasi kontrak. Pemeriksaan statis dan pemeriksaan sintaks JavaScript dapat dijalankan pada snapshot proyek. Namun, folder `node_modules` tidak disertakan dalam ZIP dan modul `express` tidak tersedia pada lingkungan pengujian. Oleh sebab itu, seluruh tes runtime Express, koneksi MongoDB, layanan Python, dan build frontend tidak dapat dinyatakan lulus pada Aktivitas 28 ini.

Batas penting yang dipertahankan: laporan Aktivitas 27 menyatakan halaman Blocked IPs pada dashboard belum memanggil `GET /api/blocked-ips`; halaman tersebut masih menampilkan risk signals berdasarkan VPN/proxy. ZIP yang diterima untuk Aktivitas 28 hanya berisi repository backend, sehingga source frontend tidak diubah dan integrasi browser halaman tersebut belum dapat dinyatakan selesai.

## 2. Konteks dan Tujuan Aktivitas

### 2.1 Konteks proyek

Proyek membangun sistem deteksi fraud klik iklan digital menggunakan dataset `click_fraud_dataset.csv` dengan 5.000 event, 21 atribut, dan target `is_fraudulent`. Model klasifikasi Random Forest menghasilkan prediksi Valid atau Fraud. MongoDB menyimpan event, model run, serta daftar IP terblokir melalui backend Express.js. Dashboard React digunakan untuk memantau event, traffic, metrik evaluasi, dan informasi blocked IP.

### 2.2 Posisi Aktivitas 28 dalam proyek

Aktivitas 28 merupakan kelanjutan pekerjaan backend setelah:

1. Aktivitas 13 menyediakan endpoint monitoring dan daftar blocked IP.
2. Aktivitas 16 dan 18 mengintegrasikan data traffic dan event ke dashboard React.
3. Aktivitas 19 dan 22 membangun jalur Express.js menuju Python ML serta persiapan 15 fitur.
4. Aktivitas 24 menghubungkan metrik evaluasi model ke dashboard.
5. Aktivitas 26 memperkuat validasi request, error handling, logging, dan konfigurasi layanan ML.
6. Aktivitas 27 menguji hasil prediction, blocked IP, log, dan pembacaan data monitoring secara terpadu.

Karena itu, Aktivitas 28 memusatkan pekerjaan pada konsistensi kontrak endpoint yang dipakai atau dibutuhkan dashboard. Aktivitas ini tidak mengulang feature engineering, training model, skema database, atau algoritma mitigasi IP.

### 2.3 Tujuan

1. Menginventarisasi endpoint backend yang berhubungan dengan kebutuhan dashboard React.
2. Memastikan parameter query dan bentuk respons terdokumentasi sesuai kode sumber.
3. Membedakan label dataset, metrik model run, health service, risk signals, dan daftar blocked IP.
4. Menyediakan satu dokumen API contract final sebagai acuan integrasi frontend.
5. Menambahkan pemeriksaan statis agar dokumentasi utama tetap selaras dengan source backend.

## 3. Referensi dan Dasar Pemeriksaan

Pemeriksaan menggunakan:

- `1_merged (2).pdf`, khususnya laporan Aktivitas 13, 16, 18, 19, 22, 24, 26, dan 27 serta laporan tahapan awal proyek.
- ZIP `click-fraud-detection.zip` yang diberikan, berisi repository backend pada branch `finkly/task27-integration`.
- File source backend: `src/app.js`, route, controller, service, model, middleware, `package.json`, `.env.example`, dan `README.md`.

Repository frontend `12410178/advertising` tidak terdapat dalam ZIP yang diberikan pada giliran ini. Oleh karena itu, perilaku frontend yang dijelaskan pada laporan ini dibatasi pada bukti dan catatan sumber dalam PDF, bukan klaim pemeriksaan ulang source frontend saat ini.

## 4. Validasi Kesesuaian Aktivitas

| Aspek validasi | Temuan | Penilaian |
|---|---|---|
| Kesesuaian referensi | Aktivitas 13 telah menyediakan endpoint monitoring; Aktivitas 24 mengintegrasikan metrics; Aktivitas 27 menguji summary dan blocked IP | Sesuai |
| Relevansi topik | Penyelarasan route, parameter, respons, dan kebutuhan dashboard adalah pekerjaan backend/API contract | Sesuai |
| Kesesuaian tujuan proyek | Endpoint event, traffic, metrics, dan blocked IP mendukung monitoring sistem | Sesuai |
| Keterhubungan dengan pekerjaan sebelumnya | Kode branch memuat route utama serta route pengujian real-time dari aktivitas sebelumnya | Sesuai, dengan batasan branch |
| Kecukupan output | Kontrak endpoint dapat didokumentasikan dari source; validasi runtime end-to-end belum tersedia | Tercapai pada tingkat dokumentasi dan pemeriksaan statis; pengujian runtime masih diperlukan |

### 4.1 Temuan dan masalah yang perlu dicatat

**Temuan 1 - README tidak sesuai dengan source branch.** README menyatakan prediksi real-time serta mitigasi otomatis belum aktif, sedangkan source branch memiliki `POST /api/realtime/test-history` dan `realtimePredictionService` dengan pemeriksaan blocked IP dan penambahan IP setelah label fraud. README diperbarui agar membedakan endpoint prediksi utama, route pengujian history, dan batas bahwa route history tidak menyimpan event ke collection `events`.

**Temuan 2 - halaman Blocked IPs belum mengambil daftar blocked IP aktual.** Laporan Aktivitas 27 menyatakan halaman tersebut masih menampilkan risk signals dari VPN/proxy dan belum mengirim request ke `GET /api/blocked-ips`. Endpoint backend tersedia dan dapat diakses melalui proxy, tetapi pemanggilan dari halaman belum dibuktikan. Kontrak Aktivitas 28 mendokumentasikan kebutuhan endpoint tersebut serta melarang penyamaan risk signals dengan daftar blocked IP.

**Temuan 3 - terdapat perbedaan error status pada route uji real-time.** Aktivitas 27 mencatat bahwa ketika layanan Python tidak tersedia, `/api/predict` dapat mengembalikan 503 sementara `/api/realtime/test-history` mengembalikan 500. Hal ini didokumentasikan sebagai keterbatasan yang belum diselesaikan oleh perubahan Aktivitas 28, karena route tersebut bukan endpoint baca dashboard dan perbaikannya memerlukan perubahan serta tes tersendiri.

**Temuan 4 - tidak ada bukti bahwa semua endpoint telah diuji ulang pada lingkungan penyusunan.** Snapshot tidak menyediakan `node_modules`, MongoDB, layanan Python yang sedang berjalan, atau repository frontend. Karena itu hasil pengujian sebelumnya tidak ditulis sebagai pengujian baru Aktivitas 28.

## 5. Langkah Pengerjaan

| Langkah | Tujuan | Pemeriksaan/pekerjaan | Referensi/data | Hasil |
|---|---|---|---|---|
| 1. Verifikasi snapshot | Memastikan basis kerja benar | Memeriksa branch, commit, dan struktur backend | ZIP branch Aktivitas 27 | Branch `finkly/task27-integration`, commit `cc8f37e` terkonfirmasi dari metadata Git ZIP |
| 2. Pemetaan endpoint | Mengidentifikasi API utama | Memeriksa `src/app.js` dan seluruh route | Source backend, Aktivitas 13/24/27 | Matriks endpoint tersedia |
| 3. Pemetaan kontrak event | Menyesuaikan pagination/filter | Memeriksa event controller, service, dan schema | `eventController.js`, `eventService.js`, `Event.js`, Aktivitas 18 | Parameter dan bentuk respons terdokumentasi |
| 4. Pemetaan monitoring | Menyesuaikan traffic, metrics, summary | Memeriksa monitoring controller/service dan ModelRun | Aktivitas 13/16/24/27 | Struktur `data`, interval, metrics, dan model status terdokumentasi |
| 5. Pemetaan blocked IP | Memisahkan daftar aktual dari risk signal | Memeriksa blocked IP controller/service/model | Aktivitas 23/25/27 | Kontrak `GET /api/blocked-ips` dan batas schema terdokumentasi |
| 6. Finalisasi dokumen | Menyatukan spesifikasi | Membuat API contract dan memperbarui README | Source backend dan PDF | Dokumen API contract final tersedia |
| 7. Pemeriksaan konsistensi | Mengurangi drift dokumentasi/source | Menambahkan dan menjalankan pemeriksaan statis | Source backend dan dokumen contract | Hasil pemeriksaan statis dicatat pada Bagian 7 |

## 6. Implementasi dan Hasil

### 6.1 Branch dan commit dasar

Metadata Git pada ZIP menunjukkan branch aktif `finkly/task27-integration` dengan commit `cc8f37e` (`test: skenario aktivitas 27 integrasi prediction, blocked IP, dan monitoring`). Commit tersebut berada setelah merge `498b8bd`, yang menggabungkan perubahan dari `main` pada commit `136f06f`. Snapshot ini dipakai sebagai dasar pemeriksaan Aktivitas 28.

### 6.2 Endpoint utama yang dipetakan

| Method | Endpoint | Fungsi | Status pada integrasi dashboard berdasarkan referensi |
|---|---|---|---|
| GET | `/health` | Status Express dan koneksi database | Dipakai untuk pemeriksaan kesehatan |
| GET | `/api/events` | Daftar event dengan pagination dan filter | Dipakai frontend; pengambilan bertahap dicatat pada Aktivitas 18/27 |
| GET | `/api/monitoring/traffic` | Agregasi traffic per jam/hari | Dipakai untuk grafik traffic |
| GET | `/api/monitoring/metrics` | Metrik evaluasi model run | Integrasi dashboard dicatat Aktivitas 24 |
| GET | `/api/monitoring/summary` | Overview, traffic, blocked IP, status model run | Tersedia pada backend; konsumsi frontend tidak dinyatakan sebagai sumber utama KPI di Aktivitas 27 |
| GET | `/api/blocked-ips` | Daftar IP aktual pada collection `blocked_ips` | Tersedia; halaman Blocked IPs belum terbukti memanggilnya pada Aktivitas 27 |

### 6.3 Kontrak event

`GET /api/events` mendukung `page`, `limit`, `click_id`, `ip_address`, `device_type`, `is_fraudulent`, `startDate`, `endDate`, `sortBy`, dan `sortOrder`. Pagination default adalah halaman 1 dengan 50 record dan batas maksimum 100 per halaman. Respons service memuat `data`, `total`, `page`, `limit`, dan `totalPages`.

Dashboard pada referensi mengakses event secara bertahap dengan `page` dan `limit=50`. `is_fraudulent` adalah label pada data sumber, bukan hasil prediction dari layanan ML.

### 6.4 Kontrak monitoring

`GET /api/monitoring/traffic` menerima rentang tanggal opsional dan `interval=hour|day`; pengelompokan service menggunakan timezone UTC. `GET /api/monitoring/metrics` hanya mengembalikan field metrik yang benar-benar ada pada model run. Jika belum ada catatan, `data` bernilai `null` dan status `NO_MODEL_RUN_RECORDED`. Status tersebut tidak menunjukkan kesiapan layanan Python.

`GET /api/monitoring/summary` menyatukan `overview`, `traffic`, `blockedIPs`, dan `modelStatus`. `fraudRate` dikembalikan dalam persen. Ringkasan ini didokumentasikan sebagai endpoint opsional yang tersedia, bukan pengganti otomatis bagi filter frontend yang saat ini dihitung dari koleksi event.

### 6.5 Kontrak blocked IP

`GET /api/blocked-ips` mendukung `page` dan `limit`, dengan bentuk respons `data`, `total`, `page`, `limit`, dan `totalPages`. Record saat ini hanya menyediakan `_id` dan `ip_address`. Dokumen tidak menambahkan reason, blocked timestamp, probabilitas, atau aksi unblock karena field tersebut tidak ada pada schema yang diperiksa.

### 6.6 Perubahan file

| File | Perubahan |
|---|---|
| `docs/API_CONTRACT_AKTIVITAS_28.md` | Baru; memuat matriks endpoint, query, bentuk respons, error contract, pemetaan dashboard, dan prosedur verifikasi |
| `docs/LAPORAN_AKTIVITAS_28.md` | Baru; salinan laporan aktivitas dalam repository |
| `scripts/checkApiContractActivity28.js` | Baru; pemeriksaan statis konsistensi route, service, dan dokumentasi |
| `README.md` | Diperbarui agar deskripsi prediksi/mitigasi sesuai implementasi branch dan merujuk contract Aktivitas 28 |
| `.env.example` | Ditambah konfigurasi contoh `PREDICTION_URL` dan `HISTORY_WINDOW_MINUTES` yang memang dibaca oleh route uji real-time |
| `package.json` | Ditambah perintah `npm run check:activity28` |

Tidak ada perubahan pada model ML, data training, feature engineering, schema MongoDB, aturan penambahan IP ke blocked list, atau alur filter React.

## 7. Pengujian dan Validasi

### 7.1 Pemeriksaan statis API contract

Perintah:

```bash
npm run check:activity28
```

Hasil aktual: **20 dari 20 pemeriksaan statis lulus**. Pemeriksaan meliputi pendaftaran route, parameter service, field metrik, pagination, timezone UTC, label dataset, pembedaan risk signals dan blocked IP, serta batas route uji real-time.

### 7.2 Pemeriksaan sintaks JavaScript

Perintah `node --check` dijalankan terhadap seluruh 52 file JavaScript dalam folder `src`, `scripts`, dan `tests`. Hasilnya: **52 file lulus pemeriksaan sintaks**.

### 7.3 Tes unit dan integrasi runtime

**Tes runtime dicoba, tetapi rangkaian tes belum dapat dinyatakan lulus seluruhnya.** Folder `node_modules` tidak disertakan dalam ZIP. Saat `node --test tests/*.test.js` dijalankan, 11 test case berhasil, sedangkan satu test suite tidak dapat dimuat karena modul `express` tidak ditemukan. MongoDB dan layanan Python juga tidak dijalankan. Oleh karena itu:

- `node --test tests/*.test.js`: 11 test case lulus; satu test suite tidak dapat dimuat karena `Cannot find module 'express'`. Rangkaian tes secara keseluruhan belum lulus.
- Tes integrasi MongoDB belum dijalankan ulang.
- Permintaan HTTP aktual ke semua endpoint belum dijalankan ulang.
- Hasil prediksi dan mitigasi Aktivitas 27 tetap menjadi bukti historis, bukan pengujian baru.

### 7.4 Pengujian frontend

Repository frontend tidak terdapat dalam ZIP input. `npm run build`, pemeriksaan browser, serta verifikasi bahwa halaman Blocked IPs mengirim request `/api/blocked-ips` belum dapat dilakukan pada paket ini. Bagian tersebut tetap menjadi verifikasi lintas repository yang diperlukan sebelum menyatakan integrasi end-to-end sepenuhnya selesai.

## 8. Analisis Konsistensi dan Keterbatasan

1. Kontrak backend untuk event, traffic, metrics, summary, health, dan blocked IP telah dihimpun dari source yang ada; tidak diperlukan pembuatan endpoint monitoring duplikat.
2. Event label dari dataset, prediction model, risk signals VPN/proxy, dan blocked IP adalah empat hal yang berbeda dan harus dipertahankan istilahnya.
3. `GET /api/blocked-ips` merupakan sumber daftar blocked IP aktual. Pemanggilan URL melalui proxy saja tidak membuktikan halaman UI telah mengintegrasikannya.
4. `NO_MODEL_RUN_RECORDED` berarti belum ada hasil model run tersimpan; hal tersebut tidak identik dengan Python service tidak aktif.
5. Endpoint `/api/realtime/test-history` adalah route uji yang tidak menyimpan event ke koleksi `events`. Route ini bukan bukti bahwa pipeline ingest produksi otomatis menjalankan prediction.
6. Route uji real-time masih memiliki perbedaan HTTP status ketika layanan Python tidak tersedia, sebagaimana dicatat pada Aktivitas 27.
7. Model baseline pada referensi memiliki metrik evaluasi yang lemah. Aktivitas integrasi API tidak memperbaiki kualitas model dan tidak boleh dianggap membuktikan target akurasi lebih dari 95% tercapai.
8. ZIP yang disediakan hanya memuat backend. Untuk pengujian React end-to-end diperlukan source frontend yang sesuai dengan snapshot backend.

## 9. Kesimpulan

Aktivitas 28 telah menghasilkan penyelarasan dokumentasi API backend dengan kebutuhan dashboard React berdasarkan source branch `finkly/task27-integration`. Kontrak endpoint utama dihimpun dalam `docs/API_CONTRACT_AKTIVITAS_28.md`, README diselaraskan dengan implementasi branch, contoh konfigurasi route real-time diperjelas, dan pemeriksaan statis kontrak ditambahkan.

Pencapaian ini memenuhi bagian dokumentasi dan pemetaan kontrak pada target Aktivitas 28. Namun, status **integrasi end-to-end belum dapat dinyatakan sepenuhnya selesai** karena tes HTTP/MongoDB/Python belum dijalankan ulang pada lingkungan penyusunan dan source frontend tidak terdapat pada ZIP yang diterima. Secara khusus, pemanggilan `GET /api/blocked-ips` dari halaman Blocked IPs masih perlu dibuktikan melalui source frontend dan Network browser. Keterbatasan tersebut ditandai secara eksplisit agar laporan tidak mengklaim hasil yang belum diuji.

## 10. Daftar Output

1. `docs/API_CONTRACT_AKTIVITAS_28.md` - API contract final berdasarkan source backend.
2. `README.md` - dokumentasi repository yang telah diselaraskan.
3. `scripts/checkApiContractActivity28.js` - pemeriksaan konsistensi statis.
4. `package.json` - perintah `check:activity28`.
5. `.env.example` - dokumentasi variabel untuk route uji real-time.
6. Folder proyek ZIP backend yang telah diperbarui.

## 11. Informasi yang Masih Dibutuhkan untuk Status Final End-to-End

1. Repository atau ZIP frontend `12410178/advertising` pada versi yang dipakai bersama backend ini.
2. Keluaran aktual `npm run check:activity28` dan `node --test tests/*.test.js` setelah dependency terpasang.
3. Bukti request HTTP dari backend aktif dan Network browser untuk endpoint dashboard, terutama `GET /api/blocked-ips` pada halaman Blocked IPs.
4. Bukti `npm run build` frontend setelah seluruh perubahan integrasi lintas repository selesai.

Informasi tersebut diperlukan untuk menyatakan kesesuaian runtime dan integrasi UI, bukan hanya kesesuaian dokumentasi dengan source backend.
