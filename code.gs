/**
 * ============================================================================
 *  SARINADINET  —  COMMERCE & POS ENGINE
 *  Backend REST API untuk Toko Online Jual Beli Laptop & PC + POS Kasir
 *  Stack : Google Apps Script  ->  Google Sheets  ->  Blogger (SPA XML Theme)
 *  Versi : 1.0.0
 * ============================================================================
 *  CARA PAKAI SINGKAT
 *  1. Buat Google Spreadsheet baru (nama bebas, mis. "DB SARINADINET").
 *  2. Menu: Extensions > Apps Script. Hapus isi Code.gs, tempel SELURUH file ini.
 *  3. Jalankan fungsi `setupSistem()` satu kali (izinkan semua permission).
 *     -> Membuat seluruh sheet, header, data demo, pengaturan default, & PIN staf.
 *  4. Deploy > New deployment > Web app
 *       Execute as : Me
 *       Who has access : Anyone
 *  5. Salin URL /exec, tempel di theme XML pada  CONFIG.API_URL.
 *  6. Buka {URL}/exec?action=ping  -> harus mengembalikan JSON ok:true.
 *
 *  KEAMANAN : PIN staf di-hash (SHA-256 + salt). Sesi memakai token
 *  HMAC-SHA256 bertanda tangan dengan masa berlaku (default 12 jam).
 *  TIDAK ADA kredensial yang disimpan di sisi klien.
 * ============================================================================
 */

/* ===========================================================================
 * 1. KONFIGURASI GLOBAL
 * ======================================================================== */
var APP = {
  NAME: 'Sarinadinet Commerce & POS',
  CODE: 'sarinadinet',
  VERSION: '1.0.0',
  TZ: 'Asia/Jakarta',
  TOKEN_TTL: 43200,          // detik (12 jam)
  CACHE_TTL: 180,            // detik cache produk/konten
  LOW_STOCK_DEFAULT: 3,
  PAGE_LIMIT: 24
};

/** Nama sheet = nama tabel logis. */
var T = {
  PRODUCT:  'PRODUCT',
  CUSTOMER: 'CUSTOMER',
  ORDER:    'ORDER',
  SERVICE:  'SERVICE',
  TRADEIN:  'TRADEIN',
  MOVE:     'STOCKMOVE',
  PO:       'PO',
  PROMO:    'PROMO',
  STAFF:    'STAFF',
  SETTING:  'SETTING',
  AUDIT:    'AUDIT',
  BANNER:   'BANNER',
  TESTI:    'TESTI',
  COUNTER:  'COUNTER',
  HOLD:     'HOLDCART'
};

/** Prefix ID dokumen. */
var PFX = {
  PRODUCT: 'PRD', ORDER: 'INV', SERVICE: 'SVC', TRADEIN: 'TI', PO: 'PO',
  CUSTOMER: 'CST', PROMO: 'PRM', STAFF: 'STF', BANNER: 'BNR', TESTI: 'TST',
  MOVE: 'MUT', AUDIT: 'LOG', HOLD: 'HLD'
};

/** Skema tabel: kolom-kolom yang otomatis dibuat. */
var SCHEMA = {
  PRODUCT: ['id','sku','nama','kategori','brand','tipe','kondisi','harga','harga_coret','harga_beli','stok','stok_min','satuan','garansi','poin','gambar','deskripsi','tags','bom','status','unggulan','dibuat','diubah'],
  CUSTOMER:['id','nama','wa','email','alamat','kota','total_belanja','trx','poin','tier','catatan','dibuat','diubah'],
  ORDER:   ['id','tanggal','tipe','customer_id','nama','wa','alamat','items','subtotal','diskon','diskon_kode','poin_pakai','poin_dapat','ongkir','total','metode','bayar','kembali','status','kasir','catatan','dibuat'],
  SERVICE: ['id','tanggal','nama','wa','perangkat','kategori','keluhan','mode','teknisi','status','diagnosa','estimasi','biaya','parts','garansi','catatan','diubah'],
  TRADEIN: ['id','tanggal','nama','wa','perangkat','kategori','tahun','kondisi','harga_beli_dulu','estimasi_lo','estimasi_hi','bonus','penawaran','status','produk_id','catatan','dibuat'],
  STOCKMOVE:['id','tanggal','product_id','sku','nama','tipe','qty','sebelum','sesudah','ref','catatan','oleh'],
  PO:      ['id','tanggal','supplier','wa','items','total','status','eta','diterima_pada','catatan','oleh','dibuat'],
  PROMO:   ['id','kode','judul','tipe','nilai','min_belanja','maks_diskon','mulai','akhir','kuota','terpakai','aktif','catatan'],
  STAFF:   ['id','nama','pin_hash','pin_salt','role','wa','email','aktif','dibuat','last_login','trx'],
  SETTING: ['id','value'],
  AUDIT:   ['id','tanggal','user','role','aksi','entitas','entitas_id','detail'],
  BANNER:  ['id','judul','subjek','gambar','link','urutan','aktif'],
  TESTI:   ['id','nama','kota','rating','pesan','avatar','produk','aktif','urutan'],
  COUNTER: ['id','value'],
  HOLDCART:['id','tanggal','kasir','nama','wa','items','catatan','diskon']
};

/* ===========================================================================
 * 2. ROUTER & UTILITAS RESPON
 * ======================================================================== */

function doGet(e)  { return route_(e, 'GET'); }
function doPost(e) { return route_(e, 'POST'); }
function doOptions() {
  return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
}

/** Health check manual dari editor Apps Script. */
function ping() { Logger.log(JSON.stringify(apiPing_({}), null, 2)); }

function route_(e, method) {
  var p = params_(e);
  var action = String(p.action || p.route || '').trim();
  var cb = String(p.callback || '').trim();
  try {
    if (!action) {
      return respond_({ ok: true, data: {
        name: APP.NAME, version: APP.VERSION, status: 'online',
        time: nowIso_(), routes: Object.keys(ROUTES).length
      }}, cb);
    }
    var spec = ROUTES[action];
    if (!spec) throw err_('NOT_FOUND', 'Aksi tidak dikenal: ' + action);
    var fn   = typeof spec === 'function' ? spec : spec.fn;
    var meta = typeof spec === 'function' ? {} : spec;

    var ctx = { action: action, params: p, method: method, user: null, token: p.token || '' };
    if (!meta.public) {
      ctx.user = requireAuth_(p.token, meta.roles);
    }
    var out = fn(ctx) || {};
    if (out && out.ok === undefined) out = { ok: true, data: out };
    if (out.meta === undefined) out.meta = {};
    if (ctx.user) out.meta.user = { nama: ctx.user.n, role: ctx.user.r };
    return respond_(out, cb && meta.jsonp !== false ? cb : '');
  } catch (err) {
    var body = { ok: false, error: {
      code: err && err.code ? err.code : 'ERROR',
      message: err && err.message ? err.message : String(err),
      hint: err && err.hint ? err.hint : undefined
    }};
    if (ERRORS_LOG) { try { logAudit_('SISTEM', 'ERROR', action, body.error.message); } catch (x) {} }
    return respond_(body, cb);
  }
}

/** Gabungkan query string + body JSON/POST form menjadi satu objek param. */
function params_(e) {
  var out = {};
  e = e || {};
  if (e.parameter) { for (var k in e.parameter) out[k] = e.parameter[k]; }
  if (e.postData && e.postData.contents) {
    var raw = e.postData.contents, parsed = null;
    try { parsed = JSON.parse(raw); } catch (x) { parsed = null; }
    if (parsed && typeof parsed === 'object') {
      for (var j in parsed) out[j] = parsed[j];
    } else if (raw.indexOf('=') > -1) {
      raw.split('&').forEach(function (kv) {
        var i = kv.indexOf('='); if (i < 0) return;
        out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
      });
    }
  }
  return out;
}

/** Kirim respon JSON (atau JSONP bila ada callback) + dukungan CORS. */
function respond_(obj, cb) {
  obj.meta = Object.assign({ app: APP.CODE, version: APP.VERSION, ts: nowIso_() }, obj.meta || {});
  var txt = JSON.stringify(obj);
  if (cb) {
    return ContentService.createTextOutput(cb + '(' + txt + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}

function err_(code, message, hint) {
  var e = new Error(message);
  e.code = code; if (hint) e.hint = hint;
  return e;
}

/** Bila true, error internal ikut tercatat di sheet AUDIT. */
var ERRORS_LOG = true;

/* ===========================================================================
 * 3. UTILITAS UMUM
 * ======================================================================== */
function props_() { return PropertiesService.getScriptProperties(); }
function cache_() { return CacheService.getScriptCache(); }
function lock_(fn) {
  var l = LockService.getScriptLock();
  l.waitLock(15000);
  try { return fn(); } finally { try { l.releaseLock(); } catch (x) {} }
}

function secret_() {
  var s = props_().getProperty('SD_SECRET');
  if (!s) {
    s = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props_().setProperty('SD_SECRET', s);
  }
  return s;
}

function ss_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (x) { ss = null; }
  if (ss) return ss;
  var id = props_().getProperty('SD_SHEET_ID');
  if (!id) throw err_('NO_SHEET', 'Spreadsheet belum terhubung. Set Script Property SD_SHEET_ID atau bind script ke spreadsheet.');
  return SpreadsheetApp.openById(id);
}

/** Set ID spreadsheet dari parameter (dipakai aksi system.bindSheet). */
function bindSheet_(id) {
  if (!id) throw err_('BAD_REQUEST', 'Parameter sheet_id wajib');
  var ss = SpreadsheetApp.openById(id);
  props_().setProperty('SD_SHEET_ID', id);
  return ss.getName();
}

function nowIso_() {
  return Utilities.formatDate(new Date(), APP.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}
function stamp_() {
  return Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd HH:mm:ss');
}
function dayKey_(d) { return Utilities.formatDate(d || new Date(), APP.TZ, 'yyyy-MM-dd'); }
function monthKey_(d) { return Utilities.formatDate(d || new Date(), APP.TZ, 'yyyy-MM'); }
function num_(v) { var n = Number(String(v === undefined || v === null ? 0 : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
function str_(v) { return v === undefined || v === null ? '' : String(v); }
function bool_(v) { return v === true || v === 'true' || v === 1 || v === '1' || v === 'YA' || v === 'ya'; }
function jsonv_(v, fb) { if (v === undefined || v === null || v === '') return fb; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch (x) { return fb; } }
function slug_(s) { return str_(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function wa_(v) {
  var d = str_(v).replace(/[^0-9]/g, '');
  if (d.indexOf('0') === 0) d = '62' + d.slice(1);
  if (d.indexOf('62') !== 0) d = '62' + d;
  return d;
}
function rp_(n) { return 'Rp' + Number(num_(n)).toLocaleString('id-ID'); }
function sha_(txt) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(txt), Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}
function hmac_(txt) {
  var raw = Utilities.computeHmacSha256Signature(String(txt), secret_());
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/, '');
}
function b64_(o) { return Utilities.base64EncodeWebSafe(Utilities.newBlob(JSON.stringify(o)).getBytes()).replace(/=+$/, ''); }
function unb64_(s) {
  var pad = s.length % 4 === 0 ? '' : new Array(5 - (s.length % 4)).join('=');
  return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(s + pad)).getDataAsString());
}
function chunk_(arr, n) {
  var out = []; for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
function paging_(rows, p) {
  var limit = Math.max(1, Math.min(200, num_(p.limit) || APP.PAGE_LIMIT));
  var page  = Math.max(1, num_(p.page) || 1);
  var total = rows.length, pages = Math.ceil(total / limit) || 1;
  return { rows: rows.slice((page - 1) * limit, page * limit), meta: { page: page, pages: pages, total: total, limit: limit } };
}

/* ===========================================================================
 * 4. LAPISAN DATABASE (GOOGLE SHEETS)
 * ======================================================================== */

/** Ambil sheet; buat otomatis beserta header bila belum ada. */
function sheet_(name) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    var head = SCHEMA[name] || ['id', 'value'];
    sh.getRange(1, 1, 1, head.length).setValues([head]);
    styleHeader_(sh, head.length);
  } else if (sh.getLastRow() === 0) {
    var h2 = SCHEMA[name] || ['id', 'value'];
    sh.getRange(1, 1, 1, h2.length).setValues([h2]);
    styleHeader_(sh, h2.length);
  }
  return sh;
}

function styleHeader_(sh, cols) {
  try {
    sh.getRange(1, 1, 1, cols)
      .setBackground('#0f172a').setFontColor('#ffffff').setFontWeight('bold')
      .setFontFamily('Inter').setVerticalAlignment('middle');
    sh.setFrozenRows(1);
    sh.setRowHeight(1, 32);
  } catch (x) {}
}

/** Baca seluruh isi tabel menjadi array objek (baris kosong diabaikan). */
function tbl_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (last < 2) return { headers: SCHEMA[name] || [], rows: [] };
  var values = sh.getRange(1, 1, last, lastCol).getValues();
  var headers = values[0].map(function (h) { return str_(h).trim(); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i], o = { _row: i + 1 }, empty = true;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var v = r[c];
      if (v instanceof Date) v = Utilities.formatDate(v, APP.TZ, 'yyyy-MM-dd HH:mm:ss');
      o[headers[c]] = v === null ? '' : v;
      if (str_(v) !== '') empty = false;
    }
    if (!empty) rows.push(o);
  }
  return { headers: headers, rows: rows };
}

/** Versi cache dari tbl_ (untuk data yang sering dibaca: produk, konten). */
function tblCached_(name, ttl) {
  var key = 'tbl_' + name;
  var c = cache_();
  var hit = null;
  try { hit = c.get(key); } catch (x) {}
  if (hit) { try { return JSON.parse(hit); } catch (x) {} }
  var data = tbl_(name);
  try { c.put(key, JSON.stringify(data), ttl || APP.CACHE_TTL); } catch (x) {}
  return data;
}

function bust_(name) {
  try { cache_().remove('tbl_' + name); } catch (x) {}
  if (!name) {
    try { cache_().removeAll(['dash_stats', 'katalog_index']); } catch (x) {}
  }
}

function rows_(name) { return tbl_(name).rows; }
function findById_(name, id) {
  var rows = rows_(name);
  for (var i = 0; i < rows.length; i++) if (str_(rows[i].id) === str_(id)) return rows[i];
  return null;
}
function findBy_(name, field, value) {
  var rows = rows_(name);
  for (var i = 0; i < rows.length; i++) if (str_(rows[i][field]) === str_(value)) return rows[i];
  return null;
}
function filterBy_(name, fn) {
  return rows_(name).filter(fn);
}

