# Catatan Desain

## 1. Event
Collection `events` mempertahankan 21 field dataset yang telah dipetakan pada tahap sebelumnya.

`click_id` dipertahankan sebagai identifier unik event. `is_fraudulent` tetap merupakan target/label, bukan feature input. `ip_address` tetap digunakan untuk konteks sistem dan mitigasi, sedangkan `timestamp` merupakan data waktu event.

### Index

- `click_id`: unique index.
- `ip_address`: regular index.
- `timestamp`: descending index.

Unique index pada `click_id` didukung oleh hasil pemeriksaan bahwa `click_id` tidak duplikat. Index `ip_address` dan `timestamp` adalah keputusan desain teknis berdasarkan kebutuhan lookup mitigasi dan monitoring traffic.

## 2. Blocked IP
Collection `blocked_ips` menyimpan `ip_address` sebagai bagian dari blocked IP list.

### Index

`ip_address` menggunakan unique index. Ini adalah keputusan desain agar satu alamat IP tidak tercatat berulang dalam daftar blocked IP.

## 3. Model Run
Collection `model_runs` menggunakan baseline minimum:

- `model_type`
- `accuracy`
- `precision`
- `recall`
- `f1_score`
- `roc_auc`

Field metric dibuat opsional karena pada tahap ini belum ada hasil training/evaluasi yang menjadi data awal untuk dimasukkan ke database. Referensi menyebut metrik tersebut, tetapi tidak mendefinisikan schema Model Run lengkap.

Tidak ada index tambahan untuk `model_runs` pada tahap ini selain `_id` bawaan MongoDB. Menambahkan index lain akan membutuhkan kebutuhan query yang belum tersedia.

## 4. Verifikasi Aktual

Pada 8 Oktober 2026, pengujian kelompok menghasilkan:

- `events`: ADA
- `blocked_ips`: ADA
- `model_runs`: ADA
- `events.click_id`: unique index ADA
- `events.ip_address`: index ADA
- `events.timestamp`: descending index ADA
- `blocked_ips.ip_address`: unique index ADA
- `model_runs`: hanya `_id`

Bukti terminal lengkap disimpan pada `docs/VERIFICATION_RESULT.md`.

## 5. Batasan

- Schema Model Run lengkap belum tersedia dalam referensi dan bukan scope final tahap ini.
- Backend Express route/controller belum dibuat.
- Relasi atau penghubungan lanjutan Model Run belum dibuat karena menjadi pekerjaan tahap berikutnya.
- Tidak ada data contoh yang dimasukkan otomatis agar tidak mengarang data proyek.
