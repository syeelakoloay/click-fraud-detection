# API Contract Final - Aktivitas 28

**Proyek:** Sistem Deteksi Fraud Klik Iklan Digital Menggunakan Machine Learning  
**Repository:** `syeelakoloay/click-fraud-detection`  
**Basis kode:** branch `finkly/task27-integration`, commit `cc8f37e` (snapshot ZIP yang diperiksa)  
**Tujuan dokumen:** menyatukan kontrak endpoint backend yang relevan dengan dashboard React dan membedakan endpoint dashboard dari endpoint prediksi/pengujian.

> Catatan sumber: kontrak di bawah disusun dari route, controller, service, dan schema pada snapshot backend yang diberikan serta catatan integrasi pada laporan Aktivitas 16, 18, 21, 24, 26, dan 27. Contoh JSON hanya menjelaskan bentuk field; contoh bukan hasil request baru atau data produksi.

## 1. Konteks dan batas integrasi

Dashboard ClickGuard menggunakan Express API untuk membaca event dan data monitoring. Catatan Aktivitas 18 menjelaskan pemuatan event secara bertahap melalui `GET /api/events` menggunakan `page` dan `limit=50`. Aktivitas 24 mencatat konsumsi `GET /api/monitoring/metrics`, sedangkan Aktivitas 16/18 mencatat penggunaan `GET /api/monitoring/traffic`. Aktivitas 27 membuktikan backend dapat menyajikan daftar blocked IP melalui `GET /api/blocked-ips` dan melalui proxy dashboard.

Ada satu batas integrasi yang wajib dipertahankan dalam dokumentasi: laporan Aktivitas 27 menyatakan halaman **Blocked IPs** pada frontend saat itu masih menampilkan *risk signals* dari event VPN/proxy dan belum mengirim request ke `GET /api/blocked-ips`. Endpoint backend tersedia, tetapi pemanggilan dari halaman tersebut belum dibuktikan oleh snapshot yang diberikan. Risk signals bukan daftar IP yang benar-benar masuk collection `blocked_ips`.

Dokumen ini mendefinisikan kontrak backend untuk konsumsi dashboard. Pada workspace terpadu Aktivitas 28 yang disusun dari dua ZIP referensi, halaman Blocked IPs frontend telah dihubungkan ke `GET /api/blocked-ips` dan risk signals tetap dipisahkan. Keberadaan integrasi pada source belum dengan sendirinya membuktikan tes HTTP/MongoDB atau browser end-to-end; verifikasi runtime tetap harus dilakukan pada lingkungan yang menjalankan layanan.

## 2. Aturan umum API

- Base URL lokal yang dicatat pada aktivitas sebelumnya adalah `http://localhost:5000`.
- Format request/response menggunakan JSON, kecuali `POST /api/events/import` yang menerima CSV mentah dan berada di luar kontrak baca dashboard.
- Timestamp disimpan sebagai tanggal MongoDB. Untuk request rentang tanggal, frontend sebaiknya mengirim ISO 8601 dengan zona waktu eksplisit agar interpretasi tanggal tidak ambigu.
- Label event `is_fraudulent` berasal dari label dataset: `0 = Valid/Non-Fraud`, `1 = Fraud`. Field ini bukan hasil prediksi real-time.
- Bentuk error standar middleware aplikasi adalah `{"error":{"code":"...","message":"..."}}`.
- CORS menggunakan `CORS_ORIGINS`; nilai default kode mencakup `http://localhost:5173` dan `http://localhost:5174`. Saat frontend memakai proxy Vite, request `/api` diteruskan ke backend sesuai konfigurasi frontend.

## 3. Matriks endpoint utama