/** Insert atau update berdasarkan field `id`. Mengembalikan objek tersimpan. */
function save_(name, obj, opts) {
  opts = opts || {};
  var head = SCHEMA[name] || ['id', 'value'];
  var sh = sheet_(name);
  obj = Object.assign({}, obj);
  if (!obj.id) obj.id = nextId_(name);
  var rowIdx = null;
  var col = head.indexOf('id') + 1;
  var last = sh.getLastRow();
  if (last > 1) {
    var ids = sh.getRange(2, col, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (str_(ids[i][0]).trim() === str_(obj.id)) { rowIdx = i + 2; break; }
    }
  }
  var values = head.map(function (h) {
    var v = obj[h];
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
  if (rowIdx) {
    // merge dengan data lama agar field yang tak dikirim tidak hilang
    if (opts.merge !== false) {
      var old = sh.getRange(rowIdx, 1, rowIdx, head.length).getValues()[0];
      for (var k = 0; k < head.length; k++) {
        if (obj[head[k]] === undefined && str_(old[k]) !== '') values[k] = old[k];
      }
    }
    sh.getRange(rowIdx, 1, 1, head.length).setValues([values]);
  } else {
    sh.appendRow(values);
    rowIdx = sh.getLastRow();
  }
  bust_(name);
  var saved = {}; head.forEach(function (h, i) { saved[h] = values[i]; });
  saved._row = rowIdx;
  return saved;
}

function delete_(name, id) {
  var sh = sheet_(name);
  var col = (SCHEMA[name] || ['id']).indexOf('id') + 1;
  var last = sh.getLastRow();
  if (last < 2) return false;
  var ids = sh.getRange(2, col, last - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (str_(ids[i][0]).trim() === str_(id)) {
      sh.deleteRow(i + 2);
      bust_(name);
      return true;
    }
  }
  return false;
}

/** Nomor urut dokumen: PRD-000123 (aman dari race via LockService). */
function nextId_(name) {
  var pfx = PFX[name] || 'DOC';
  var key = 'seq_' + pfx;
  var c = cache_();
  var n = num_(c.get(key));
  if (!n) {
    var sh = sheet_(T.COUNTER);
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (str_(data[i][0]) === pfx) { n = num_(data[i][1]); break; }
    }
  }
  n = (n || 0) + 1;
  cache_().put(key, String(n), 21600);
  if (n % 25 === 0 || n === 1) {
    var sh2 = sheet_(T.COUNTER);
    var d2 = sh2.getDataRange().getValues(), found = false;
    for (var j = 1; j < d2.length; j++) {
      if (str_(d2[j][0]) === pfx) { sh2.getRange(j + 1, 2).setValue(n); found = true; break; }
    }
    if (!found) sh2.appendRow([pfx, n]);
  }
  return pfx + '-' + ('000000' + n).slice(-6);
}

/* ===========================================================================
 * 5. PENGATURAN (SETTING)
 * ======================================================================== */
var DEFAULT_SETTINGS = {
  nama_toko: 'Sarinadinet Computer',
  tagline: 'Laptop, PC Rakitan & Service Terpercaya',
  alamat: 'Jl. Merdeka No. 128, Yogyakarta',
  kota: 'Yogyakarta',
  wa: '6281234567890',
  email: 'cs@sarinadinet.com',
  jam_buka: 'Senin - Sabtu, 09.00 - 21.00 WIB',
  ig: 'https://instagram.com/sarinadinet',
  fb: '',
  tiktok: '',
  maps: 'https://maps.google.com/?q=Yogyakarta',
  logo: '',
  mata_uang: 'IDR',
  pajak_pct: '0',
  ongkir_min: '0',
  gratis_ongkir: '2000000',
  poin_per_1000: '1',          // 1 poin per Rp1.000 belanja
  poin_nilai: '1000',          // 1 poin = Rp1.000 diskon
  poin_maks_pct: '30',         // maksimal 30% dari subtotal
  tier_silver: '1000000',
  tier_gold: '5000000',
  tier_platinum: '15000000',
  tradein_margin_pct: '25',
  tradein_bonus_pct: '5',
  tradein_aktif: '1',
  wa_template_order: 'Halo {toko}, saya mau order:\n{items}\n\nTotal: {total}\nNama: {nama}\nWhatsApp: {wa}\nAlamat: {alamat}\n\nOrder ID: {kode}',
  wa_template_service: 'Halo {toko}, saya ingin service:\nPerangkat: {perangkat}\nKeluhan: {keluhan}\nNama: {nama}\nWhatsApp: {wa}',
  wa_template_tradein: 'Halo {toko}, saya ingin trade-in:\nPerangkat: {perangkat} ({tahun})\nKondisi: {kondisi}\nHarga beli dulu: {harga}\nEstimasi: {estimasi}\nNama: {nama}',
  notif_email: '',
  maintenance: '0',
  versi_db: '1'
};

function settings_() {
  var data = tblCached_(T.SETTING, 300);
  var out = Object.assign({}, DEFAULT_SETTINGS);
  data.rows.forEach(function (r) { if (r.id) out[str_(r.id)] = str_(r.value); });
  return out;
}
function setSetting_(key, value) {
  save_(T.SETTING, { id: key, value: str_(value) });
  bust_(T.SETTING);
  return true;
}
function setMany_(obj) {
  Object.keys(obj).forEach(function (k) { setSetting_(k, obj[k]); });
  return true;
}

/* ===========================================================================
 * 6. AUTENTIKASI & SESI (PIN STAF -> TOKEN HMAC)
 * ======================================================================== */
function hashPin_(pin, salt) { return sha_(salt + '::' + str_(pin) + '::' + secret_()); }

function createStaff_(nama, pin, role, wa, email) {
  var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  return save_(T.STAFF, {
    id: nextId_(T.STAFF), nama: nama, pin_hash: hashPin_(pin, salt), pin_salt: salt,
    role: role, wa: wa || '', email: email || '', aktif: '1',
    dibuat: stamp_(), last_login: '', trx: 0
  });
}

function issueToken_(staff) {
  var exp = Math.floor(Date.now() / 1000) + APP.TOKEN_TTL;
  var payload = { u: staff.id, n: staff.nama, r: staff.role, e: exp };
  var body = b64_(payload);
  return { token: body + '.' + hmac_(body), exp: exp, ttl: APP.TOKEN_TTL };
}

function verifyToken_(token) {
  token = str_(token).trim();
  if (!token) throw err_('UNAUTHORIZED', 'Token tidak ada. Silakan login ulang.');
  var parts = token.split('.');
  if (parts.length !== 2) throw err_('UNAUTHORIZED', 'Format token tidak valid.');
  if (hmac_(parts[0]) !== parts[1]) throw err_('UNAUTHORIZED', 'Token tidak valid (signature mismatch).');
  var pay = unb64_(parts[0]);
  if (!pay.e || pay.e < Math.floor(Date.now() / 1000)) throw err_('TOKEN_EXPIRED', 'Sesi berakhir. Silakan login ulang.');
  var staff = findById_(T.STAFF, pay.u);
  if (!staff) throw err_('UNAUTHORIZED', 'Akun staf tidak ditemukan.');
  if (!bool_(staff.aktif)) throw err_('FORBIDDEN', 'Akun staf dinonaktifkan.');
  return { id: staff.id, n: staff.nama, r: staff.role, wa: staff.wa, e: pay.e };
}

function requireAuth_(token, roles) {
  var u = verifyToken_(token);
  if (roles && roles.length && roles.indexOf(u.r) < 0) {
    throw err_('FORBIDDEN', 'Role "' + u.r + '" tidak memiliki akses ke aksi ini.');
  }
  return u;
}

/* ===========================================================================
 * 7. AUDIT TRAIL
 * ======================================================================== */
function logAudit_(user, role, aksi, entitas, entitasId, detail) {
  try {
    save_(T.AUDIT, {
      id: nextId_(T.AUDIT), tanggal: stamp_(), user: str_(user),
      role: str_(role), aksi: str_(aksi), entitas: str_(entitas),
      entitas_id: str_(entitasId), detail: typeof detail === 'object' ? JSON.stringify(detail) : str_(detail)
    });
  } catch (x) { /* audit tidak boleh menggagalkan transaksi */ }
}
function audit_(ctx, aksi, entitas, entitasId, detail) {
  logAudit_(ctx && ctx.user ? ctx.user.n : 'PUBLIK', ctx && ctx.user ? ctx.user.r : 'guest', aksi, entitas, entitasId, detail);
}

/* ===========================================================================
 * 8. KATALOG, PRODUK & BUNDLING (BILL OF MATERIALS)
 * ======================================================================== */
function toNum_(v) { return num_(v); }

/** Normalisasi produk untuk konsumsi front-end. */
function productView_(p) {
  var harga = num_(p.harga), coret = num_(p.harga_coret);
  var diskon = coret > harga && coret > 0 ? Math.round(((coret - harga) / coret) * 100) : 0;
  return {
    id: str_(p.id), sku: str_(p.sku), nama: str_(p.nama),
    kategori: str_(p.kategori), brand: str_(p.brand), tipe: str_(p.tipe) || 'UNIT',
    kondisi: str_(p.kondisi) || 'BARU', harga: harga, harga_coret: coret,
    diskon: diskon, stok: toNum_(p.stok), stok_min: toNum_(p.stok_min) || APP.LOW_STOCK_DEFAULT,
    satuan: str_(p.satuan) || 'unit', garansi: str_(p.garansi), poin: toNum_(p.poin),
    gambar: str_(p.gambar), deskripsi: str_(p.deskripsi), tags: str_(p.tags),
    bom: jsonv_(p.bom, null), status: str_(p.status) || 'AKTIF',
    unggulan: bool_(p.unggulan), habis: toNum_(p.stok) <= 0,
    tipis: toNum_(p.stok) > 0 && toNum_(p.stok) <= (toNum_(p.stok_min) || APP.LOW_STOCK_DEFAULT)
  };
}

/** Produk internal (POS/backoffice) termasuk harga beli, BOM mentah & nilai aset. */
function productFull_(p) {
  var v = productView_(p);
  v.harga_beli = num_(p.harga_beli);
  v.margin = v.harga - num_(p.harga_beli);
  v.margin_pct = num_(p.harga_beli) > 0 ? Math.round(((v.harga - num_(p.harga_beli)) / num_(p.harga_beli)) * 100) : 100;
  v.nilai_stok = v.harga_beli * v.stok;
  v.dibuat = str_(p.dibuat); v.diubah = str_(p.diubah);
  v.tipe = str_(p.tipe) || 'UNIT';
  if (v.tipe === 'BUNDLE') {
    v.komponen = explodeBom_(p);
    v.max_buildable = maxBuildable_(p);
  }
  return v;
}

/** Pecah BOM -> daftar komponen [{sku,nama,qty,stok,harga,harga_beli,url}] */
function explodeBom_(p) {
  var bom = jsonv_(typeof p === 'string' ? p : p.bom, []);
  if (!Array.isArray(bom)) return [];
  var prods = rows_(T.PRODUCT);
  return bom.map(function (b) {
    var sku = str_(b.sku || b.id);
    var comp = null;
    for (var i = 0; i < prods.length; i++) {
      if (str_(prods[i].sku) === sku || str_(prods[i].id) === sku) { comp = prods[i]; break; }
    }
    var qty = num_(b.qty) || 1;
    return {
      sku: sku, qty: qty,
      nama: comp ? str_(comp.nama) : ('(komponen hilang: ' + sku + ')'),
      stok: comp ? num_(comp.stok) : 0,
      harga: comp ? num_(comp.harga) : 0,
      harga_beli: comp ? num_(comp.harga_beli) : 0,
      gambar: comp ? str_(comp.gambar) : '',
      hilang: !comp
    };
  });
}

/** Berapa unit rakitan yang bisa dibangun dari stok komponen saat ini. */
function maxBuildable_(p) {
  var comps = explodeBom_(p);
  if (!comps.length) return 0;
  var min = Infinity;
  comps.forEach(function (c) {
    if (c.hilang) { min = 0; return; }
    var bisa = Math.floor(c.stok / (c.qty || 1));
    if (bisa < min) min = bisa;
  });
  return min === Infinity ? 0 : min;
}
/** Nilai HPP ideal sebuah bundle berdasarkan komponen. */
function bomCost_(p) {
  return explodeBom_(p).reduce(function (s, c) { return s + c.harga_beli * c.qty; }, 0);
}

/* ===========================================================================
 * 9. STOK: MUTASI, OPNAME, PENERIMAAN
 * ======================================================================== */
function stockMove_(rec) {
  return save_(T.MOVE, Object.assign({
    id: nextId_(T.MOVE), tanggal: stamp_(), oleh: 'sistem'
  }, rec));
}

/**
 * Kurangi / tambah stok beserta pencatatan kartu stok.
 * items: [{sku|id, qty, nama?}]
 */
function applyStock_(items, arah, ref, oleh, catatan) {
  var log = [];
  lock_(function () {
    items.forEach(function (it) {
      var key = str_(it.sku || it.id);
      var p = findBy_(T.PRODUCT, 'sku', key) || findById_(T.PRODUCT, key);
      if (!p) throw err_('NOT_FOUND', 'Produk tidak ditemukan: ' + key);
      var qty = num_(it.qty) || 1;
      var before = num_(p.stok);
      var after = arah === 'OUT' ? before - qty : before + qty;
      // Bila produk BUNDLE -> explode BOM, stok bundle tetap dicatat turun 1
      if (arah === 'OUT' && str_(p.tipe) === 'BUNDLE') {
        var comps = explodeBom_(p);
        comps.forEach(function (c) {
          var cp = findBy_(T.PRODUCT, 'sku', c.sku);
          if (!cp) return;
          var cb = num_(cp.stok), ca = cb - (c.qty * qty);
          save_(T.PRODUCT, { id: cp.id, stok: ca, diubah: stamp_() });
          stockMove_({ product_id: cp.id, sku: cp.sku, nama: cp.nama, tipe: 'BUNDLE_OUT',
            qty: -(c.qty * qty), sebelum: cb, sesudah: ca, ref: ref, catatan: catatan || ('Komponen bundle ' + p.sku), oleh: oleh });
        });
      }
      save_(T.PRODUCT, { id: p.id, stok: after, diubah: stamp_() });
      stockMove_({ product_id: p.id, sku: p.sku, nama: p.nama,
        tipe: arah === 'OUT' ? 'OUT' : 'IN', qty: arah === 'OUT' ? -qty : qty,
        sebelum: before, sesudah: after, ref: ref, catatan: catatan || '', oleh: oleh });
      log.push({ sku: p.sku, sebelum: before, sesudah: after });
    });
  });
  bust_(T.PRODUCT);
  return log;
}

/* ===========================================================================
 * 10. PELANGGAN, POIN & TIER LOYALITAS
 * ======================================================================== */
function tierOf_(total, s) {
  var t = num_(total);
  if (t >= num_(s.tier_platinum)) return 'PLATINUM';
  if (t >= num_(s.tier_gold)) return 'GOLD';
  if (t >= num_(s.tier_silver)) return 'SILVER';
  return 'BRONZE';
}
function tierMeta_(tier) {
  var map = {
    BRONZE:   { label: 'Bronze',   diskon: 0,  warna: '#b45309', ikon: '🥉', benefit: 'Poin dasar 1x' },
    SILVER:   { label: 'Silver',   diskon: 1,  warna: '#64748b', ikon: '🥈', benefit: 'Poin 1.25x + gratis ongkir' },
    GOLD:     { label: 'Gold',     diskon: 2.5, warna: '#ca8a04', ikon: '🥇', benefit: 'Poin 1.5x + prioritas service' },
    PLATINUM: { label: 'Platinum', diskon: 4,  warna: '#0f766e', ikon: '💎', benefit: 'Poin 2x + teknisi prioritas + garansi extended' }
  };
  return map[str_(tier).toUpperCase()] || map.BRONZE;
}
function tierMultiplier_(tier) {
  return { BRONZE: 1, SILVER: 1.25, GOLD: 1.5, PLATINUM: 2 }[str_(tier).toUpperCase()] || 1;
}

/** Cari pelanggan via WhatsApp; buat baru bila belum ada. */
function customerUpsert_(data) {
  var wa = wa_(data.wa);
  if (!wa || wa.length < 9) throw err_('BAD_REQUEST', 'Nomor WhatsApp tidak valid');
  var found = null;
  if (wa) {
    var all = rows_(T.CUSTOMER);
    for (var i = 0; i < all.length; i++) if (wa_(all[i].wa) === wa) { found = all[i]; break; }
  }
  if (found) {
    var upd = { id: found.id, nama: data.nama || found.nama, email: data.email || found.email,
      alamat: data.alamat || found.alamat, kota: data.kota || found.kota, diubah: stamp_() };
    if (data.catatan) upd.catatan = str_(found.catatan) + (str_(found.catatan) ? ' | ' : '') + data.catatan;
    return save_(T.CUSTOMER, upd);
  }
  return save_(T.CUSTOMER, {
    id: nextId_(T.CUSTOMER), nama: data.nama || 'Pelanggan Baru', wa: wa,
    email: data.email || '', alamat: data.alamat || '', kota: data.kota || '',
    total_belanja: 0, trx: 0, poin: 0, tier: 'BRONZE', catatan: data.catatan || '', dibuat: stamp_(), diubah: stamp_()
  });
}

/** Tambah poin + akumulasi belanja + recalculate tier. delta bisa negatif. */
function awardPoints_(customerId, poinDelta, belanjaDelta) {
  var c = findById_(T.CUSTOMER, customerId);
  if (!c) return null;
  var s = settings_();
  var total = num_(c.total_belanja) + num_(belanjaDelta);
  var poin = Math.max(0, num_(c.poin) + num_(poinDelta));
  var tier = tierOf_(total, s);
  return save_(T.CUSTOMER, {
    id: c.id, poin: poin, total_belanja: total,
    trx: num_(c.trx) + (belanjaDelta > 0 ? 1 : 0),
    tier: tier, diubah: stamp_()
  });
}

/* ===========================================================================
 * 11. PROMO & DISKON
 * ======================================================================== */
function promoCheck_(kode, subtotal) {
  kode = str_(kode).toUpperCase().trim();
  if (!kode) return { valid: false, reason: 'Kode kosong', diskon: 0 };
  var p = findBy_(T.PROMO, 'kode', kode);
  if (!p) return { valid: false, reason: 'Kode promo tidak ditemukan', diskon: 0 };
  if (!bool_(p.aktif)) return { valid: false, reason: 'Promo sudah tidak aktif', diskon: 0 };
  var today = dayKey_();
  if (str_(p.mulai) && str_(p.mulai) > today) return { valid: false, reason: 'Promo belum dimulai', diskon: 0 };
  if (str_(p.akhir) && str_(p.akhir) < today) return { valid: false, reason: 'Promo sudah berakhir', diskon: 0 };
  if (num_(p.kuota) > 0 && num_(p.terpakai) >= num_(p.kuota)) return { valid: false, reason: 'Kuota promo habis', diskon: 0 };
  var sub = num_(subtotal);
  if (sub < num_(p.min_belanja)) {
    return { valid: false, reason: 'Minimum belanja ' + rp_(p.min_belanja), diskon: 0 };
  }
  var diskon = 0, tipe = str_(p.tipe).toUpperCase();
  if (tipe === 'PERCENT') diskon = Math.round(sub * num_(p.nilai) / 100);
  else if (tipe === 'NOMINAL') diskon = num_(p.nilai);
  else if (tipe === 'SHIPPING') diskon = num_(p.nilai);
  if (num_(p.maks_diskon) > 0 && diskon > num_(p.maks_diskon)) diskon = num_(p.maks_diskon);
  if (diskon > sub) diskon = sub;
  return { valid: true, kode: kode, judul: str_(p.judul), tipe: tipe, diskon: diskon, shipping_free: tipe === 'SHIPPING' };
}

/* ===========================================================================
 * 12. MESIN TRANSAKSI (POS CHECKOUT)
 * ======================================================================== */
/**
 * Inti perhitungan transaksi. Dipakai POS kasir, order online, & invoice service.
 * payload: { items, promo, diskon_manual, ongkir, poin_pakai, customer{nama,wa,..},
 *            metode, bayar, tipe, catatan, kasir, deduct(true|false) }
 */
function hitungTransaksi_(payload) {
  var s = settings_();
  var items = jsonv_(payload.items, []);
  if (typeof items === 'string') items = jsonv_(items, []);
  if (!Array.isArray(items) || !items.length) throw err_('BAD_REQUEST', 'Keranjang kosong');

  var detail = [], subtotal = 0;
  items.forEach(function (it) {
    var key = str_(it.sku || it.id);
    var p = findBy_(T.PRODUCT, 'sku', key) || findById_(T.PRODUCT, key);
    if (!p) throw err_('NOT_FOUND', 'Produk tidak ditemukan: ' + key);
    var qty = Math.max(1, num_(it.qty) || 1);
    var view = productView_(p);
    var harga = num_(it.harga) > 0 ? num_(it.harga) : view.harga;
    var potonganItem = num_(it.diskon);
    if (potonganItem > 0) harga = Math.max(0, harga - potonganItem);
    if (str_(view.tipe) !== 'BUNDLE' && view.stok < qty) {
      throw err_('STOK_KURANG', 'Stok ' + view.nama + ' tersisa ' + view.stok + ', diminta ' + qty);
    }
    if (str_(view.tipe) === 'BUNDLE' && maxBuildable_(p) < qty) {
      throw err_('STOK_KURANG', 'Komponen untuk rakitan ' + view.nama + ' tidak cukup (maks ' + maxBuildable_(p) + ' unit)');
    }
    var line = harga * qty;
    subtotal += line;
    detail.push({
      id: view.id, sku: view.sku, nama: view.nama, qty: qty, harga: harga,
      harga_normal: view.harga, hpp: num_(p.harga_beli), tipe: view.tipe,
      kategori: view.kategori, line: line, poin: view.poin * qty,
      gambar: view.gambar, garansi: view.garansi
    });
  });

  // --- Diskon ---
  var promo = { valid: false, diskon: 0 };
  if (payload.promo) {
    promo = promoCheck_(payload.promo, subtotal);
    if (payload.promo_strict && !promo.valid) throw err_('PROMO_INVALID', promo.reason);
  }
  var diskonManual = Math.max(0, num_(payload.diskon_manual));
  var diskonMaks = Math.round(subtotal * 0.9);
  var diskonTotal = Math.min(diskonMaks, (promo.valid ? promo.diskon : 0) + diskonManual);

  // --- Poin ---
  var poinPakai = Math.max(0, num_(payload.poin_pakai));
  var nilaiPoin = num_(s.poin_nilai) || 1000;
  var poinMaksPct = num_(s.poin_maks_pct) || 30;
  var batasPoinRp = Math.round((subtotal - diskonTotal) * poinMaksPct / 100);
  var poinRp = poinPakai * nilaiPoin;
  if (poinRp > batasPoinRp) {
    poinPakai = Math.floor(batasPoinRp / nilaiPoin);
    poinRp = poinPakai * nilaiPoin;
  }

  // --- Ongkir & pajak ---
  var ongkir = Math.max(0, num_(payload.ongkir));
  if (num_(s.gratis_ongkir) > 0 && subtotal >= num_(s.gratis_ongkir)) ongkir = 0;
  var dasar = Math.max(0, subtotal - diskonTotal - poinRp);
  var pajak = Math.round(dasar * (num_(s.pajak_pct) / 100));
  var total = dasar + ongkir + pajak;

  var bayar = num_(payload.bayar);
  var kembali = Math.max(0, bayar - total);
  var kurang = Math.max(0, total - bayar);

  // --- Poin didapat ---
  var tierLama = 'BRONZE';
  var cid = str_(payload.customer_id);
  if (!cid && payload.customer && payload.customer.wa) {
    var existing = null, all = rows_(T.CUSTOMER), wx = wa_(payload.customer.wa);
    for (var i = 0; i < all.length; i++) if (wa_(all[i].wa) === wx) { existing = all[i]; break; }
    if (existing) { cid = existing.id; tierLama = str_(existing.tier) || 'BRONZE'; }
  } else if (cid) {
    var c0 = findById_(T.CUSTOMER, cid);
    if (c0) tierLama = str_(c0.tier) || 'BRONZE';
  }
  var poinDapat = Math.floor((dasar / 1000) * (num_(s.poin_per_1000) || 1) * tierMultiplier_(tierLama));

  return {
    items: detail, subtotal: subtotal,
    promo: promo, diskon_promo: promo.valid ? promo.diskon : 0,
    diskon_manual: diskonManual, diskon: diskonTotal,
    poin_pakai: poinPakai, poin_rp: poinRp, poin_dapat: poinDapat,
    ongkir: ongkir, pajak: pajak, total: total, bayar: bayar, kembali: kembali, kurang: kurang,
    tier_lama: tierLama, settings: s
  };
}

/** Simpan transaksi lengkap (dipakai POS, order online, invoice service). */
function simpanTransaksi_(payload, ctx, opts) {
  opts = opts || {};
  var h = hitungTransaksi_(payload);
  var s = h.settings;
  var deduct = opts.deduct !== undefined ? opts.deduct : true;
  var status = str_(payload.status) || (opts.deduct === false ? 'MENUNGGU' : 'LUNAS');
  var tipe = str_(payload.tipe) || 'JUAL';

  // Pelanggan
  var cust = null;
  if (payload.customer && (payload.customer.wa || payload.customer.nama)) {
    cust = customerUpsert_(payload.customer);
  } else if (payload.customer_id) {
    cust = findById_(T.CUSTOMER, payload.customer_id);
  }

  var order = {
    id: nextId_(T.ORDER), tanggal: stamp_(), tipe: tipe,
    customer_id: cust ? cust.id : '', nama: cust ? cust.nama : str_(payload.nama) || 'Umum',
    wa: cust ? str_(cust.wa) : wa_(payload.wa), alamat: (cust && cust.alamat) || str_(payload.alamat),
    items: JSON.stringify(h.items),
    subtotal: h.subtotal, diskon: h.diskon,
    diskon_kode: h.promo.valid ? h.promo.kode : '', poin_pakai: h.poin_pakai, poin_dapat: h.poin_dapat,
    ongkir: h.ongkir, total: h.total, metode: str_(payload.metode) || 'TUNAI',
    bayar: h.bayar, kembali: h.kembali, status: status,
    kasir: ctx && ctx.user ? ctx.user.n : (str_(payload.kasir) || 'ONLINE'),
    catatan: str_(payload.catatan), dibuat: stamp_()
  };
  var saved = save_(T.ORDER, order);

  if (deduct) {
    applyStock_(h.items, 'OUT', saved.id, order.kasir, 'Penjualan ' + saved.id);
    if (cust) {
      awardPoints_(cust.id, h.poin_dapat - h.poin_pakai, (status === 'LUNAS' || tipe !== 'JUAL') ? h.total : 0);
    }
    if (h.promo.valid) {
      var pr = findBy_(T.PROMO, 'kode', h.promo.kode);
      if (pr) { save_(T.PROMO, { id: pr.id, terpakai: num_(pr.terpakai) + 1 }); }
    }
  } else if (cust) {
    // Order online: poin ditahan sampai dikonfirmasi
    save_(T.CUSTOMER, { id: cust.id, trx: num_(cust.trx) });
  }

  var view = orderView_(saved);
  return { order: view, hitung: h, customer: cust ? custView_(cust) : null };
}

function orderView_(o) {
  var c = o.customer_id ? findById_(T.CUSTOMER, o.customer_id) : null;
  return {
    id: str_(o.id), tanggal: str_(o.tanggal), tipe: str_(o.tipe),
    customer_id: str_(o.customer_id), nama: str_(o.nama), wa: str_(o.wa), alamat: str_(o.alamat),
    items: jsonv_(o.items, []), subtotal: num_(o.subtotal), diskon: num_(o.diskon),
    diskon_kode: str_(o.diskon_kode), poin_pakai: num_(o.poin_pakai), poin_dapat: num_(o.poin_dapat),
    ongkir: num_(o.ongkir), total: num_(o.total), metode: str_(o.metode),
    bayar: num_(o.bayar), kembali: num_(o.kembali), status: str_(o.status),
    kasir: str_(o.kasir), catatan: str_(o.catatan),
    tier: c ? str_(c.tier) : 'BRONZE',
    lunas: str_(o.status) === 'LUNAS', void: str_(o.status) === 'VOID'
  };
}
function custView_(c) {
  var t = tierMeta_(c.tier);
  return {
    id: str_(c.id), nama: str_(c.nama), wa: str_(c.wa), email: str_(c.email),
    alamat: str_(c.alamat), kota: str_(c.kota),
    total_belanja: num_(c.total_belanja), trx: num_(c.trx), poin: num_(c.poin),
    tier: str_(c.tier) || 'BRONZE', tier_info: t, catatan: str_(c.catatan), dibuat: str_(c.dibuat)
  };
}

/** Struk teks siap cetak / kirim WhatsApp. */
function struk_(order, s) {
  var L = [], W = 40;
  var pad = function (a, b) {
    a = str_(a); b = str_(b);
    var sp = Math.max(1, W - a.length - b.length);
    return a + new Array(sp + 1).join(' ') + b;
  };
  L.push(center_(str_(s.nama_toko).toUpperCase()));
  if (str_(s.alamat)) L.push(center_(s.alamat));
  if (str_(s.wa)) L.push(center_('WA ' + s.wa));
  L.push(rep_('-', W));
  L.push(pad('No ' + order.id, str_(order.tanggal).slice(0, 16)));
  L.push('Kasir : ' + order.kasir);
  if (order.nama) L.push('Pelanggan : ' + order.nama + (order.wa ? ' (' + order.wa + ')' : ''));
  L.push(rep_('-', W));
  order.items.forEach(function (it) {
    L.push(str_(it.nama).slice(0, W));
    L.push(pad('  ' + it.qty + ' x ' + rp_(it.harga), rp_(it.line)));
  });
  L.push(rep_('-', W));
  L.push(pad('Subtotal', rp_(order.subtotal)));
  if (order.diskon) L.push(pad('Diskon ' + (order.diskon_kode || ''), '-' + rp_(order.diskon)));
  if (order.poin_pakai) L.push(pad('Tukar poin (' + order.poin_pakai + ')', '-' + rp_(order.poin_pakai * num_(s.poin_nilai))));
  if (order.ongkir) L.push(pad('Ongkir', rp_(order.ongkir)));
  L.push(pad('TOTAL', rp_(order.total)));
  L.push(pad('Bayar (' + order.metode + ')', rp_(order.bayar)));
  L.push(pad('Kembali', rp_(order.kembali)));
  L.push(rep_('-', W));
  if (order.poin_dapat) L.push('Poin diperoleh : +' + order.poin_dapat);
  L.push(center_('Garansi resmi toko - simpan struk ini'));
  L.push(center_('Terima kasih telah berbelanja!'));
  L.push('');
  L.push(center_('Sarinadinet Commerce & POS'));
  return L.join('\n');
}
function center_(t) {
  t = str_(t); var W = 40, sp = Math.max(0, Math.floor((W - t.length) / 2));
  return new Array(sp + 1).join(' ') + t;
}
function rep_(ch, n) { return new Array(n + 1).join(ch); }

/** Isi template WhatsApp dengan variabel {kunci}. */
function renderTemplate_(tpl, vars) {
  return str_(tpl).replace(/\{(\w+)\}/g, function (m, k) {
    return vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m;
  });
}
function waLink_(nomor, teks) {
  return 'https://wa.me/' + str_(nomor).replace(/[^0-9]/g, '') + '?text=' + encodeURIComponent(teks);
}

/* ===========================================================================
 * 13. SERVICE (REPARASI)
 * ======================================================================== */
var SERVICE_FLOW = ['MASUK', 'ANTRI', 'DIAGNOSA', 'MENUNGGU_PART', 'DIKERJAKAN', 'SELESAI', 'DIAMBIL'];
function serviceView_(j) {
  var idx = SERVICE_FLOW.indexOf(str_(j.status));
  return {
    id: str_(j.id), tanggal: str_(j.tanggal), nama: str_(j.nama), wa: str_(j.wa),
    perangkat: str_(j.perangkat), kategori: str_(j.kategori), keluhan: str_(j.keluhan),
    mode: str_(j.mode), teknisi: str_(j.teknisi), status: str_(j.status),
    diagnosa: str_(j.diagnosa), estimasi: num_(j.estimasi), biaya: num_(j.biaya),
    parts: jsonv_(j.parts, []), garansi: str_(j.garansi), catatan: str_(j.catatan),
    diubah: str_(j.diubah), step: idx < 0 ? 0 : idx, total_step: SERVICE_FLOW.length,
    progres: idx < 0 ? 0 : Math.round(((idx + 1) / SERVICE_FLOW.length) * 100)
  };
}

/* ===========================================================================
 * 14. TRADE-IN (TUKAR TAMBAH)
 * ======================================================================== */
var TRADEIN_FAKTOR_TAHUN = [
  { max: 1, f: 0.78 }, { max: 2, f: 0.68 }, { max: 3, f: 0.58 },
  { max: 4, f: 0.48 }, { max: 5, f: 0.38 }, { max: 7, f: 0.28 }, { max: 99, f: 0.18 }
];
var TRADEIN_KONDISI = {
  MULUS:    { f: 1.00, label: 'Mulus seperti baru', desc: 'Tanpa lecet, fungsi 100% normal' },
  BAIK:     { f: 0.90, label: 'Baik', desc: 'Lecet halus, semua fungsi normal' },
  NORMAL:   { f: 0.78, label: 'Normal / pemakaian', desc: 'Ada lecet wajar, fungsi normal' },
  MINUS:    { f: 0.62, label: 'Ada minus', desc: 'Misal LCD/termal/keyboard bermasalah' },
  RUSAK:    { f: 0.42, label: 'Rusak berat', desc: 'Mati total / butuh perbaikan besar' }
};
function estimasiTradeIn_(input) {
  var s = settings_();
  var harga = num_(input.harga_beli_dulu || input.harga);
  var tahunBeli = num_(input.tahun) || (new Date().getFullYear());
  var umur = Math.max(0, new Date().getFullYear() - tahunBeli);
  var fTahun = TRADEIN_FAKTOR_TAHUN[0].f;
  for (var i = 0; i < TRADEIN_FAKTOR_TAHUN.length; i++) {
    if (umur <= TRADEIN_FAKTOR_TAHUN[i].max) { fTahun = TRADEIN_FAKTOR_TAHUN[i].f; break; }
  }
  var kondisi = str_(input.kondisi).toUpperCase();
  var k = TRADEIN_KONDISI[kondisi] || TRADEIN_KONDISI.NORMAL;
  var brand = str_(input.brand).toLowerCase();
  var bonusBrand = /apple|mac|asus rog|lenovo legion|msi|thinkpad|dell xps/.test(brand) ? 1.08 : 1;
  var kategori = str_(input.kategori).toLowerCase();
  var bonusKategori = kategori === 'laptop' ? 1.05 : kategori === 'komponen' ? 0.9 : 1;

  var base = harga * fTahun * k.f * bonusBrand * bonusKategori;
  var lo = Math.round(base * 0.92 / 1000) * 1000;
  var hi = Math.round(base * 1.06 / 1000) * 1000;
  var bonusPct = num_(s.tradein_bonus_pct) || 5;
  var bonusRp = Math.round(hi * bonusPct / 100 / 1000) * 1000;
  var hargaBaru = num_(input.harga_baru);
  var rekomendasi = [];
  if (hargaBaru > 0) {
    var tambah = Math.max(0, hargaBaru - hi);
    rekomendasi.push({ label: 'Tukar dengan unit senilai ' + rp_(hargaBaru), tambahan: tambah, sisa: Math.max(0, tambah - bonusRp) });
  }
  return {
    aktif: bool_(s.tradein_aktif),
    harga_beli_dulu: harga, umur_tahun: umur, faktor_tahun: fTahun,
    kondisi: kondisi || 'NORMAL', kondisi_label: k.label, faktor_kondisi: k.f,
    bonus_brand: bonusBrand, bonus_kategori: bonusKategori,
    estimasi_lo: lo, estimasi_hi: hi,
    bonus_pct: bonusPct, bonus_rp: bonusRp,
    nilai_maksimal: hi + bonusRp,
    rekomendasi: rekomendasi,
    syarat: [
      'Unit berfungsi normal sesuai kondisi yang dideklarasikan.',
      'Wajib dilengkapi charger/original accessories bila ada.',
      'Harga final ditentukan setelah verifikasi teknisi di toko.',
      'Tidak menerima unit blacklist / hasil kejahatan (wajib KTP).'
    ]
  };
}

/* ===========================================================================
 * 15. PURCHASE ORDER (PENGADAAN)
 * ======================================================================== */
function poView_(po) {
  return {
    id: str_(po.id), tanggal: str_(po.tanggal), supplier: str_(po.supplier), wa: str_(po.wa),
    items: jsonv_(po.items, []), total: num_(po.total), status: str_(po.status),
    eta: str_(po.eta), diterima_pada: str_(po.diterima_pada), catatan: str_(po.catatan),
    oleh: str_(po.oleh), dibuat: str_(po.dibuat)
  };
}

/* ===========================================================================
 * 16. DASHBOARD & ANALITIK
 * ======================================================================== */
function ordersLunas_() {
  return rows_(T.ORDER).filter(function (o) {
    var st = str_(o.status).toUpperCase();
    return st === 'LUNAS' || st === 'SELESAI' || st === 'DIAMBIL';
  });
}

function stats_(p) {
  var s = settings_(), cache = cache_(), key = 'dash_stats_' + dayKey_();
  var hit = cache.get(key);
  if (hit && !bool_(p.fresh)) { try { return JSON.parse(hit); } catch (x) {} }

  var orders = ordersLunas_();
  var today = dayKey_(), thisMonth = monthKey_();
  var yDate = new Date(); yDate.setDate(yDate.getDate() - 1);
  var yesterday = dayKey_(yDate);
  var pm = new Date(); pm.setDate(1); pm.setMonth(pm.getMonth() - 1);
  var prevMonth = monthKey_(pm);

  var agg = function (list) {
    var o = { trx: list.length, omzet: 0, hpp: 0, laba: 0, qty: 0, poin: 0 };
    list.forEach(function (r) {
      o.omzet += num_(r.total); o.poin += num_(r.poin_dapat);
      var items = jsonv_(r.items, []);
      items.forEach(function (it) { o.hpp += num_(it.hpp) * num_(it.qty); o.qty += num_(it.qty); });
    });
    o.laba = o.omzet - o.hpp;
    o.margin_pct = o.omzet > 0 ? Math.round((o.laba / o.omzet) * 100) : 0;
    o.rata = o.trx > 0 ? Math.round(o.omzet / o.trx) : 0;
    return o;
  };
  var byDay = function (d) { return orders.filter(function (o) { return str_(o.tanggal).slice(0, 10) === d; }); };
  var byMonth = function (m) { return orders.filter(function (o) { return str_(o.tanggal).slice(0, 7) === m; }); };

  var prods = rows_(T.PRODUCT);
  var nilaiStok = 0, nilaiJualStok = 0, lowStock = [], habis = 0;
  prods.forEach(function (pr) {
    var st = num_(pr.stok), min = num_(pr.stok_min) || APP.LOW_STOCK_DEFAULT;
    nilaiStok += num_(pr.harga_beli) * st;
    nilaiJualStok += num_(pr.harga) * st;
    if (st <= 0) habis++;
    else if (st <= min) lowStock.push({ sku: str_(pr.sku), nama: str_(pr.nama), stok: st, min: min });
  });
  lowStock.sort(function (a, b) { return a.stok - b.stok; });

  var jobs = rows_(T.SERVICE);
  var svcAktif = jobs.filter(function (j) {
    var st = str_(j.status).toUpperCase();
    return SERVICE_FLOW.indexOf(st) > -1 && st !== 'DIAMBIL';
  });
  var ti = rows_(T.TRADEIN);
  var tiPending = ti.filter(function (t) { return str_(t.status).toUpperCase() === 'BARU'; });
  var pendingOrders = rows_(T.ORDER).filter(function (o) { return str_(o.status).toUpperCase() === 'MENUNGGU'; });

  var out = {
    hari_ini: agg(byDay(today)),
    kemarin: agg(byDay(yesterday)),
    bulan_ini: agg(byMonth(thisMonth)),
    bulan_lalu: agg(byMonth(prevMonth)),
    total: agg(orders),
    inventori: {
      sku: prods.length, unit: prods.reduce(function (a, b) { return a + num_(b.stok); }, 0),
      nilai_modal: nilaiStok, nilai_jual: nilaiJualStok,
      potensi_laba: nilaiJualStok - nilaiStok, habis: habis,
      menipis: lowStock.length, daftar_menipis: lowStock.slice(0, 8)
    },
    service: {
      aktif: svcAktif.length, selesai_bulan_ini: jobs.filter(function (j) {
        return str_(j.status).toUpperCase() === 'SELESAI' && str_(j.diubah).slice(0, 7) === thisMonth;
      }).length,
      nilai_berjalan: svcAktif.reduce(function (a, b) { return a + num_(b.biaya); }, 0)
    },
    tradein_menunggu: tiPending.length,
    order_menunggu: pendingOrders.length,
    pelanggan: rows_(T.CUSTOMER).length,
    pelanggan_baru_bulan_ini: rows_(T.CUSTOMER).filter(function (c) { return str_(c.dibuat).slice(0, 7) === thisMonth; }).length,
    po_terbuka: rows_(T.PO).filter(function (po) { return ['DRAFT', 'DIKIRIM', 'DITERIMA_SEBAGIAN'].indexOf(str_(po.status).toUpperCase()) > -1; }).length,
    target_bulanan: num_(s.target_bulanan) || 0,
    dihitung_pada: nowIso_()
  };
  try { cache.put(key, JSON.stringify(out), 90); } catch (x) {}
  return out;
}

function charts_(p) {
  var days = Math.max(7, Math.min(90, num_(p.hari) || 14));
  var orders = ordersLunas_();
  var serie = [], labels = [];
  for (var i = days - 1; i >= 0; i--) {
    var d = new Date(); d.setDate(d.getDate() - i);
    var k = dayKey_(d);
    var list = orders.filter(function (o) { return str_(o.tanggal).slice(0, 10) === k; });
    var omzet = list.reduce(function (a, b) { return a + num_(b.total); }, 0);
    var hpp = 0, qty = 0;
    list.forEach(function (r) {
      jsonv_(r.items, []).forEach(function (it) { hpp += num_(it.hpp) * num_(it.qty); qty += num_(it.qty); });
    });
    labels.push(Utilities.formatDate(d, APP.TZ, 'dd MMM'));
    serie.push({ tanggal: k, omzet: omzet, laba: omzet - hpp, trx: list.length, qty: qty });
  }

  // Top produk
  var map = {};
  orders.forEach(function (o) {
    jsonv_(o.items, []).forEach(function (it) {
      var k = str_(it.sku);
      if (!map[k]) map[k] = { sku: k, nama: str_(it.nama), qty: 0, omzet: 0, laba: 0, gambar: str_(it.gambar) };
      map[k].qty += num_(it.qty);
      map[k].omzet += num_(it.line) || num_(it.harga) * num_(it.qty);
      map[k].laba += (num_(it.harga) - num_(it.hpp)) * num_(it.qty);
    });
  });
  var top = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.qty - a.qty; }).slice(0, 10);

  // Kategori
  var kat = {};
  orders.forEach(function (o) {
    jsonv_(o.items, []).forEach(function (it) {
      var k = str_(it.kategori) || 'Lainnya';
      kat[k] = (kat[k] || 0) + (num_(it.line) || num_(it.harga) * num_(it.qty));
    });
  });

  // Metode bayar
  var metode = {};
  orders.forEach(function (o) { var m = str_(o.metode) || 'TUNAI'; metode[m] = (metode[m] || 0) + num_(o.total); });

  // Performa staf
  var staf = {};
  orders.forEach(function (o) {
    var k = str_(o.kasir) || '-';
    if (!staf[k]) staf[k] = { nama: k, trx: 0, omzet: 0 };
    staf[k].trx++; staf[k].omzet += num_(o.total);
  });

  // Tipe transaksi
  var tipe = {};
  orders.forEach(function (o) { var t = str_(o.tipe) || 'JUAL'; tipe[t] = (tipe[t] || 0) + 1; });

  // Jam sibuk
  var jam = new Array(24).fill(0);
  orders.forEach(function (o) {
    var h = parseInt(str_(o.tanggal).slice(11, 13), 10);
    if (h >= 0 && h < 24) jam[h] += num_(o.total);
  });

  return {
    tren: { labels: labels, data: serie },
    top_produk: top,
    kategori: Object.keys(kat).map(function (k) { return { label: k, value: kat[k] }; }).sort(function (a, b) { return b.value - a.value; }),
    metode: Object.keys(metode).map(function (k) { return { label: k, value: metode[k] }; }).sort(function (a, b) { return b.value - a.value; }),
    staf: Object.keys(staf).map(function (k) { return staf[k]; }).sort(function (a, b) { return b.omzet - a.omzet; }).slice(0, 8),
    tipe: Object.keys(tipe).map(function (k) { return { label: k, value: tipe[k] }; }),
    jam: jam
  };
}

