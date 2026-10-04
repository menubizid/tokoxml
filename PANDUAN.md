# 📘 PANDUAN LENGKAP — SARINADINET COMMERCE & POS

> **Toko Online Jual Beli Laptop & PC + POS Kasir** berbasis **Blogger (SPA) + Google Apps Script + Google Spreadsheet**.
> Versi 1.0.0 · Bahasa Indonesia · Siap produksi (production ready)

Dokumen ini menjelaskan **cara memasang, mengonfigurasi, memakai, dan merawat** seluruh sistem — dari halaman toko untuk pelanggan, hingga kasir POS, gudang, teknisi, CRM, dan audit trail.

---

## DAFTAR ISI

1. [Ringkasan Sistem](#1-ringkasan-sistem)
2. [Tiga File Inti & Arsitektur](#2-tiga-file-inti--arsitektur)
3. [Prasyarat](#3-prasyarat)
4. [Pemasangan Backend (Google Apps Script)](#4-pemasangan-backend-google-apps-script)
5. [Pemasangan Frontend (Blogger XML Theme)](#5-pemasangan-frontend-blogger-xml-theme)
6. [Konfigurasi `CONFIG` di Theme](#6-konfigurasi-config-di-theme)
7. [Mode DEMO (tanpa backend)](#7-mode-demo-tanpa-backend)
8. [Login Staf & Hak Akses (RBAC)](#8-login-staf--hak-akses-rbac)
9. [Struktur Data di Google Spreadsheet](#9-struktur-data-di-google-spreadsheet)
10. [Referensi API (86 Aksi)](#10-referensi-api-86-aksi)
11. [Panduan Halaman Publik (Pelanggan)](#11-panduan-halaman-publik-pelanggan)
12. [Panduan Modul POS Kasir](#12-panduan-modul-pos-kasir)
13. [Panduan Transaksi & Pesanan](#13-panduan-transaksi--pesanan)
14. [Panduan Katalog Produk & CRUD](#14-panduan-katalog-produk--crud)
15. [Panduan Bundling PC Rakitan (BOM)](#15-panduan-bundling-pc-rakitan-bom)
16. [Panduan Stok, Opname & Kartu Stok](#16-panduan-stok-opname--kartu-stok)
17. [Panduan Pembelian / Purchase Order](#17-panduan-pembelian--purchase-order)
18. [Panduan CRM Pelanggan, Poin & Tier](#18-panduan-crm-pelanggan-poin--tier)
19. [Panduan Service (Papan Kerja & Invoice)](#19-panduan-service-papan-kerja--invoice)
20. [Panduan Tukar Tambah (Trade-In)](#20-panduan-tukar-tambah-trade-in)
21. [Panduan Promo & Voucher](#21-panduan-promo--voucher)
22. [Panduan Konten Situs](#22-panduan-konten-situs)
23. [Panduan Staf & Reset PIN](#23-panduan-staf--reset-pin)
24. [Panduan Pengaturan Sistem](#24-panduan-pengaturan-sistem)
25. [Panduan Audit Trail](#25-panduan-audit-trail)
26. [Template Pesan WhatsApp](#26-template-pesan-whatsapp)
27. [Desain, Animasi & Aksesibilitas](#27-desain-animasi--aksesibilitas)
28. [Perangkat Pendukung: Barcode, Struk, Shortcut](#28-perangkat-pendukung-barcode-struk-shortcut)
29. [Troubleshooting](#29-troubleshooting)
30. [Checklist Go-Live & Keamanan](#30-checklist-go-live--keamanan)
31. [Lampiran: Rumus & Aturan Bisnis](#31-lampiran-rumus--aturan-bisnis)

---

## 1. RINGKASAN SISTEM

**Sarinadinet Commerce & POS** adalah satu aplikasi (Single Page Application) yang menangani dua dunia sekaligus:

| Sisi | Untuk siapa | Isi |
|---|---|---|
| **Storefront** (halaman publik) | Pelanggan | Hero, katalog + filter/sort/cari, detail produk, paket rakitan, keranjang, checkout WhatsApp, tukar tambah, form service, lacak pesanan, testimoni, FAQ, kontak |
| **Back-office & POS** | Staf/Owner | Dashboard analitik, POS kasir, transaksi, produk, bundling, stok & opname, PO, CRM, service, trade-in, promo, konten, staf, pengaturan, audit trail |

Keduanya hidup dalam **satu file theme Blogger**, ditambah **satu file backend GAS** dan **satu file panduan ini**.

### Fitur utama

- 🛍️ **Katalog dinamis**: kategori, brand, kondisi (baru/bekas), tipe (unit/paket), diskon, stok, sorting, pencarian *debounced*, *load more*, filter aktif yang bisa dihapus satu-satu.
- 🛒 **Keranjang & checkout**: tersimpan di `localStorage`, cek stok real-time ke server, validasi kode promo, poin otomatis, gratis ongkir, pesanan dikirim ke WhatsApp toko.
- 🧾 **POS Kasir premium**: pencarian SKU/nama, **dukungan scanner barcode USB**, keranjang cepat, *numpad*, *quick cash*, *hold cart*, 6 metode bayar, diskon manual + promo, struk termal 40 kolom (cetak / salin / kirim WA), pre-order.
- 📊 **Dashboard analitik**: omzet/laba/transaksi/margin hari ini vs kemarin, grafik tren 14 hari, kategori, metode bayar, produk terlaris, performa staf, peringatan stok (Chart.js).
- 📦 **Produk & bundling**: CRUD lengkap, impor massal (tempel data / unggah CSV / drag & drop), ekspor CSV, hapus massal, **BOM PC rakitan** dengan `max_buildable` otomatis.
- 🧮 **Stok**: opname mode **SET** & **DELTA** (wajib catatan), kartu stok (semua mutasi: IN/OUT/ADJUST/OPNAME/PO_IN/TRADEIN_IN/RETUR), peringatan produk menipis & rakitan terhambat.
- 🚚 **Purchase Order**: draft → dikirim → diterima, penerimaan otomatis menambah stok & membuat produk baru bila SKU belum ada, kirim PO ke supplier via WhatsApp.
- 👥 **CRM**: tier otomatis (Bronze/Silver/Gold/Platinum), poin loyalitas, penyesuaian poin manual, profil 360° (transaksi + service + trade-in), broadcast promo WhatsApp.
- 🔧 **Service**: papan kerja kanban 7 tahap (drag & drop), diagnosa, sparepart, invoice service otomatis + struk.
- ♻️ **Tukar tambah**: kalkulator estimasi publik, pengajuan masuk, review, **persetujuan otomatis membuat produk "Bekas"** dengan markup margin.
- 🏷️ **Promo**: persentase/nominal/gratis ongkir, minimum belanja, maksimum diskon, kuota, periode, aktif/nonaktif.
- 🎨 **Konten**: banner & testimoni yang tampil di halaman publik.
- 🔐 **Keamanan**: PIN staf (hash SHA-256 + salt di sisi server), token HMAC bertanda tangan (TTL 12 jam), RBAC per halaman & per aksi API.
- 🧭 **Audit trail**: login, checkout, void, ubah harga, hapus data — lengkap dengan waktu, nama staf, dan detail.
- 🌙 **Desain**: mobile-first, mode terang & gelap, animasi halus (reveal, marquee, fly-to-cart, shimmer, mikro-interaksi), aksesibel (ARIA, fokus, kontras).

---

## 2. TIGA FILE INTI & ARSITEKTUR

```
┌──────────────────────────────┐        ┌───────────────────────────────┐
│  theme-blogger.xml           │  HTTPS │  code.gs (Google Apps Script)  │
│  (SPA Blogger: HTML+CSS+JS)  │ ─────► │  REST API 86 aksi             │
│  Storefront + POS            │ JSONP  │  Validasi · RBAC · Audit      │
└──────────────────────────────┘ ◄───── └──────────────┬────────────────┘
                                                        │ SpreadsheetApp
                                              ┌─────────▼─────────┐
                                              │  Google Sheets    │
                                              │  15 sheet data    │
                                              └───────────────────┘
```

| File | Isi | Ukuran | Catatan |
|---|---|---|---|
| `code.gs` | Backend REST API untuk Google Apps Script | ±3.000 baris, 33 bagian | Tempel utuh di Apps Script |
| `theme-blogger.xml` | SPA lengkap (CSS di `b:skin`, markup, JS) | ±7.600 baris, >500 KB | Tempel utuh di *Edit HTML* Blogger |
| `PANDUAN.md` | Dokumen ini | — | Baca sekali, pakai selamanya |

### Alur data singkat

1. Pelanggan membuka blog → theme memuat → memanggil `public.bootstrap` → konten hero/katalog terisi.
2. Pelanggan checkout → `public.order.create` → pesanan tersimpan di sheet `ORDER` → pesan WhatsApp berisi rincian otomatis dibuka.
3. Staf login dengan PIN → `auth.login` → server mengembalikan **token** → disimpan di `localStorage`.
4. Semua aksi staf mengirim `token`; server memverifikasi tanda tangan HMAC, masa berlaku, dan **role** yang diizinkan.
5. Setiap aksi vital dicatat ke sheet `AUDIT` (siapa, kapan, apa, berapa).

---

## 3. PRASYARAT

- Akun **Google** (gratis) — untuk Spreadsheet + Apps Script.
- Akun **Blogger/Blogspot** (gratis) — sebagai host aplikasi.
- Browser modern: Chrome, Edge, Firefox, Safari (versi 2 tahun terakhir). Disarankan Chrome untuk mode *kiosk* POS.
- Opsional: **scanner barcode USB** (bekerja seperti keyboard — apa pun merek, tanpa driver), printer struk 58/80 mm, atau printer biasa untuk cetak A4.
- Tidak perlu server, database, atau hosting berbayar. Tidak ada biaya langganan.

> ⚠️ Batas gratis yang wajar diketahui: kuota Apps Script ±20.000 request/hari (akun Gmail biasa) — untuk toko ritel hal ini sangat longgar (ribuan transaksi/hari tetap aman).

---

## 4. PEMASANGAN BACKEND (GOOGLE APPS SCRIPT)

### Langkah 1 — Buat Spreadsheet database

1. Buka [sheets.new](https://sheets.new) → beri nama, misal **`DB SARINADINET`**.
2. Jangan membuat sheet apa pun secara manual — biarkan `setupSistem()` yang membuat semuanya.

### Langkah 2 — Tempel kode backend

1. Di Spreadsheet: menu **Extensions → Apps Script**.
2. Hapus isi `Code.gs` yang kosong.
3. Buka file `code.gs` dari paket ini, **salin seluruhnya**, tempel ke editor Apps Script.
4. Simpan (ikon 💾 atau `Ctrl+S`). Beri nama project, misal **`Sarinadinet API`**.

### Langkah 3 — Jalankan setup satu kali

1. Pada daftar fungsi di toolbar, pilih **`setupSistem`** → klik **Run**.
2. Muncul dialog izin → **Review permissions** → pilih akun → *Advanced* → *Go to Sarinadinet API (unsafe)* → **Allow**.
   *(Peringatan "unsafe" adalah normal untuk skrip buatan sendiri yang belum diverifikasi Google.)*
3. Tunggu hingga log selesai. Hasilnya:
   - 15 sheet dibuat: `PRODUCT, CUSTOMER, ORDER, SERVICE, TRADEIN, STOCKMOVE, PO, PROMO, STAFF, SETTING, AUDIT, BANNER, TESTI, COUNTER, HOLDCART`
   - Pengaturan default terpasang (profil toko, aturan poin, template WhatsApp)
   - 4 akun staf: **Owner `123456`**, Kasir `1111`, Teknisi `2222`, Gudang `3333`
   - Data contoh produk, pelanggan, promo, banner, testimoni

> 🧪 Opsional: jalankan fungsi **`selfTest`** untuk memverifikasi 13 pemeriksaan otomatis (login, produk, stok, checkout, dll). Semua harus melaporkan `OK`.

### Langkah 4 — Deploy sebagai Web App

1. Klik **Deploy → New deployment**.
2. Klik ikon ⚙️ di samping *Select type* → pilih **Web app**.
3. Isi:
   - **Description**: `Sarinadinet API v1`
   - **Execute as**: **Me** (akun Anda)
   - **Who has access**: **Anyone** *(wajib "Anyone", bukan "Anyone with Google account", agar pelanggan bisa membaca katalog)*
4. **Deploy** → salin **Web app URL** yang berakhiran `/exec`.

### Langkah 5 — Uji API

Buka URL berikut di tab baru (ganti `{URL}` dengan milik Anda):

```
{URL}/exec?action=ping
```

Harus muncul JSON:

```json
{ "ok": true, "data": { "pong": true, "waktu": "2026-01-01 09:00:00" } }
```

Uji login:

```
{URL}/exec?action=auth.login&pin=123456
```

Jika dua uji di atas berhasil, **backend siap**. 🎉

> 📌 Setiap kali Anda mengubah `code.gs`, lakukan **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy** agar perubahan aktif (URL tetap sama).

---

## 5. PEMASANGAN FRONTEND (BLOGGER XML THEME)

### Langkah 1 — Siapkan blog

1. Masuk [blogger.com](https://www.blogger.com) → **Create new blog** (atau pakai blog lama).
2. Nama & alamat bebas, mis. `sarinadinet.blogspot.com`.

### Langkah 2 — Tempel theme

1. Menu kiri: **Theme (Tema)**.
2. Klik ikon **▾** di sebelah *Customize* → pilih **Edit HTML**.
3. **Pilih semua** isi editor (`Ctrl+A`) lalu **hapus** (`Delete`).
4. Buka `theme-blogger.xml` dari paket ini, salin **seluruh isinya** (dari `<?xml` hingga `</html>`), tempel ke editor.
5. Klik **Save** (ikon 💾) di kanan atas.

> Jika Blogger menolak dengan pesan error: pastikan Anda menyalin **seluruh** file (termasuk baris terakhir `</html>`), dan tidak ada teks tambahan seperti penomoran baris dari preview.

### Langkah 3 — Hubungkan ke API

1. Di editor HTML yang sama, tekan `Ctrl+F` → cari **`API_URL`**.
2. Anda akan menemukan blok:

```javascript
var CONFIG = {
  API_URL: '',                  // ← TEMPEL URL /exec DI SINI
  USE_JSONP: true,
  ...
};
```

3. Isi dengan URL dari [Langkah 4](#langkah-4--deploy-sebagai-web-app), contoh:

```javascript
API_URL: 'https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxx/exec',
```

4. **Save**.
5. Buka blog di tab baru → katalog produk harus langsung muncul dari Spreadsheet Anda.

### Langkah 4 — Optimasi wajib setelah theme terpasang

| Setelan | Lokasi | Nilai disarankan | Alasan |
|---|---|---|---|
| **Meta description** | Settings → Basic → Description | Deskripsi toko + kata kunci | SEO |
| **Crawlers & indexing** | Settings → Privacy → Crawlers and indexing | *Yes* (untuk toko publik) | Produk terindeks Google |
| **Tampilan mobile** | Theme → Mobile → *Mobile* | **No, use desktop theme** | Agar SPA tampil identik & penuh di HP |
| **Komentar** | Settings → Comments | Sembunyikan/sesuai kebutuhan | SPA tidak memakai sistem komentar Blogger |

> ⚠️ **Penting**: Blogger secara default memakai *mobile theme* terpisah yang akan mengacak tampilan SPA. Set `Theme → Mobile → pilih "No. Show desktop theme"`.

### Bagaimana cara menyematkan halaman POS di dalam blog?

Aplikasi POS adalah bagian dari halaman yang sama (SPA). Tiga cara membukanya:

1. Klik tombol **Masuk** di navbar → masukkan PIN.
2. Tambahkan `#pos` pada URL blog: `https://namablog.blogspot.com/#pos` — login langsung terbuka.
3. Tombol **Masuk Staf / POS** di menu drawer (mobile).

---

## 6. KONFIGURASI `CONFIG` DI THEME

Cari blok `var CONFIG = {` (sekitar baris 2.360 pada file XML):

```javascript
var CONFIG = {
  API_URL: '',                       // URL Web App GAS. Kosong = MODE DEMO.
  USE_JSONP: true,                   // Fallback JSONP otomatis bila CORS gagal
  BRAND: 'Sarinadinet',              // Nama brand pada judul & pesan
  TOKEN_KEY: 'sd_token',             // Kunci localStorage token sesi
  USER_KEY: 'sd_user',               // Kunci localStorage data user
  CART_KEY: 'sd_cart',               // Kunci localStorage keranjang
  THEME_KEY: 'sd_theme',             // Kunci localStorage tema
  WA_DEFAULT: '6281234567890',       // Nomor WA cadangan (bila setting kosong)
  TIMEOUT: 25000                     // Timeout request (ms)
};
```

| Opsi | Fungsi | Kapan diubah |
|---|---|---|
| `API_URL` | Alamat backend GAS | **Wajib** diisi setelah deploy |
| `USE_JSONP` | Bila `true`, kegagalan CORS otomatis dicoba ulang lewat JSONP | Biarkan `true` |
| `WA_DEFAULT` | Nomor WhatsApp cadangan | Ubah ke nomor Anda sebagai jaring pengaman |
| `TIMEOUT` | Batas tunggu respons | Naikkan bila koneksi seluler lambat (mis. `35000`) |
| `TOKEN_KEY` dll | Kunci penyimpanan lokal | Ubah hanya bila ingin memisahkan beberapa toko di satu domain |

**Nomor WhatsApp utama** tidak diatur di sini, melainkan di **Pengaturan → Profil Toko → WhatsApp Toko** (tersimpan di Spreadsheet), sehingga bisa diubah tanpa menyentuh kode.

---

## 7. MODE DEMO (TANPA BACKEND)

Selama `API_URL` masih kosong (atau bukan URL `script.google.com`), seluruh aplikasi berjalan dengan **data contoh di memori browser**:

- ✅ Semua halaman, CRUD, POS, checkout, opname, BOM, kanban service, trade-in, promo, audit **berfungsi penuh**.
- 🧠 Data disimpan di variabel memori (`DEMO.db`) → **hilang saat halaman dimuat ulang** (kecuali keranjang & sesi yang memakai `localStorage`).
- 🏷️ Label **“Demo”** muncul di topbar, dan layar login menampilkan hint PIN.
- 🔑 PIN demo: **123456** (Owner), **1111** (Kasir), **2222** (Teknisi), **3333** (Gudang).

Mode ini berguna untuk **demo ke calon pelanggan, pelatihan staf, dan uji coba tampilan** sebelum menyambung ke database sungguhan. Begitu `API_URL` diisi dan benar, mode demo otomatis nonaktif tanpa perlu mengubah apa pun lagi.

---

## 8. LOGIN STAF & HAK AKSES (RBAC)

### Cara login

1. Klik **Masuk** (navbar) / **Masuk Staf / POS** (drawer mobile) / buka `#pos`.
2. Isi **Nama Staf** (boleh dikosongkan → sistem mendeteksi dari PIN) dan **PIN**.
3. Gunakan *numpad* di layar (ramah tablet) atau ketik langsung, lalu **Masuk Sistem**.
4. Sesi tersimpan 12 jam di `localStorage` — muat ulang halaman tidak perlu login lagi.
5. Klik **avatar staf** (kanan atas) → **Keluar dari Akun** untuk mengakhiri sesi.

### Matriks hak akses

| Halaman | OWNER | ADMIN | KASIR | GUDANG | TEKNISI |
|---|:--:|:--:|:--:|:--:|:--:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Kasir POS | ✅ | ✅ | ✅ | — | — |
| Transaksi | ✅ | ✅ | ✅ | — | — |
| Service | ✅ | ✅ | ✅ | — | ✅ |
| Tukar Tambah | ✅ | ✅ | ✅ | — | ✅ |
| Produk | ✅ | ✅ | — | ✅ | — |
| Bundling PC | ✅ | ✅ | — | ✅ | — |
| Stok & Opname | ✅ | ✅ | ✅ | ✅ | — |
| Pembelian (PO) | ✅ | ✅ | — | ✅ | — |
| CRM Pelanggan | ✅ | ✅ | ✅ | — | — |
| Promo | ✅ | ✅ | — | — | — |
| Konten Situs | ✅ | ✅ | — | — | — |
| Staf & Akses | ✅ | ✅ | — | — | — |
| Pengaturan | ✅ | ✅ | — | — | — |
| Audit Trail | ✅ | ✅ | — | — | — |

> Menu yang tidak diizinkan **disembunyikan** dari sidebar, dan bila dipaksa lewat URL/kode, sistem menolak dengan pesan *“Peran … tidak memiliki akses ke halaman ini”*. Server juga memvalidasi role pada setiap aksi API — jadi menyembunyikan menu hanyalah lapisan pertama.

| Role | Deskripsi |
|---|---|
| **OWNER** | Akses penuh termasuk pengaturan & audit trail |
| **ADMIN** | Kelola produk, promo, konten & laporan penjualan |
| **KASIR** | Transaksi POS, pelunasan tagihan, data pelanggan |
| **GUDANG** | Stok, opname, purchase order, bundling PC |
| **TEKNISI** | Papan kerja service & invoice perbaikan |

---

## 9. STRUKTUR DATA DI GOOGLE SPREADSHEET

15 sheet dibuat otomatis oleh `setupSistem()`. **Jangan mengubah nama sheet atau urutan kolom** — API membaca kolom berdasarkan posisi header.

| Sheet | Isi | Kolom kunci |
|---|---|---|
| `PRODUCT` | Master produk (unit, komponen, aksesoris, paket, bekas) | `id, sku, nama, kategori, brand, tipe, kondisi, harga, harga_coret, harga_beli, stok, stok_min, satuan, garansi, poin, gambar, deskripsi, tags, bom, status, unggulan` |
| `CUSTOMER` | Pelanggan + tier & poin | `id, nama, wa, email, alamat, kota, total_belanja, trx, poin, tier, catatan` |
| `ORDER` | Semua transaksi (penjualan, pre-order, service, online) | `id, tanggal, tipe, customer_id, nama, wa, alamat, items(JSON), subtotal, diskon, diskon_kode, poin_pakai, poin_dapat, ongkir, total, metode, bayar, kembali, status, kasir, catatan` |
| `SERVICE` | Job service & reparasi | `id, tanggal, nama, wa, perangkat, kategori, keluhan, mode, teknisi, status, diagnosa, estimasi, biaya, parts(JSON), garansi, catatan` |
| `TRADEIN` | Pengajuan tukar tambah | `id, tanggal, nama, wa, perangkat, kategori, tahun, kondisi, harga_beli_dulu, estimasi_lo, estimasi_hi, bonus, penawaran, status, produk_id, catatan` |
| `STOCKMOVE` | Semua mutasi stok (kartu stok) | `id, tanggal, product_id, sku, nama, tipe, qty, sebelum, sesudah, ref, catatan, oleh` |
| `PO` | Purchase order ke supplier | `id, tanggal, supplier, wa, items(JSON), total, status, eta, diterima_pada, catatan, oleh` |
| `PROMO` | Voucher/diskon | `id, kode, judul, tipe, nilai, min_belanja, maks_diskon, mulai, akhir, kuota, terpakai, aktif, catatan` |
| `STAFF` | Akun staf (PIN ter-hash) | `id, nama, role, pin(hash), wa, email, aktif, last_login` |
| `SETTING` | Pengaturan toko (key-value) | `key, value` |
| `AUDIT` | Jejak tindakan vital | `id, tanggal, user, role, aksi, entitas, entitas_id, detail` |
| `BANNER` | Banner halaman utama | `id, judul, subjek, gambar, link, urutan, aktif` |
| `TESTI` | Testimoni pelanggan | `id, nama, kota, rating, pesan, avatar, produk, aktif, urutan` |
| `COUNTER` | Penomoran otomatis per prefix | `prefix, last` |
| `HOLDCART` | Keranjang kasir yang ditahan | `id, tanggal, kasir, nama, wa, items(JSON), catatan, diskon` |

### Format ID otomatis

| Prefix | Entitas | Contoh |
|---|---|---|
| `PRD` | Produk | `PRD-000123` |
| `INV` | Invoice/Order | `INV-000045` |
| `SVC` | Tiket service | `SVC-000012` |
| `TI` | Pengajuan trade-in | `TI-000007` |
| `PO` | Purchase order | `PO-000003` |
| `CST` | Pelanggan | `CST-000088` |
| `PRM` | Promo | `PRM-000004` |
| `STF` | Staf | `STF-000002` |
| `BNR` / `TST` | Banner / Testimoni | `BNR-000001` |
| `MUT` | Mutasi stok | `MUT-001204` |
| `LOG` | Audit | `LOG-004411` |
| `HLD` | Hold cart | `HLD-000009` |

> `items` pada `ORDER`/`PO`/`HOLDCART` disimpan sebagai **JSON** dalam satu sel — API yang mengurai & menghitungnya. Aman diedit manual bila perlu, tapi hati-hati dengan tanda kutip.

---

## 10. REFERENSI API (86 AKSI)

Semua aksi dipanggil ke `API_URL` dengan metode **POST form** (atau GET untuk uji cepat), parameter `action` + parameter lain, dan mengembalikan:

```json
{ "ok": true,  "data": { }, "meta": { } }         // sukses
{ "ok": false, "error": { "code": "…", "message": "…", "hint": "…" } }  // gagal
```

Tambahkan `&callback=namaFungsi` untuk respons **JSONP**. Tambahkan `token=…` untuk aksi non-publik.

### 10.1 Publik (tanpa token) — 12 aksi

| Aksi | Parameter | Kegunaan |
|---|---|---|
| `ping` | — | Uji konektivitas |
| `public.bootstrap` | — | Konten awal halaman (profil toko, unggulan, terbaru, diskon, testimoni, banner, promo) |
| `public.products` | `q, kategori, kondisi, tipe, diskon, tersedia, sort, page, limit` | Katalog dengan filter & paging |
| `public.product` | `sku` atau `id` | Detail produk + produk terkait + komponen BOM |
| `public.stock.check` | `items[{sku,qty}]` | Cek ketersediaan real-time (paket rakitan dihitung) |
| `public.promo.check` | `kode, subtotal` | Validasi voucher sebelum checkout |
| `public.order.create` | `nama, wa, alamat, kota, metode, catatan, promo, items` | Buat pesanan online + teks WhatsApp |
| `public.track` | `q` (kode invoice/WA) | Lacak pesanan, service, dan trade-in |
| `public.testimonials` | — | Daftar testimoni aktif |
| `public.tradein.estimate` / `.calc` | `kategori, brand, tahun, kondisi, harga_beli_dulu` | Estimasi nilai tukar tambah |
| `public.tradein.apply` | data + `nama, wa` | Kirim pengajuan trade-in |
| `public.service.apply` | `nama, wa, perangkat, keluhan, kategori, mode, garansi, budget` | Buat tiket service |
| `public.lead` | `nama, wa, minat, sumber` | Simpan prospek/lead marketing |

### 10.2 Autentikasi — 4 aksi

| Aksi | Parameter | Kegunaan |
|---|---|---|
| `auth.login` | `pin` (opsional `nama`) | Mengembalikan token + profil + pengaturan |
| `auth.me` | `token` | Validasi sesi & sisa waktu |
| `auth.logout` | `token` | Akhiri sesi |
| `auth.changePin` | `token, pin_lama, pin_baru` | Ganti PIN sendiri |

### 10.3 Dashboard & POS — 8 aksi

| Aksi | Parameter | Kegunaan |
|---|---|---|
| `dash.stats` | — | KPI hari ini/kemarin/bulan, inventori, service, trade-in, PO |
| `dash.charts` | — | Data grafik: tren 14 hari, top produk, kategori, metode, staf, tipe |
| `pos.lookup` | `q, limit` | Cari produk untuk kasir (nama/SKU/brand/tag) |
| `pos.checkout` | `items, metode, bayar, promo, diskon_manual, nama, wa, customer_id, poin_pakai, tipe` | Simpan transaksi + kurangi stok + struk |
| `pos.hold.save` | `nama, items, catatan, diskon, wa` | Tahan keranjang |
| `pos.hold.list` | — | Daftar keranjang tertahan |
| `pos.hold.delete` | `id` | Hapus keranjang tertahan |
| `order.pay` / `order.confirm` | `id, bayar` | Tandai lunas + kurangi stok |

### 10.4 Transaksi — 6 aksi

`order.list` (`q, status, tipe, dari, sampai, page, limit`), `order.get` / `order.receipt` (`id` → termasuk teks struk & tautan WA), `order.void` (`id, alasan` → kembalikan stok + audit), `order.confirm`, `order.pay`.

### 10.5 Produk & Bundling — 10 aksi

`product.list`, `product.get`, `product.save` (tambah/ubah), `product.delete`, `product.bulkDelete` (`ids[]`), `product.import` (`rows[]`), `product.export` (CSV), `bundle.materials` (bahan rakitan), `bundle.explode` (BOM + `max_buildable` + HPP ideal).

### 10.6 Stok & PO — 8 aksi

`stock.moves` (`sku, product_id, tipe, q, limit`), `stock.opname` (`items[], catatan, mode SET|DELTA`), `stock.low`, `po.list`, `po.save`, `po.receive` (`id` → tambah stok), `po.status`, `po.delete`.

### 10.7 CRM, Service, Trade-in — 16 aksi

`customer.list` (`q, tier, sort`), `customer.get` (profil 360°), `customer.save`, `customer.delete`, `customer.points` (`id, poin, alasan`), `service.list` (`q, status, teknisi`), `service.save`, `service.status`, `service.invoice` (`id, biaya, parts[], metode, bayar`), `service.delete`, `tradein.list`, `tradein.simulate`, `tradein.review`, `tradein.approve` (`id, penawaran, margin_pct, sku, nama, kategori, garansi`), `tradein.reject`, …

### 10.8 Konten, Promo, Staf, Sistem — 22 aksi

`content.get`, `banner.save`, `banner.delete`, `testi.save`, `testi.delete`, `promo.list`, `promo.save`, `promo.delete`, `promo.toggle`, `staff.list`, `staff.save`, `staff.delete`, `staff.resetPin`, `settings.get`, `settings.save`, `audit.list` (`q, aksi, entitas, page, limit`), `system.info`, `system.init`, `system.warm`, `system.seed`, `system.resetDemo`, `system.backup`, `system.bindSheet`.

**Contoh pemanggilan manual (untuk uji):**

```
{URL}/exec?action=product.list&q=vivobook&limit=5
{URL}/exec?action=auth.login&pin=123456
{URL}/exec?action=dash.stats&token=TOKEN_DARI_LOGIN
```

---

## 11. PANDUAN HALAMAN PUBLIK (PELANGGAN)

### 11.1 Navbar & navigasi

- **Sticky navbar** yang menyusut saat digulir, dengan indikator menu aktif mengikuti posisi gulir.
- Menu: Beranda · Katalog · PC Rakitan · Service · Tukar Tambah · FAQ · Kontak.
- Ikon kanan: 🌙 tema, 🔍 lacak pesanan, 🛒 keranjang (dengan badge jumlah), **Masuk** (staf).
- Mobile: tombol ☰ membuka **drawer** dari kiri + **bottom nav** 5 tombol (Beranda, Katalog, Rakitan, Lacak, WhatsApp).

### 11.2 Hero

- Headline + subheadline konversi, klaim sosial (rating & jumlah ulasan), dua tombol CTA (**WhatsApp** & **Lihat Katalog**).
- Kartu produk unggulan otomatis mengambil produk `unggulan=1` dari database — klik untuk melihat detail.
- *Floating cards* statistik, animasi *bob/float*, dan *blob* gradien latar.

### 11.3 Ticker & statistik

- Pita berjalan berisi promo aktif (HEMAT10, gratis ongkir, trade-in, garansi, cicilan, service express) + label **“N produk siap kirim hari ini”**.
- Band statistik dengan angka yang beranimasi saat masuk layar (IntersectionObserver).

### 11.4 Katalog produk

| Kontrol | Fungsi |
|---|---|
| **Kolom cari** | Pencarian *debounced* 320 ms pada nama, SKU, brand, kategori, tag |
| **Tabs kategori** | Semua · Laptop · PC Rakitan · Komponen · Monitor · Aksesoris |
| **Urutkan** | Populer, Terbaru, Termurah, Termahal, Diskon, Stok, Nama A-Z |
| **Filter Lanjutan** | Kondisi (baru/bekas), tipe (unit/paket), hanya diskon, hanya stok tersedia |
| **Chip filter aktif** | Setiap filter tampil sebagai chip yang bisa dihapus satu per satu + **Hapus semua** |
| **Muat lebih banyak** | 12 produk per halaman, tombol menampilkan jumlah sisa |

Kartu produk menampilkan: gambar (lazy), badge (diskon/paket/bekas/terbaru/best seller), tombol favorit, tombol **Lihat Detail** & **Beli** saat hover, nama, spesifikasi singkat, harga coret + persentase hemat, status stok (warna hijau/kuning/merah), dan rating.

### 11.5 Detail produk (modal)

- Galeri gambar + thumbnail, harga + coret + hemat, chip jaminan (garansi, kirim cepat, service), daftar spesifikasi, **isi paket** (bila produk bundling), deskripsi, produk terkait.
- Pengatur jumlah + tombol **Tambah ke Keranjang** dan **Tanya Stok via WhatsApp** (pesan otomatis berisi nama & SKU).
- Pelanggan yang belum tahu kondisi stok akan melihat status jujur — termasuk estimasi **“Bisa dirakit: N paket”** untuk PC rakitan.

### 11.6 Keranjang & checkout

1. **Keranjang** tersimpan di `localStorage` (`sd_cart`) — tidak hilang saat berpindah halaman/reload.
2. Setiap perubahan memicu **`public.stock.check`**: item yang stoknya kurang diberi tanda merah + getar + pesan “Stok tersisa N”.
3. **Kode promo** divalidasi ke server; bila valid muncul keterangan & besaran hemat.
4. Ringkasan: subtotal, diskon promo, total, dan ajakan **gratis ongkir** (belanja kurang RpX lagi).
5. **Checkout**: nama, WhatsApp, alamat, kota, metode bayar (Transfer/QRIS/COD/COD-Kurir/Cicilan), catatan, dan persetujuan dihubungi.
6. Setelah terkirim: modal sukses berisi **kode pesanan**, total estimasi, metode, status, dan tombol **Kirim Rincian via WhatsApp** (template dapat diubah dari Pengaturan).
7. Pesanan masuk ke sheet `ORDER` dengan status **MENUNGGU** → kasir menekan **Tandai Lunas** saat pembayaran diterima (stok baru berkurang di titik ini).

### 11.7 PC Rakitan (bundling)

- Kartu paket dengan harga, harga coret, dan penghematan dibanding beli terpisah.
- Klik paket → detail menampilkan **komponen penyusun (BOM)**, jumlah yang bisa dirakit, dan tombol beli/hubungi.
- Bila komponen kurang, sistem menawarkan **pre-order / indent** (mis. “Indent 3 hari”).

### 11.8 Service

- 6 kartu layanan (diagnosa, upgrade, ganti LCD, install ulang, bersih-bersih, recovery data) dengan estimasi durasi & harga mulai.
- **Formulir Service**: nama, WhatsApp, perangkat, jenis, metode (bawa ke toko/panggilan/konsultasi), keluhan, garansi diharapkan, perkiraan budget → menghasilkan **nomor tiket `SVC-…`**.
- **Lacak Status**: masukkan kode tiket atau nomor WA untuk melihat progres bar 7 tahap.

### 11.9 Tukar Tambah

- **Kalkulator publik**: pilih kategori, merek, perangkat, tahun, kondisi, harga beli dulu → estimasi **range harga** (lo–hi), bonus tukar tambah (%), dan **nilai maksimal** bila ditukar unit baru.
- Faktor yang ditampilkan transparan: faktor tahun (umur), faktor kondisi, bonus tukar tambah.
- Tombol **Ajukan Penilaian** membuka modal pengajuan (nama, WhatsApp, catatan kelengkapan) → tersimpan di sheet `TRADEIN` dengan status **BARU**, dan pesan WhatsApp siap dikirim.

### 11.10 Testimoni, FAQ, CTA, footer

- **Marquee testimoni** dua baris berlawanan arah, dihentikan saat kursor menyentuh (aksesibilitas).
- **FAQ akordeon** (6 pertanyaan tersering: garansi, bekas, kirim, cicilan, tukar tambah, service).
- **CTA band** dengan ajakan WhatsApp, **footer** lengkap (kontak, jam, alamat, sosial media, newsletter WhatsApp yang tersimpan sebagai lead).
- **FAB**: tombol WhatsApp mengambang (muncul di semua halaman, otomatis disembunyikan saat modal terbuka) dan tombol **kembali ke atas** yang muncul setelah menggulir.

### 11.11 Lacak pesanan

Modal pelacakan menerima **kode invoice (`INV-…`), kode service (`SVC-…`), atau nomor WhatsApp**, lalu menampilkan kartu status untuk: pesanan, service (dengan progress bar), dan tukar tambah — semuanya bisa dilanjutkan ke obrolan WhatsApp.

---

## 12. PANDUAN MODUL POS KASIR

Buka: sidebar → **Kasir POS** (role: Owner/Admin/Kasir).

### 12.1 Tata letak

```
┌───────────────────────────────┬──────────────────────────┐
│  🔍 Scan barcode / cari SKU   │  KERANJANG   [0 item] 🗑 │
│  [Semua] [Laptop] [Komponen]… │  ────────────────────────│
│  ┌─────┐ ┌─────┐ ┌─────┐      │  → daftar item + qty     │
│  │produk│ │produk│ │produk│    │  ────────────────────────│
│  └─────┘ └─────┘ └─────┘      │  Subtotal / Promo / TOTAL│
│  …grid produk…                │  [Tunai][Transfer][QRIS]…│
│                               │  Quick cash · Kembalian  │
│                               │  [ BAYAR Rp… ]  Hold · PO│
└───────────────────────────────┴──────────────────────────┘
```

### 12.2 Tiga cara menambah produk

1. **Scan barcode** — cukup arahkan scanner USB ke layar. Sistem menampung ketukan cepat (<120 ms antar karakter) di luar kolom input, lalu mencocokkan kode dengan SKU. Cocok, langsung masuk keranjang + toast konfirmasi.
2. **Ketik di kolom cari** — hasil muncul real-time (debounce 260 ms). Tekan **Enter** untuk menambahkan bila kode persis sama dengan SKU.
3. **Klik kartu produk** di grid.

### 12.3 Mengelola keranjang

| Aksi | Cara |
|---|---|
| Ubah jumlah | tombol `+` / `−` atau ketik langsung di kolom angka |
| Hapus item | ikon 🗑 pada baris |
| Kosongkan semua | tombol **Kosongkan** (dengan konfirmasi) |
| Diskon manual | ikon 🏷 → isi nominal (mis. pembulatan nego) + kode promo opsional |
| Pilih pelanggan | chip **Pelanggan Umum** → pilih dari CRM (poin & tier otomatis) |

### 12.4 Pembayaran

1. Pilih **metode**: Tunai · Transfer · QRIS · Debit · Kredit · Cicilan.
2. Khusus **Tunai**: tersedia tombol cepat `50rb 100rb 200rb 500rb 1jt` + **Uang Pas**; kolom nominal bisa diketik; kotak **Kembalian / Kurang bayar** berubah warna otomatis.
3. Klik tombol hijau **Bayar Rp…** → transaksi tersimpan, stok berkurang, dan **struk** muncul.
4. Untuk pesanan tanpa pembayaran langsung, gunakan **Pre-Order** (tersimpan sebagai `PRE_ORDER` dan tetap harus dilunasi lewat menu Transaksi).

### 12.5 Hold cart (keranjang tertahan)

- **Hold** → beri nama (mis. “Meja 3 — Pak Budi”) → keranjang dikosongkan dan transaksi ditahan.
- **Simpan / Ambil** → daftar keranjang tertahan; klik **Ambil** untuk melanjutkan, atau 🗑 untuk menghapus.
- Berguna saat pelanggan harus mengambil uang/barang lain terlebih dahulu.

### 12.6 Struk (nota termal 40 kolom)

Setelah transaksi muncul modal **Nota Transaksi** dengan tiga tombol:

| Tombol | Fungsi |
|---|---|
| **Cetak** | Membuka jendela cetak berisi struk monospace siap printer termal (58/80 mm) atau kertas biasa |
| **Salin** | Menyalin seluruh teks struk ke clipboard (bisa ditempel ke aplikasi lain) |
| **Kirim WA** | Membuka WhatsApp pelanggan dengan struk sebagai pesan (atau nomor toko bila pelanggan “Umum”) |

Struk memuat: nama & alamat toko, nomor invoice, tanggal, kasir, item + qty + harga, subtotal, diskon, poin, total, metode bayar, dibayar, kembalian, dan ucapan terima kasih.

### 12.7 Pintasan keyboard

| Tombol | Aksi |
|---|---|
| `F2` | Fokus ke kolom pencarian POS |
| `F9` | Proses pembayaran (setara klik tombol Bayar) |
| `Enter` (di kolom cari) | Tambahkan produk bila SKU cocok persis |
| `Esc` | Tutup modal / drawer |

---

## 13. PANDUAN TRANSAKSI & PESANAN

Menu **Transaksi** menampilkan seluruh riwayat dengan:

- **4 KPI ringkas**: total transaksi, omzet (tanpa void), sudah lunas, void.
- **Filter**: pencarian (invoice/nama/WA/kasir), status (Semua/Lunas/Menunggu/Void), tipe (Penjualan/Pre-Order/Service/Trade-in), rentang tanggal (dari–sampai), tombol **Reset**.
- **Tabel** dengan aksi baris: 👁 **Detail**, 🖨 **Cetak nota**, klik baris untuk membuka detail.
- **Ekspor CSV** sesuai filter aktif (pemisah `;` agar langsung rapi di Excel Indonesia).
- **Paginasi** 15 baris/halaman.

### Detail transaksi

- Info lengkap: invoice, tanggal, tipe, status, pelanggan + WA, kasir, metode, diskon, alamat.
- Rincian item (nama, SKU, harga, qty, subtotal).
- Ringkasan uang: subtotal, diskon, poin dipakai/didapat, total, dibayar, kembalian, catatan.
- Tombol aksi:
  - **Kirim WA** — pesan rincian ke pelanggan.
  - **Tandai Lunas** — hanya untuk status **MENUNGGU**; stok baru dikurangi di titik ini (mencegah stok “hilang” untuk pesanan yang tidak jadi).
  - **Void** — untuk transaksi yang sudah lunas; **stok dikembalikan**, alasan **wajib diisi**, dan semuanya tercatat di audit trail.

> 💡 **Tips**: pesanan online masuk dengan status MENUNGGU. Setelah transfer/QRIS terverifikasi, tekan **Tandai Lunas** — maka stok berkurang dan pelanggan menerima struk resmi.

---

## 14. PANDUAN KATALOG PRODUK & CRUD

Menu **Produk** (role: Owner/Admin/Gudang).

### 14.1 Ringkasan & filter

- Baris info: jumlah produk, nilai modal total, jumlah **habis**, jumlah **menipis**.
- Filter: pencarian, kategori, tipe (unit/paket), kondisi (baru/bekas), status (aktif/arsip/semua), urutan (nama, terbaru, stok terkecil, margin terbesar, harga tertinggi), dan centang **Stok menipis saja**.

### 14.2 Tabel produk

Kolom: checkbox pilih, produk (foto, nama, SKU, kategori, tanda PAKET/BEKAS), **harga jual** (+% diskon), **modal**, **margin** (chip warna: hijau ≥15%, kuning 7–14%, merah <7%), **stok** (hijau/kuning/merah; paket menampilkan jumlah paket yang bisa dirakit), status, dan aksi: ✏️ ubah, 🧱 BOM (khusus paket), 📋 kartu stok, 🗑 hapus.

### 14.3 Tambah / ubah produk

Formulir 20 kolom penting:

| Bagian | Field |
|---|---|
| Identitas | Nama, SKU (boleh dikosongkan → dibuat otomatis), Satuan, Kategori, Brand |
| Jenis | Tipe (Unit Tunggal / Paket Rakitan), Kondisi (Baru / Bekas-Refurbished) |
| Harga | Harga Modal, Harga Jual, Harga Coret (otomatis menampilkan % diskon), Poin Bonus |
| Stok | Stok, Stok Minimum (memicu peringatan dashboard) |
| Lain-lain | Garansi, URL gambar utama, Tag pencarian, Deskripsi |
| Publikasi | Status (Aktif/Arsip), **Unggulan** (tampil di hero beranda) |

Validasi penting:
- **SKU harus unik** — duplikat ditolak server dengan menyebut nama produk yang memakai SKU tersebut.
- Perubahan stok lewat form **dicatat sebagai mutasi** `ADJUST` pada kartu stok.
- Produk yang **dipakai dalam BOM** tidak bisa dihapus (server menolak dengan menyebut paket yang memakainya).

### 14.4 Hapus massal

Centang beberapa produk (atau checkbox di header untuk memilih semua di halaman) → muncul **bulk bar** gelap di atas tabel → **Hapus** (konfirmasi) atau **Ekspor** produk terpilih.

### 14.5 Impor massal (Excel / Google Sheets / CSV)

1. Klik **Impor**.
2. Pilih sumber: **Tempel data** atau **Unggah file CSV** (bisa juga **drag & drop** ke area unggah).
3. Format kolom (baris pertama = judul, pemisah koma / titik-koma / TAB):

```
nama,sku,kategori,brand,harga,harga_beli,stok,garansi
ASUS Vivobook 14 A1404ZA,LPT-ASU-V14,Laptop,ASUS,6499000,5950000,5,1 Tahun Resmi
Kingston DDR4 8GB,RAM-KVR-8GD4,Komponen,Kingston,395000,310000,20,3 Tahun
```

4. Klik **Impor Sekarang**. Hasilnya dilaporkan: **N baris sukses**, **N gagal** (beserta alasan per baris).
5. Aturan: SKU yang sudah ada → **diperbarui**; SKU baru → **dibuat**. Kolom kosong diisi nilai aman (`kategori=Lainnya`, `tipe=UNIT`, `status=AKTIF`).

> 📥 Cara mendapat file CSV: **Ekspor CSV** dari menu Produk, edit di Excel/Sheets, lalu impor kembali. Cara ini paling aman karena judul kolomnya sudah persis.

### 14.6 Ekspor CSV

Kolom: `sku, nama, kategori, brand, tipe, kondisi, harga, harga_coret, harga_beli, stok, stok_min, garansi, status`. Nama file otomatis: `produk-YYYY-MM-DD.csv`. Semua ekspor tercatat di audit trail.

---

## 15. PANDUAN BUNDLING PC RAKITAN (BOM)

Menu **Bundling PC** (role: Owner/Admin/Gudang).

Bundling = menjual satu **paket rakitan** yang terdiri dari beberapa komponen. Stok paket **tidak diisi manual** — sistem menghitungnya dari komponen.

### 15.1 Membuat paket baru

1. Karena paket pada dasarnya adalah produk, buat produk bertipe **BUNDLE**:
   - Menu **Bundling PC** → **Paket Baru** (mengarah ke form produk), atau
   - Menu **Produk** → **Produk Baru** → *Tipe*: **Paket Rakitan (BOM)**.
2. Isi nama (mis. “PC Rakitan Sarinadinet Creator RTX”), harga jual paket, dan kategori **PC Rakitan**.

### 15.2 Menyusun komponen

1. Pilih paket: **Pilih Paket** (atau klik 🧱 dari tabel produk).
2. Klik **Tambah Komponen** → pilih komponen + jumlah per paket (mis. RAM 16GB × 2).
3. Baris komponen menampilkan: nama, SKU, modal, stok tersedia, progress bar ketersediaan, pengatur jumlah, dan tombol hapus.
4. Panel kanan **Kesiapan Komponen** langsung memberi tahu komponen mana yang **kurang** — lengkap dengan tombol **+** untuk langsung membuat PO komponen tersebut.
5. Klik **Simpan Perubahan BOM**.

### 15.3 Membaca angka penting

| Angka | Arti |
|---|---|
| **N paket siap rakit** | Nilai terkecil dari `⌊stok komponen ÷ kebutuhan⌋` di seluruh komponen |
| **HPP ideal** | Total modal komponen per paket (`Σ harga_beli × qty`) |
| **Margin** | `(harga jual paket − HPP ideal) ÷ HPP ideal` |
| **Rakitan terhambat** | Daftar paket yang tidak bisa dirakit karena komponen kurang (juga muncul di menu Stok) |

### 15.4 Perilaku saat penjualan

Ketika paket terjual (POS atau order online), sistem **memecah BOM** dan mengurangi stok **setiap komponen** — bukan satu SKU paket. Karena itu:
- Jangan isi stok manual untuk produk bertipe BUNDLE (biarkan 0 / tidak dipakai).
- Bila pelanggan memesan lebih dari kapasitas rakit, POS akan menolak dengan pesan sisa stok.
- Alternatif: tawarkan **Pre-Order / indent** (tombol Pre-Order di POS).

---

## 16. PANDUAN STOK, OPNAME & KARTU STOK

Menu **Stok & Opname** (role: Owner/Admin/Gudang/Kasir untuk melihat).

Tiga tab: **Sesi Opname** · **Kartu Stok** · **Peringatan Stok**.

### 16.1 Sesi opname (stock opname)

1. Isi **Catatan Opname** (wajib, min. 5 karakter) — mis. “Opname rutin akhir bulan, gudang belakang”. Catatan ini masuk audit trail.
2. Pilih **Mode**:
   - **SET** — isi **stok akhir** hasil hitung fisik. Cocok untuk opname penuh.
   - **DELTA** — isi **selisih** (+ tambah / − kurang). Cocok untuk koreksi cepat.
3. Tambahkan produk dengan dua cara:
   - **Cari produk** di kolom pencarian → klik chip saran (menampilkan stok sistem saat ini).
   - **Tambah Baris** → isi manual.
4. Tabel menampilkan: produk, **Stok Sistem**, kolom input, dan **Hasil** (stok akhir + selisih berwarna hijau/merah) sebelum diposting.
5. Klik **Posting Opname** → konfirmasi → hasil dilaporkan: N disesuaikan, N gagal.

Setiap perubahan opname menulis **mutasi `OPNAME`** (sebelum → sesudah) ke kartu stok, sehingga selalu bisa diaudit **siapa mengubah apa dan kapan**.

### 16.2 Kartu stok

- Cari berdasarkan SKU, nama, atau nomor referensi; filter jenis mutasi.
- Ringkasan: total unit **masuk**, total unit **keluar**, jumlah mutasi.
- Tabel: waktu, produk, tipe mutasi, qty (± berwarna), stok sebelum → sesudah, referensi + catatan, dan nama staf pelaksana.

Jenis mutasi yang tercatat:

| Tipe | Asal |
|---|---|
| `IN` / `OUT` | Penjualan (`OUT`), retur/void (`IN`) |
| `ADJUST` | Perubahan stok dari form produk |
| `OPNAME` | Penyesuaian opname |
| `PO_IN` | Penerimaan barang dari PO |
| `TRADEIN_IN` | Unit bekas hasil tukar tambah |
| `RETUR` | Pengembalian barang |

### 16.3 Peringatan stok

Dua panel:
- **Produk Menipis & Habis** — daftar produk yang `stok ≤ stok_min` atau habis, dengan tombol **+** untuk langsung menambahkannya ke PO.
- **Rakitan Terhambat** — paket yang tidak bisa dirakit beserta komponen kurang, lengkap dengan tombol **Kelola BOM**.

---

## 17. PANDUAN PEMBELIAN / PURCHASE ORDER

Menu **Pembelian (PO)** (role: Owner/Admin/Gudang).

### 17.1 Alur status

```
DRAFT ──► DIKIRIM ──► DITERIMA
   │           │
   └───────────┴──► BATAL
```

### 17.2 Membuat PO

1. Klik **PO Baru**.
2. Isi **Nama Supplier** (wajib), **WhatsApp Supplier**, **Estimasi Kedatangan**, dan status awal.
3. Tambahkan item:
   - Cari produk (kolom pencarian) → klik chip → otomatis terisi harga beli terakhir.
   - Atau **Item Manual** untuk barang yang belum ada di katalog.
4. Sesuaikan qty & harga beli per baris; **TOTAL PO** terhitung otomatis.
5. Simpan. PO mendapatkan nomor `PO-0000xx`.

> 💡 Dari menu **Stok → Produk Menipis**, tombol **+** membuka form PO yang **sudah terisi** produk tersebut dengan qty saran (2× stok minimum − stok saat ini).

### 17.3 Berinteraksi dengan supplier

- **Kirim ke Supplier** → membuka WhatsApp berisi daftar item, nomor PO, dan total estimasi.
- **Tandai Dikirim** → status menjadi `DIKIRIM` (barang dalam perjalanan).

### 17.4 Menerima barang

1. Klik **Terima Barang** → konfirmasi.
2. Server akan, untuk setiap item:
   - Menambah **stok** produk terkait,
   - Memperbarui **harga beli** bila harga di PO berbeda,
   - Menulis mutasi **`PO_IN`** ke kartu stok,
   - **Membuat produk baru** otomatis bila SKU belum ada di katalog.
3. Status PO menjadi `DITERIMA`, tanggal penerimaan dicatat, dan detail penerimaan masuk audit trail.

---

## 18. PANDUAN CRM PELANGGAN, POIN & TIER

Menu **CRM Pelanggan** (role: Owner/Admin/Kasir).

### 18.1 Kartu ringkasan

Total pelanggan · total nilai belanja · total poin beredar · jumlah Platinum/Gold.

### 18.2 Tabel pelanggan

Kolom: pelanggan (avatar inisial, nama, WA, kota), **tier** (badge warna), total belanja, jumlah transaksi, poin, dan aksi: 🎁 kelola poin, 💬 chat WA, ✏️ ubah, 🗑 hapus. Klik baris untuk **profil 360°**.

Filter: pencarian (nama/WA/email/kota), tier, dan urutan (belanja terbanyak, poin terbanyak, terbaru, nama).

### 18.3 Tier otomatis

| Tier | Ambang total belanja (default) | Diskon tier* |
|---|---|---|
| **BRONZE** | < Rp1.000.000 | 0% |
| **SILVER** | ≥ Rp1.000.000 | 1% |
| **GOLD** | ≥ Rp5.000.000 | 2,5% |
| **PLATINUM** | ≥ Rp15.000.000 | 4% |

\* Ambang & diskon dapat diubah di **Pengaturan → Poin & Tier**. Tier dihitung ulang otomatis setiap pelanggan menyelesaikan transaksi.

### 18.4 Poin loyalitas

- **Mendapat poin**: `⌊subtotal ÷ 1.000⌋` poin per transaksi (dapat diubah: Pengaturan → *Poin per Rp1.000*).
- **Nilai poin**: 1 poin = Rp1.000 (dapat diubah: *Nilai 1 Poin*).
- **Batas tukar**: maksimal 30% dari subtotal (dapat diubah: *Maksimal Tukar Poin*).
- **Penyesuaian manual**: klik 🎁 pada baris pelanggan → isi jumlah (**positif** untuk menambah, **negatif** untuk mengurangi) + **alasan wajib** (mis. bonus event, kompensasi keterlambatan, penukaran hadiah).
- Riwayat poin tercatat di audit trail sebagai `TAMBAH_POIN` / `KURANGI_POIN`.

### 18.5 Profil pelanggan (360°)

Menampilkan: avatar, tier, total belanja, jumlah transaksi, poin & nilainya, alamat, **progress menuju tier berikutnya** (butuh RpX lagi), jumlah transaksi/service/trade-in, riwayat transaksi terakhir, riwayat service, dan riwayat tukar tambah. Tombol: **Kelola Poin**, **Ubah Data**, **Chat WhatsApp**.

### 18.6 Broadcast promo WhatsApp

1. Klik **Broadcast Promo**.
2. Pilih **audiens**: semua pelanggan atau per tier (jumlah ditampilkan).
3. Tulis pesan dengan variabel `{nama}` dan `{toko}` (otomatis diganti per pelanggan).
4. Klik **Kirim Sekarang** → konfirmasi jumlah tab → browser membuka satu tab WhatsApp per pelanggan (beri jeda otomatis agar tidak diblokir).

> ⚠️ Izinkan popup pada browser agar broadcast berjalan. Untuk daftar besar (di atas ~30 penerima), bagi menjadi beberapa batch.

---

## 19. PANDUAN SERVICE (PAPAN KERJA & INVOICE)

Menu **Service** (role: Owner/Admin/Kasir/Teknisi).

### 19.1 Papan kerja kanban

7 kolom sesuai alur kerja:

```
MASUK → ANTRI → DIAGNOSA → MENUNGGU_PART → DIKERJAKAN → SELESAI → DIAMBIL
                                                        (+ BATAL)
```

- Setiap kartu menampilkan: nomor tiket, biaya (atau “belum ada biaya”), nama pelanggan, perangkat, **progress bar**, teknisi, serta tombol 👁 detail & 🧾 invoice (khusus kolom SELESAI).
- **Drag & drop** kartu antar kolom untuk memindahkan status (desktop). Di perangkat sentuh, buka detail kartu lalu klik chip status.
- Bar statistik di atas: total job, dikerjakan, menunggu part, selesai, dan nilai pekerjaan berjalan.

### 19.2 Menerima job baru

Dua sumber:
1. **Dari pelanggan**: formulir service di halaman publik → otomatis muncul sebagai kolom MASUK.
2. **Dari toko**: tombol **Job Service Baru** → isi nama, WA, perangkat, kategori, metode, keluhan, teknisi, status, estimasi biaya, garansi.

### 19.3 Detail job

Modal detail menampilkan seluruh data (tiket, tanggal masuk, perangkat, pelanggan, metode, teknisi, estimasi, biaya final, keluhan, diagnosa, progress) plus:

- **Chip status** — klik untuk memindahkan tahap tanpa draf.
- **Ubah** — buka form lengkap (tambah diagnosa, teknisi, biaya final).
- **Update WA** — kirim pesan status otomatis ke pelanggan: `“Halo Nama, update service SVC-000012 (perangkat): status saat ini *DIKERJAKAN* (57% selesai). Estimasi biaya Rp850.000.”`
- **Hapus** — hapus tiket (tercatat di audit).
- **Buat Invoice** — tagih pekerjaan.

### 19.4 Invoice service

1. Klik **Buat Invoice** (dari kartu SELESAI atau dari detail).
2. Isi **Biaya Jasa Service** (wajib), **Metode Pembayaran**, dan opsional **SKU + qty sparepart**.
3. Sistem membuat transaksi bertipe **SERVICE**:
   - Jasa masuk sebagai item `JASA-SVC`,
   - Sparepart masuk sebagai item produk (**stok sparepart otomatis berkurang**),
   - Status tiket otomatis menjadi **DIAMBIL**,
   - Struk siap cetak/kirim WA.

### 19.5 Ekspor

Tombol **Ekspor** menghasilkan CSV seluruh job: tiket, tanggal, nama, WA, perangkat, keluhan, status, teknisi, biaya.

---

## 20. PANDUAN TUKAR TAMBAH (TRADE-IN)

Menu **Tukar Tambah** (role: Owner/Admin/Kasir/Teknisi).

### 20.1 Kartu ringkasan

Pengajuan baru · disetujui · ditolak · **nilai total yang disetujui**.

### 20.2 Daftar pengajuan

Kolom: kode `TI-…`, pelanggan, perangkat (kategori/tahun/kondisi), **range estimasi**, **penawaran**, status, dan aksi: ✅ setujui, ❌ tolak, 💬 chat WA.

Filter: pencarian (kode/nama/perangkat) dan status (BARU/DISETUJUI/DITOLAK).

### 20.3 Simulator

Tombol **Simulator** membuka kalkulator internal (sama seperti versi publik) untuk menghitung cepat saat pelanggan datang langsung. Hasilnya menampilkan: umur perangkat, faktor tahun, label kondisi, range estimasi, bonus %, dan nilai maksimal.

### 20.4 Menyetujui pengajuan → produk bekas otomatis

1. Klik ✅ pada baris berstatus **BARU**.
2. Isi:
   - **Harga Beli dari Pelanggan** (dasar perhitungan),
   - **Margin Markup %** (default dari Pengaturan, mis. 25%),
   - **Kategori**, **Nama Produk Bekas**, **SKU** (opsional), **Garansi Toko**, URL foto, dan deskripsi.
3. Sistem menghitung **harga jual = harga beli × (1 + margin%)**, lalu:
   - Membuat produk baru bertipe `UNIT`, kondisi **BEKAS**, status **AKTIF**, tag `bekas,trade-in`,
   - Menulis mutasi **`TRADEIN_IN`** (stok +1) ke kartu stok,
   - Menautkan `produk_id` ke pengajuan,
   - Menyiapkan pesan WhatsApp penawaran ke pelanggan.
4. Produk bekas langsung tampil di katalog publik dengan badge **“Bekas Bergaransi”** dan **margin terlihat di laporan**.

### 20.5 Menolak pengajuan

Klik ❌ → isi **alasan penolakan** (wajib) → status menjadi DITOLAK dan alasan tercatat di audit trail (dapat dikirim ke pelanggan melalui tombol WA).

### 20.6 Rumus estimasi (transparan)

```
nilai_dasar = harga_beli_dulu × faktor_tahun × faktor_kondisi × faktor_brand × faktor_kategori
estimasi_lo = ⌊nilai_dasar × 0,92⌋   (dibulatkan ke ribuan)
estimasi_hi = ⌊nilai_dasar × 1,06⌋
bonus       = ⌊estimasi_hi × bonus_pct%⌋
nilai_maks  = estimasi_hi + bonus
```

| Faktor tahun (umur) | Nilai | | Faktor kondisi | Nilai |
|---|---|---|---|---|
| ≤ 1 tahun | 78% | | MULUS (seperti baru) | 100% |
| ≤ 2 tahun | 66% | | BAIK | 90% |
| ≤ 3 tahun | 54% | | NORMAL | 78% |
| ≤ 4 tahun | 44% | | MINUS | 62% |
| ≤ 5 tahun | 36% | | RUSAK | 42% |
| ≤ 7 tahun | 26% | | | |
| > 8 tahun | 18% | | | |

Bonus merek premium (**Apple, Mac, ROG, Legion, MSI, ThinkPad, XPS**): ×1,08 · Kategori laptop ×1,05 · Komponen ×0,90 · Bonus tukar tambah default **5%** (diatur di Pengaturan).

---

## 21. PANDUAN PROMO & VOUCHER

Menu **Promo** (role: Owner/Admin).

### 21.1 Membuat promo

| Field | Keterangan |
|---|---|
| **Kode Promo** | Huruf kapital tanpa spasi, mis. `HEMAT10`. **Harus unik** |
| **Judul** | Nama kampanye, mis. “Diskon 10% Laptop Gaming” |
| **Tipe Diskon** | `PERCENT` (%) atau `NOMINAL` (Rp) |
| **Nilai Diskon** | Contoh: `10` untuk 10%, atau `150000` untuk Rp150.000 |
| **Minimum Belanja** | Belanja minimum agar promo berlaku |
| **Maksimum Diskon** | Plafon potongan (khusus tipe persen) |
| **Mulai / Berakhir** | Periode berlaku (boleh dikosongkan) |
| **Kuota** | Jumlah maksimal pemakaian (`0` = tanpa batas) |
| **Aktifkan sekarang** | Saklar aktif/nonaktif |

### 21.2 Status promo

Badge **AKTIF** hanya diberikan bila: centang aktif + hari ini berada dalam periode. Sistem juga menampilkan **terpakai N×** dan **sisa kuota**.

### 21.3 Aksi pada kartu promo

- **Ubah** — edit semua field.
- **Aktifkan / Nonaktifkan** — saklar cepat.
- **Salin Kode** — menyalin kode ke clipboard untuk dibagikan ke pelanggan.
- 🗑 **Hapus**.

### 21.4 Di mana promo dipakai?

- **Halaman publik**: kolom “Kode Promo” di keranjang → divalidasi server (`public.promo.check`).
- **POS**: ikon 🏷 → kolom kode promo + diskon manual. Promo dan diskon manual bisa digabung.
- **Pesan error jujur**: minimum belanja belum terpenuhi, kuota habis, sudah kedaluwarsa, atau kode tidak dikenal.

### 21.5 Diskon manual

Berbeda dengan promo (yang punya kode & tercatat pemakaiannya), **diskon manual** adalah potongan bebas yang hanya butuh nominal — mis. pembulatan nego Rp7.000. Diskon manual **tetap tercatat** pada transaksi (`diskon`) dan audit, tetapi tidak menambah hitungan `terpakai` pada promo apa pun.

---

## 22. PANDUAN KONTEN SITUS

Menu **Konten Situs** (role: Owner/Admin) dengan dua tab:

### 22.1 Banner promo

- Field: **Judul**, **Deskripsi singkat**, **URL gambar**, **Link tujuan** (default `#katalog`), **Urutan tampil**, **saklar tampil**.
- Banner ditampilkan berurutan (`urutan` menaik) pada bagian promo halaman publik.
- Saran ukuran gambar: 1.200 × 400 px (rasio 3:1), format JPG/WebP, ukuran < 300 KB.

### 22.2 Testimoni

- Field: **Nama pelanggan**, **Kota**, **Produk yang dibeli**, **Rating 1–5**, **Urutan**, **URL foto** (opsional), **Isi testimoni**, **saklar tampil**.
- Testimoni tampil pada **marquee dua baris** di halaman publik dan otomatis digandakan untuk perulangan yang mulus.
- Semua testimoni juga dipakai di `public.bootstrap` sehingga perubahan langsung terasa di halaman publik.

---

## 23. PANDUAN STAF & RESET PIN

Menu **Staf & Akses** (role: Owner/Admin).

### 23.1 Menambah staf

1. **Tambah Staf** → isi Nama, **Role**, WhatsApp, Email, **PIN Awal** (4–8 digit, wajib), dan saklar akun aktif.
2. Staf langsung bisa login memakai PIN tersebut.

### 23.2 Mengubah & menonaktifkan

- **Ubah** → ganti nama/role/WA/email, PIN (kosongkan bila tidak diubah), atau matikan **Akun aktif** (staf tidak bisa login tanpa dihapus — praktik terbaik saat staf resign).
- **Reset PIN** → sistem membuat PIN acak 4 digit; PIN baru ditampilkan sekali di modal **hanya untuk Anda**, sampaikan langsung ke staf (jangan lewat grup).
- 🗑 **Hapus** → menghapus akun. Akun **OWNER tidak dapat dihapus**, dan Anda **tidak dapat menghapus akun Anda sendiri** (dicegah server).

### 23.3 Praktik terbaik keamanan PIN

1. **Segera ganti PIN default** (`123456`, `1111`, `2222`, `3333`) setelah go-live.
2. Satu staf = satu akun. Jangan berbagi PIN — audit trail menjadi tidak bermakna.
3. Gunakan 6 digit untuk Owner, 4–6 digit untuk staf operasional.
4. Reset PIN setiap ada pergantian orang di posisi kasir.
5. Role **KASIR** tidak bisa melihat Pengaturan/Staf/Audit — jadi kesalahan input stok pun tetap terbatas.

---

## 24. PANDUAN PENGATURAN SISTEM

Menu **Pengaturan** (role: Owner/Admin). Empat kelompok + template WhatsApp + utilitas.

### 24.1 Profil Toko

Nama toko, tagline, alamat, kota, **WhatsApp toko**, email, jam buka, Instagram, Facebook, TikTok, link Google Maps. Nilai ini otomatis mengisi: footer, halaman kontak, judul dokumen, dan pesan WhatsApp default.

### 24.2 Poin & Tier

| Pengaturan | Arti |
|---|---|
| **Poin per Rp1.000** | Jumlah poin yang didapat pelanggan per Rp1.000 belanja |
| **Nilai 1 Poin (Rp)** | Berapa rupiah nilai tukar 1 poin |
| **Maksimal Tukar Poin (%)** | Batas poin yang boleh dipakai dalam satu transaksi |
| **Ambang Silver / Gold / Platinum** | Batas total belanja untuk naik tier |

### 24.3 Harga & Pengiriman

**Ongkir Minimum** · **Gratis Ongkir Mulai** (default Rp2.000.000) · **Pajak/PPN (%)** — dipakai pada perhitungan keranjang & kasir.

### 24.4 Tukar Tambah

Saklar **fitur tukar tambah**, **bonus tukar tambah (%)**, dan **margin markup produk bekas (%)**.

### 24.5 Template WhatsApp

Tiga template dengan **variabel** yang dikenali sistem:

| Template | Variabel |
|---|---|
| **Pesanan Online** | `{toko} {items} {total} {nama} {wa} {alamat} {kode} {diskon} {subtotal}` |
| **Pengajuan Service** | `{toko} {perangkat} {keluhan} {nama} {wa}` |
| **Pengajuan Tukar Tambah** | `{toko} {perangkat} {tahun} {kondisi} {harga} {estimasi} {nama}` |

Contoh template pesanan:

```
Halo {toko}, saya mau order:
{items}

Total: {total}
Nama: {nama}
WhatsApp: {wa}
Alamat: {alamat}

Order ID: {kode}
```

### 24.6 Utilitas sistem

| Tombol | Fungsi |
|---|---|
| **Info Sistem** | Nama & versi aplikasi, waktu server, zona waktu, TTL token, jumlah baris per sheet, status API URL |
| **Warm Cache** | Memuat ulang cache produk/konten agar halaman publik responsif |
| **Backup DB** | Membuat cadangan (di mode demo menampilkan keterangan; di mode GAS membuat salinan sheet) |
| **Reset Data Demo** | Mengosongkan ORDER, SERVICE, TRADEIN, STOCKMOVE, AUDIT, HOLDCART — **produk & pengaturan tetap**. Gunakan saat serah terima dari masa uji coba |

> 💾 **Cadangan wajib**: `File → Make a copy` pada Spreadsheet (atau aktifkan versi terproteksi di Google Sheets) setiap akhir bulan. Backup adalah satu-satunya hal yang tidak bisa diotomatiskan oleh token & audit.

---

## 25. PANDUAN AUDIT TRAIL

Menu **Audit Trail** (role: Owner/Admin).

Menampilkan **semua tindakan vital** dengan kolom: waktu, pengguna (nama + role), aksi (chip berwarna), entitas + ID, dan detail.

Filter: pencarian bebas, **filter aksi** (mis. `CHECKOUT`, `VOID`, `HAPUS`), dan **entitas** (ORDER, PRODUCT, CUSTOMER, SERVICE, TRADEIN, STOCKMOVE, PO, PROMO, STAFF, SETTING, BANNER, TESTI). Paginasi 40 baris, plus **Ekspor CSV**.

### Aksi yang dicatat

| Kelompok | Contoh aksi |
|---|---|
| Autentikasi | `LOGIN`, `LOGIN_GAGAL`, `RESET_PIN`, `UBAH_STAF` |
| Penjualan | `CHECKOUT`, `PELUNASAN`, `VOID`, `ORDER_ONLINE` |
| Produk | `TAMBAH_PRODUK`, `UBAH_PRODUK`, `HAPUS_PRODUK`, `HAPUS_MASSAL`, `IMPOR_PRODUK`, `EKSPOR_PRODUK` |
| Stok | `OPNAME`, `TERIMA_PO`, `BUAT_PO`, `STATUS_PO`, `REVIEW_TRADEIN` |
| CRM | `TAMBAH_PELANGGAN`, `UBAH_PELANGGAN`, `TAMBAH_POIN`, `KURANGI_POIN` |
| Service | `TAMBAH_SERVICE`, `UBAH_SERVICE`, `INVOICE_SERVICE`, `HAPUS_SERVICE` |
| Lain-lain | `UBAH_SETTING`, `TAMBAH_PROMO`, `UBAH_BANNER`, `TAMBAH_TESTI`, `HOLD_SIMPAN` |

> 🕵️ Audit trail adalah teman Anda saat **selisih stok** atau **selisih kas**: cari aksi `VOID`, `HAPUS`, atau `OPNAME` pada rentang tanggal yang dicurigai, dan Anda akan melihat nama staf pelaksananya.

---

## 26. TEMPLATE PESAN WHATSAPP

Sistem mengirim pesan melalui tautan `https://wa.me/…` (tanpa API berbayar, tanpa langganan). Pesan yang disiapkan otomatis:

| Momen | Isi pesan |
|---|---|
| **Pesan order dari pelanggan** | Rincian item, total, identitas, alamat, kode pesanan |
| **Setelah checkout online** | Tombol *Kirim Rincian via WhatsApp* |
| **Struk POS** | Teks nota lengkap 40 kolom |
| **Tanya stok produk** | Nama produk + SKU + harga |
| **Update service** | Status + progress + estimasi biaya |
| **Penawaran trade-in** | Nomor pengajuan, perangkat, penawaran, masa berlaku |
| **Penawaran produk bekas (disetujui)** | Produk baru yang tersedia di katalog |
| **Invoice service** | Struk tagihan jasa & sparepart |
| **Broadcast promo** | Pesan massal dengan `{nama}` yang diganti otomatis |
| **PO ke supplier** | Daftar item, nomor PO, total estimasi |

Semua nomor dinormalisasi otomatis: `08xx` → `628xx`, spasi/tanda hubung dibuang. Bila pelanggan tidak memiliki nomor (transaksi “Umum”), tombol WA mengarah ke nomor toko.

---

## 27. DESAIN, ANIMASI & AKSESIBILITAS

### 27.1 Bahasa desain

- **Warna**: palet biru brand (`#2563eb`) dengan aksen violet, emerald, amber, dan rose. Semua warna sebagai **CSS variables** (`--brand-600`, `--text-3`, `--surface`, `--line`, …) → mengganti brand cukup mengubah satu blok variabel di `b:skin`.
- **Tipografi**: display *Plus Jakarta Sans* (judul, angka) + *Inter* (teks) + monospace untuk kode/SKU/struk.
- **Bentuk**: radius berlapis (`--r-sm` s/d `--r-2xl`), bayangan bertingkat, dan **glassmorphism** halus pada navbar & kartu.
- **Mode gelap**: `data-theme="dark"` di `<html>`, menghormati `prefers-color-scheme` pada kunjungan pertama, dan pilihan pengguna disimpan di `localStorage`.

### 27.2 Animasi

| Nama | Dipakai untuk |
|---|---|
| `fade-in`, `page-in` | Perpindahan halaman aplikasi |
| `line-in` | Baris keranjang & kartu baru |
| `card-in`, `pop` | Kemunculan kartu & modal |
| `slide-down`, `sheet-up` | Panel & bottom-sheet (mobile) |
| `shimmer` | Skeleton loading (`sk`) |
| `marquee`, `marquee-rev` | Testimoni & ticker |
| `float1…3`, `bob` | Kartu mengambang di hero |
| `sheen` | Kilau pada tombol/kartu unggulan |
| `fly-to-cart` | Animasi produk terbang ke keranjang |
| `bump` | Denyut ikon keranjang saat item masuk |
| `progress`, `spin`, `pulse-dot`, `ping` | Progress bar, loader, indikator live |

Ditambah **scroll reveal** (`IntersectionObserver`) dengan *stagger* otomatis per elemen (`data-delay`), animasi angka statistik, dan grafik yang tumbuh.

### 27.3 Aksesibilitas & kenyamanan

- Struktur heading berurutan, `aria-label` pada tombol ikon, `role="dialog"` + `aria-modal` pada modal, dan `aria-live="polite"` untuk toast.
- Fokus terlihat jelas, `Esc` menutup modal/drawer, klik latar menutup modal, dan fokus otomatis ke kolom pertama saat modal dibuka.
- Semua target sentuh ≥ 40 px; tabel bisa digulir horizontal di layar kecil.
- Menghormati `prefers-reduced-motion` (animasi dimatikan).
- Teks alternatif pada gambar produk & inisial avatar bila gambar gagal dimuat.

### 27.4 Responsif

| Breakpoint | Perubahan |
|---|---|
| < 640 px | Bottom-nav + drawer, grid 1–2 kolom, POS bertumpuk (keranjang jadi panel bawah), tabel bisa digulir |
| 640–1023 px | Grid 2 kolom, sidebar POS tetap, kanban 2 kolom |
| ≥ 1024 px | Sidebar tetap, grid 3–4 kolom, kanban 4–7 kolom, dashboard 2 kolom |
| ≥ 1440 px | Lebar konten maksimal, margin lebih lega |

---

## 28. PERANGKAT PENDUKUNG: BARCODE, STRUK, SHORTCUT

### 28.1 Scanner barcode USB

Scanner USB bekerja sebagai “keyboard cepat”. Persyaratan:

1. Buka halaman **POS** dan biarkan fokus tidak berada di kolom input (klik area kosong sekali).
2. Scan barcode. Sistem menampung ketukan yang datang < 120 ms satu sama lain, lalu mencocokkan dengan **SKU**.
3. Bila cocok → produk masuk keranjang + toast “Scan: nama produk”. Bila tidak dikenali → toast peringatan.

> Mahkota SKU yang baik: konsisten dan mudah dibaca, mis. `LPT-ASU-VIVO14`. Bila Anda memakai barcode bawaan pabrik, simpan kode tersebut di kolom **SKU** saat impor produk.

### 28.2 Printer struk

- **Cetak** membuka jendela baru berisi struk monospace 40 kolom → cocok untuk printer termal 58/80 mm (Chrome: pilih printer → *Paper: 58mm/80mm* → *Margins: None* → *Scale: 100%*).
- Bila popup diblokir, izinkan popup untuk blog Anda, atau gunakan tombol **Salin** dan tempel ke aplikasi kasir lain.
- Untuk printer biasa (A4), struk tetap rapi karena menggunakan font monospace.
- **Tips**: simpan pengaturan cetak sebagai *default* printer sekali, setelah itu cukup tekan `Ctrl+P` lalu `Enter`.

### 28.3 Ringkasan pintasan

| Konteks | Tombol | Aksi |
|---|---|---|
| POS | `F2` | Fokus kolom cari |
| POS | `F9` | Bayar |
| POS | `Enter` di kolom cari | Tambah produk bila SKU cocok |
| Di mana saja | `Esc` | Tutup modal / drawer / sidebar |
| Modal form | `Tab` / `Shift+Tab` | Berpindah antar field |
| Semua tabel | `Ctrl+P` | Cetak (setelah membuka nota) |

---

## 29. TROUBLESHOOTING

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| Halaman tampil tapi katalog kosong / “Gagal memuat katalog” | `API_URL` belum diisi, salah, atau deployment belum di-*Deploy ulang* | Cek `CONFIG.API_URL`, uji `{URL}?action=ping`, lakukan *Deploy → Manage deployments → Edit → New version* |
| Muncul label **“Demo”** di topbar | `API_URL` masih kosong / bukan URL GAS | Isi `API_URL` lalu simpan theme |
| Error CORS di console | Pembatasan browser | Biarkan `USE_JSONP: true` (fallback otomatis). Pastikan Web App di-deploy *Anyone* |
| “PIN salah” padahal yakin benar | PIN berbeda per akun, atau staf memakai PIN akun lain | Pakai PIN Owner `123456`; reset lewat **Staf → Reset PIN** |
| Sesi sering minta login ulang | Token 12 jam kedaluwarsa, atau `localStorage` dibersihkan browser/mode privat | Normal. Login ulang, atau naikkan `TOKEN_TTL` di `code.gs` |
| Tampilan berantakan/aneh di HP | Blogger memakai *mobile theme* | **Theme → Mobile → No, show desktop theme** |
| Gambar produk tidak muncul | URL gambar salah/terblokir | Pastikan URL publik (`https://…`), atau ganti dengan gambar dari unsplash/pravatar |
| Tombol WhatsApp tidak membuka tab | Popup diblokir browser | Izinkan popup untuk domain blog |
| Stok minus / tidak sesuai | Ada transaksi yang belum dilunasi, void, atau opname | Buka **Kartu Stok** SKU terkait → cek mutasi & nama pelaksana; gunakan **Opname** untuk koreksi (wajib catatan) |
| Produk tidak bisa dihapus | Dipakai BOM paket rakitan | Server menyebut nama paketnya → hapus komponen itu dari BOM terlebih dahulu |
| Promo valid tapi tidak memotong | Kuota habis / minimum belanja belum terpenuhi / melebihi maksimum diskon | Cek kartu promo (sisa kuota) & ubah nilai minimum |
| Impor produk gagal sebagian | Kolom `nama` kosong, format kolom bergeser | Gunakan hasil **Ekspor CSV** sebagai template, pastikan baris pertama berisi judul kolom |
| Kanban tidak bisa di-drag di HP | Sentuh memicu scroll, bukan drag | Buka detail kartu → klik chip status |
| Chart kosong di dashboard | CDN Chart.js belum termuat (offline) | Muat ulang halaman; angka KPI tetap tampil tanpa grafik |
| Nota tercetak terpotong | Ukuran kertas belum 58/80 mm | Ubah pengaturan kertas printer, matikan *fit to page* |
| “Aksi tidak dikenal: …” | Nama aksi berbeda antara file theme & backend | Pastikan `theme-blogger.xml` dan `code.gs` berasal dari **versi paket yang sama** |
| Perubahan `code.gs` tidak berefek | Belum membuat versi deployment baru | *Manage deployments → Edit → Version: New version → Deploy* |

### Konsol browser sebagai alat diagnosis

Tekan `F12` → tab **Console**. Bila ada pesan merah, biasanya memuat nama aksi (`action`) dan HTTP status. Sertakan tangkapan layar itu saat meminta bantuan — Anda akan dibantu jauh lebih cepat.

---

## 30. CHECKLIST GO-LIVE & KEAMANAN

### Sebelum dibuka ke publik

- [ ] `setupSistem()` sudah dijalankan, Spreadsheet berisi 15 sheet.
- [ ] `selfTest` melaporkan semua pemeriksaan **OK**.
- [ ] Web App di-deploy **Execute as: Me**, **Who has access: Anyone**.
- [ ] `CONFIG.API_URL` sudah diisi dengan URL `/exec` dan **Save** sukses.
- [ ] Blog memakai **desktop theme** untuk mobile (bukan mobile theme).
- [ ] Data contoh dihapus/diganti: produk, pelanggan, testimoni, banner, promo.
- [ ] **PIN default diganti semua** (`123456`, `1111`, `2222`, `3333`) → Staf → Reset PIN.
- [ ] Satu staf = satu akun; role sesuai tugas (jangan semua jadi Admin).
- [ ] Profil toko lengkap: nama, tagline, alamat, WhatsApp, jam buka, Maps, sosmed.
- [ ] Aturan bisnis dicek: poin per Rp1.000, nilai poin, maksimal tukar, ambang tier, gratis ongkir, pajak, margin trade-in.
- [ ] Template WhatsApp disesuaikan (nama toko, rekening, kebijakan retur).
- [ ] Produk minimum 20 unit unggulan sudah ada foto + deskripsi + spesifikasi.
- [ ] Uji transaksi uji coba: 1 online, 1 POS tunai, 1 QRIS, 1 pre-order → lalu void semuanya (audit tetap bersih).
- [ ] Uji cetak struk di printer yang sebenarnya.
- [ ] Uji scanner barcode dengan 3–5 produk ber-SKU.
- [ ] Cadangan Spreadsheet (**File → Make a copy**) dan simpan salinannya.
- [ ] Nomor WhatsApp toko aktif & dipegang staf yang bertugas.

### Rutin (harian / mingguan / bulanan)

| Frekuensi | Tindakan |
|---|---|
| Harian | Tutup kasir: cocokkan total **Tunai** di dashboard dengan uang fisik; tinjau transaksi **VOID** |
| Harian | Cek panel **Peringatan Stok** → buat PO untuk produk menipis |
| Mingguan | Tinjau **Audit Trail** untuk aksi `HAPUS*` dan `UBAH_PRODUK` (terutama harga) |
| Mingguan | Perbarui konten: banner promo & testimoni baru |
| Bulanan | **Opname** penuh (mode SET) dengan catatan yang jelas |
| Bulanan | Ekspor CSV transaksi + produk, simpan sebagai arsip |
| Bulanan | **Backup Spreadsheet** (make a copy) & simpan di folder Drive terpisah |
| Bulanan | Tinjau tier pelanggan & kirim broadcast promo ke segmen yang tepat |
| Kwartalan | Ganti PIN kasir & ganti password akun Google pemilik Spreadsheet |

### Keamanan (sudah tertanam)

- PIN staf **di-hash** (SHA-256 + salt) — PIN asli tidak pernah tersimpan di sheet.
- Token sesi **HMAC bertanda tangan** dengan masa berlaku 12 jam; token palsu/kedaluwarsa ditolak server.
- **RBAC ganda**: dicek di UI (menu) dan di server (per aksi API).
- **Tidak ada kredensial di sisi klien** selain token sesi sementara.
- Input form dibersihkan (escape HTML) sebelum dirender → mencegah penyisipan skrip dari data pelanggan.
- Setiap aksi vital meninggalkan jejak audit yang **tidak dapat dihapus dari UI** (hanya bisa dihapus manual di sheet — dan itu pun terlihat).

> ⚠️ **Jangan** menempelkan password Google, API key, atau token di dalam file theme. Cukup `API_URL` — semuanya.

---

## 31. LAMPIRAN: RUMUS & ATURAN BISNIS

### 31.1 Perhitungan transaksi

```
subtotal       = Σ (harga × qty)
diskon_promo   = tipe PERCENT ? min(subtotal × nilai%, maks_diskon) : nilai
                 (hanya bila subtotal ≥ min_belanja, kode aktif, dalam periode, kuota tersisa)
diskon_manual  = potongan bebas kasir
poin_dipakai   = min(poin_pelanggan, ⌊(subtotal − diskon) × maks_tukar% ÷ nilai_poin⌋)
nilai_poin_rp  = poin_dipakai × nilai_poin
pajak          = PPN% × (subtotal − diskon_total)
total          = subtotal − diskon_promo − diskon_manual − nilai_poin_rp + ongkir + pajak
poin_didapat   = ⌊(subtotal − diskon_total) ÷ 1.000⌋ × poin_per_1000
kembalian      = bayar − total
```

### 31.2 Aturan stok

- Stok hanya berkurang pada **transaksi LUNAS** (POS langsung, atau `order.pay` untuk pesanan online).
- **Void** mengembalikan stok seluruh item.
- Penjualan produk **BUNDLE** mengurangi stok tiap komponen sesuai BOM.
- **`max_buildable`** = `min(⌊stok komponen ÷ kebutuhan komponen⌋)`.
- Semua perubahan stok menulis baris di `STOCKMOVE` dengan nilai sebelum & sesudah — inilah yang membuat audit stok mungkin dilakukan.

### 31.3 Aturan poin & tier

- Poin dihitung dari nilai belanja **setelah diskon**, bukan sebelum.
- Poin tidak diberikan untuk transaksi yang di-void.
- Tier dihitung ulang tiap transaksi dari **total belanja seumur hidup** (tidak pernah turun).
- Poin dapat dikurangi manual hanya dengan alasan yang wajib diisi.

### 31.4 SLA layanan (contoh yang dipakai di halaman publik)

| Layanan | Target |
|---|---|
| Respon WhatsApp | ≤ 15 menit pada jam kerja |
| Diagnosa service | 1×24 jam |
| Perbaikan ringan | 1×24 jam kerja |
| Perbaikan berat / tunggu part | 3–7 hari kerja |
| Verifikasi trade-in | ≤ 1×24 jam kerja |
| Pengiriman dalam kota | Same-day (sebelum 15.00) |
| Pengiriman luar kota | 1–4 hari kerja (JNE/J&T/SiCepat) |

---

## PENUTUP

Sistem ini dirancang agar **satu orang pun bisa mengelola toko komputer lengkap** — katalog yang meyakinkan pembeli, kasir yang cepat, stok yang jujur, service yang terlacak, dan pemasaran yang terukur — semuanya berjalan di atas layanan gratis Google + Blogger.

Urutan pemakaian harian yang disarankan:

1. **Pagi** — cek Dashboard (omzet kemarin, stok menipis) → kirim PO bila perlu.
2. **Sepanjang hari** — POS untuk penjualan, Service untuk pekerjaan teknisi, CRM saat pelanggan lama datang.
3. **Sore** — tandai lunas pesanan online, kirim update status service, follow up trade-in.
4. **Tutup** — cek VOID hari ini, cocokkan kas, tinjau peringatan stok.
5. **Mingguan** — audit trail, konten, broadcast promo.
6. **Bulanan** — opname, ekspor laporan, backup Spreadsheet.

Selamat berjualan — semoga tokonya ramai dan labanya bertumbuh. 🚀

> Butuh penyesuaian (mis. tambah metode bayar baru, laporan pajak, atau integrasi ekspedisi)? Semua logika terpusat di `code.gs` (satu fungsi per aksi) dan satu blok CSS variabel di theme — perubahan kecil tidak akan merusak bagian lain.
