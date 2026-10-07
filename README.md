# MongoDB Backend - Tahap 1

## Proyek
Sistem Deteksi Fraud Klik Iklan Digital Menggunakan Machine Learning

## Scope
Aktivitas ini merupakan tahap pertama backend dan mencakup:

- pembuatan Mongoose model/collection untuk event;
- pembuatan Mongoose model/collection untuk blocked IP;
- pembuatan Mongoose model/collection untuk model run;
- pembuatan index yang diperlukan sebagai baseline;
- script inisialisasi dan verifikasi collection/index.

Express route, controller, prediction, training, dan hubungan lanjutan Model Run **tidak termasuk** scope aktivitas ini.

## Dasar Referensi
Referensi utama menetapkan bahwa MongoDB digunakan untuk menyimpan **data event, hasil model run, dan daftar IP yang diblokir** melalui backend Express.js. Referensi juga menetapkan 21 field dataset yang dipertahankan pada tahap persiapan data.

Collection dan index pada paket ini dibangun sebagai baseline teknis berdasarkan kebutuhan tersebut. Bagian yang tidak ditetapkan secara eksplisit oleh referensi, terutama schema rinci Model Run dan beberapa index teknis, ditandai sebagai keputusan desain.

## Struktur

```text
backend-mongodb-stage1/
├── .env.example
├── .gitignore
├── README.md
├── package.json
├── docs/
│   ├── DESIGN_NOTES.md
│   └── VERIFICATION_RESULT.md
└── src/
    ├── config/
    │   └── database.js
    ├── initDatabase.js
    ├── verifyDatabase.js
    └── models/
        ├── BlockedIP.js
        ├── Event.js
        ├── ModelRun.js
        └── index.js
```

## Persiapan

1. Salin `.env.example` menjadi `.env`.
2. Isi `MONGODB_URI` dengan koneksi MongoDB yang digunakan kelompok.
3. Jalankan:

```bash
npm install
```

## Inisialisasi Collection dan Index

```bash
npm run init:db
```

Script ini menghubungkan ke MongoDB dan menjalankan `init()` pada ketiga Mongoose model sehingga collection dan index yang didefinisikan oleh schema dapat diinisialisasi.

## Verifikasi

```bash
npm run verify:db
```

Script verifikasi memeriksa keberadaan collection serta menampilkan index yang benar-benar terdaftar pada MongoDB.

## Hasil Verifikasi Aktual

Pengujian dilakukan pada lingkungan MongoDB kelompok pada **8 Oktober 2026**.

### `npm install`

```text
added 20 packages, and audited 21 packages in 8s

2 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

### `npm run init:db`

```text
> click-fraud-backend-stage1@1.0.0 init:db
> node src/initDatabase.js

MongoDB berhasil terhubung.
Collection dan index berhasil diinisialisasi oleh Mongoose.
```

### `npm run verify:db`

```text
> click-fraud-backend-stage1@1.0.0 verify:db
> node src/verifyDatabase.js

MongoDB berhasil terhubung.

=== VERIFIKASI COLLECTION ===
events: ADA
blocked_ips: ADA
model_runs: ADA

=== VERIFIKASI INDEX ===

events
{"v":2,"key":{"_id":1},"name":"_id_"}
{"v":2,"key":{"click_id":1},"name":"click_id_1","background":true,"unique":true}
{"v":2,"key":{"ip_address":1},"name":"ip_address_1","background":true}
{"v":2,"key":{"timestamp":-1},"name":"timestamp_-1","background":true}

blocked_ips
{"v":2,"key":{"_id":1},"name":"_id_"}
{"v":2,"key":{"ip_address":1},"name":"ip_address_1","background":true,"unique":true}

model_runs
{"v":2,"key":{"_id":1},"name":"_id_"}
```

## Status Output

| Output | Status |
|---|---|
| `events` | Terverifikasi ADA |
| `blocked_ips` | Terverifikasi ADA |
| `model_runs` | Terverifikasi ADA |
| `events.click_id` unique index | Terverifikasi ADA |
| `events.ip_address` index | Terverifikasi ADA |
| `events.timestamp` descending index | Terverifikasi ADA |
| `blocked_ips.ip_address` unique index | Terverifikasi ADA |
| `model_runs` additional index | Tidak ada; belum diperlukan berdasarkan scope/informasi tersedia |

## Catatan Model Run

Referensi menyatakan MongoDB menyimpan hasil model run dan mencantumkan metrik accuracy, precision, recall, F1-score, dan ROC AUC. Referensi tidak memberikan schema Model Run secara lengkap.

Karena aktivitas ini hanya tahap pertama backend, `ModelRun.js` menggunakan baseline minimum berikut:

- `model_type`
- `accuracy`
- `precision`
- `recall`
- `f1_score`
- `roc_auc`

Baseline tersebut **bukan schema final untuk tahap backend berikutnya**. Relasi/penghubungan Model Run dengan komponen lain tidak dibuat pada tahap ini.

## Catatan Index

- `events.click_id` menggunakan unique index karena `click_id` adalah identifier event dan pada pemeriksaan dataset sebelumnya tidak ditemukan duplikasi `click_id`.
- `events.ip_address` menggunakan regular index karena `ip_address` digunakan pada konteks mitigasi dan pemeriksaan event.
- `events.timestamp` menggunakan descending index sebagai keputusan desain untuk mendukung kebutuhan monitoring traffic berbasis waktu.
- `blocked_ips.ip_address` menggunakan unique index sebagai keputusan desain agar satu alamat IP tidak memiliki entri blocked yang berulang.

Index `events.ip_address`, `events.timestamp`, dan unique index `blocked_ips.ip_address` adalah keputusan desain teknis. Ketiganya bukan daftar index yang dituliskan secara eksplisit dalam referensi utama.

## Batasan Tahap Ini

- Belum ada Express route/controller.
- Belum ada prediction atau training.
- Belum ada hubungan lanjutan Model Run.
- Tidak ada data contoh yang dimasukkan otomatis.
- Schema Model Run masih berupa baseline minimum dan dapat disesuaikan ketika spesifikasi tahap berikutnya tersedia.