/* ===========================================================================
 * 17. HANDLER PUBLIK
 * ======================================================================== */
function apiPing_(ctx) {
  return { ok: true, data: { status: 'online', name: APP.NAME, version: APP.VERSION, waktu: nowIso_(),
    sheet: (function () { try { return ss_().getName(); } catch (x) { return null; } })() } };
}

function h_public_bootstrap(ctx) {
  var s = settings_();
  var prods = tblCached_(T.PRODUCT, 120).rows.map(productView_);
  var aktif = prods.filter(function (p) { return p.status === 'AKTIF'; });
  var kat = {}, brand = {};
  aktif.forEach(function (p) {
    if (p.kategori) kat[p.kategori] = (kat[p.kategori] || 0) + 1;
    if (p.brand) brand[p.brand] = (brand[p.brand] || 0) + 1;
  });
  var testi = rows_(T.TESTI).filter(function (t) { return bool_(t.aktif); })
    .sort(function (a, b) { return num_(a.urutan) - num_(b.urutan); })
    .map(function (t) { return { id: t.id, nama: t.nama, kota: t.kota, rating: num_(t.rating) || 5, pesan: t.pesan, avatar: t.avatar, produk: t.produk }; });
  var banner = rows_(T.BANNER).filter(function (b) { return bool_(b.aktif); })
    .sort(function (a, b) { return num_(a.urutan) - num_(b.urutan); });
  var promo = rows_(T.PROMO).filter(function (p) { return bool_(p.aktif); }).map(function (p) {
    return { kode: p.kode, judul: p.judul, tipe: p.tipe, nilai: num_(p.nilai), min_belanja: num_(p.min_belanja),
      maks_diskon: num_(p.maks_diskon), akhir: p.akhir };
  });
  return {
    data: {
      toko: s, kategori: Object.keys(kat).sort(), brand: Object.keys(brand).sort(),
      statistik: {
        total_produk: aktif.length, total_unit: aktif.reduce(function (a, b) { return a + b.stok; }, 0),
        siap_kirim: aktif.filter(function (p) { return !p.habis; }).length,
        kategori: Object.keys(kat).length
      },
      unggulan: aktif.filter(function (p) { return p.unggulan; }).slice(0, 8),
      terbaru: aktif.slice(0, 8),
      diskon: aktif.filter(function (p) { return p.diskon > 0; }).sort(function (a, b) { return b.diskon - a.diskon; }).slice(0, 8),
      testimoni: testi, banner: banner, promo: promo,
      tier: ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM'].map(function (t) { return Object.assign({ kode: t }, tierMeta_(t),
        { ambang: num_(t === 'SILVER' ? s.tier_silver : t === 'GOLD' ? s.tier_gold : t === 'PLATINUM' ? s.tier_platinum : 0) }); })
    }
  };
}

function h_public_products(ctx) {
  var p = ctx.params;
  var all = tblCached_(T.PRODUCT, 120).rows.map(productView_).filter(function (x) { return x.status === 'AKTIF'; });
  var q = str_(p.q).toLowerCase().trim();
  if (q) {
    all = all.filter(function (x) {
      return (x.nama + ' ' + x.sku + ' ' + x.brand + ' ' + x.kategori + ' ' + x.tags + ' ' + x.deskripsi).toLowerCase().indexOf(q) > -1;
    });
  }
  if (p.kategori && p.kategori !== 'ALL') all = all.filter(function (x) { return x.kategori.toLowerCase() === str_(p.kategori).toLowerCase(); });
  if (p.brand && p.brand !== 'ALL') all = all.filter(function (x) { return x.brand.toLowerCase() === str_(p.brand).toLowerCase(); });
  if (p.kondisi && p.kondisi !== 'ALL') all = all.filter(function (x) { return x.kondisi.toUpperCase() === str_(p.kondisi).toUpperCase(); });
  if (p.tipe && p.tipe !== 'ALL') all = all.filter(function (x) { return x.tipe.toUpperCase() === str_(p.tipe).toUpperCase(); });
  if (bool_(p.diskon)) all = all.filter(function (x) { return x.diskon > 0; });
  if (bool_(p.tersedia)) all = all.filter(function (x) { return !x.habis; });
  if (p.min) all = all.filter(function (x) { return x.harga >= num_(p.min); });
  if (p.max) all = all.filter(function (x) { return x.harga <= num_(p.max); });

  var sort = str_(p.sort) || 'populer';
  var sorters = {
    terbaru: function (a, b) { return str_(b.id).localeCompare(str_(a.id)); },
    termurah: function (a, b) { return a.harga - b.harga; },
    termahal: function (a, b) { return b.harga - a.harga; },
    diskon: function (a, b) { return b.diskon - a.diskon; },
    nama: function (a, b) { return a.nama.localeCompare(b.nama); },
    stok: function (a, b) { return b.stok - a.stok; },
    populer: function (a, b) { return (b.unggulan ? 1 : 0) - (a.unggulan ? 1 : 0) || b.poin - a.poin; }
  };
  all.sort(sorters[sort] || sorters.populer);

  var pg = paging_(all, { page: p.page, limit: p.limit || 12 });
  return { data: pg.rows, meta: Object.assign({ sort: sort }, pg.meta) };
}

function h_public_product(ctx) {
  var key = str_(ctx.params.sku || ctx.params.id);
  var p = findBy_(T.PRODUCT, 'sku', key) || findById_(T.PRODUCT, key);
  if (!p) throw err_('NOT_FOUND', 'Produk tidak ditemukan');
  var view = productView_(p);
  var rel = tblCached_(T.PRODUCT, 120).rows.map(productView_)
    .filter(function (x) { return x.status === 'AKTIF' && x.id !== view.id && (x.kategori === view.kategori || x.brand === view.brand); })
    .slice(0, 8);
  if (view.tipe === 'BUNDLE') view.komponen = explodeBom_(p);
  return { data: view, meta: { terkait: rel } };
}

function h_public_stock_check(ctx) {
  var items = jsonv_(ctx.params.items, []);
  if (typeof items === 'string') items = jsonv_(items, []);
  var out = [], ok = true;
  (items || []).forEach(function (it) {
    var key = str_(it.sku || it.id), qty = num_(it.qty) || 1;
    var p = findBy_(T.PRODUCT, 'sku', key) || findById_(T.PRODUCT, key);
    if (!p) { out.push({ sku: key, ok: false, tersedia: 0, pesan: 'Produk tidak ditemukan' }); ok = false; return; }
    var v = productView_(p);
    var bisa = str_(v.tipe) === 'BUNDLE' ? maxBuildable_(p) : v.stok;
    var cukup = bisa >= qty;
    if (!cukup) ok = false;
    out.push({ sku: v.sku, id: v.id, nama: v.nama, diminta: qty, tersedia: bisa, ok: cukup,
      pesan: cukup ? 'Tersedia' : 'Stok tersisa ' + bisa, harga: v.harga, gambar: v.gambar, tipe: v.tipe });
  });
  return { data: { ok: ok, items: out } };
}

function h_public_promo_check(ctx) { return { data: promoCheck_(ctx.params.kode, ctx.params.subtotal) }; }

function h_public_order_create(ctx) {
  var p = ctx.params;
  var res = simpanTransaksi_({
    items: jsonv_(p.items, []), promo: p.promo, diskon_manual: p.diskon_manual,
    ongkir: p.ongkir, poin_pakai: p.poin_pakai,
    customer: { nama: p.nama, wa: p.wa, email: p.email, alamat: p.alamat, kota: p.kota, catatan: p.catatan },
    metode: p.metode || 'TRANSFER', bayar: 0, tipe: 'JUAL', status: 'MENUNGGU',
    catatan: p.catatan, kasir: 'ONLINE'
  }, null, { deduct: false });
  var s = settings_();
  var items = res.order.items.map(function (i) { return '- ' + i.nama + ' (' + i.qty + 'x) ' + rp_(i.harga * i.qty); }).join('\n');
  var teks = renderTemplate_(s.wa_template_order, {
    toko: s.nama_toko, items: items, total: rp_(res.order.total), nama: res.order.nama,
    wa: res.order.wa, alamat: res.order.alamat || '-', kode: res.order.id,
    subtotal: rp_(res.order.subtotal), diskon: rp_(res.order.diskon)
  });
  logAudit_(res.order.nama, 'pelanggan', 'ORDER_ONLINE', 'ORDER', res.order.id, rp_(res.order.total));
  return { data: { order: res.order, wa: waLink_(s.wa, teks), pesan: 'Pesanan dibuat. Lanjutkan konfirmasi via WhatsApp.' } };
}

function h_public_track(ctx) {
  var q = str_(ctx.params.q || ctx.params.kode).trim();
  if (!q) throw err_('BAD_REQUEST', 'Masukkan kode transaksi atau nomor WhatsApp');
  var s = settings_(), found = { orders: [], services: [], tradein: [] };
  var qq = q.toUpperCase(), wq = wa_(q);
  rows_(T.ORDER).forEach(function (o) {
    if (str_(o.id).toUpperCase() === qq || (wq && wa_(o.wa) === wq)) found.orders.push(orderView_(o));
  });
  rows_(T.SERVICE).forEach(function (j) {
    if (str_(j.id).toUpperCase() === qq || wa_(j.wa) === wq) found.services.push(serviceView_(j));
  });
  rows_(T.TRADEIN).forEach(function (t) {
    if (str_(t.id).toUpperCase() === qq || wa_(t.wa) === wq) found.tradein.push(tradeinView_(t));
  });
  var empty = !found.orders.length && !found.services.length && !found.tradein.length;
  return { data: found, meta: { kosong: empty, kode: q,
    help: empty ? 'Data tidak ditemukan. Pastikan kode benar atau hubungi WA ' + s.wa : '' } };
}

function h_public_testimonials(ctx) { return { data: h_public_bootstrap(ctx).data.testimoni }; }

function h_public_service_apply(ctx) {
  var p = ctx.params, s = settings_();
  if (!str_(p.nama) || !str_(p.wa) || !str_(p.perangkat)) {
    throw err_('BAD_REQUEST', 'Nama, WhatsApp, dan perangkat wajib diisi');
  }
  var job = save_(T.SERVICE, {
    id: nextId_(T.SERVICE), tanggal: stamp_(), nama: str_(p.nama), wa: wa_(p.wa),
    perangkat: str_(p.perangkat), kategori: str_(p.kategori) || 'Laptop',
    keluhan: str_(p.keluhan), mode: str_(p.mode) || 'BAWA_KE_TOKO',
    teknisi: '', status: 'MASUK', diagnosa: '', estimasi: 0, biaya: 0,
    parts: '[]', garansi: str_(p.garansi) || '30 hari', catatan: str_(p.catatan), diubah: stamp_()
  });
  var teks = renderTemplate_(s.wa_template_service, {
    toko: s.nama_toko, perangkat: job.perangkat, keluhan: job.keluhan,
    nama: job.nama, wa: job.wa, kode: job.id, mode: job.mode
  });
  logAudit_(job.nama, 'pelanggan', 'SERVICE_APPLY', 'SERVICE', job.id, job.perangkat);
  return { data: { service: serviceView_(job), wa: waLink_(s.wa, teks) } };
}

function h_public_tradein_estimate(ctx) {
  var e = estimasiTradeIn_(ctx.params);
  logAudit_(str_(ctx.params.nama) || 'publik', 'pelanggan', 'TRADEIN_ESTIMASI', 'TRADEIN', '', str_(ctx.params.perangkat));
  return { data: e, meta: { kondisi: Object.keys(TRADEIN_KONDISI).map(function (k) {
    return Object.assign({ kode: k }, TRADEIN_KONDISI[k]); }) } };
}

function tradeinView_(t) {
  return {
    id: str_(t.id), tanggal: str_(t.tanggal), nama: str_(t.nama), wa: str_(t.wa),
    perangkat: str_(t.perangkat), kategori: str_(t.kategori), tahun: num_(t.tahun),
    kondisi: str_(t.kondisi), harga_beli_dulu: num_(t.harga_beli_dulu),
    estimasi_lo: num_(t.estimasi_lo), estimasi_hi: num_(t.estimasi_hi), bonus: num_(t.bonus),
    penawaran: num_(t.penawaran), status: str_(t.status), produk_id: str_(t.produk_id),
    catatan: str_(t.catatan), dibuat: str_(t.dibuat)
  };
}

function h_public_tradein_apply(ctx) {
  var p = ctx.params, s = settings_();
  if (!str_(p.nama) || !str_(p.wa) || !str_(p.perangkat)) throw err_('BAD_REQUEST', 'Nama, WhatsApp, dan perangkat wajib diisi');
  var e = estimasiTradeIn_(p);
  var rec = save_(T.TRADEIN, {
    id: nextId_(T.TRADEIN), tanggal: stamp_(), nama: str_(p.nama), wa: wa_(p.wa),
    perangkat: str_(p.perangkat), kategori: str_(p.kategori) || 'Laptop',
    tahun: num_(p.tahun), kondisi: str_(p.kondisi) || 'NORMAL',
    harga_beli_dulu: num_(p.harga_beli_dulu), estimasi_lo: e.estimasi_lo, estimasi_hi: e.estimasi_hi,
    bonus: e.bonus_rp, penawaran: e.estimasi_hi, status: 'BARU', produk_id: '',
    catatan: str_(p.catatan), dibuat: stamp_()
  });
  var teks = renderTemplate_(s.wa_template_tradein, {
    toko: s.nama_toko, perangkat: rec.perangkat, tahun: rec.tahun, kondisi: rec.kondisi,
    harga: rp_(rec.harga_beli_dulu), estimasi: rp_(e.estimasi_lo) + ' - ' + rp_(e.estimasi_hi),
    nama: rec.nama, kode: rec.id
  });
  logAudit_(rec.nama, 'pelanggan', 'TRADEIN_APPLY', 'TRADEIN', rec.id, rec.perangkat);
  return { data: { tradein: tradeinView_(rec), estimasi: e, wa: waLink_(s.wa, teks) } };
}