| Method | Endpoint | Peran dashboard | Status integrasi berdasarkan referensi |
|---|---|---|---|
| `GET` | `/health` | Memeriksa server dan koneksi database | Sudah digunakan untuk pemeriksaan kesehatan layanan |
| `GET` | `/api/events` | Sumber record untuk KPI, tabel event, filter, dan grafik berbasis timestamp di frontend | Sudah digunakan; pengambilan halaman berulang dicatat pada Aktivitas 18/27 |
| `GET` | `/api/monitoring/traffic` | Sumber agregasi traffic per jam atau hari | Sudah digunakan pada grafik traffic |
| `GET` | `/api/monitoring/metrics` | Membaca metrik evaluasi model run tersimpan | Integrasi metrik dicatat pada Aktivitas 24 |
| `GET` | `/api/monitoring/summary` | Ringkasan overview, traffic, blocked IP, dan status model run | Tersedia di backend; tidak dinyatakan sebagai sumber utama KPI React pada Aktivitas 27 |
| `GET` | `/api/blocked-ips` | Daftar IP aktual pada collection `blocked_ips` | Endpoint tersedia dan dapat diakses; halaman Blocked IPs belum terbukti memanggilnya pada Aktivitas 27 |

## 4. Kontrak per endpoint

### 4.1 `GET /health`

**Fungsi:** memeriksa status aplikasi Express dan koneksi Mongoose ke MongoDB.

**Status dan respons:**

- `200` jika koneksi database aktif (`readyState === 1`).
- `503` jika database belum terhubung.

Contoh respons ketika terhubung:

```json
{
  "status": "ok",
  "service": "click-fraud-detection-api",
  "database": "connected"
}
```

Health check tidak membuktikan bahwa collection tertentu berisi data atau bahwa layanan Python aktif.

### 4.2 `GET /api/events`

**Fungsi:** membaca event tersimpan dengan pagination, filter, dan pengurutan.

**Query parameter:**

| Parameter | Nilai/aturan | Default atau batas |
|---|---|---|
| `page` | Bilangan bulat positif | `1` |
| `limit` | Bilangan bulat positif | `50`, maksimum `100` |
| `click_id` | Teks tidak kosong | Tidak ada |
| `ip_address` | Teks tidak kosong | Tidak ada |
| `device_type` | Teks; nilai event mengikuti enum schema (`Desktop`, `Tablet`, `Mobile`) | Tidak ada |
| `is_fraudulent` | `0` atau `1` | Tidak ada |
| `startDate` | Tanggal yang dapat diparse | Tidak ada |
| `endDate` | Tanggal yang dapat diparse; tidak boleh lebih kecil dari `startDate` | Tidak ada |
| `sortBy` | `timestamp`, `click_id`, atau `is_fraudulent` | `timestamp` |
| `sortOrder` | `asc` atau `desc` | `desc` |

**Bentuk respons:**

```json
{
  "data": [
    {
      "_id": "<mongo-id>",
      "click_id": "<click-id>",
      "timestamp": "<ISO-8601>",
      "user_id": "<user-id>",
      "ip_address": "<ip-address>",
      "device_type": "Desktop",
      "browser": "Chrome",
      "operating_system": "Windows",
      "referrer_url": "<url>",
      "page_url": "<url>",
      "click_duration": 0,
      "scroll_depth": 0,
      "mouse_movement": 0,
      "keystrokes_detected": 0,
      "ad_position": "Top",
      "click_frequency": 1,
      "time_since_last_click": 1,
      "device_ip_reputation": "Good",
      "VPN_usage": 0,
      "proxy_usage": 0,
      "bot_likelihood_score": 0,
      "is_fraudulent": 0
    }
  ],
  "total": 0,
  "page": 1,
  "limit": 50,
  "totalPages": 0
}
```

`data` adalah record halaman yang diminta. `total` adalah jumlah record setelah filter dan sebelum pagination. `totalPages` dihitung dari `total / limit`; jika tidak ada record, nilainya `0`. Record pada schema Event memiliki 21 field sumber; `_id` merupakan identifier MongoDB dan `__v` dinonaktifkan pada schema.

**Pola konsumsi frontend yang tercatat:** frontend membaca halaman berurutan menggunakan `page` dan `limit=50`, lalu melanjutkan sesuai metadata pagination. Jangan mengasumsikan satu respons halaman pertama berisi semua event. Filter perangkat/klasifikasi dan penyusunan komponen visual pada implementasi React yang dilaporkan dilakukan pada data yang sudah dimuat; jangan mengubah perilaku filter frontend hanya dengan memindahkan filter ke server tanpa pengujian kompatibilitas.

### 4.3 `GET /api/monitoring/traffic`

