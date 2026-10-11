# Aktivitas 8 - Service Database (MongoDB)

## Tujuan dan hubungan dengan Aktivitas 6

Aktivitas 8 meneruskan fondasi Aktivitas 6. File `src/config/database.js`, model Mongoose `Event`, `BlockedIP`, `ModelRun`, model index, serta `src/initDatabase.js` dan `src/verifyDatabase.js` tetap dipertahankan. Tambahan utama Aktivitas 8 adalah lapisan `src/services/` yang menyediakan operasi data untuk backend dan ringkasan monitoring.

## Service yang tersedia

### `eventService`

- `createEvent(eventData)`: menyimpan satu event menggunakan validasi schema `Event` yang sudah ada.
- `getEventByClickId(clickId)` dan `getEventById(id)`: mengambil satu event.
- `listEvents(options)`: mengambil daftar event dengan filter `click_id`, IP, jenis perangkat, label fraud, rentang waktu, sort, dan pagination.
- `countEvents(options)`: menghitung event yang sesuai filter waktu, label, dan/atau IP.
- `findEventsByIP(ipAddress, options)`: mencari event berdasarkan IP.

### `blockedIPService`

- `addBlockedIP(ipAddress)`: menambah record blocked IP; panggilan berulang pada IP sama tidak membuat record duplikat.
- `getBlockedIP(ipAddress)` dan `isIPBlocked(ipAddress)`: mengambil record atau memeriksa keberadaan IP.
- `listBlockedIPs(options)`: mengambil daftar dengan pagination.
- `removeBlockedIP(ipAddress)`: menghapus satu record berdasarkan IP.

Service ini hanya merekam keputusan pemblokiran yang dipanggil secara eksplisit. Tidak ada aturan otomatis untuk memblokir IP berdasarkan label fraud.

### `modelRunService`

- `createModelRun(modelRunData)`: menyimpan catatan hasil berdasarkan field dalam schema baseline `ModelRun`.
- `getModelRunById(id)` dan `listModelRuns(options)`: mengambil catatan tertentu atau daftar paginated.
- `getLatestModelRun()`: mengambil catatan dengan `_id` paling besar sebagai pendekatan urutan penyimpanan. Schema yang ada belum menyertakan `createdAt`, sehingga fungsi ini bukan penanda waktu training yang pasti.
- `getModelStatus()`: mengembalikan `RESULT_RECORDED` bila ada record tersimpan, atau `NO_MODEL_RUN_RECORDED` bila belum ada. Ini bukan status health/prediksi model.

### `monitoringService`

- `getOverview(options)`: mengembalikan `totalEvents`, `fraudCount`, `validCount`, `fraudRate`, dan `latestEventAt`.
- `getTrafficByTime(options)`: mengelompokkan event per jam UTC (`interval: "hour"`) atau hari UTC (`interval: "day"`) dan menyajikan total/fraud/valid.
- `getMonitoringSnapshot(options)`: menggabungkan overview, traffic, daftar blocked IP, dan status catatan model run.

`fraudRate` adalah persentase `fraudCount / totalEvents * 100`, dibulatkan dua desimal. Jika tidak ada event yang sesuai filter, service mengembalikan `0`.

## File Aktivitas 8

```text
src/services/
├── serviceUtils.js
├── eventService.js
├── blockedIPService.js
├── modelRunService.js
├── monitoringService.js
└── index.js
scripts/
├── checkActivity8Syntax.js
├── testActivity8Utils.js
└── testActivity8Services.js
```

## Batasan

- Tidak menambahkan Express route atau controller; target aktivitas ini adalah koneksi dan service database.
- Tidak menjalankan training/prediction dan tidak menciptakan hasil ML proyek.
- `is_fraudulent` tetap label pada event yang tersimpan, bukan hasil prediksi yang dihitung oleh service.
- Tidak membuat kebijakan atau threshold auto-block.
- Schema ModelRun adalah baseline minimal dari Aktivitas 6.
- Tidak ada data proyek yang dimasukkan secara otomatis oleh service.

## Status tes

Pada pemeriksaan saat paket dibuat, pemeriksaan sintaks 8 file dan unit test utilitas (13 assertion checks) lulus. Integration test yang menggunakan koneksi MongoDB harus dijalankan dari lingkungan kelompok dan belum dinyatakan lulus hingga output aktual menunjukkan seluruh 8 pemeriksaan `PASS`.