function h_public_lead(ctx) {
  var p = ctx.params;
  var note = 'LEAD/' + str_(p.tipe || 'NEWSLETTER') + ' : ' + str_(p.pesan || '');
  save_(T.CUSTOMER, {
    id: nextId_(T.CUSTOMER), nama: str_(p.nama) || 'Prospek', wa: wa_(p.wa) || ('-' + Date.now()),
    email: str_(p.email), alamat: '', kota: str_(p.kota), total_belanja: 0, trx: 0, poin: 0,
    tier: 'BRONZE', catatan: note, dibuat: stamp_(), diubah: stamp_()
  });
  logAudit_(str_(p.nama) || 'publik', 'pelanggan', 'LEAD', 'CUSTOMER', '', note);
  return { data: { pesan: 'Terima kasih! Tim kami akan menghubungi Anda.' } };
}

/* ===========================================================================
 * 18. HANDLER AUTH
 * ======================================================================== */
function h_auth_login(ctx) {
  var p = ctx.params;
  var pin = str_(p.pin).trim();
  var nama = str_(p.nama).trim();
  if (!pin || pin.length < 4) throw err_('BAD_REQUEST', 'PIN minimal 4 digit');
  var staffs = rows_(T.STAFF).filter(function (s) { return bool_(s.aktif); });
  var found = null;
  if (nama) {
    var kandidat = staffs.filter(function (s) { return str_(s.nama).toLowerCase() === nama.toLowerCase(); });
    for (var i = 0; i < kandidat.length; i++) {
      if (hashPin_(pin, kandidat[i].pin_salt) === str_(kandidat[i].pin_hash)) { found = kandidat[i]; break; }
    }
  }
  if (!found) {
    for (var j = 0; j < staffs.length; j++) {
      if (hashPin_(pin, staffs[j].pin_salt) === str_(staffs[j].pin_hash)) { found = staffs[j]; break; }
    }
  }
  if (!found) {
    logAudit_(nama || 'unknown', 'guest', 'LOGIN_GAGAL', 'STAFF', '', 'PIN salah');
    throw err_('UNAUTHORIZED', 'PIN salah. Coba lagi atau hubungi Owner.');
  }
  var tk = issueToken_(found);
  save_(T.STAFF, { id: found.id, last_login: stamp_() });
  logAudit_(found.nama, found.role, 'LOGIN', 'STAFF', found.id, 'Berhasil login');
  return { data: {
    token: tk.token, exp: tk.exp, ttl: tk.ttl,
    user: { id: found.id, nama: found.nama, role: found.role, wa: found.wa },
    toko: (function () { var s = settings_(); return { nama: s.nama_toko, wa: s.wa, alamat: s.alamat, kota: s.kota }; })()
  }};
}

function h_auth_me(ctx) {
  var u = ctx.user;
  var st = findById_(T.STAFF, u.id);
  return { data: { user: { id: u.id, nama: u.n, role: u.r, wa: u.wa, last_login: st ? st.last_login : '' },
    exp: u.e, sisa_detik: u.e - Math.floor(Date.now() / 1000) } };
}

function h_auth_logout(ctx) { audit_(ctx, 'LOGOUT', 'STAFF', ctx.user.id, ''); return { data: { pesan: 'Sesi diakhiri' } }; }

function h_auth_change_pin(ctx) {
  var p = ctx.params, st = findById_(T.STAFF, ctx.user.id);
  if (hashPin_(str_(p.pin_lama), st.pin_salt) !== str_(st.pin_hash)) throw err_('UNAUTHORIZED', 'PIN lama salah');
  if (str_(p.pin_baru).length < 4) throw err_('BAD_REQUEST', 'PIN baru minimal 4 digit');
  var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  save_(T.STAFF, { id: st.id, pin_hash: hashPin_(p.pin_baru, salt), pin_salt: salt });
  audit_(ctx, 'UBAH_PIN', 'STAFF', st.id, '');
  return { data: { pesan: 'PIN berhasil diubah' } };
}

/* ===========================================================================
 * 19. HANDLER POS / KASIR
 * ======================================================================== */
function h_pos_lookup(ctx) {
  var q = str_(ctx.params.q).trim().toLowerCase();
  var all = tblCached_(T.PRODUCT, 60).rows.map(productFull_).filter(function (p) { return p.status === 'AKTIF'; });
  var rowsOut = all;
  if (q) {
    if (ctx.params.exact) {
      rowsOut = all.filter(function (p) { return p.sku.toLowerCase() === q; });
    } else {
      rowsOut = all.filter(function (p) {
        return (p.nama + ' ' + p.sku + ' ' + p.brand + ' ' + p.tags + ' ' + p.kategori).toLowerCase().indexOf(q) > -1;
      });
    }
  }
  rowsOut = rowsOut.sort(function (a, b) {
    if (q) {
      var as = a.sku.toLowerCase() === q ? 0 : (a.nama.toLowerCase().indexOf(q) === 0 ? 1 : 2);
      var bs = b.sku.toLowerCase() === q ? 0 : (b.nama.toLowerCase().indexOf(q) === 0 ? 1 : 2);
      if (as !== bs) return as - bs;
    }
    return a.nama.localeCompare(b.nama);
  }).slice(0, num_(ctx.params.limit) || 24);
  return { data: rowsOut };
}

function h_pos_checkout(ctx) {
  var p = ctx.params;
  var res = simpanTransaksi_(p, ctx, { deduct: true });
  var s = settings_();
  var struk = struk_(res.order, s);
  audit_(ctx, 'CHECKOUT', 'ORDER', res.order.id, res.order.total + ' / ' + res.order.metode);
  return { data: {
    order: res.order, hitung: {
      subtotal: res.hitung.subtotal, diskon: res.hitung.diskon, poin_pakai: res.hitung.poin_pakai,
      poin_rp: res.hitung.poin_rp, poin_dapat: res.hitung.poin_dapat, ongkir: res.hitung.ongkir,
      pajak: res.hitung.pajak, total: res.hitung.total, bayar: res.hitung.bayar, kembali: res.hitung.kembali
    },
    customer: res.customer, struk: struk,
    wa_struk: waLink_(res.order.wa, struk)
  }};
}

function h_pos_pay(ctx) {
  var p = ctx.params;
  var o = findById_(T.ORDER, p.id);
  if (!o) throw err_('NOT_FOUND', 'Transaksi tidak ditemukan');
  if (str_(o.status).toUpperCase() === 'LUNAS') throw err_('BAD_REQUEST', 'Transaksi sudah lunas');
  if (str_(o.status).toUpperCase() === 'VOID') throw err_('BAD_REQUEST', 'Transaksi sudah dibatalkan');
  var h = hitungTransaksi_({ items: jsonv_(o.items, []), ongkir: o.ongkir, promo: o.diskon_kode,
    diskon_manual: num_(o.diskon) - (o.diskon_kode ? num_(promoCheck_(o.diskon_kode, o.subtotal).diskon) : 0) });
  var bayar = num_(p.bayar) || h.total;
  var order = orderView_(o);
  var upd = save_(T.ORDER, { id: o.id, status: 'LUNAS', metode: str_(p.metode) || o.metode,
    bayar: bayar, kembali: Math.max(0, bayar - num_(o.total)) });
  applyStock_(jsonv_(o.items, []), 'OUT', o.id, ctx.user.n, 'Pelunasan ' + o.id);
  if (o.customer_id) awardPoints_(o.customer_id, num_(o.poin_dapat) - num_(o.poin_pakai), num_(o.total));
  audit_(ctx, 'PELUNASAN', 'ORDER', o.id, rp_(num_(o.total)));
  var s = settings_();
  var view = orderView_(upd);
  return { data: { order: view, struk: struk_(view, s), wa_struk: waLink_(view.wa, struk_(view, s)) } };
}

function h_order_void(ctx) {
  var o = findById_(T.ORDER, ctx.params.id);
  if (!o) throw err_('NOT_FOUND', 'Transaksi tidak ditemukan');
  if (str_(o.status).toUpperCase() === 'VOID') throw err_('BAD_REQUEST', 'Transaksi sudah VOID');
  if (!str_(ctx.params.alasan)) throw err_('BAD_REQUEST', 'Alasan void wajib diisi');
  if (str_(o.status).toUpperCase() === 'LUNAS') {
    applyStock_(jsonv_(o.items, []), 'IN', o.id, ctx.user.n, 'VOID ' + o.id);
    if (o.customer_id) awardPoints_(o.customer_id, num_(o.poin_pakai) - num_(o.poin_dapat), -num_(o.total));
  }
  save_(T.ORDER, { id: o.id, status: 'VOID', catatan: str_(o.catatan) + ' | VOID: ' + str_(ctx.params.alasan) });
  audit_(ctx, 'VOID', 'ORDER', o.id, str_(ctx.params.alasan));
  return { data: { pesan: 'Transaksi ' + o.id + ' dibatalkan', order: orderView_(findById_(T.ORDER, o.id)) } };
}

function h_order_list(ctx) {
  var p = ctx.params;
  var all = rows_(T.ORDER).map(orderView_);
  if (p.q) { var q = str_(p.q).toLowerCase(); all = all.filter(function (o) { return (o.id + o.nama + o.wa + o.kasir).toLowerCase().indexOf(q) > -1; }); }
  if (p.status && p.status !== 'ALL') all = all.filter(function (o) { return o.status.toUpperCase() === str_(p.status).toUpperCase(); });
  if (p.tipe && p.tipe !== 'ALL') all = all.filter(function (o) { return o.tipe.toUpperCase() === str_(p.tipe).toUpperCase(); });
  if (p.dari) all = all.filter(function (o) { return str_(o.tanggal).slice(0, 10) >= str_(p.dari); });
  if (p.sampai) all = all.filter(function (o) { return str_(o.tanggal).slice(0, 10) <= str_(p.sampai); });
  all.sort(function (a, b) { return str_(b.tanggal).localeCompare(str_(a.tanggal)); });
  var ringkas = {
    trx: all.length, omzet: all.reduce(function (a, b) { return a + (b.void ? 0 : b.total); }, 0),
    lunas: all.filter(function (o) { return o.lunas; }).length,
    menunggu: all.filter(function (o) { return o.status === 'MENUNGGU'; }).length,
    void: all.filter(function (o) { return o.void; }).length
  };
  var pg = paging_(all, { page: p.page, limit: p.limit || 20 });
  return { data: pg.rows, meta: Object.assign({ ringkas: ringkas }, pg.meta) };
}

function h_order_get(ctx) {
  var o = findById_(T.ORDER, ctx.params.id);
  if (!o) throw err_('NOT_FOUND', 'Transaksi tidak ditemukan');
  var s = settings_();
  var view = orderView_(o);
  return { data: view, meta: { struk: struk_(view, s), wa_struk: waLink_(view.wa, struk_(view, s)) } };
}

function h_order_confirm(ctx) {
  var o = findById_(T.ORDER, ctx.params.id);
  if (!o) throw err_('NOT_FOUND', 'Transaksi tidak ditemukan');
  if (str_(o.status).toUpperCase() !== 'MENUNGGU') throw err_('BAD_REQUEST', 'Status transaksi bukan MENUNGGU');
  applyStock_(jsonv_(o.items, []), 'OUT', o.id, ctx.user.n, 'Konfirmasi order online');
  if (o.customer_id) awardPoints_(o.customer_id, num_(o.poin_dapat) - num_(o.poin_pakai), num_(o.total));
  save_(T.ORDER, { id: o.id, status: 'LUNAS', bayar: num_(o.total), kembali: 0, kasir: ctx.user.n });
  audit_(ctx, 'KONFIRMASI', 'ORDER', o.id, rp_(num_(o.total)));
  var s = settings_(), view = orderView_(findById_(T.ORDER, o.id));
  return { data: { order: view, struk: struk_(view, s), wa_struk: waLink_(view.wa, struk_(view, s)) } };
}

function h_receipt(ctx) {
  var o = findById_(T.ORDER, ctx.params.id);
  if (!o) throw err_('NOT_FOUND', 'Transaksi tidak ditemukan');
  var s = settings_(), view = orderView_(o);
  return { data: { struk: struk_(view, s), order: view, wa: waLink_(view.wa, struk_(view, s)) } };
}

/* --- HOLD CART (tahan transaksi sementara) --- */
function h_pos_hold_save(ctx) {
  var p = ctx.params;
  var rec = save_(T.HOLD, {
    id: str_(p.id) || nextId_(T.HOLD), tanggal: stamp_(), kasir: ctx.user.n,
    nama: str_(p.nama) || 'Tanpa Nama', wa: str_(p.wa),
    items: JSON.stringify(jsonv_(p.items, [])), catatan: str_(p.catatan), diskon: num_(p.diskon)
  });
  audit_(ctx, 'HOLD_SIMPAN', 'HOLDCART', rec.id, rec.nama);
  return { data: rec };
}
function h_pos_hold_list(ctx) {
  var all = rows_(T.HOLD).filter(function (h) {
    return ctx.user.r === 'OWNER' || ctx.user.r === 'ADMIN' || str_(h.kasir) === ctx.user.n;
  }).map(function (h) {
    return { id: h.id, tanggal: h.tanggal, kasir: h.kasir, nama: h.nama, wa: h.wa,
      items: jsonv_(h.items, []), catatan: h.catatan, diskon: num_(h.diskon),
      jumlah_item: jsonv_(h.items, []).reduce(function (a, b) { return a + num_(b.qty); }, 0) };
  }).sort(function (a, b) { return str_(b.tanggal).localeCompare(str_(a.tanggal)); });
  return { data: all };
}
function h_pos_hold_delete(ctx) {
  var ok = delete_(T.HOLD, ctx.params.id);
  audit_(ctx, 'HOLD_HAPUS', 'HOLDCART', ctx.params.id, '');
  return { data: { terhapus: ok } };
}

/* ===========================================================================
 * 20. HANDLER PRODUK & BUNDLING
 * ======================================================================== */
function h_product_list(ctx) {
  var p = ctx.params;
  var all = rows_(T.PRODUCT).map(productFull_);
  if (str_(p.status) && p.status !== 'ALL') all = all.filter(function (x) { return x.status === p.status; });
  if (p.kategori && p.kategori !== 'ALL') all = all.filter(function (x) { return x.kategori.toLowerCase() === str_(p.kategori).toLowerCase(); });
  if (p.brand && p.brand !== 'ALL') all = all.filter(function (x) { return x.brand.toLowerCase() === str_(p.brand).toLowerCase(); });
  if (p.tipe && p.tipe !== 'ALL') all = all.filter(function (x) { return x.tipe.toUpperCase() === str_(p.tipe).toUpperCase(); });
  if (p.kondisi && p.kondisi !== 'ALL') all = all.filter(function (x) { return x.kondisi.toUpperCase() === str_(p.kondisi).toUpperCase(); });
  if (bool_(p.menipis)) all = all.filter(function (x) { return x.tipis || x.habis; });
  if (p.q) {
    var q = str_(p.q).toLowerCase();
    all = all.filter(function (x) { return (x.nama + x.sku + x.brand + x.tags).toLowerCase().indexOf(q) > -1; });
  }
  var sort = str_(p.sort) || 'nama';
  all.sort({
    nama: function (a, b) { return a.nama.localeCompare(b.nama); },
    stok: function (a, b) { return a.stok - b.stok; },
    harga: function (a, b) { return b.harga - a.harga; },
    termurah: function (a, b) { return a.harga - b.harga; },
    margin: function (a, b) { return b.margin_pct - a.margin_pct; },
    terbaru: function (a, b) { return str_(b.dibuat).localeCompare(str_(a.dibuat)); }
  }[sort] || function (a, b) { return a.nama.localeCompare(b.nama); });
  var ringkasan = { total: all.length, nilai_modal: all.reduce(function (a, b) { return a + b.nilai_stok; }, 0),
    habis: all.filter(function (x) { return x.habis; }).length, menipis: all.filter(function (x) { return x.tipis; }).length };
  var pg = paging_(all, { page: p.page, limit: p.limit || 20 });
  return { data: pg.rows, meta: Object.assign({ ringkasan: ringkasan }, pg.meta) };
}

function h_product_get(ctx) {
  var p = findById_(T.PRODUCT, ctx.params.id);
  if (!p) throw err_('NOT_FOUND', 'Produk tidak ditemukan');
  return { data: productFull_(p) };
}

function h_product_save(ctx) {
  var p = ctx.params, id = str_(p.id);
  if (!str_(p.nama)) throw err_('BAD_REQUEST', 'Nama produk wajib diisi');
  var harga = num_(p.harga);
  if (harga <= 0) throw err_('BAD_REQUEST', 'Harga jual harus lebih dari 0');
  var tipe = str_(p.tipe).toUpperCase() || 'UNIT';
  var bom = jsonv_(p.bom, []);
  if (tipe === 'BUNDLE' && (!bom || !bom.length)) throw err_('BAD_REQUEST', 'Produk bundle wajib memiliki minimal 1 komponen');
  var sku = str_(p.sku).trim() || ('SKU-' + Utilities.getUuid().slice(0, 6).toUpperCase());
  // Cek duplikat SKU
  var dup = findBy_(T.PRODUCT, 'sku', sku);
  if (dup && str_(dup.id) !== id) throw err_('DUPLIKAT', 'SKU ' + sku + ' sudah dipakai produk lain');

  var payload = {
    id: id || nextId_(T.PRODUCT), sku: sku, nama: str_(p.nama).trim(), kategori: str_(p.kategori) || 'Lainnya',
    brand: str_(p.brand), tipe: tipe, kondisi: str_(p.kondisi).toUpperCase() || 'BARU',
    harga: harga, harga_coret: num_(p.harga_coret), harga_beli: num_(p.harga_beli),
    stok: num_(p.stok), stok_min: num_(p.stok_min) || APP.LOW_STOCK_DEFAULT,
    satuan: str_(p.satuan) || 'unit', garansi: str_(p.garansi), poin: num_(p.poin),
    gambar: str_(p.gambar), deskripsi: str_(p.deskripsi), tags: str_(p.tags),
    bom: JSON.stringify(bom), status: str_(p.status).toUpperCase() || 'AKTIF',
    unggulan: bool_(p.unggulan) ? 1 : 0, diubah: stamp_()
  };
  var lama = id ? findById_(T.PRODUCT, id) : null;
  if (!lama) payload.dibuat = stamp_();

  // Catat mutasi bila stok berubah manual
  var rec = save_(T.PRODUCT, payload);
  if (lama && num_(lama.stok) !== num_(payload.stok)) {
    stockMove_({ product_id: rec.id, sku: rec.sku, nama: rec.nama, tipe: 'ADJUST',
      qty: num_(payload.stok) - num_(lama.stok), sebelum: num_(lama.stok), sesudah: num_(payload.stok),
      ref: 'EDIT-PRODUK', catatan: 'Perubahan stok via form produk', oleh: ctx.user.n });
  } else if (!lama && num_(payload.stok) > 0) {
    stockMove_({ product_id: rec.id, sku: rec.sku, nama: rec.nama, tipe: 'IN', qty: num_(payload.stok),
      sebelum: 0, sesudah: num_(payload.stok), ref: 'PRODUK-BARU', catatan: 'Stok awal', oleh: ctx.user.n });
  }
  audit_(ctx, lama ? 'UBAH_PRODUK' : 'TAMBAH_PRODUK', 'PRODUCT', rec.id, payload.nama + ' @' + harga);
  bust_(T.PRODUCT);
  return { data: productFull_(findById_(T.PRODUCT, rec.id)) };
}

function h_product_delete(ctx) {
  var p = findById_(T.PRODUCT, ctx.params.id);
  if (!p) throw err_('NOT_FOUND', 'Produk tidak ditemukan');
  var dipakai = rows_(T.PRODUCT).filter(function (x) {
    var bom = jsonv_(x.bom, []);
    return Array.isArray(bom) && bom.some(function (b) { return str_(b.sku) === str_(p.sku); });
  });
  if (dipakai.length) throw err_('DIPAKAI', 'SKU ini dipakai oleh bundling: ' + dipakai.map(function (x) { return x.nama; }).join(', '));
  delete_(T.PRODUCT, p.id);
  audit_(ctx, 'HAPUS_PRODUK', 'PRODUCT', p.id, p.nama);
  bust_(T.PRODUCT);
  return { data: { pesan: 'Produk ' + p.nama + ' dihapus' } };
}

function h_product_bulk_delete(ctx) {
  var ids = jsonv_(ctx.params.ids, []);
  if (typeof ids === 'string') ids = str_(ids).split(',');
  var n = 0;
  ids.forEach(function (id) { if (delete_(T.PRODUCT, str_(id).trim())) n++; });
  audit_(ctx, 'HAPUS_MASSAL', 'PRODUCT', '-', n + ' produk');
  bust_(T.PRODUCT);
  return { data: { terhapus: n } };
}

/** Impor massal: teks CSV/TSV atau array baris. */
function h_product_import(ctx) {
  var rowsIn = jsonv_(ctx.params.rows, null);
  if (!rowsIn) {
    var raw = str_(ctx.params.teks || ctx.params.csv).trim();
    if (!raw) throw err_('BAD_REQUEST', 'Data impor kosong');
    var lines = raw.split(/\r?\n/).filter(function (l) { return l.trim(); });
    var delim = (lines[0].indexOf('\t') > -1) ? '\t' : (lines[0].indexOf(';') > -1 ? ';' : ',');
    var head = lines[0].split(delim).map(function (h) { return h.trim().toLowerCase(); });
    rowsIn = lines.slice(1).map(function (l) {
      var cells = l.split(delim), o = {};
      head.forEach(function (h, i) { o[h] = cells[i] === undefined ? '' : String(cells[i]).trim(); });
      return o;
    });
  }
  var hasil = { sukses: 0, gagal: 0, error: [] };
  rowsIn.forEach(function (r, idx) {
    try {
      if (!str_(r.nama)) throw err_('BAD_REQUEST', 'Kolom nama kosong');
      var sku = str_(r.sku).trim();
      var ada = sku ? findBy_(T.PRODUCT, 'sku', sku) : null;
      var payload = Object.assign({}, r);
      if (ada) payload.id = ada.id;
      payload.sku = sku || undefined;
      payload.nama = str_(r.nama);
      payload.harga = num_(r.harga);
      payload.harga_beli = num_(r.harga_beli);
      payload.stok = num_(r.stok);
      payload.kategori = str_(r.kategori) || 'Lainnya';
      payload.tipe = str_(r.tipe).toUpperCase() || 'UNIT';
      payload.kondisi = str_(r.kondisi).toUpperCase() || 'BARU';
      payload.status = str_(r.status).toUpperCase() || 'AKTIF';
      handleProductSaveInternal_(payload, ctx, 'IMPORT');
      hasil.sukses++;
    } catch (err) {
      hasil.gagal++;
      hasil.error.push('Baris ' + (idx + 2) + ': ' + err.message);
    }
  });
  bust_(T.PRODUCT);
  audit_(ctx, 'IMPOR_PRODUK', 'PRODUCT', '-', hasil.sukses + ' sukses / ' + hasil.gagal + ' gagal');
  return { data: hasil };
}