**Fungsi:** mengembalikan agregasi event, fraud, dan valid menurut bucket waktu.

**Query parameter:**

- `startDate`: batas awal opsional.
- `endDate`: batas akhir opsional.
- `interval`: `hour` atau `day`; default `hour`.

**Bentuk respons:**

```json
{
  "data": {
    "interval": "hour",
    "data": [
      {
        "period": "<UTC-time-bucket>",
        "totalEvents": 0,
        "fraudCount": 0,
        "validCount": 0
      }
    ]
  }
}
```

Bucket dihitung pada timezone UTC. Untuk `hour`, format periode setara dengan `YYYY-MM-DDTHH:00:00.000Z`; untuk `day`, formatnya `YYYY-MM-DD`. Satu baris `data` mewakili bucket waktu, bukan satu event. Pada implementasi frontend yang dijelaskan dalam Aktivitas 18, mode per jam meminta interval `hour`, sedangkan mode periode lain meminta interval `day` lalu pengelompokan minggu/bulan/tahun dilanjutkan di frontend.

### 4.4 `GET /api/monitoring/metrics`

**Fungsi:** membaca metrik evaluasi dari model run terbaru yang benar-benar tersimpan pada collection `model_runs`.

**Query parameter:** tidak ada parameter khusus.

Jika model run tersedia, `data` dapat memuat `model_type`, `accuracy`, `precision`, `recall`, `f1_score`, dan `roc_auc`. Nilai metrik disimpan sebagai angka desimal pada rentang `0` sampai `1`. Jika belum ada model run, `data` bernilai `null` dan status `NO_MODEL_RUN_RECORDED`.

Contoh ketika belum ada record:

```json
{
  "data": null,
  "status": "NO_MODEL_RUN_RECORDED",
  "note": "Belum ada hasil model run tersimpan di MongoDB."
}
```

`RESULT_RECORDED` hanya menyatakan catatan model run ditemukan. Status ini **bukan** health check layanan Python atau bukti model sedang siap menerima prediksi. Frontend Aktivitas 24 mengubah nilai desimal menjadi persentase untuk ditampilkan; konversi tampilan tidak mengubah nilai API.

### 4.5 `GET /api/monitoring/summary`

**Fungsi:** menyediakan gabungan snapshot monitoring.

**Query parameter:**

- `startDate`, `endDate`: rentang tanggal untuk overview dan traffic.
- `interval`: `hour` atau `day`; default `hour`.
- `blockedIPLimit`: jumlah maksimal entri blocked IP dalam bagian snapshot; default `50`, batas maksimum mengikuti service pagination (`100`).

**Bentuk respons:**

```json
{
  "data": {
    "overview": {
      "totalEvents": 0,
      "fraudCount": 0,
      "validCount": 0,
      "fraudRate": 0,
      "latestEventAt": null
    },
    "traffic": {
      "interval": "hour",
      "data": []
    },
    "blockedIPs": {
      "data": [],
      "total": 0,
      "page": 1,
      "limit": 50,
      "totalPages": 0
    },
    "modelStatus": {
      "status": "NO_MODEL_RUN_RECORDED",
      "hasRecordedRun": false,
      "latestModelRun": null,
      "note": "Belum ada hasil model run tersimpan di MongoDB."
    }
  }
}
```

`fraudRate` dinyatakan dalam persen (misalnya `24.82`, bukan rasio `0.2482`). `latestEventAt` bernilai `null` jika belum ada event. Nilai dalam contoh adalah placeholder skematis, bukan angka sesi uji.

### 4.6 `GET /api/blocked-ips`

**Fungsi:** membaca daftar IP yang benar-benar tersimpan pada collection `blocked_ips`.

**Query parameter:** `page` dan `limit`; default `page=1`, `limit=50`, maksimum `100`.

**Bentuk respons:**

```json
{
  "data": [
    {
      "_id": "<mongo-id>",
      "ip_address": "<ip-address>"
    }
  ],
  "total": 0,
  "page": 1,
  "limit": 50,
  "totalPages": 0
}
```

Schema saat ini hanya menyediakan `ip_address` (serta `_id` dari MongoDB). Kontrak tidak menyediakan `reason`, `blockedAt`, probabilitas, `click_id`, atau operasi membuka blokir. Jangan mengisi metadata tersebut di frontend dengan nilai buatan.

