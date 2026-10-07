# Verification Result - MongoDB Backend Tahap 1

Tanggal verifikasi: 8 Oktober 2026

Pengujian ini merupakan hasil eksekusi pengguna terhadap paket `backend-mongodb-stage1` pada MongoDB yang digunakan kelompok.

## 1. npm install

```text
added 20 packages, and audited 21 packages in 8s

2 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

## 2. npm run init:db

```text
> click-fraud-backend-stage1@1.0.0 init:db
> node src/initDatabase.js

MongoDB berhasil terhubung.
Collection dan index berhasil diinisialisasi oleh Mongoose.
```

## 3. npm run verify:db

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

## 4. Kesimpulan Pengujian

Pengujian membuktikan bahwa:

1. koneksi MongoDB berhasil;
2. collection `events` tersedia;
3. collection `blocked_ips` tersedia;
4. collection `model_runs` tersedia;
5. unique index `events.click_id` tersedia;
6. index `events.ip_address` tersedia;
7. descending index `events.timestamp` tersedia;
8. unique index `blocked_ips.ip_address` tersedia;
9. `model_runs` belum memiliki index tambahan selain `_id`, sesuai scope tahap ini.