/** Dipakai bersama oleh h_product_save & h_product_import. */
function handleProductSaveInternal_(payload, ctx, ref) {
  payload.sku = str_(payload.sku).trim() || ('SKU-' + Utilities.getUuid().slice(0, 6).toUpperCase());
  payload.tipe = str_(payload.tipe).toUpperCase() || 'UNIT';
  var dup = findBy_(T.PRODUCT, 'sku', payload.sku);
  if (dup && str_(dup.id) !== str_(payload.id)) throw err_('DUPLIKAT', 'SKU ' + payload.sku + ' sudah ada');
  var lama = payload.id ? findById_(T.PRODUCT, payload.id) : null;
  var rec = save_(T.PRODUCT, Object.assign({
    id: payload.id || nextId_(T.PRODUCT),
    harga: num_(payload.harga), harga_beli: num_(payload.harga_beli), harga_coret: num_(payload.harga_coret),
    stok: num_(payload.stok), stok_min: num_(payload.stok_min) || APP.LOW_STOCK_DEFAULT,
    poin: num_(payload.poin), unggulan: bool_(payload.unggulan) ? 1 : 0,
    bom: typeof payload.bom === 'object' ? JSON.stringify(payload.bom || []) : str_(payload.bom) || '[]',
    diubah: stamp_(), dibuat: lama ? undefined : stamp_()
  }));
  if (!lama && num_(payload.stok) > 0) {
    stockMove_({ product_id: rec.id, sku: rec.sku, nama: rec.nama, tipe: 'IN', qty: num_(payload.stok),
      sebelum: 0, sesudah: num_(payload.stok), ref: ref || 'IMPORT', catatan: 'Impor ' + (ref || 'massal'), oleh: ctx.user.n });
  } else if (lama && num_(lama.stok) !== num_(payload.stok)) {
    stockMove_({ product_id: rec.id, sku: rec.sku, nama: rec.nama, tipe: 'ADJUST',
      qty: num_(payload.stok) - num_(lama.stok), sebelum: num_(lama.stok), sesudah: num_(payload.stok),
      ref: ref || 'IMPORT', catatan: 'Update stok impor', oleh: ctx.user.n });
  }
  return rec;
}