**Catatan integrasi halaman:** laporan Aktivitas 27 mencatat halaman Blocked IPs belum menggunakan endpoint ini. Pada workspace Aktivitas 28 yang telah digabungkan, frontend sekarang mengirim `GET /api/blocked-ips` dan membaca seluruh halaman berdasarkan metadata pagination. *Risk signals* dari event dengan `VPN_usage=1` atau `proxy_usage=1` tetap ditampilkan pada bagian terpisah dan tidak disebut sebagai blocked IP. Bukti request runtime dari halaman tetap perlu diperiksa melalui Network tab.

## 5. Endpoint operasional di luar konsumsi dashboard

Endpoint berikut tetap menjadi bagian backend, tetapi tidak termasuk kontrak baca dashboard utama pada aktivitas ini.

| Method | Endpoint | Fungsi dan batasan |
|---|---|---|
| `POST` | `/api/predict` | Endpoint prediksi bridge Express.js ke layanan Python. Menerima fitur atau event yang diproses `predictionFeatureService`; bukan endpoint untuk mengambil daftar dashboard. |
| `POST` | `/api/realtime/test-history` | Route pengujian history/blocked-IP pada branch Aktivitas 27. Tidak menyimpan event uji ke `events`; respons memuat label/probability, `prediction_source`, `blocked_by_ip_list`, `ip_blocked`, dan `history_used`. |
| `POST` | `/api/events/ingest` | Ingest batch event JSON; bukan cara frontend membaca daftar event. |
| `POST` | `/api/events/import` | Import dataset CSV mentah; bukan bagian pembacaan dashboard. |

Untuk `/api/realtime/test-history`, `PREDICTION_URL` harus diarahkan langsung ke endpoint Python `/predict` agar pemanggilan menggunakan model. Jika variabel tersebut kosong, source saat ini mengembalikan hasil mock (`prediction_source: "mock"`). `HISTORY_WINDOW_MINUTES` default `10`; batas waktu request pada source saat ini ditetapkan konstan `5000` ms dan bukan variabel lingkungan.

## 6. Error contract dan perilaku fallback

### 6.1 Error standar aplikasi

