# 🖥️ Sarinadinet — Toko Online Laptop & PC + POS Kasir

Sistem **satu aplikasi (SPA)** untuk toko komputer: halaman jualan yang meyakinkan pembeli **plus** kasir POS, gudang, service, CRM, dan audit trail — berjalan di atas **Blogger + Google Apps Script + Google Spreadsheet** (tanpa server, tanpa biaya bulanan).

```
  Pelanggan (mobile & desktop)          Staf (kasir, gudang, teknisi, owner)
              │                                        │
              └─────────►  theme-blogger.xml  ◄────────┘
                            (SPA: HTML+CSS+JS)
                                   │  REST API (fetch + JSONP fallback)
                                   ▼
                           code.gs  (86 aksi API)
                                   │
                                   ▼
                        Google Spreadsheet (15 sheet)
```

---

## ✨ Fitur

### Sisi pelanggan
- **Landing premium**: navbar sticky, hero dengan produk unggulan, ticker promo, band statistik beranimasi, keunggulan, katalog, paket rakitan, service, trade-in, testimoni marquee, FAQ akordeon, CTA, footer lengkap, FAB WhatsApp.
- **Katalog pintar**: pencarian *debounced*, tab kategori, filter lanjutan (kondisi/tipe/diskon/stok), 7 mode urutan, chip filter aktif, *load more*, skeleton loading.
- **Detail produk**: galeri, badge, harga coret + % hemat, spesifikasi, isi paket (BOM), produk terkait, tanya stok via WhatsApp.
- **Keranjang → checkout WhatsApp**: cek stok real-time, validasi kode promo, poin otomatis, gratis ongkir, pesanan tersimpan di spreadsheet + rincian terkirim ke WA.
- **Tukar tambah**: kalkulator estimasi (range + bonus), pengajuan online.
- **Service**: 6 paket layanan, formulir tiket, lacak status tiket/invoice/WA dengan progress bar.
- **Tema terang & gelap**, sepenuhnya responsif (mobile-first), animasi halus, aksesibel.

### Sisi staf (login PIN)
- **Dashboard analitik**: KPI hari ini vs kemarin, grafik tren 14 hari, kategori, metode bayar, produk terlaris, performa staf, peringatan stok.
- **POS Kasir**: dukungan **scanner barcode USB**, pencarian SKU/nama, quick cash, numpad, **hold cart**, 6 metode bayar, promo + diskon manual, **struk termal 40 kolom** (cetak/salin/kirim WA), pre-order.
- **Transaksi**: filter lengkap, detail, pelunasan, **void** (stok dikembalikan + audit), ekspor CSV.
- **Produk**: CRUD penuh, impor massal (tempel/drag & drop CSV), ekspor CSV, hapus massal, kartu stok.
- **Bundling PC**: BOM builder dengan perhitungan **max_buildable** & HPP ideal otomatis.
- **Stok**: opname mode **SET/DELTA** (wajib catatan), kartu stok lengkap, peringatan menipis & rakitan terhambat.
- **Purchase Order**: draft → dikirim → diterima; penerimaan otomatis menambah stok & membuat produk baru.
- **CRM**: tier otomatis (Bronze/Silver/Gold/Platinum), poin, profil 360°, broadcast promo WhatsApp.
- **Service**: papan kerja kanban 7 tahap (drag & drop), invoice jasa + sparepart otomatis mengurangi stok.
- **Tukar tambah**: review, simulasi, **persetujuan otomatis membuat produk "Bekas"** dengan markup margin.
- **Promo, konten (banner/testimoni), staf & PIN, pengaturan, audit trail.**

---

## 📁 Isi Paket

| File | Keterangan |
|---|---|
| **`PANDUAN.md`** | 📘 **Panduan lengkap** — pemasangan, konfigurasi, tiap modul, rumus bisnis, troubleshooting, checklist go-live |
| **`code.gs`** | Backend REST API Google Apps Script (86 aksi, ±3.000 baris) |
| **`theme-blogger.xml`** | Theme Blogger berisi seluruh SPA (storefront + POS, ±7.600 baris) |

---

## 🚀 Pasang dalam 5 Langkah

1. **Buat database** — buka [sheets.new](https://sheets.new).
2. **Backend** — Spreadsheet → *Extensions → Apps Script* → tempel seluruh `code.gs` → jalankan **`setupSistem()`** → izinkan permission → **Deploy → New deployment → Web app** (*Execute as: Me*, *Who has access: **Anyone***) → salin URL `/exec`.
3. **Uji API** — buka `{URL}?action=ping` → harus muncul `{ "ok": true }`.
4. **Frontend** — Blogger → *Theme → Edit HTML* → tempel seluruh `theme-blogger.xml` → cari `API_URL` di blok `CONFIG` → isi URL `/exec` → **Save**.
5. **Optimasi** — *Theme → Mobile → **No, show desktop theme***, lalu isi deskripsi blog untuk SEO.

Login staf: klik **Masuk** di navbar (atau buka `#pos`).
PIN awal: **`123456`** Owner · `1111` Kasir · `2222` Teknisi · `3333` Gudang — **ganti semuanya sebelum go-live**.

> ℹ️ **Mode DEMO**: selama `API_URL` masih kosong, seluruh aplikasi berjalan dengan data contoh di browser (semua fitur bisa dicoba tanpa backend).

Detail tiap langkah, tangkapan layar alur, rumus bisnis, dan troubleshooting ada di **[`PANDUAN.md`](PANDUAN.md)**.

---

## 🔐 Keamanan

- PIN staf **di-hash** (SHA-256 + salt) — tersimpan di Spreadsheet, tidak pernah dikirim ke browser.
- Token sesi **HMAC-SHA256 bertanda tangan**, TTL 12 jam; token palsu/kedaluwarsa ditolak server.
- **RBAC dua lapis**: menu disembunyikan di UI *dan* divalidasi di server per aksi.
- Audit trail untuk login, checkout, void, perubahan harga, penghapusan data.

---

## 🧪 Status

| Aspek | Hasil |
|---|---|
| Validasi sintaks JavaScript | ✅ `node --check` bersih |
| Validasi struktur XML Blogger | ✅ parse lxml bersih |
| Uji end-to-end (headless DOM) | ✅ 60+ skenario: katalog, keranjang, checkout, trade-in, service, lacak, login, 15 halaman, POS + struk, CRUD produk, impor CSV, opname, BOM, kanban, trade-in approve, pengaturan, audit, RBAC |
| Uji endpoint API | ✅ 86 aksi responsif (`ok:true`) |

---

## 🛠️ Teknologi

Vanilla JavaScript (ES5-safe, tanpa framework) · CSS variables + utility classes · Chart.js (CDN) · Google Apps Script · Google Sheets · Blogger XML (`b:skin`) · WhatsApp `wa.me` · Unsplash/pravatar untuk gambar contoh.

---

## 📄 Lisensi

Dibuat untuk keperluan pemilik toko (Sarinadinet). Silakan modifikasi bebas untuk toko Anda sendiri.