function h_product_export(ctx) {
  var all = rows_(T.PRODUCT).map(productFull_);
  var head = ['sku','nama','kategori','brand','tipe','kondisi','harga','harga_coret','harga_beli','stok','stok_min','garansi','status','unggulan','gambar'];
  var csv = [head.join(',')].concat(all.map(function (p) {
    return head.map(function (h) {
      var v = p[h];
      if (v === true) v = 'YA'; if (v === false) v = 'TIDAK';
      return '"' + str_(v).replace(/"/g, '""') + '"';
    }).join(',');
  })).join('\n');
  audit_(ctx, 'EKSPOR_PRODUK', 'PRODUCT', '-', all.length + ' baris');
  return { data: { csv: csv, jumlah: all.length, nama_file: 'produk-' + dayKey_() + '.csv' } };
}

function h_bundle_explode(ctx) {
  var p = findById_(T.PRODUCT, ctx.params.id) || findBy_(T.PRODUCT, 'sku', str_(ctx.params.sku));
  if (!p) throw err_('NOT_FOUND', 'Produk tidak ditemukan');
  var komps = explodeBom_(p);
  return { data: {
    produk: productView_(p), komponen: komps, max_buildable: maxBuildable_(p),
    hpp_ideal: bomCost_(p),
    selisih_hpp: num_(p.harga_beli) - bomCost_(p),
    nilai_stok_tersedia: komps.reduce(function (a, c) { return a + c.harga_beli * c.stok; }, 0)
  }};
}

/** Komponen tersedia yang bisa dipilih saat merakit bundling. */
function h_bundle_materials(ctx) {
  var all = rows_(T.PRODUCT).map(function (p) {
    return { sku: str_(p.sku), nama: str_(p.nama), kategori: str_(p.kategori), stok: num_(p.stok),
      harga: num_(p.harga), harga_beli: num_(p.harga_beli), satuan: str_(p.satuan), tipe: str_(p.tipe) };
  }).filter(function (p) { return p.tipe !== 'BUNDLE'; });
  return { data: all };
}

/* ===========================================================================
 * 21. HANDLER INVENTORY (STOK, KARTU STOK, OPNAME)
 * ======================================================================== */
function h_stock_moves(ctx) {
  var p = ctx.params;
  var all = rows_(T.MOVE);
  if (p.sku) all = all.filter(function (m) { return str_(m.sku).toLowerCase() === str_(p.sku).toLowerCase(); });
  if (p.product_id) all = all.filter(function (m) { return str_(m.product_id) === str_(p.product_id); });
  if (p.tipe && p.tipe !== 'ALL') all = all.filter(function (m) { return str_(m.tipe).toUpperCase() === str_(p.tipe).toUpperCase(); });
  if (p.dari) all = all.filter(function (m) { return str_(m.tanggal).slice(0, 10) >= str_(p.dari); });
  if (p.sampai) all = all.filter(function (m) { return str_(m.tanggal).slice(0, 10) <= str_(p.sampai); });
  if (p.q) { var q = str_(p.q).toLowerCase(); all = all.filter(function (m) { return (str_(m.sku) + str_(m.nama) + str_(m.ref)).toLowerCase().indexOf(q) > -1; }); }
  all.reverse();
  var ringkas = {
    masuk: all.filter(function (m) { return num_(m.qty) > 0; }).reduce(function (a, b) { return a + num_(b.qty); }, 0),
    keluar: all.filter(function (m) { return num_(m.qty) < 0; }).reduce(function (a, b) { return a + Math.abs(num_(b.qty)); }, 0),
    total: all.length
  };
  var pg = paging_(all, { page: p.page, limit: p.limit || 25 });
  return { data: pg.rows, meta: Object.assign({ ringkas: ringkas }, pg.meta) };
}

function h_stock_opname(ctx) {
  var p = ctx.params;
  var catatan = str_(p.catatan).trim();
  if (!catatan) throw err_('BAD_REQUEST', 'Catatan opname wajib diisi (audit trail)');
  var items = jsonv_(p.items, []);
  if (typeof items === 'string') items = jsonv_(items, []);
  if (!Array.isArray(items) || !items.length) {
    if (p.sku) items = [{ sku: p.sku, qty: p.qty, mode: p.mode }];
    else throw err_('BAD_REQUEST', 'Tidak ada item untuk opname');
  }
  var mode = str_(p.mode).toUpperCase() || 'SET';
  var hasil = [];
  lock_(function () {
    items.forEach(function (it) {
      var key = str_(it.sku || it.id);
      var prod = findBy_(T.PRODUCT, 'sku', key) || findById_(T.PRODUCT, key);
      if (!prod) { hasil.push({ sku: key, ok: false, pesan: 'Produk tidak ditemukan' }); return; }
      var before = num_(prod.stok);
      var m = str_(it.mode || mode).toUpperCase();
      var q = num_(it.qty);
      var after = m === 'SET' ? q : before + q;
      if (after < 0) { hasil.push({ sku: prod.sku, ok: false, pesan: 'Stok hasil tidak boleh negatif' }); return; }
      save_(T.PRODUCT, { id: prod.id, stok: after, diubah: stamp_() });
      stockMove_({ product_id: prod.id, sku: prod.sku, nama: prod.nama, tipe: 'OPNAME',
        qty: after - before, sebelum: before, sesudah: after, ref: 'OPNAME-' + dayKey_(),
        catatan: catatan + ' [' + m + ']', oleh: ctx.user.n });
      hasil.push({ sku: prod.sku, nama: prod.nama, ok: true, sebelum: before, sesudah: after, selisih: after - before });
    });
  });
  bust_(T.PRODUCT);
  audit_(ctx, 'OPNAME', 'STOCKMOVE', '-', catatan + ' | ' + hasil.length + ' item');
  return { data: { hasil: hasil, sukses: hasil.filter(function (h) { return h.ok; }).length,
    gagal: hasil.filter(function (h) { return !h.ok; }).length, catatan: catatan, mode: mode } };
}

function h_stock_low(ctx) {
  var all = rows_(T.PRODUCT).map(productFull_).filter(function (p) { return p.status === 'AKTIF' && (p.tipis || p.habis); })
    .sort(function (a, b) { return a.stok - b.stok; });
  var bundles = rows_(T.PRODUCT).map(productFull_).filter(function (p) { return p.tipe === 'BUNDLE' && p.status === 'AKTIF'; })
    .map(function (b) { return { sku: b.sku, nama: b.nama, max_buildable: maxBuildable_(b), komponen: explodeBom_(b).filter(function (c) { return c.stok < c.qty; }) }; });
  return { data: all, meta: { rakit_terhambat: bundles.filter(function (b) { return b.komponen.length; }) } };
}

/* ===========================================================================
 * 22. HANDLER PURCHASE ORDER
 * ======================================================================== */
function h_po_list(ctx) {
  var all = rows_(T.PO).map(poView_);
  if (ctx.params.status && ctx.params.status !== 'ALL') all = all.filter(function (x) { return x.status.toUpperCase() === str_(ctx.params.status).toUpperCase(); });
  if (ctx.params.q) { var q = str_(ctx.params.q).toLowerCase(); all = all.filter(function (x) { return (x.id + x.supplier).toLowerCase().indexOf(q) > -1; }); }
  all.sort(function (a, b) { return str_(b.dibuat).localeCompare(str_(a.dibuat)); });
  return { data: all, meta: { terbuka: all.filter(function (x) { return ['DRAFT', 'DIKIRIM'].indexOf(x.status) > -1; }).length,
    nilai_terbuka: all.filter(function (x) { return ['DRAFT', 'DIKIRIM'].indexOf(x.status) > -1; }).reduce(function (a, b) { return a + b.total; }, 0) } };
}

function h_po_save(ctx) {
  var p = ctx.params;
  if (!str_(p.supplier)) throw err_('BAD_REQUEST', 'Nama supplier wajib diisi');
  var items = jsonv_(p.items, []);
  if (typeof items === 'string') items = jsonv_(items, []);
  if (!items.length) throw err_('BAD_REQUEST', 'Minimal 1 item pengadaan');
  var total = items.reduce(function (a, b) { return a + num_(b.qty) * num_(b.harga_beli || b.harga); }, 0);
  var rec = save_(T.PO, {
    id: str_(p.id) || nextId_(T.PO), tanggal: str_(p.tanggal) || stamp_(),
    supplier: str_(p.supplier), wa: wa_(p.wa), items: JSON.stringify(items), total: total,
    status: str_(p.status).toUpperCase() || 'DRAFT', eta: str_(p.eta), catatan: str_(p.catatan),
    oleh: ctx.user.n, dibuat: stamp_()
  });
  audit_(ctx, p.id ? 'UBAH_PO' : 'BUAT_PO', 'PO', rec.id, rec.supplier + ' ' + rp_(total));
  return { data: poView_(rec) };
}

function h_po_receive(ctx) {
  var p = ctx.params;
  var po = findById_(T.PO, p.id);
  if (!po) throw err_('NOT_FOUND', 'PO tidak ditemukan');
  var st = str_(po.status).toUpperCase();
  if (st === 'DITERIMA') throw err_('BAD_REQUEST', 'PO sudah diterima seluruhnya');
  var items = jsonv_(po.items, []);
  var diterima = '';
  lock_(function () {
    items.forEach(function (it) {
      var key = str_(it.sku || it.id);
      var prod = findBy_(T.PRODUCT, 'sku', key);
      var qty = num_(it.qty);
      if (!prod) {
        // Buat produk baru otomatis bila supplier mengirim SKU baru
        prod = save_(T.PRODUCT, {
          id: nextId_(T.PRODUCT), sku: key, nama: str_(it.nama) || key, kategori: str_(it.kategori) || 'Lainnya',
          brand: str_(it.brand), tipe: 'UNIT', kondisi: 'BARU', harga: num_(it.harga) || num_(it.harga_beli) * 1.2,
          harga_coret: 0, harga_beli: num_(it.harga_beli), stok: 0, stok_min: APP.LOW_STOCK_DEFAULT,
          satuan: 'unit', garansi: str_(it.garansi), poin: 0, gambar: str_(it.gambar), deskripsi: '',
          tags: 'baru', bom: '[]', status: 'AKTIF', unggulan: 0, dibuat: stamp_(), diubah: stamp_()
        });
      }
      if (num_(it.harga_beli) > 0 && num_(it.harga_beli) !== num_(prod.harga_beli)) {
        save_(T.PRODUCT, { id: prod.id, harga_beli: num_(it.harga_beli), diubah: stamp_() });
      }
      var before = num_(prod.stok), after = before + qty;
      save_(T.PRODUCT, { id: prod.id, stok: after, diubah: stamp_() });
      stockMove_({ product_id: prod.id, sku: prod.sku, nama: prod.nama, tipe: 'PO_IN', qty: qty,
        sebelum: before, sesudah: after, ref: po.id, catatan: 'Penerimaan dari ' + po.supplier, oleh: ctx.user.n });
      diterima += (diterima ? ', ' : '') + prod.sku + 'x' + qty;
    });
    save_(T.PO, { id: po.id, status: 'DITERIMA', diterima_pada: stamp_() });
  });
  bust_(T.PRODUCT);
  audit_(ctx, 'TERIMA_PO', 'PO', po.id, diterima);
  return { data: { pesan: 'Barang diterima & stok diperbarui', po: poView_(findById_(T.PO, po.id)), detail: diterima } };
}

function h_po_status(ctx) {
  var po = findById_(T.PO, ctx.params.id);
  if (!po) throw err_('NOT_FOUND', 'PO tidak ditemukan');
  var allowed = ['DRAFT', 'DIKIRIM', 'DITERIMA', 'BATAL'];
  var st = str_(ctx.params.status).toUpperCase();
  if (allowed.indexOf(st) < 0) throw err_('BAD_REQUEST', 'Status tidak valid. Pilihan: ' + allowed.join(', '));
  save_(T.PO, { id: po.id, status: st });
  audit_(ctx, 'STATUS_PO', 'PO', po.id, st);
  return { data: poView_(findById_(T.PO, po.id)) };
}

function h_po_delete(ctx) {
  var ok = delete_(T.PO, ctx.params.id);
  audit_(ctx, 'HAPUS_PO', 'PO', ctx.params.id, '');
  return { data: { terhapus: ok } };
}

/* ===========================================================================
 * 23. HANDLER PELANGGAN (CRM)
 * ======================================================================== */
function h_customer_list(ctx) {
  var p = ctx.params;
  var all = rows_(T.CUSTOMER).map(custView_);
  if (p.q) { var q = str_(p.q).toLowerCase(); all = all.filter(function (c) { return (c.nama + c.wa + c.email + c.kota).toLowerCase().indexOf(q) > -1; }); }
  if (p.tier && p.tier !== 'ALL') all = all.filter(function (c) { return c.tier.toUpperCase() === str_(p.tier).toUpperCase(); });
  if (p.kota && p.kota !== 'ALL') all = all.filter(function (c) { return c.kota.toLowerCase() === str_(p.kota).toLowerCase(); });
  if (str_(p.sort) === 'belanja') all.sort(function (a, b) { return b.total_belanja - a.total_belanja; });
  else if (str_(p.sort) === 'poin') all.sort(function (a, b) { return b.poin - a.poin; });
  else if (str_(p.sort) === 'baru') all.sort(function (a, b) { return str_(b.dibuat).localeCompare(str_(a.dibuat)); });
  else all.sort(function (a, b) { return a.nama.localeCompare(b.nama); });
  var tierCount = { BRONZE: 0, SILVER: 0, GOLD: 0, PLATINUM: 0 };
  var semua = rows_(T.CUSTOMER);
  semua.forEach(function (c) { var t = str_(c.tier).toUpperCase() || 'BRONZE'; if (tierCount[t] !== undefined) tierCount[t]++; });
  var pg = paging_(all, { page: p.page, limit: p.limit || 20 });
  return { data: pg.rows, meta: Object.assign({ tier: tierCount,
    total_belanja: semua.reduce(function (a, b) { return a + num_(b.total_belanja); }, 0),
    total_poin: semua.reduce(function (a, b) { return a + num_(b.poin); }, 0) }, pg.meta) };
}

function h_customer_get(ctx) {
  var c = findById_(T.CUSTOMER, ctx.params.id);
  if (!c) throw err_('NOT_FOUND', 'Pelanggan tidak ditemukan');
  var wa = wa_(c.wa);
  var orders = rows_(T.ORDER).filter(function (o) { return str_(o.customer_id) === str_(c.id) || (wa && wa_(o.wa) === wa); })
    .map(orderView_).sort(function (a, b) { return str_(b.tanggal).localeCompare(str_(a.tanggal)); });
  var svc = rows_(T.SERVICE).filter(function (j) { return wa && wa_(j.wa) === wa; }).map(serviceView_);
  var ti = rows_(T.TRADEIN).filter(function (t) { return wa && wa_(t.wa) === wa; }).map(tradeinView_);
  var s = settings_();
  var nextTier = null;
  var tiers = [['SILVER', num_(s.tier_silver)], ['GOLD', num_(s.tier_gold)], ['PLATINUM', num_(s.tier_platinum)]];
  for (var i = 0; i < tiers.length; i++) {
    if (num_(c.total_belanja) < tiers[i][1]) { nextTier = { tier: tiers[i][0], butuh: tiers[i][1] - num_(c.total_belanja), ambang: tiers[i][1] }; break; }
  }
  return { data: custView_(c), meta: { order: orders, service: svc, tradein: ti, next_tier: nextTier,
    nilai_poin: num_(c.poin) * (num_(s.poin_nilai) || 1000) } };
}

function h_customer_save(ctx) {
  var p = ctx.params;
  if (!str_(p.nama)) throw err_('BAD_REQUEST', 'Nama pelanggan wajib diisi');
  if (!str_(p.wa)) throw err_('BAD_REQUEST', 'Nomor WhatsApp wajib diisi');
  var id = str_(p.id);
  var wa = wa_(p.wa);
  var all = rows_(T.CUSTOMER);
  for (var i = 0; i < all.length; i++) {
    if (wa_(all[i].wa) === wa && str_(all[i].id) !== id) throw err_('DUPLIKAT', 'WhatsApp sudah terdaftar untuk ' + all[i].nama);
  }
  var lama = id ? findById_(T.CUSTOMER, id) : null;
  var total = p.total_belanja !== undefined ? num_(p.total_belanja) : num_(lama && lama.total_belanja);
  var rec = save_(T.CUSTOMER, {
    id: id || nextId_(T.CUSTOMER), nama: str_(p.nama).trim(), wa: wa, email: str_(p.email),
    alamat: str_(p.alamat), kota: str_(p.kota), total_belanja: total,
    trx: p.trx !== undefined ? num_(p.trx) : num_(lama && lama.trx),
    poin: p.poin !== undefined ? num_(p.poin) : num_(lama && lama.poin),
    tier: tierOf_(total, settings_()), catatan: str_(p.catatan),
    dibuat: lama ? lama.dibuat : stamp_(), diubah: stamp_()
  });
  audit_(ctx, id ? 'UBAH_PELANGGAN' : 'TAMBAH_PELANGGAN', 'CUSTOMER', rec.id, rec.nama);
  return { data: custView_(findById_(T.CUSTOMER, rec.id)) };
}

function h_customer_delete(ctx) {
  var c = findById_(T.CUSTOMER, ctx.params.id);
  if (!c) throw err_('NOT_FOUND', 'Pelanggan tidak ditemukan');
  delete_(T.CUSTOMER, c.id);
  audit_(ctx, 'HAPUS_PELANGGAN', 'CUSTOMER', c.id, c.nama);
  return { data: { pesan: 'Pelanggan dihapus' } };
}

function h_customer_points(ctx) {
  var p = ctx.params;
  var c = findById_(T.CUSTOMER, p.id);
  if (!c) throw err_('NOT_FOUND', 'Pelanggan tidak ditemukan');
  var delta = num_(p.poin);
  if (!delta) throw err_('BAD_REQUEST', 'Jumlah poin tidak boleh 0');
  var next = num_(c.poin) + delta;
  if (next < 0) throw err_('BAD_REQUEST', 'Poin tidak boleh negatif (saat ini ' + c.poin + ')');
  save_(T.CUSTOMER, { id: c.id, poin: next, diubah: stamp_() });
  audit_(ctx, delta > 0 ? 'TAMBAH_POIN' : 'KURANGI_POIN', 'CUSTOMER', c.id, delta + ' poin | ' + str_(p.alasan));
  return { data: custView_(findById_(T.CUSTOMER, c.id)) };
}

/* ===========================================================================
 * 24. HANDLER SERVICE
 * ======================================================================== */
function h_service_list(ctx) {
  var p = ctx.params;
  var all = rows_(T.SERVICE).map(serviceView_);
  if (p.status && p.status !== 'ALL') all = all.filter(function (j) { return j.status.toUpperCase() === str_(p.status).toUpperCase(); });
  if (p.teknisi && p.teknisi !== 'ALL') all = all.filter(function (j) { return j.teknisi.toLowerCase() === str_(p.teknisi).toLowerCase(); });
  if (p.q) { var q = str_(p.q).toLowerCase(); all = all.filter(function (j) { return (j.id + j.nama + j.wa + j.perangkat + j.keluhan).toLowerCase().indexOf(q) > -1; }); }
  all.sort(function (a, b) { return str_(b.tanggal).localeCompare(str_(a.tanggal)); });
  var papan = {};
  SERVICE_FLOW.concat(['BATAL']).forEach(function (st) { papan[st] = all.filter(function (j) { return j.status.toUpperCase() === st; }).length; });
  var pg = paging_(all, { page: p.page, limit: p.limit || 30 });
  return { data: pg.rows, meta: Object.assign({ papan: papan, flow: SERVICE_FLOW,
    nilai_berjalan: all.filter(function (j) { return j.status !== 'DIAMBIL' && j.status !== 'BATAL'; }).reduce(function (a, b) { return a + b.biaya; }, 0) }, pg.meta) };
}

function h_service_save(ctx) {
  var p = ctx.params;
  if (!str_(p.nama) || !str_(p.wa) || !str_(p.perangkat)) throw err_('BAD_REQUEST', 'Nama, WhatsApp, dan perangkat wajib diisi');
  var id = str_(p.id);
  var lama = id ? findById_(T.SERVICE, id) : null;
  var rec = save_(T.SERVICE, {
    id: id || nextId_(T.SERVICE), tanggal: (lama ? lama.tanggal : stamp_()), nama: str_(p.nama), wa: wa_(p.wa),
    perangkat: str_(p.perangkat), kategori: str_(p.kategori) || 'Laptop', keluhan: str_(p.keluhan),
    mode: str_(p.mode) || 'BAWA_KE_TOKO', teknisi: str_(p.teknisi), status: str_(p.status).toUpperCase() || 'MASUK',
    diagnosa: str_(p.diagnosa), estimasi: num_(p.estimasi), biaya: num_(p.biaya),
    parts: JSON.stringify(jsonv_(p.parts, [])), garansi: str_(p.garansi), catatan: str_(p.catatan), diubah: stamp_()
  });
  audit_(ctx, id ? 'UBAH_SERVICE' : 'TAMBAH_SERVICE', 'SERVICE', rec.id, rec.perangkat + ' / ' + rec.status);
  return { data: serviceView_(findById_(T.SERVICE, rec.id)) };
}

function h_service_status(ctx) {
  var p = ctx.params;
  var j = findById_(T.SERVICE, p.id);
  if (!j) throw err_('NOT_FOUND', 'Job service tidak ditemukan');
  var st = str_(p.status).toUpperCase();
  if (SERVICE_FLOW.indexOf(st) < 0 && st !== 'BATAL') throw err_('BAD_REQUEST', 'Status tidak valid');
  var upd = { id: j.id, status: st, diubah: stamp_() };
  if (p.teknisi !== undefined) upd.teknisi = str_(p.teknisi);
  if (p.diagnosa !== undefined) upd.diagnosa = str_(p.diagnosa);
  if (p.biaya !== undefined) upd.biaya = num_(p.biaya);
  if (p.catatan !== undefined) upd.catatan = str_(j.catatan) + (str_(p.catatan) ? ' | ' + str_(p.catatan) : '');
  save_(T.SERVICE, upd);
  audit_(ctx, 'STATUS_SERVICE', 'SERVICE', j.id, st + ' | ' + str_(p.catatan));
  var s = settings_(), view = serviceView_(findById_(T.SERVICE, j.id));
  var pesan = 'Halo ' + view.nama + ', update service ' + view.id + ' (' + view.perangkat + '): status *' + view.status +
    '*.\n' + (view.diagnosa ? 'Diagnosa: ' + view.diagnosa + '\n' : '') +
    (view.biaya ? 'Estimasi biaya: ' + rp_(view.biaya) + '\n' : '') + 'Terima kasih - ' + s.nama_toko;
  return { data: { service: view, wa: waLink_(view.wa, pesan), pesan_wa: pesan } };
}

function h_service_invoice(ctx) {
  var p = ctx.params;
  var j = findById_(T.SERVICE, p.id);
  if (!j) throw err_('NOT_FOUND', 'Job service tidak ditemukan');
  var parts = jsonv_(p.parts, jsonv_(j.parts, []));
  var items = [];
  // Jasa
  var biaya = num_(p.biaya !== undefined ? p.biaya : j.biaya);
  if (biaya > 0) {
    items.push({ sku: 'JASA-' + str_(j.kategori || 'SVC').toUpperCase().slice(0, 6), nama: 'Jasa Service ' + str_(j.perangkat),
      qty: 1, harga: biaya, hpp: 0, kategori: 'Jasa', tipe: 'JASA' });
  }
  // Part dari stok
  (parts || []).forEach(function (pt) {
    var prod = findBy_(T.PRODUCT, 'sku', str_(pt.sku));
    if (!prod) return;
    items.push({ sku: str_(prod.sku), nama: str_(prod.nama), qty: num_(pt.qty) || 1,
      harga: num_(pt.harga) || num_(prod.harga), hpp: num_(prod.harga_beli), kategori: str_(prod.kategori), tipe: 'PART' });
  });
  if (!items.length) throw err_('BAD_REQUEST', 'Tidak ada biaya/part untuk ditagihkan. Isi biaya jasa atau tambahkan spare part.');
  var res = simpanTransaksi_({
    items: items, bayar: num_(p.bayar), metode: str_(p.metode) || 'TUNAI', tipe: 'SERVICE',
    customer: { nama: str_(j.nama), wa: str_(j.wa) },
    catatan: 'Invoice service ' + j.id + ' (' + str_(j.perangkat) + ')' + (str_(p.catatan) ? ' - ' + str_(p.catatan) : ''),
    status: str_(p.status) || 'LUNAS'
  }, ctx, { deduct: true });
  save_(T.SERVICE, { id: j.id, status: 'DIAMBIL', biaya: num_(res.order.total), diubah: stamp_() });
  audit_(ctx, 'INVOICE_SERVICE', 'SERVICE', j.id, res.order.id + ' ' + rp_(res.order.total));
  var s = settings_();
  return { data: { order: res.order, service: serviceView_(findById_(T.SERVICE, j.id)),
    struk: struk_(res.order, s), wa_struk: waLink_(res.order.wa, struk_(res.order, s)) } };
}

function h_service_delete(ctx) {
  var j = findById_(T.SERVICE, ctx.params.id);
  if (!j) throw err_('NOT_FOUND', 'Job service tidak ditemukan');
  delete_(T.SERVICE, j.id);
  audit_(ctx, 'HAPUS_SERVICE', 'SERVICE', j.id, j.perangkat);
  return { data: { pesan: 'Job service dihapus' } };
}

/* ===========================================================================
 * 25. HANDLER TRADE-IN
 * ======================================================================== */
function h_tradein_list(ctx) {
  var p = ctx.params;
  var all = rows_(T.TRADEIN).map(tradeinView_);
  if (p.status && p.status !== 'ALL') all = all.filter(function (t) { return t.status.toUpperCase() === str_(p.status).toUpperCase(); });
  if (p.q) { var q = str_(p.q).toLowerCase(); all = all.filter(function (t) { return (t.id + t.nama + t.wa + t.perangkat).toLowerCase().indexOf(q) > -1; }); }
  all.sort(function (a, b) { return str_(b.tanggal).localeCompare(str_(a.tanggal)); });
  var ringkas = {};
  ['BARU', 'DISETUJUI', 'DITOLAK', 'DIBATALKAN'].forEach(function (st) { ringkas[st] = all.filter(function (t) { return t.status === st; }).length; });
  ringkas.nilai_disetujui = all.filter(function (t) { return t.status === 'DISETUJUI'; }).reduce(function (a, b) { return a + b.penawaran; }, 0);
  return { data: all, meta: { ringkas: ringkas } };
}

function h_tradein_review(ctx) {
  var p = ctx.params;
  var t = findById_(T.TRADEIN, p.id);
  if (!t) throw err_('NOT_FOUND', 'Pengajuan trade-in tidak ditemukan');
  var penawaran = num_(p.penawaran) || num_(t.penawaran);
  save_(T.TRADEIN, { id: t.id, penawaran: penawaran, catatan: str_(t.catatan) + (str_(p.catatan) ? ' | review: ' + str_(p.catatan) : ''), status: str_(p.status) || t.status });
  audit_(ctx, 'REVIEW_TRADEIN', 'TRADEIN', t.id, rp_(penawaran));
  var s = settings_();
  var pesan = 'Halo ' + t.nama + ', pengajuan trade-in ' + t.id + ' untuk ' + t.perangkat +
    ' disetujui dengan penawaran ' + rp_(penawaran) + '. Berlaku 7 hari. - ' + s.nama_toko;
  return { data: { tradein: tradeinView_(findById_(T.TRADEIN, t.id)), wa: waLink_(t.wa, pesan) } };
}

function h_tradein_approve(ctx) {
  var p = ctx.params;
  var t = findById_(T.TRADEIN, p.id);
  if (!t) throw err_('NOT_FOUND', 'Pengajuan trade-in tidak ditemukan');
  if (str_(t.status) === 'DISETUJUI') throw err_('BAD_REQUEST', 'Pengajuan sudah disetujui');
  var s = settings_();
  var beli = num_(p.penawaran) || num_(t.penawaran) || num_(t.estimasi_hi);
  var margin = num_(p.margin_pct) || num_(s.tradein_margin_pct) || 25;
  var hargaJual = Math.round(beli * (1 + margin / 100) / 1000) * 1000;
  var sku = str_(p.sku).trim() || ('USED-' + Utilities.getUuid().slice(0, 6).toUpperCase());
  var dup = findBy_(T.PRODUCT, 'sku', sku);
  if (dup) sku = sku + '-' + Utilities.getUuid().slice(0, 3).toUpperCase();

  var prod = save_(T.PRODUCT, {
    id: nextId_(T.PRODUCT), sku: sku, nama: str_(p.nama) || (str_(t.perangkat) + ' (Bekas)'),
    kategori: str_(p.kategori) || str_(t.kategori) || 'Laptop', brand: str_(p.brand) || '',
    tipe: 'UNIT', kondisi: 'BEKAS', harga: hargaJual, harga_coret: 0, harga_beli: beli,
    stok: 1, stok_min: 1, satuan: 'unit', garansi: str_(p.garansi) || '30 hari toko',
    poin: 0, gambar: str_(p.gambar), deskripsi: str_(p.deskripsi) ||
      ('Unit bekas tukar tambah dari ' + t.nama + '. Kondisi: ' + t.kondisi + '. Tahun: ' + t.tahun + '. ID: ' + t.id),
    tags: 'bekas,trade-in,' + slug_(t.perangkat), bom: '[]', status: 'AKTIF', unggulan: 0,
    dibuat: stamp_(), diubah: stamp_()
  });
  stockMove_({ product_id: prod.id, sku: prod.sku, nama: prod.nama, tipe: 'TRADEIN_IN', qty: 1,
    sebelum: 0, sesudah: 1, ref: t.id, catatan: 'Tukar tambah dari ' + t.nama + ' senilai ' + rp_(beli), oleh: ctx.user.n });
  save_(T.TRADEIN, { id: t.id, status: 'DISETUJUI', penawaran: beli, produk_id: prod.id, catatan: str_(t.catatan) + ' | disetujui ' + stamp_() + ' -> ' + sku });
  audit_(ctx, 'APPROVE_TRADEIN', 'TRADEIN', t.id, 'beli ' + rp_(beli) + ' jual ' + rp_(hargaJual) + ' sku ' + sku);
  bust_(T.PRODUCT);
  var pesan = 'Halo ' + t.nama + ', unit ' + t.perangkat + ' Anda telah kami terima dengan nilai tukar tambah ' + rp_(beli) +
    '. Terima kasih! - ' + s.nama_toko;
  return { data: { tradein: tradeinView_(findById_(T.TRADEIN, t.id)), produk: productFull_(prod),
    wa: waLink_(t.wa, pesan), margin_pct: margin } };
}

function h_tradein_reject(ctx) {
  var t = findById_(T.TRADEIN, ctx.params.id);
  if (!t) throw err_('NOT_FOUND', 'Pengajuan tidak ditemukan');
  save_(T.TRADEIN, { id: t.id, status: 'DITOLAK', catatan: str_(t.catatan) + ' | ditolak: ' + str_(ctx.params.alasan) });
  audit_(ctx, 'TOLAK_TRADEIN', 'TRADEIN', t.id, str_(ctx.params.alasan));
  var s = settings_();
  var pesan = 'Halo ' + t.nama + ', mohon maaf pengajuan trade-in ' + t.id + ' (' + t.perangkat + ') belum dapat kami terima. ' +
    (str_(ctx.params.alasan) ? 'Alasan: ' + str_(ctx.params.alasan) + '. ' : '') + 'Terima kasih - ' + s.nama_toko;
  return { data: { tradein: tradeinView_(findById_(T.TRADEIN, t.id)), wa: waLink_(t.wa, pesan) } };
}

function h_tradein_simulate(ctx) { return { data: estimasiTradeIn_(ctx.params) }; }

/* ===========================================================================
 * 26. HANDLER PROMO
 * ======================================================================== */
function promoView_(p) {
  var today = dayKey_();
  return {
    id: str_(p.id), kode: str_(p.kode), judul: str_(p.judul), tipe: str_(p.tipe), nilai: num_(p.nilai),
    min_belanja: num_(p.min_belanja), maks_diskon: num_(p.maks_diskon), mulai: str_(p.mulai), akhir: str_(p.akhir),
    kuota: num_(p.kuota), terpakai: num_(p.terpakai), aktif: bool_(p.aktif), catatan: str_(p.catatan),
    sisa: num_(p.kuota) > 0 ? Math.max(0, num_(p.kuota) - num_(p.terpakai)) : null,
    berlaku: bool_(p.aktif) && (!str_(p.mulai) || str_(p.mulai) <= today) && (!str_(p.akhir) || str_(p.akhir) >= today)
  };
}
function h_promo_list(ctx) {
  var all = rows_(T.PROMO).map(promoView_);
  if (ctx.params.status === 'AKTIF') all = all.filter(function (p) { return p.berlaku; });
  if (ctx.params.status === 'ARSIP') all = all.filter(function (p) { return !p.berlaku; });
  all.sort(function (a, b) { return (b.berlaku ? 1 : 0) - (a.berlaku ? 1 : 0); });
  return { data: all, meta: { aktif: all.filter(function (p) { return p.berlaku; }).length,
    terpakai: all.reduce(function (a, b) { return a + b.terpakai; }, 0) } };
}
function h_promo_save(ctx) {
  var p = ctx.params;
  var kode = str_(p.kode).toUpperCase().trim();
  if (!kode) throw err_('BAD_REQUEST', 'Kode promo wajib diisi');
  if (!num_(p.nilai)) throw err_('BAD_REQUEST', 'Nilai diskon wajib diisi');
  var dup = findBy_(T.PROMO, 'kode', kode);
  if (dup && str_(dup.id) !== str_(p.id)) throw err_('DUPLIKAT', 'Kode promo sudah dipakai');
  var rec = save_(T.PROMO, {
    id: str_(p.id) || nextId_(T.PROMO), kode: kode, judul: str_(p.judul),
    tipe: str_(p.tipe).toUpperCase() || 'PERCENT', nilai: num_(p.nilai),
    min_belanja: num_(p.min_belanja), maks_diskon: num_(p.maks_diskon),
    mulai: str_(p.mulai), akhir: str_(p.akhir), kuota: num_(p.kuota),
    terpakai: num_(p.terpakai), aktif: bool_(p.aktif) ? 1 : 0, catatan: str_(p.catatan)
  });
  audit_(ctx, p.id ? 'UBAH_PROMO' : 'TAMBAH_PROMO', 'PROMO', rec.id, kode);
  return { data: promoView_(findById_(T.PROMO, rec.id)) };
}
function h_promo_delete(ctx) {
  var ok = delete_(T.PROMO, ctx.params.id);
  audit_(ctx, 'HAPUS_PROMO', 'PROMO', ctx.params.id, '');
  return { data: { terhapus: ok } };
}
function h_promo_toggle(ctx) {
  var p = findById_(T.PROMO, ctx.params.id);
  if (!p) throw err_('NOT_FOUND', 'Promo tidak ditemukan');
  save_(T.PROMO, { id: p.id, aktif: bool_(p.aktif) ? 0 : 1 });
  audit_(ctx, 'TOGGLE_PROMO', 'PROMO', p.id, bool_(p.aktif) ? 'nonaktif' : 'aktif');
  return { data: promoView_(findById_(T.PROMO, p.id)) };
}

/* ===========================================================================
 * 27. HANDLER KONTEN (BANNER, TESTIMONI)
 * ======================================================================== */
function h_content_get(ctx) {
  return { data: {
    banner: rows_(T.BANNER).sort(function (a, b) { return num_(a.urutan) - num_(b.urutan); }),
    testimoni: rows_(T.TESTI).sort(function (a, b) { return num_(a.urutan) - num_(b.urutan); }),
    promo: rows_(T.PROMO).map(promoView_)
  }};
}
function h_banner_save(ctx) {
  var p = ctx.params;
  if (!str_(p.judul)) throw err_('BAD_REQUEST', 'Judul banner wajib diisi');
  var rec = save_(T.BANNER, {
    id: str_(p.id) || nextId_(T.BANNER), judul: str_(p.judul), subjek: str_(p.subjek),
    gambar: str_(p.gambar), link: str_(p.link), urutan: num_(p.urutan), aktif: bool_(p.aktif) ? 1 : 0
  });
  audit_(ctx, p.id ? 'UBAH_BANNER' : 'TAMBAH_BANNER', 'BANNER', rec.id, rec.judul);
  return { data: rec };
}
function h_banner_delete(ctx) {
  var ok = delete_(T.BANNER, ctx.params.id);
  audit_(ctx, 'HAPUS_BANNER', 'BANNER', ctx.params.id, '');
  return { data: { terhapus: ok } };
}
function h_testi_save(ctx) {
  var p = ctx.params;
  if (!str_(p.nama) || !str_(p.pesan)) throw err_('BAD_REQUEST', 'Nama dan pesan testimoni wajib diisi');
  var rec = save_(T.TESTI, {
    id: str_(p.id) || nextId_(T.TESTI), nama: str_(p.nama), kota: str_(p.kota),
    rating: Math.max(1, Math.min(5, num_(p.rating) || 5)), pesan: str_(p.pesan),
    avatar: str_(p.avatar), produk: str_(p.produk), aktif: bool_(p.aktif) ? 1 : 0, urutan: num_(p.urutan)
  });
  audit_(ctx, p.id ? 'UBAH_TESTI' : 'TAMBAH_TESTI', 'TESTI', rec.id, rec.nama);
  return { data: rec };
}
function h_testi_delete(ctx) {
  var ok = delete_(T.TESTI, ctx.params.id);
  audit_(ctx, 'HAPUS_TESTI', 'TESTI', ctx.params.id, '');
  return { data: { terhapus: ok } };
}

/* ===========================================================================
 * 28. HANDLER STAF (RBAC)
 * ======================================================================== */
function staffView_(s) {
  var peran = {
    OWNER: 'Akses penuh termasuk pengaturan & audit',
    ADMIN: 'Kelola produk, promo, konten & laporan',
    KASIR: 'Transaksi POS, pelunasan, pelanggan',
    GUDANG: 'Stok, opname, purchase order, bundling',
    TEKNISI: 'Papan kerja service & invoice service'
  };
  return { id: str_(s.id), nama: str_(s.nama), role: str_(s.role), wa: str_(s.wa), email: str_(s.email),
    aktif: bool_(s.aktif), dibuat: str_(s.dibuat), last_login: str_(s.last_login), trx: num_(s.trx),
    deskripsi: peran[str_(s.role)] || '-' };
}
function h_staff_list(ctx) { return { data: rows_(T.STAFF).map(staffView_) }; }
function h_staff_save(ctx) {
  var p = ctx.params, id = str_(p.id);
  if (!str_(p.nama)) throw err_('BAD_REQUEST', 'Nama staf wajib diisi');
  var role = str_(p.role).toUpperCase() || 'KASIR';
  if (['OWNER', 'ADMIN', 'KASIR', 'GUDANG', 'TEKNISI'].indexOf(role) < 0) throw err_('BAD_REQUEST', 'Role tidak valid');
  var lama = id ? findById_(T.STAFF, id) : null;
  if (!lama) {
    if (str_(p.pin).length < 4) throw err_('BAD_REQUEST', 'PIN minimal 4 digit');
    var rec = createStaff_(str_(p.nama), str_(p.pin), role, p.wa, p.email);
    audit_(ctx, 'TAMBAH_STAF', 'STAFF', rec.id, rec.nama + ' / ' + role);
    return { data: staffView_(findById_(T.STAFF, rec.id)) };
  }
  var upd = { id: lama.id, nama: str_(p.nama), role: role, wa: str_(p.wa), email: str_(p.email), aktif: bool_(p.aktif) ? 1 : 0 };
  if (str_(p.pin)) {
    if (str_(p.pin).length < 4) throw err_('BAD_REQUEST', 'PIN minimal 4 digit');
    var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    upd.pin_hash = hashPin_(p.pin, salt); upd.pin_salt = salt;
  }
  if (str_(lama.role) === 'OWNER' && role !== 'OWNER') {
    var owners = rows_(T.STAFF).filter(function (s) { return str_(s.role) === 'OWNER' && bool_(s.aktif); });
    if (owners.length <= 1) throw err_('FORBIDDEN', 'Minimal harus ada 1 Owner aktif');
  }
  save_(T.STAFF, upd);
  audit_(ctx, 'UBAH_STAF', 'STAFF', lama.id, lama.nama + ' -> ' + role);
  return { data: staffView_(findById_(T.STAFF, lama.id)) };
}
function h_staff_delete(ctx) {
  var id = str_(ctx.params.id);
  var s = findById_(T.STAFF, id);
  if (!s) throw err_('NOT_FOUND', 'Staf tidak ditemukan');
  if (str_(s.id) === str_(ctx.user.id)) throw err_('FORBIDDEN', 'Tidak bisa menghapus akun sendiri');
  if (str_(s.role) === 'OWNER') {
    var owners = rows_(T.STAFF).filter(function (x) { return str_(x.role) === 'OWNER' && bool_(x.aktif); });
    if (owners.length <= 1) throw err_('FORBIDDEN', 'Minimal harus ada 1 Owner aktif');
  }
  delete_(T.STAFF, id);
  audit_(ctx, 'HAPUS_STAF', 'STAFF', id, s.nama);
  return { data: { pesan: 'Staf ' + s.nama + ' dihapus' } };
}
function h_staff_reset_pin(ctx) {
  var s = findById_(T.STAFF, ctx.params.id);
  if (!s) throw err_('NOT_FOUND', 'Staf tidak ditemukan');
  var pin = str_(ctx.params.pin) || '1234';
  var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  save_(T.STAFF, { id: s.id, pin_hash: hashPin_(pin, salt), pin_salt: salt });
  audit_(ctx, 'RESET_PIN', 'STAFF', s.id, s.nama);
  return { data: { pesan: 'PIN ' + s.nama + ' direset', pin: pin } };
}

/* ===========================================================================
 * 29. HANDLER PENGATURAN & SISTEM
 * ======================================================================== */
function h_settings_get(ctx) {
  var s = settings_();
  var aman = Object.assign({}, s);
  delete aman.SHARED_SECRET;
  return { data: aman, meta: {
    api_url: (function () { try { return ScriptApp.getService().getUrl(); } catch (x) { return ''; } })(),
    spreadsheet: (function () { try { return ss_().getUrl(); } catch (x) { return ''; } })(),
    versi: APP.VERSION, waktu_server: nowIso_(), zona: APP.TZ
  }};
}
function h_settings_save(ctx) {
  var p = ctx.params;
  var payload = jsonv_(p.settings, null) || (jsonv_(p.data, null)) || p;
  var skip = ['action', 'token', 'settings', 'data', 'callback', '_'];
  var n = 0;
  Object.keys(payload).forEach(function (k) {
    if (skip.indexOf(k) > -1) return;
    if (typeof payload[k] === 'object') return;
    setSetting_(k, payload[k]); n++;
  });
  audit_(ctx, 'UBAH_SETTING', 'SETTING', '-', n + ' kunci');
  return { data: settings_(), meta: { diubah: n } };
}

function h_audit_list(ctx) {
  var p = ctx.params;
  var all = rows_(T.AUDIT);
  if (p.aksi && p.aksi !== 'ALL') all = all.filter(function (a) { return str_(a.aksi).toUpperCase().indexOf(str_(p.aksi).toUpperCase()) > -1; });
  if (p.user && p.user !== 'ALL') all = all.filter(function (a) { return str_(a.user).toLowerCase() === str_(p.user).toLowerCase(); });
  if (p.entitas && p.entitas !== 'ALL') all = all.filter(function (a) { return str_(a.entitas).toUpperCase() === str_(p.entitas).toUpperCase(); });
  if (p.dari) all = all.filter(function (a) { return str_(a.tanggal).slice(0, 10) >= str_(p.dari); });
  if (p.sampai) all = all.filter(function (a) { return str_(a.tanggal).slice(0, 10) <= str_(p.sampai); });
  if (p.q) { var q = str_(p.q).toLowerCase(); all = all.filter(function (a) { return (str_(a.aksi) + str_(a.detail) + str_(a.user) + str_(a.entitas_id)).toLowerCase().indexOf(q) > -1; }); }
  all.reverse();
  var pg = paging_(all, { page: p.page, limit: p.limit || 40 });
  var aksi = {}; rows_(T.AUDIT).forEach(function (a) { aksi[str_(a.aksi)] = (aksi[str_(a.aksi)] || 0) + 1; });
  return { data: pg.rows, meta: Object.assign({ total: all.length, jenis_aksi: Object.keys(aksi).length }, pg.meta) };
}

function h_system_info(ctx) {
  var s = settings_(), ss = null;
  try { ss = ss_(); } catch (x) {}
  var t = {};
  Object.keys(T).forEach(function (k) { try { t[T[k]] = Math.max(0, sheet_(T[k]).getLastRow() - 1); } catch (x) { t[T[k]] = 0; } });
  return { data: {
    app: { nama: APP.NAME, versi: APP.VERSION, zona: APP.TZ, token_ttl: APP.TOKEN_TTL },
    spreadsheet: ss ? { nama: ss.getName(), url: ss.getUrl(), jumlah_sheet: ss.getSheets().length } : null,
    tabel: t, total_baris: Object.values(t).reduce(function (a, b) { return a + b; }, 0),
    api_url: (function () { try { return ScriptApp.getService().getUrl(); } catch (x) { return ''; } })(),
    waktu: nowIso_(),
    pengaturan_tersimpan: Object.keys(s).length,
    kuota: (function () { try { return { email: MailApp.getRemainingDailyQuota() }; } catch (x) { return null; } })()
  }};
}

/** Inisialisasi seluruh sheet + pengaturan + data demo. */
function h_system_init(ctx) {
  var dibuat = [];
  Object.keys(T).forEach(function (k) { sheet_(T[k]); dibuat.push(T[k]); });
  if (!ctx.params.reset_settings) {
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
      if (findById_(T.SETTING, k) === null) setSetting_(k, DEFAULT_SETTINGS[k]);
    });
  } else {
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) { setSetting_(k, DEFAULT_SETTINGS[k]); });
  }
  var ownerAda = rows_(T.STAFF).some(function (s) { return str_(s.role) === 'OWNER'; });
  var pinOwner = '123456';
  if (!ownerAda) {
    createStaff_('Owner', pinOwner, 'OWNER', DEFAULT_SETTINGS.wa, DEFAULT_SETTINGS.email);
    createStaff_('Kasir Satu', '1111', 'KASIR', '', '');
    createStaff_('Teknisi Dua', '2222', 'TEKNISI', '', '');
    createStaff_('Gudang Tiga', '3333', 'GUDANG', '', '');
  }
  bust_();
  logAudit_('SISTEM', 'SYSTEM', 'INIT_DB', 'SETTING', '-', dibuat.join(','));
  return { data: {
    pesan: 'Basis data siap digunakan', sheet: dibuat,
    owner_default: ownerAda ? 'sudah ada' : { nama: 'Owner', pin: pinOwner },
    staf_demo: ownerAda ? [] : [{ nama: 'Kasir Satu', pin: '1111' }, { nama: 'Teknisi Dua', pin: '2222' }, { nama: 'Gudang Tiga', pin: '3333' }],
    saran: 'SEGERA ganti PIN default dari menu Pengaturan > Keamanan.'
  }};
}