Error yang diteruskan ke middleware aplikasi menggunakan bentuk:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "<pesan yang aman untuk client>"
  }
}
```

Status yang dapat muncul pada API termasuk:

| HTTP | Kondisi yang tercatat pada implementasi |
|---|---|
| `400` | JSON/input/query tidak valid atau validasi schema |
| `403` | Origin CORS tidak diizinkan |
| `404` | Endpoint atau event tidak ditemukan |
| `409` | `click_id` duplikat |
| `413` | Payload terlalu besar |
| `500` | Kesalahan internal yang tidak dikategorikan secara khusus |
| `502` / `503` | Respons/gangguan layanan ML pada endpoint `/api/predict`, sesuai klasifikasi `predictionService` |

Frontend perlu memeriksa HTTP status dan field `error.code`, bukan hanya mengasumsikan setiap respons selalu berisi `data`.

### 6.2 Batasan error route pengujian real-time

Pada source branch yang diperiksa, `/api/realtime/test-history` masih memakai penanganan error lokal: `TypeError` menjadi `400`, sedangkan error lain menjadi `500`. Laporan Aktivitas 27 juga mencatat bahwa ketika Python tidak tersedia, `/api/predict` dapat mengembalikan `503` sementara `/api/realtime/test-history` mengembalikan `500`. Perbedaan ini tidak disamarkan sebagai kontrak yang sudah seragam. Route tersebut bukan konsumsi dashboard utama, dan penyelarasan error route real-time perlu dilakukan sebagai perubahan kode terpisah serta diuji sebelum dinyatakan selesai.

### 6.3 Kondisi kosong bukan nilai nol yang direka

- Event kosong: `data: []`, `total: 0`, `totalPages: 0`.
- Metrics belum ada: `data: null`, `status: "NO_MODEL_RUN_RECORDED"`.
- Overview tanpa event: hitungan `0`, `fraudRate: 0`, `latestEventAt: null`.
- Blocked IP kosong: `data: []`, `total: 0`.

Frontend harus membedakan kondisi kosong dari request gagal. Status model run juga tidak boleh dipakai sebagai pengganti health status Python.

## 7. Matriks komponen React dan sumber API

| Kebutuhan UI | Sumber utama | Aturan konsistensi |
|---|---|---|
| Event list / Click events | `GET /api/events` | Gunakan pagination server; `is_fraudulent` tetap label dataset |
| KPI overview yang dihitung dari event terunduh | `GET /api/events` | Gunakan satu koleksi/filter bersama jika perilaku frontend saat ini dipertahankan |
| Traffic chart | `GET /api/monitoring/traffic` dan pemrosesan periode frontend | Perhatikan bucket UTC; jumlah bucket bukan jumlah event |
| Model evaluation metrics | `GET /api/monitoring/metrics` | `data:null` berarti belum ada record model run, bukan Python down |
| Health / status koneksi database | `GET /health` | Tidak menjamin data event/model run tersedia |
| Blocked IP list aktual | `GET /api/blocked-ips` | Harus dibedakan dari VPN/proxy risk signals |
| Snapshot gabungan (opsional) | `GET /api/monitoring/summary` | Jangan mengganti logika KPI berfilter tanpa uji kompatibilitas |

## 8. Urutan verifikasi API

Jalankan backend pada lingkungan proyek dengan `.env` yang valid dan MongoDB aktif. Pengujian runtime berikut belum dijalankan pada saat dokumen ini disusun; jalankan dan simpan respons aktual sebelum mengklaim end-to-end lulus.

PowerShell:

```powershell
Invoke-RestMethod "http://localhost:5000/health" | ConvertTo-Json -Depth 8
Invoke-RestMethod "http://localhost:5000/api/events?page=1&limit=50" | ConvertTo-Json -Depth 8
Invoke-RestMethod "http://localhost:5000/api/monitoring/traffic?interval=hour" | ConvertTo-Json -Depth 8
Invoke-RestMethod "http://localhost:5000/api/monitoring/metrics" | ConvertTo-Json -Depth 8
Invoke-RestMethod "http://localhost:5000/api/monitoring/summary" | ConvertTo-Json -Depth 8
Invoke-RestMethod "http://localhost:5000/api/blocked-ips?page=1&limit=50" | ConvertTo-Json -Depth 8
```

Periksa Network tab pada dashboard untuk memastikan request yang benar-benar dilakukan frontend dan cocokkan respons dengan tabel pada dokumen ini. Untuk halaman Blocked IPs, bukti integrasi harus memperlihatkan request `/api/blocked-ips` dari halaman tersebut, bukan hanya membuka URL proxy secara manual.

## 9. Pengujian kontrak statis repository

Jalankan:

```bash
npm run check:activity28
```

Skrip `scripts/checkApiContractActivity28.js` memeriksa secara statis keterhubungan route, parameter service, field respons, dan dokumentasi kontrak. Pemeriksaan ini tidak menjalankan Express, tidak menghubungi MongoDB/Python, dan tidak menggantikan tes HTTP, unit test, tes MongoDB, atau tes browser end-to-end.

## 10. Sumber internal

1. Laporan Tahap 1 dan Tahap 2: kebutuhan sistem, data dictionary, serta definisi label dan dataset.
2. Laporan Aktivitas 13: implementasi endpoint monitoring dan blocked IP.
3. Laporan Aktivitas 16 dan 18: integrasi traffic dan pengambilan event bertahap oleh React.
4. Laporan Aktivitas 19 dan 22: kontrak endpoint prediksi dan persiapan 15 fitur.
5. Laporan Aktivitas 24: konsumsi metrics pada dashboard.
6. Laporan Aktivitas 26: validasi, error handler, request logger, dan konfigurasi layanan ML.
7. Laporan Aktivitas 27: pengujian terpadu prediction, blocked IP, log, serta batas pemanggilan `/api/blocked-ips` oleh halaman Blocked IPs.

Seluruh referensi tersebut berada pada dokumen `1_merged (2).pdf` yang diberikan untuk proyek ini. Tidak ada nilai hasil pengujian baru yang diasumsikan dalam kontrak ini.