function h_system_warm(ctx) { bust_(); return { data: { pesan: 'Cache dibersihkan', waktu: nowIso_() } }; }

function h_system_backup(ctx) {
  var name = 'BACKUP ' + APP.NAME + ' ' + stamp_();
  var ss = SpreadsheetApp.create(name);
  Object.keys(T).forEach(function (k) {
    var src = tbl_(T[k]);
    var sh = ss.getSheetByName(T[k]) || ss.insertSheet(T[k]);
    if (!src.headers.length) return;
    var data = [src.headers].concat(src.rows.map(function (r) { return src.headers.map(function (h) { return r[h]; }); }));
    sh.getRange(1, 1, data.length, src.headers.length).setValues(data);
    styleHeader_(sh, src.headers.length);
  });
  var def = ss.getSheetByName('Sheet1');
  if (def) ss.deleteSheet(def);
  PropsService_backupUrl_(ss.getUrl());
  audit_(ctx, 'BACKUP', 'SISTEM', '-', ss.getUrl());
  return { data: { pesan: 'Backup selesai', url: ss.getUrl(), nama: name,
    sheet: ss.getSheets().map(function (s) { return s.getName(); }) } };
}
function PropsService_backupUrl_(url) { try { props_().setProperty('SD_LAST_BACKUP', url + ' @ ' + stamp_()); } catch (x) {} }

function h_system_bind_sheet(ctx) { return { data: { spreadsheet: bindSheet_(str_(ctx.params.sheet_id)) } }; }

function h_system_reset_demo(ctx) {
  if (str_(ctx.params.konfirmasi) !== 'RESET') throw err_('BAD_REQUEST', 'Kirim parameter konfirmasi=RESET untuk melanjutkan');
  var apa = str_(ctx.params.tabel || 'SEMUA').toUpperCase();
  var target = apa === 'SEMUA'
    ? [T.PRODUCT, T.ORDER, T.SERVICE, T.STOCKMOVE, T.PO, T.CUSTOMER, T.HOLD, T.TRADEIN, T.PROMO, T.BANNER, T.TESTI]
    : [T[apa] || apa];
  var n = 0;
  target.forEach(function (nm) {
    try {
      var sh = sheet_(nm);
      if (sh.getLastRow() > 1) { sh.deleteRows(2, sh.getLastRow() - 1); n++; }
    } catch (x) {}
  });
  bust_();
  audit_(ctx, 'RESET_DATA', 'SISTEM', '-', target.join(','));
  return { data: { pesan: 'Data dikosongkan (sheet & header tetap)', sheet_dikosongkan: target, jumlah: n } };
}

/** Seed data demo untuk uji coba (produk, pelanggan, transaksi, service, promo, konten). */
function h_system_seed(ctx) {
  var arr = SEED_DATA_();
  var hasil = {};
  Object.keys(arr).forEach(function (k) {
    var sh = sheet_(k);
    var rowsBaru = arr[k];
    if (sh.getLastRow() > 1 && !bool_(ctx.params.timpa)) { hasil[k] = 'dilewati (sudah ada data)'; return; }
    if (bool_(ctx.params.timpa) && sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
    var head = SCHEMA[k];
    var data = rowsBaru.map(function (r) { return head.map(function (h) { var v = r[h]; return (v === undefined || v === null) ? '' : (typeof v === 'object' ? JSON.stringify(v) : v); }); });
    if (data.length) sh.getRange(2, 1, data.length, head.length).setValues(data);
    styleHeader_(sh, head.length);
    hasil[k] = data.length + ' baris';
  });
  bust_();
  audit_(ctx, 'SEED_DATA', 'SISTEM', '-', JSON.stringify(hasil));
  return { data: { pesan: 'Data demo dimuat', detail: hasil } };
}

/* ===========================================================================
 * 30. TABEL ROUTES
 * ======================================================================== */
var ROUTES = {
  /* --- publik (tanpa token) --- */
  'ping':                    { fn: apiPing_, public: true },
  'public.bootstrap':        { fn: h_public_bootstrap, public: true },
  'public.products':         { fn: h_public_products, public: true },
  'public.product':          { fn: h_public_product, public: true },
  'public.stock.check':      { fn: h_public_stock_check, public: true },
  'public.promo.check':      { fn: h_public_promo_check, public: true },
  'public.order.create':     { fn: h_public_order_create, public: true },
  'public.track':            { fn: h_public_track, public: true },
  'public.tradein.estimate': { fn: h_public_tradein_estimate, public: true },
  'public.tradein.calc':     { fn: h_tradein_simulate, public: true },
  'public.tradein.apply':    { fn: h_public_tradein_apply, public: true },
  'public.service.apply':    { fn: h_public_service_apply, public: true },
  'public.testimonials':     { fn: h_public_testimonials, public: true },
  'public.lead':             { fn: h_public_lead, public: true },

  /* --- auth --- */
  'auth.login':      { fn: h_auth_login, public: true },
  'auth.me':         { fn: h_auth_me, roles: ['OWNER', 'ADMIN', 'KASIR', 'GUDANG', 'TEKNISI'] },
  'auth.logout':     { fn: h_auth_logout, roles: ['OWNER', 'ADMIN', 'KASIR', 'GUDANG', 'TEKNISI'] },
  'auth.changePin':  { fn: h_auth_change_pin, roles: ['OWNER', 'ADMIN', 'KASIR', 'GUDANG', 'TEKNISI'] },

  /* --- POS / KASIR --- */
  'pos.lookup':       { fn: h_pos_lookup, roles: ['OWNER', 'ADMIN', 'KASIR', 'GUDANG'] },
  'pos.checkout':     { fn: h_pos_checkout, roles: ['OWNER', 'ADMIN', 'KASIR'] },
  'pos.hold.save':    { fn: h_pos_hold_save, roles: ['OWNER', 'ADMIN', 'KASIR'] },
  'pos.hold.list':    { fn: h_pos_hold_list, roles: ['OWNER', 'ADMIN', 'KASIR'] },
  'pos.hold.delete':  { fn: h_pos_hold_delete, roles: ['OWNER', 'ADMIN', 'KASIR'] },

  /* --- ORDER --- */
  'order.list':    { fn: h_order_list, roles: ['OWNER', 'ADMIN', 'KASIR'] },
  'order.get':     { fn: h_order_get, roles: ['OWNER', 'ADMIN', 'KASIR', 'TEKNISI'] },
  'order.void':    { fn: h_order_void, roles: ['OWNER', 'ADMIN'] },
  'order.pay':     { fn: h_pos_pay, roles: ['OWNER', 'ADMIN', 'KASIR'] },
  'order.confirm': { fn: h_order_confirm, roles: ['OWNER', 'ADMIN', 'KASIR'] },
  'order.receipt': { fn: h_receipt, roles: ['OWNER', 'ADMIN', 'KASIR'] },

  /* --- dashboard --- */
  'dash.stats':  { fn: function (c) { return { data: stats_(c.params) }; }, roles: ['OWNER', 'ADMIN', 'KASIR', 'GUDANG', 'TEKNISI'] },
  'dash.charts': { fn: function (c) { return { data: charts_(c.params) }; }, roles: ['OWNER', 'ADMIN', 'KASIR'] },

  /* --- produk & bundling --- */
  'product.list':       { fn: h_product_list, roles: ['OWNER', 'ADMIN', 'KASIR', 'GUDANG'] },
  'product.get':        { fn: h_product_get, roles: ['OWNER', 'ADMIN', 'KASIR', 'GUDANG'] },
  'product.save':       { fn: h_product_save, roles: ['OWNER', 'ADMIN', 'GUDANG'] },
  'product.delete':     { fn: h_product_delete, roles: ['OWNER', 'ADMIN'] },
  'product.bulkDelete': { fn: h_product_bulk_delete, roles: ['OWNER', 'ADMIN'] },
  'product.import':     { fn: h_product_import, roles: ['OWNER', 'ADMIN', 'GUDANG'] },
  'product.export':     { fn: h_product_export, roles: ['OWNER', 'ADMIN', 'GUDANG'] },
  'bundle.explode':     { fn: h_bundle_explode, roles: ['OWNER', 'ADMIN', 'KASIR', 'GUDANG'] },
  'bundle.materials':   { fn: h_bundle_materials, roles: ['OWNER', 'ADMIN', 'GUDANG'] },

  /* --- stok --- */
  'stock.moves':  { fn: h_stock_moves, roles: ['OWNER', 'ADMIN', 'GUDANG'] },
  'stock.opname': { fn: h_stock_opname, roles: ['OWNER', 'ADMIN', 'GUDANG'] },
  'stock.low':    { fn: h_stock_low, roles: ['OWNER', 'ADMIN', 'GUDANG', 'KASIR'] },

  /* --- purchase order --- */
  'po.list':    { fn: h_po_list, roles: ['OWNER', 'ADMIN', 'GUDANG'] },
  'po.save':    { fn: h_po_save, roles: ['OWNER', 'ADMIN', 'GUDANG'] },
  'po.receive': { fn: h_po_receive, roles: ['OWNER', 'ADMIN', 'GUDANG'] },
  'po.status':  { fn: h_po_status, roles: ['OWNER', 'ADMIN', 'GUDANG'] },
  'po.delete':  { fn: h_po_delete, roles: ['OWNER', 'ADMIN'] },

  /* --- pelanggan --- */
  'customer.list':   { fn: h_customer_list, roles: ['OWNER', 'ADMIN', 'KASIR'] },
  'customer.get':    { fn: h_customer_get, roles: ['OWNER', 'ADMIN', 'KASIR'] },
  'customer.save':   { fn: h_customer_save, roles: ['OWNER', 'ADMIN', 'KASIR'] },
  'customer.delete': { fn: h_customer_delete, roles: ['OWNER', 'ADMIN'] },
  'customer.points': { fn: h_customer_points, roles: ['OWNER', 'ADMIN', 'KASIR'] },

  /* --- service --- */
  'service.list':    { fn: h_service_list, roles: ['OWNER', 'ADMIN', 'KASIR', 'TEKNISI'] },
  'service.save':    { fn: h_service_save, roles: ['OWNER', 'ADMIN', 'KASIR'] },
  'service.status':  { fn: h_service_status, roles: ['OWNER', 'ADMIN', 'KASIR', 'TEKNISI'] },
  'service.invoice': { fn: h_service_invoice, roles: ['OWNER', 'ADMIN', 'KASIR'] },
  'service.delete':  { fn: h_service_delete, roles: ['OWNER', 'ADMIN'] },

  /* --- trade-in --- */
  'tradein.list':     { fn: h_tradein_list, roles: ['OWNER', 'ADMIN', 'KASIR'] },
  'tradein.review':   { fn: h_tradein_review, roles: ['OWNER', 'ADMIN', 'KASIR'] },
  'tradein.approve':  { fn: h_tradein_approve, roles: ['OWNER', 'ADMIN'] },
  'tradein.reject':   { fn: h_tradein_reject, roles: ['OWNER', 'ADMIN', 'KASIR'] },
  'tradein.simulate': { fn: h_tradein_simulate, roles: ['OWNER', 'ADMIN', 'KASIR'] },

  /* --- promo --- */
  'promo.list':   { fn: h_promo_list, roles: ['OWNER', 'ADMIN', 'KASIR'] },
  'promo.save':   { fn: h_promo_save, roles: ['OWNER', 'ADMIN'] },
  'promo.delete': { fn: h_promo_delete, roles: ['OWNER', 'ADMIN'] },
  'promo.toggle': { fn: h_promo_toggle, roles: ['OWNER', 'ADMIN'] },

  /* --- konten --- */
  'content.get':   { fn: h_content_get, roles: ['OWNER', 'ADMIN'] },
  'banner.save':   { fn: h_banner_save, roles: ['OWNER', 'ADMIN'] },
  'banner.delete': { fn: h_banner_delete, roles: ['OWNER', 'ADMIN'] },
  'testi.save':    { fn: h_testi_save, roles: ['OWNER', 'ADMIN'] },
  'testi.delete':  { fn: h_testi_delete, roles: ['OWNER', 'ADMIN'] },

  /* --- staf --- */
  'staff.list':     { fn: h_staff_list, roles: ['OWNER'] },
  'staff.save':     { fn: h_staff_save, roles: ['OWNER'] },
  'staff.delete':   { fn: h_staff_delete, roles: ['OWNER'] },
  'staff.resetPin': { fn: h_staff_reset_pin, roles: ['OWNER'] },

  /* --- pengaturan & sistem --- */
  'settings.get':    { fn: h_settings_get, roles: ['OWNER', 'ADMIN'] },
  'settings.save':   { fn: h_settings_save, roles: ['OWNER', 'ADMIN'] },
  'audit.list':      { fn: h_audit_list, roles: ['OWNER', 'ADMIN'] },
  'system.info':     { fn: h_system_info, roles: ['OWNER', 'ADMIN'] },
  'system.init':     { fn: h_system_init, roles: ['OWNER', 'ADMIN'] },
  'system.warm':     { fn: h_system_warm, roles: ['OWNER', 'ADMIN'] },
  'system.backup':   { fn: h_system_backup, roles: ['OWNER'] },
  'system.bindSheet':{ fn: h_system_bind_sheet, roles: ['OWNER'] },
  'system.resetDemo':{ fn: h_system_reset_demo, roles: ['OWNER'] },
  'system.seed':     { fn: h_system_seed, roles: ['OWNER', 'ADMIN'] }
};

/* ===========================================================================
 * 31. DATA DEMO (SEED) — dipakai system.seed & setupSistem()
 * ======================================================================== */
function SEED_DATA_() {
  var t = stamp_();
  var img = function (q) { return 'https://source.unsplash.com/640x420/?'; };
  var P = [
    /* --- LAPTOP BARU --- */
    { id:'PRD-000001', sku:'LPT-ASU-VIVO14', nama:'ASUS Vivobook 14 A1404ZA', kategori:'Laptop', brand:'ASUS', tipe:'UNIT', kondisi:'BARU',
      harga:6499000, harga_coret:7199000, harga_beli:5950000, stok:12, stok_min:3, satuan:'unit', garansi:'1 Tahun Resmi ASUS', poin:65,
      gambar:'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=80',
      deskripsi:'Laptop tipis 14" Intel Core i5-1235U, RAM 8GB DDR4, SSD 512GB NVMe, layar FHD IPS anti-glare, fingerprint, backlit keyboard. Cocok untuk kerja, kuliah, dan multitasking harian.',
      tags:'laptop asus vivobook tipis i5', bom:'[]', status:'AKTIF', unggulan:1, dibuat:t, diubah:t },
    { id:'PRD-000002', sku:'LPT-LEN-IDP3', nama:'Lenovo IdeaPad Slim 3 14IAH8', kategori:'Laptop', brand:'Lenovo', tipe:'UNIT', kondisi:'BARU',
      harga:5999000, harga_coret:6599000, harga_beli:5480000, stok:9, stok_min:3, satuan:'unit', garansi:'1 Tahun Resmi Lenovo', poin:60,
      gambar:'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=900&q=80',
      deskripsi:'Core i5-12450H, RAM 8GB, SSD 512GB, layar 14" FHD. Performa tangguh dengan harga bersahabat untuk produktivitas harian.',
      tags:'lenovo ideapad slim laptop', bom:'[]', status:'AKTIF', unggulan:1, dibuat:t, diubah:t },
    { id:'PRD-000003', sku:'LPT-ACR-ASP5', nama:'Acer Aspire 5 Slim A514-56M', kategori:'Laptop', brand:'Acer', tipe:'UNIT', kondisi:'BARU',
      harga:7299000, harga_coret:7999000, harga_beli:6650000, stok:7, stok_min:2, satuan:'unit', garansi:'1 Tahun Resmi Acer', poin:72,
      gambar:'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=900&q=80',
      deskripsi:'Intel Core i5-1335U, RAM 16GB LPDDR5, SSD 512GB, layar 14" WUXGA IPS. Ringan 1.5kg dengan daya tahan baterai hingga 10 jam.',
      tags:'acer aspire laptop 16gb', bom:'[]', status:'AKTIF', unggulan:0, dibuat:t, diubah:t },
    { id:'PRD-000004', sku:'LPT-APH-NITROV', nama:'Acer Nitro V15 ANV15-51 Gaming', kategori:'Laptop', brand:'Acer', tipe:'UNIT', kondisi:'BARU',
      harga:12499000, harga_coret:13499000, harga_beli:11550000, stok:5, stok_min:2, satuan:'unit', garansi:'1 Tahun Resmi Acer', poin:125,
      gambar:'https://images.unsplash.com/photo-1541140532154-b024d705b90a?auto=format&fit=crop&w=900&q=80',
      deskripsi:'Core i7-13620H + RTX 4050 6GB, RAM 16GB DDR5, SSD 512GB, layar 15.6" FHD 144Hz. Siap untuk gaming kompetitif dan editing video.',
      tags:'gaming laptop rtx 4050 acer nitro', bom:'[]', status:'AKTIF', unggulan:1, dibuat:t, diubah:t },
    { id:'PRD-000005', sku:'LPT-MSI-COVID15', nama:'MSI Cyborg 15 A12VE', kategori:'Laptop', brand:'MSI', tipe:'UNIT', kondisi:'BARU',
      harga:13999000, harga_coret:15299000, harga_beli:12900000, stok:3, stok_min:2, satuan:'unit', garansi:'1 Tahun Resmi MSI', poin:140,
      gambar:'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?auto=format&fit=crop&w=900&q=80',
      deskripsi:'Core i7-12650H + RTX 4060 8GB, RAM 16GB DDR5, SSD 512GB, layar 15.6" FHD 144Hz. Desain futuristik translucent dengan performa kencang.',
      tags:'msi cyborg gaming rtx 4060', bom:'[]', status:'AKTIF', unggulan:0, dibuat:t, diubah:t },
    { id:'PRD-000006', sku:'LPT-APL-MBA-M2', nama:'Apple MacBook Air M2 13" 2023', kategori:'Laptop', brand:'Apple', tipe:'UNIT', kondisi:'BARU',
      harga:16499000, harga_coret:17999000, harga_beli:15200000, stok:4, stok_min:2, satuan:'unit', garansi:'1 Tahun Resmi iBox', poin:165,
      gambar:'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=900&q=80',
      deskripsi:'Chip Apple M2 8-core CPU / 10-core GPU, RAM 8GB Unified, SSD 256GB, Liquid Retina 13.6". Baterai hingga 18 jam, fanless & senyap.',
      tags:'macbook air m2 apple premium', bom:'[]', status:'AKTIF', unggulan:1, dibuat:t, diubah:t },
    /* --- LAPTOP GAMING HIGH-END --- */
    { id:'PRD-000007', sku:'LPT-ASU-ROG-G16', nama:'ASUS ROG Strix G16 RTX 4070', kategori:'Laptop', brand:'ASUS', tipe:'UNIT', kondisi:'BARU',
      harga:24999000, harga_coret:26999000, harga_beli:23200000, stok:2, stok_min:1, satuan:'unit', garansi:'2 Tahun Resmi ASUS', poin:250,
      gambar:'https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&w=900&q=80',
      deskripsi:'Core i9-13980HX, RTX 4070 8GB, RAM 16GB DDR5 (expandable), SSD 1TB Gen4, layar 16" QHD+ 240Hz. Monster gaming dengan RGB per-key.',
      tags:'rog gaming i9 rtx 4070 premium', bom:'[]', status:'AKTIF', unggulan:1, dibuat:t, diubah:t },
    /* --- UNIT BEKAS --- */
    { id:'PRD-000008', sku:'USED-TP-X1C-G7', nama:'Lenovo ThinkPad X1 Carbon Gen 7 (Bekas)', kategori:'Laptop', brand:'Lenovo', tipe:'UNIT', kondisi:'BEKAS',
      harga:5850000, harga_coret:7200000, harga_beli:4300000, stok:2, stok_min:1, satuan:'unit', garansi:'3 Bulan Toko', poin:58,
      gambar:'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=900&q=80',
      deskripsi:'Bekas mulus eks kantor, Core i5-8365U, RAM 16GB, SSD 512GB, layar 14" FHD IPS. Keyboard backlit, body carbon fiber ringan 1.09kg. Baterai masih sehat.',
      tags:'thinkpad bekas business murah', bom:'[]', status:'AKTIF', unggulan:0, dibuat:t, diubah:t },
    { id:'PRD-000009', sku:'USED-DEL-LAT5410', nama:'Dell Latitude 5410 (Bekas)', kategori:'Laptop', brand:'Dell', tipe:'UNIT', kondisi:'BEKAS',
      harga:3250000, harga_coret:4100000, harga_beli:2350000, stok:6, stok_min:2, satuan:'unit', garansi:'3 Bulan Toko', poin:32,
      gambar:'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=900&q=80',
      deskripsi:'Core i5-10310U, RAM 8GB, SSD 256GB, layar 14" FHD. Unit bekas berkualitas untuk pelajar & kantor. Sudah melalui QC 24 titik.',
      tags:'dell latitude bekas pelajar', bom:'[]', status:'AKTIF', unggulan:0, dibuat:t, diubah:t },
    /* --- KOMPONEN --- */
    { id:'PRD-000010', sku:'CPU-AMD-R5-5600', nama:'AMD Ryzen 5 5600 6-Core 3.5GHz', kategori:'Komponen', brand:'AMD', tipe:'UNIT', kondisi:'BARU',
      harga:1450000, harga_coret:1650000, harga_beli:1260000, stok:24, stok_min:5, satuan:'pcs', garansi:'3 Tahun Resmi AMD', poin:14,
      gambar:'https://images.unsplash.com/photo-1555617981-dac3880eac6e?auto=format&fit=crop&w=900&q=80',
      deskripsi:'AM4, 6 core 12 thread, boost hingga 4.4GHz, TDP 65W, tanpa cooler. Pilihan terbaik PC rakitan value gaming & produktivitas.',
      tags:'processor amd ryzen 5600', bom:'[]', status:'AKTIF', unggulan:0, dibuat:t, diubah:t },
    { id:'PRD-000011', sku:'MB-ASR-B450M', nama:'ASRock B450M Steel Legend', kategori:'Komponen', brand:'ASRock', tipe:'UNIT', kondisi:'BARU',
      harga:1125000, harga_coret:0, harga_beli:960000, stok:18, stok_min:4, satuan:'pcs', garansi:'3 Tahun Resmi', poin:11,
      gambar:'https://images.unsplash.com/photo-1591370874773-6702e8f12fd8?auto=format&fit=crop&w=900&q=80',
      deskripsi:'Micro-ATX AM4, support Ryzen 5000 ready, DDR4 4 slot hingga 128GB, PCIe Gen3, dual M.2, RGB header, VRM diperkuat heatsink.',
      tags:'motherboard b450 am4', bom:'[]', status:'AKTIF', unggulan:0, dibuat:t, diubah:t },
    { id:'PRD-000012', sku:'RAM-KVR-8GD4', nama:'Kingston ValueRAM DDR4 8GB 3200MHz', kategori:'Komponen', brand:'Kingston', tipe:'UNIT', kondisi:'BARU',
      harga:395000, harga_coret:465000, harga_beli:310000, stok:60, stok_min:10, satuan:'pcs', garansi:'Seumur Hidup', poin:4,
      gambar:'https://images.unsplash.com/photo-1562976540-1502c2145186?auto=format&fit=crop&w=900&q=80',
      deskripsi:'DDR4 8GB single stick 3200MHz, CL22, 1.2V. Kompatibel universal untuk Intel & AMD, garansi seumur hidup resmi.',
      tags:'ram ddr4 8gb kingston', bom:'[]', status:'AKTIF', unggulan:0, dibuat:t, diubah:t },
    { id:'PRD-000013', sku:'SSD-SAM-980-500', nama:'Samsung 980 NVMe M.2 500GB', kategori:'Komponen', brand:'Samsung', tipe:'UNIT', kondisi:'BARU',
      harga:685000, harga_coret:795000, harga_beli:560000, stok:42, stok_min:8, satuan:'pcs', garansi:'5 Tahun Resmi Samsung', poin:6,
      gambar:'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=900&q=80',
      deskripsi:'NVMe M.2 PCIe 3.0, baca hingga 3100MB/s, tulis 2600MB/s. Upgrade paling terasa untuk laptop & PC lama.',
      tags:'ssd nvme samsung 500gb', bom:'[]', status:'AKTIF', unggulan:1, dibuat:t, diubah:t },
    { id:'PRD-000014', sku:'VGA-ASU-RTX4060', nama:'ASUS Dual RTX 4060 OC 8GB', kategori:'Komponen', brand:'ASUS', tipe:'UNIT', kondisi:'BARU',
      harga:5350000, harga_coret:5790000, harga_beli:4900000, stok:8, stok_min:2, satuan:'pcs', garansi:'3 Tahun Resmi ASUS', poin:53,
      gambar:'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=900&q=80',
      deskripsi:'RTX 4060 8GB GDDR6, boost 2505MHz, DLSS 3, dual fan axial-tech, 0dB technology. Efisien daya hanya 115W.',
      tags:'vga rtx 4060 asus gaming', bom:'[]', status:'AKTIF', unggulan:1, dibuat:t, diubah:t },
    { id:'PRD-000015', sku:'PSU-CVT-650W', nama:'Corsair CV650 650W 80+ Bronze', kategori:'Komponen', brand:'Corsair', tipe:'UNIT', kondisi:'BARU',
      harga:725000, harga_coret:0, harga_beli:610000, stok:15, stok_min:4, satuan:'pcs', garansi:'3 Tahun Resmi', poin:7,
      gambar:'https://images.unsplash.com/photo-1591488320449-011318cc5b9a?auto=format&fit=crop&w=900&q=80',
      deskripsi:'650W 80+ Bronze, 120mm fan, proteksi lengkap OVP/OCP/SCP, kabel sleeved. Stabil untuk rakitan menengah.',
      tags:'psu corsair 650w bronze', bom:'[]', status:'AKTIF', unggulan:0, dibuat:t, diubah:t },
    { id:'PRD-000016', sku:'CSE-ARM-ATX', nama:'Armaggeddon Tesseract T3 ATX Case', kategori:'Komponen', brand:'Armaggeddon', tipe:'UNIT', kondisi:'BARU',
      harga:545000, harga_coret:625000, harga_beli:430000, stok:20, stok_min:5, satuan:'pcs', garansi:'1 Tahun', poin:5,
      gambar:'https://images.unsplash.com/photo-1587202372634-32705e3bf49c?auto=format&fit=crop&w=900&q=80',
      deskripsi:'Mid tower ATX, tempered glass side panel, 3x ARGB fan pre-installed, dukungan radiator 240mm, cable management rapi.',
      tags:'casing pc atx rgb', bom:'[]', status:'AKTIF', unggulan:0, dibuat:t, diubah:t },
    { id:'PRD-000017', sku:'MON-LG-24MK430', nama:'LG 24MK430H 24" IPS 75Hz', kategori:'Monitor', brand:'LG', tipe:'UNIT', kondisi:'BARU',
      harga:1299000, harga_coret:1450000, harga_beli:1120000, stok:14, stok_min:3, satuan:'unit', garansi:'3 Tahun Resmi LG', poin:13,
      gambar:'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=900&q=80',
      deskripsi:'24" FHD IPS, 75Hz, AMD FreeSync, HDMI + D-Sub, mode pembaca & game. Warna akurat untuk kerja desain ringan.',
      tags:'monitor lg ips 24 inch', bom:'[]', status:'AKTIF', unggulan:0, dibuat:t, diubah:t },
    { id:'PRD-000018', sku:'ACC-LOG-M331', nama:'Logitech M331 Silent Plus Wireless', kategori:'Aksesoris', brand:'Logitech', tipe:'UNIT', kondisi:'BARU',
      harga:189000, harga_coret:229000, harga_beli:142000, stok:48, stok_min:10, satuan:'pcs', garansi:'1 Tahun Resmi Logitech', poin:2,
      gambar:'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=900&q=80',
      deskripsi:'Mouse wireless silent klik, koneksi USB nano receiver 2.4GHz, baterai hingga 24 bulan, desain ergonomis tangan kanan.',
      tags:'mouse logitech wireless silent', bom:'[]', status:'AKTIF', unggulan:0, dibuat:t, diubah:t },
    { id:'PRD-000019', sku:'ACC-KEY-MK240', nama:'Logitech MK240 Nano Wireless Combo', kategori:'Aksesoris', brand:'Logitech', tipe:'UNIT', kondisi:'BARU',
      harga:329000, harga_coret:389000, harga_beli:255000, stok:30, stok_min:8, satuan:'pcs', garansi:'1 Tahun Resmi', poin:3,
      gambar:'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=80',
      deskripsi:'Keyboard + mouse wireless nano, layout full size, tahan cipratan air, baterai awet hingga 3 tahun. Siap pakai langsung.',
      tags:'keyboard mouse combo wireless', bom:'[]', status:'AKTIF', unggulan:0, dibuat:t, diubah:t },
    { id:'PRD-000020', sku:'HDD-SEA-1TB', nama:'Seagate Barracuda 1TB 3.5" 7200RPM', kategori:'Komponen', brand:'Seagate', tipe:'UNIT', kondisi:'BARU',
      harga:615000, harga_coret:0, harga_beli:505000, stok:4, stok_min:5, satuan:'pcs', garansi:'2 Tahun Resmi', poin:6,
      gambar:'https://images.unsplash.com/photo-1531492746076-161ca9bcad58?auto=format&fit=crop&w=900&q=80',
      deskripsi:'HDD 1TB SATA III 7200RPM, cache 64MB. Penyimpanan massal hemat biaya untuk data & arsip.',
      tags:'hdd seagate 1tb', bom:'[]', status:'AKTIF', unggulan:0, dibuat:t, diubah:t },
    /* --- BUNDLE RAKITAN --- */
    { id:'PRD-000021', sku:'PC-SAR-ESPORTS', nama:'PC Rakitan Sarinadinet eSports Value', kategori:'PC Rakitan', brand:'Sarinadinet', tipe:'BUNDLE', kondisi:'BARU',
      harga:5999000, harga_coret:6799000, harga_beli:5050000, stok:0, stok_min:1, satuan:'unit', garansi:'1 Tahun Rakitan Toko', poin:60,
      gambar:'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=900&q=80',
      deskripsi:'Paket PC gaming eSports siap pakai: Ryzen 5 5600 + B450M + RAM 8GB + SSD 500GB + case RGB. Dirakit & dites 24 jam sebelum dikirim.',
      tags:'pc rakitan gaming esports murah',
      bom: JSON.stringify([
        { sku:'CPU-AMD-R5-5600', qty:1 }, { sku:'MB-ASR-B450M', qty:1 }, { sku:'RAM-KVR-8GD4', qty:1 },
        { sku:'SSD-SAM-980-500', qty:1 }, { sku:'CSE-ARM-ATX', qty:1 }, { sku:'PSU-CVT-650W', qty:1 }
      ]), status:'AKTIF', unggulan:1, dibuat:t, diubah:t },
    { id:'PRD-000022', sku:'PC-SAR-CREATOR', nama:'PC Rakitan Sarinadinet Creator RTX', kategori:'PC Rakitan', brand:'Sarinadinet', tipe:'BUNDLE', kondisi:'BARU',
      harga:12999000, harga_coret:14299000, harga_beli:11450000, stok:0, stok_min:1, satuan:'unit', garansi:'1 Tahun Rakitan Toko', poin:130,
      gambar:'https://images.unsplash.com/photo-1591489378430-ef2f4c626b35?auto=format&fit=crop&w=900&q=80',
      deskripsi:'Workstation & content creator: Ryzen 5 5600 + RTX 4060 + RAM 16GB + SSD 500GB + PSU 650W Bronze. Render & streaming lancar.',
      tags:'pc rakitan creator rtx 4060 editing',
      bom: JSON.stringify([
        { sku:'CPU-AMD-R5-5600', qty:1 }, { sku:'MB-ASR-B450M', qty:1 }, { sku:'RAM-KVR-8GD4', qty:2 },
        { sku:'SSD-SAM-980-500', qty:1 }, { sku:'VGA-ASU-RTX4060', qty:1 }, { sku:'CSE-ARM-ATX', qty:1 }, { sku:'PSU-CVT-650W', qty:1 }
      ]), status:'AKTIF', unggulan:1, dibuat:t, diubah:t }
  ];

  var C = [
    { id:'CST-000001', nama:'Budi Santoso', wa:'6281234500011', email:'budi@mail.com', alamat:'Jl. Kaliurang KM 5 No. 12', kota:'Yogyakarta', total_belanja:0, trx:0, poin:0, tier:'BRONZE', catatan:'', dibuat:t, diubah:t },
    { id:'CST-000002', nama:'Siti Aminah', wa:'6281234500022', email:'siti@mail.com', alamat:'Jl. Solo KM 8, Kalasan', kota:'Sleman', total_belanja:0, trx:0, poin:0, tier:'BRONZE', catatan:'', dibuat:t, diubah:t },
    { id:'CST-000003', nama:'Andi Pratama', wa:'6281234500033', email:'andi@mail.com', alamat:'Perum Citra Indah Blok C2', kota:'Bantul', total_belanja:0, trx:0, poin:0, tier:'BRONZE', catatan:'', dibuat:t, diubah:t },
    { id:'CST-000004', nama:'Dewi Lestari', wa:'6281234500044', email:'dewi@mail.com', alamat:'Jl. Gejayan No. 88', kota:'Yogyakarta', total_belanja:0, trx:0, poin:0, tier:'BRONZE', catatan:'', dibuat:t, diubah:t },
    { id:'CST-000005', nama:'Rizky Nugraha', wa:'6281234500055', email:'rizky@mail.com', alamat:'Jl. Magelang KM 6, Mlati', kota:'Sleman', total_belanja:0, trx:0, poin:0, tier:'BRONZE', catatan:'', dibuat:t, diubah:t },
    { id:'CST-000006', nama:'Maya Kusuma', wa:'6281234500066', email:'maya@mail.com', alamat:'Jl. Imogiri Timur KM 4', kota:'Bantul', total_belanja:0, trx:0, poin:0, tier:'BRONZE', catatan:'', dibuat:t, diubah:t }
  ];

  var P0 = [
    { id:'PRM-000001', kode:'HEMAT10', judul:'Diskon 10% Semua Laptop', tipe:'PERCENT', nilai:10, min_belanja:3000000, maks_diskon:1000000, mulai:'2024-01-01', akhir:'2030-12-31', kuota:100, terpakai:0, aktif:1, catatan:'Promo berjalan sepanjang tahun' },
    { id:'PRM-000002', kode:'GRATISONGKIR', judul:'Gratis Ongkir Seluruh Indonesia', tipe:'SHIPPING', nilai:150000, min_belanja:1500000, maks_diskon:150000, mulai:'2024-01-01', akhir:'2030-12-31', kuota:0, terpakai:0, aktif:1, catatan:'Ongkir maksimal Rp150.000' },
    { id:'PRM-000003', kode:'NEWMEMBER', judul:'Voucher Member Baru Rp250.000', tipe:'NOMINAL', nilai:250000, min_belanja:2500000, maks_diskon:250000, mulai:'2024-01-01', akhir:'2030-12-31', kuota:50, terpakai:0, aktif:1, catatan:'Khusus pembelian pertama' },
    { id:'PRM-000004', kode:'AKHIRPEKAN', judul:'Flash Sale Akhir Pekan 7%', tipe:'PERCENT', nilai:7, min_belanja:500000, maks_diskon:750000, mulai:'2024-01-01', akhir:'2030-12-31', kuota:0, terpakai:0, aktif:1, catatan:'Sabtu & Minggu' }
  ];

  var B = [
    { id:'BNR-000001', judul:'Laptop Impian, Harga Terjangkau', subjek:'Cicilan 0% hingga 12 bulan • Garansi resmi • Bisa tukar tambah unit lama Anda', gambar:'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1200&q=80', link:'#katalog', urutan:1, aktif:1 },
    { id:'BNR-000002', judul:'Rakit PC Impian, Tim Kami yang Rakit', subjek:'Konsultasi gratis • Komponen bergaransi resmi • Dites 24 jam sebelum kirim', gambar:'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=1200&q=80', link:'#katalog', urutan:2, aktif:1 },
    { id:'BNR-000003', judul:'Service Cepat, Teknisi Berpengalaman', subjek:'Diagnosa gratis • Update status real-time via WhatsApp • Garansi pengerjaan 30 hari', gambar:'https://images.unsplash.com/photo-1588508065123-287b28e013da?auto=format&fit=crop&w=1200&q=80', link:'#service', urutan:3, aktif:1 }
  ];

  var T0 = [
    { id:'TST-000001', nama:'Bagus Ramadhan', kota:'Yogyakarta', rating:5, pesan:'Beli laptop untuk kuliah dan dilayani sangat detail. Dijelaskan perbedaan tiap tipe sampai saya paham betul. Barang datang berpacking rapi dan sudah diinstalasi aplikasi dasar.', avatar:'https://i.pravatar.cc/120?img=12', produk:'ASUS Vivobook 14', aktif:1, urutan:1 },
    { id:'TST-000002', nama:'Rani Oktaviani', kota:'Sleman', rating:5, pesan:'Rakit PC di sini budget 7 juta dan hasilnya kencang banget buat editing. Dikasih detail komponen, dites bareng, dan dibantu setup Windows. Recommended!', avatar:'https://i.pravatar.cc/120?img=32', produk:'PC Rakitan eSports Value', aktif:1, urutan:2 },
    { id:'TST-000003', nama:'Hendra Wijaya', kota:'Bantul', rating:5, pesan:'LCD laptop saya mati, dikerjakan 2 hari sudah beres dan bisa pantau progresnya via WhatsApp. Harga spare part wajar dan diberi garansi pengerjaan.', avatar:'https://i.pravatar.cc/120?img=68', produk:'Service Ganti LCD', aktif:1, urutan:3 },
    { id:'TST-000004', nama:'Nurul Hidayah', kota:'Yogyakarta', rating:5, pesan:'Tukar tambah laptop lama saya dihitung jujur dan transparan, dapat estimasi langsung di web sebelum datang. Prosesnya cepat, tinggal tambah sedikit sudah dapat unit baru.', avatar:'https://i.pravatar.cc/120?img=45', produk:'Trade-in ASUS Zenbook', aktif:1, urutan:4 },
    { id:'TST-000005', nama:'Fajar Setiawan', kota:'Klaten', rating:4, pesan:'Harga bersaing dengan marketplace besar tapi bisa nego langsung dan dapat bonus mouse. Pengiriman luar kota cepat dan aman.', avatar:'https://i.pravatar.cc/120?img=15', produk:'Lenovo IdeaPad Slim 3', aktif:1, urutan:5 },
    { id:'TST-000006', nama:'Intan Permata', kota:'Sleman', rating:5, pesan:'Anak saya butuh laptop sekolah mendadak, timnya bantu carikan yang pas budget dan stoknya tersedia. Besoknya sudah bisa dipakai.', avatar:'https://i.pravatar.cc/120?img=25', produk:'Acer Aspire 5 Slim', aktif:1, urutan:6 }
  ];

  return { PRODUCT: P, CUSTOMER: C, PROMO: P0, BANNER: B, TESTI: T0 };
}

/* ===========================================================================
 * 32. SETUP SATU KLIK (jalankan dari editor Apps Script)
 * ======================================================================== */
function setupSistem() {
  var log = [];
  Object.keys(T).forEach(function (k) { sheet_(T[k]); log.push('Sheet siap: ' + T[k]); });
  // Reset counter agar ID seed konsisten
  var cSh = sheet_(T.COUNTER);
  if (cSh.getLastRow() > 1) cSh.deleteRows(2, cSh.getLastRow() - 1);
  cSh.appendRow(['PRD', 100]); cSh.appendRow(['CST', 100]); cSh.appendRow(['PRM', 100]);
  cSh.appendRow(['BNR', 100]); cSh.appendRow(['TST', 100]); cSh.appendRow(['INV', 0]);
  cSh.appendRow(['SVC', 0]); cSh.appendRow(['TI', 0]); cSh.appendRow(['PO', 0]);
  cSh.appendRow(['MUT', 0]); cSh.appendRow(['LOG', 0]); cSh.appendRow(['HLD', 0]); cSh.appendRow(['STF', 0]);

  // Pengaturan default
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) {
    if (findById_(T.SETTING, k) === null) setSetting_(k, DEFAULT_SETTINGS[k]);
  });
  log.push('Pengaturan default: ' + Object.keys(DEFAULT_SETTINGS).length + ' kunci');

  // Staf default
  if (!rows_(T.STAFF).length) {
    createStaff_('Owner', '123456', 'OWNER', DEFAULT_SETTINGS.wa, DEFAULT_SETTINGS.email);
    createStaff_('Kasir Satu', '1111', 'KASIR', '', '');
    createStaff_('Teknisi Dua', '2222', 'TEKNISI', '', '');
    createStaff_('Gudang Tiga', '3333', 'GUDANG', '', '');
    log.push('4 akun staf dibuat (Owner PIN 123456, Kasir 1111, Teknisi 2222, Gudang 3333)');
  } else {
    log.push('Staf sudah ada (' + rows_(T.STAFF).length + ' akun) — tidak diubah');
  }

  // Seed data produk/konten
  var seed = SEED_DATA_();
  Object.keys(seed).forEach(function (k) {
    var sh = sheet_(k);
    if (sh.getLastRow() > 1) { log.push('Lewati seed ' + k + ' (sudah ada data)'); return; }
    var head = SCHEMA[k];
    var data = seed[k].map(function (r) { return head.map(function (h) { var v = r[h]; return (v === undefined || v === null) ? '' : (typeof v === 'object' ? JSON.stringify(v) : v); }); });
    sh.getRange(2, 1, data.length, head.length).setValues(data);
    styleHeader_(sh, head.length);
    log.push('Seed ' + k + ': ' + data.length + ' baris');
  });

  bust_();
  var url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (x) { url = '(belum di-deploy)'; }
  Logger.log('=== SETUP SELESAI ===\n' + log.join('\n'));
  Logger.log('\nAPI URL  : ' + url);
  Logger.log('Tes cepat: ' + url + '?action=ping');
  Logger.log('\nLangkah berikutnya:');
  Logger.log('1. Deploy > New deployment > Web app > Execute as: Me, Access: Anyone.');
  Logger.log('2. Copy URL /exec ke theme XML pada CONFIG.API_URL.');
  Logger.log('3. GANTI PIN default segera (Pengaturan > Keamanan).');
  return { ok: true, log: log, api_url: url };
}

/** Utilitas: tambah staf dari editor Apps Script. */
function tambahStaf(nama, pin, role, wa, email) {
  var s = createStaff_(nama, pin, role || 'KASIR', wa || '', email || '');
  Logger.log('Staf dibuat: ' + s.nama + ' (' + s.role + ') ID ' + s.id);
  return s;
}

/** Utilitas: ganti PIN cepat dari editor. */
function gantiPin(nama, pinBaru) {
  var all = rows_(T.STAFF);
  for (var i = 0; i < all.length; i++) {
    if (str_(all[i].nama).toLowerCase() === str_(nama).toLowerCase()) {
      var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
      save_(T.STAFF, { id: all[i].id, pin_hash: hashPin_(pinBaru, salt), pin_salt: salt });
      Logger.log('PIN ' + all[i].nama + ' diubah.');
      return true;
    }
  }
  Logger.log('Staf tidak ditemukan: ' + nama);
  return false;
}

/* ===========================================================================
 * 33. SELF-TEST (jalankan selfTest() di editor Apps Script)
 * ======================================================================== */
function selfTest() {
  var hasil = [], ok = 0, gagal = 0;
  var cek = function (nama, fn) {
    try { var r = fn(); hasil.push('PASS  ' + nama + (r ? '  -> ' + JSON.stringify(r).slice(0, 140) : '')); ok++; }
    catch (e) { hasil.push('FAIL  ' + nama + '  -> ' + (e && e.message)); gagal++; }
  };
  var ctxOwner = { user: { id: 'STF-000001', n: 'Owner', r: 'OWNER' }, params: {} };

  cek('sheet & skema lengkap', function () {
    Object.keys(T).forEach(function (k) { sheet_(T[k]); });
    return Object.keys(T).length + ' tabel';
  });
  cek('pengaturan terbaca', function () { var s = settings_(); if (!s.nama_toko) throw new Error('nama_toko kosong'); return s.nama_toko; });
  cek('katalog publik', function () { var r = h_public_products({ params: { limit: 3 } }); return r.data.length + ' produk (total ' + r.meta.total + ')'; });
  cek('bootstrap publik', function () { var r = h_public_bootstrap({ params: {} }); return r.data.statistik.total_produk + ' produk aktif'; });
  cek('cek stok realtime', function () {
    var r = h_public_stock_check({ params: { items: [{ sku: 'LPT-ASU-VIVO14', qty: 1 }] } });
    if (!r.data.ok) throw new Error('stok produk demo tidak cukup');
    return r.data.items[0].tersedia + ' tersedia';
  });
  cek('estimasi trade-in', function () {
    var r = estimasiTradeIn_({ harga_beli_dulu: 8000000, tahun: 2021, kondisi: 'BAIK', kategori: 'laptop', brand: 'ASUS' });
    return rp_(r.estimasi_lo) + ' - ' + rp_(r.estimasi_hi);
  });
  cek('validasi promo', function () {
    var r = promoCheck_('HEMAT10', 6500000);
    return (r.valid ? 'valid, diskon ' + rp_(r.diskon) : 'tidak valid: ' + r.reason);
  });
  cek('hitung transaksi (tanpa simpan)', function () {
    var h = hitungTransaksi_({ items: [{ sku: 'LPT-ASU-VIVO14', qty: 1 }], promo: 'HEMAT10', bayar: 10000000 });
    return 'total ' + rp_(h.total) + ' kembali ' + rp_(h.kembali);
  });
  cek('login PIN owner', function () {
    var r = h_auth_login({ params: { pin: '123456' } });
    if (!r.data.token) throw new Error('token kosong');
    var u = verifyToken_(r.data.token);
    return 'login sebagai ' + u.n + ' (' + u.r + ')';
  });
  cek('RBAC menolak tanpa token', function () {
    try { requireAuth_('', ['OWNER']); } catch (e) { return e.code; }
    throw new Error('seharusnya gagal');
  });
  cek('explode bill of materials', function () {
    var p = findBy_(T.PRODUCT, 'sku', 'PC-SAR-CREATOR');
    if (!p) throw new Error('bundle demo tidak ada — jalankan setupSistem()');
    var komps = explodeBom_(p);
    return komps.length + ' komponen, max buildable ' + maxBuildable_(p) + ', HPP ideal ' + rp_(bomCost_(p));
  });
  cek('opname SET mode (dry)', function () {
    var p = findBy_(T.PRODUCT, 'sku', 'RAM-KVR-8GD4');
    if (!p) throw new Error('produk demo tidak ada');
    return 'stok saat ini ' + p.stok;
  });
  cek('render template WhatsApp', function () {
    var s = settings_();
    return renderTemplate_(s.wa_template_order, { toko: s.nama_toko, items: '- 1x Test', total: rp_(100000), nama: 'Test', wa: '62812', alamat: '-', kode: 'INV-000001' }).split('\n')[0];
  });
  cek('struk generator', function () {
    var o = { id: 'INV-000001', tanggal: stamp_(), kasir: 'Owner', nama: 'Test', wa: '62812', items: [{ nama: 'Produk Uji', qty: 1, harga: 100000, line: 100000 }], subtotal: 100000, diskon: 0, poin_pakai: 0, ongkir: 0, total: 100000, metode: 'TUNAI', bayar: 100000, kembali: 0, poin_dapat: 100 };
    return struk_(o, settings_()).split('\n').length + ' baris struk';
  });
  cek('audit trail bertambah', function () {
    var n0 = rows_(T.AUDIT).length;
    logAudit_('selfTest', 'SYSTEM', 'SELF_TEST', 'SISTEM', '-', 'uji otomatis');
    var n1 = rows_(T.AUDIT).length;
    if (n1 <= n0) throw new Error('audit tidak bertambah');
    return n1 + ' baris audit';
  });

  Logger.log('=========== SELF TEST ===========\n' + hasil.join('\n') +
    '\n\nTOTAL: ' + ok + ' PASS / ' + gagal + ' FAIL');
  return { ok: ok, gagal: gagal, hasil: hasil };
}
