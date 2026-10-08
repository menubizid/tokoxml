/***************************************************************
 * LAPTORIUM — Toko Online Laptop & PC + POS Kasir
 * Backend REST API : Google Apps Script + Google Spreadsheet
 * Versi            : 1.0.0 | 7 Okt 2026
 *
 * CARA PAKAI SINGKAT
 * 1. Buat Spreadsheet baru > Extensions > Apps Script.
 * 2. Paste seluruh file ini ke Code.gs > Save.
 * 3. Jalankan fungsi `setup()` sekali (beri izin akses).
 * 4. Deploy > New deployment > Web app > Execute as: Me,
 *    Who has access: Anyone > Deploy. Salin Web App URL.
 * 5. Tempel URL + API Key ke pengaturan tema (menu Admin >
 *    Pengaturan, atau konstanta API_URL di theme.xml).
 * 6. (Opsional) Jalankan `seedDemo()` untuk data contoh.
 *
 * FRONTEND melakukan request:
 *  GET  {URL}?action=getProducts&category=laptop&limit=12
 *  POST {URL}  Body JSON text/plain: {"action":"posCheckout",...}
 ***************************************************************/

/* ================= KONFIGURASI ================= */
const APP_NAME    = 'LAPTORIUM';
const APP_VERSION = '1.0.0';
const PROP_API_KEY = 'LAPTORIUM_API_KEY';
const TOKEN_TTL_SEC = 12 * 3600; // masa berlaku token login admin/kasir

/* Skema kolom tiap sheet (urutan = urutan kolom) */
const SCHEMAS = {
  Settings:     ['key', 'value', 'updated_at'],
  Categories:   ['id', 'name', 'slug', 'icon', 'image', 'description', 'sort', 'status'],
  Products:     ['id', 'sku', 'name', 'brand', 'category', 'price', 'promo_price', 'cost_price',
                 'stock', 'condition', 'specs', 'description', 'image_url', 'images',
                 'badge', 'featured', 'bestseller', 'is_new', 'rating', 'sold', 'weight',
                 'status', 'created_at', 'updated_at'],
  Orders:       ['id', 'invoice', 'date', 'customer_name', 'customer_wa', 'customer_email',
                 'customer_address', 'items_json', 'subtotal', 'discount', 'shipping',
                 'total', 'payment_method', 'payment_status', 'order_status', 'notes',
                 'source', 'cashier', 'created_at', 'updated_at'],
  Customers:    ['id', 'name', 'wa', 'email', 'address', 'total_orders', 'total_spend',
                 'created_at', 'updated_at'],
  Services:     ['id', 'name', 'icon', 'short_desc', 'description', 'price_from',
                 'features', 'sort', 'status'],
  Testimonials: ['id', 'name', 'role', 'avatar', 'rating', 'text', 'status', 'created_at'],
  Banners:      ['id', 'title', 'subtitle', 'image_url', 'cta_text', 'cta_link', 'sort', 'status'],
  Faqs:         ['id', 'question', 'answer', 'sort', 'status'],
  TradeIns:     ['id', 'date', 'name', 'wa', 'device_brand', 'device_model', 'condition',
                 'description', 'photo_url', 'est_price', 'status', 'notes', 'created_at'],
  Logs:         ['id', 'date', 'user', 'action', 'detail']
};

/* Aksi baca publik (tanpa API key) — katalog toko */
const PUBLIC_GET = ['health', 'getSettingsPublic', 'getProducts', 'getProduct',
  'getCategories', 'getServices', 'getTestimonials', 'getBanners', 'getFaqs',
  'trackOrder'];
/* Aksi tulis publik (tanpa token, tapi wajib API key ringan via param) */
const PUBLIC_POST = ['createOrder', 'submitTradeIn', 'login'];

/* ================= UTIL SPREADSHEET ================= */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sh_(name) {
  const s = ss_().getSheetByName(name) || ss_().insertSheet(name);
  if (s.getLastRow() === 0) {
    s.appendRow(SCHEMAS[name]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, SCHEMAS[name].length).setFontWeight('bold');
  } else {
    // Pastikan header sesuai skema (tambah kolom baru bila kurang)
    const head = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
    SCHEMAS[name].forEach(function (h) {
      if (head.indexOf(h) === -1) { s.getRange(1, s.getLastColumn() + 1).setValue(h); }
    });
  }
  return s;
}

function headIdx_(sheet) {
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const m = {};
  head.forEach(function (h, i) { m[String(h).trim()] = i; });
  return m;
}

function all_(name) {
  const s = sh_(name), last = s.getLastRow();
  if (last < 2) return [];
  const idx = headIdx_(s);
  const vals = s.getRange(2, 1, last - 1, s.getLastColumn()).getValues();
  return vals.map(function (r, i) {
    const o = { _row: i + 2 };
    Object.keys(idx).forEach(function (k) { o[k] = r[idx[k]]; });
    // Normalisasi angka & boolean ringan
    ['price','promo_price','cost_price','stock','rating','sold','weight','subtotal',
     'discount','shipping','total','sort','price_from','total_orders','total_spend',
     'est_price'].forEach(function (n) {
      if (o[n] !== '' && o[n] !== null && !isNaN(Number(o[n]))) o[n] = Number(o[n]);
    });
    return o;
  });
}

function rowToObj_(name, row) {
  const s = sh_(name), idx = headIdx_(s);
  const r = s.getRange(row, 1, 1, s.getLastColumn()).getValues()[0];
  const o = { _row: row };
  Object.keys(idx).forEach(function (k) { o[k] = r[idx[k]]; });
  return o;
}

function upsert_(name, data, idField) {
  idField = idField || 'id';
  const s = sh_(name), idx = headIdx_(s);
  const now = now_();
  data.updated_at = data.updated_at || now;
  if (!data[idField]) {
    data[idField] = uid_(name.substring(0, 3).toUpperCase());
    data.created_at = data.created_at || now;
    const row = SCHEMAS[name].map(function (h) { return data[h] !== undefined ? data[h] : ''; });
    s.appendRow(row);
    return rowToObj_(name, s.getLastRow());
  }
  const rows = all_(name);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][idField]) === String(data[idField])) {
      const r = rows[i]._row;
      Object.keys(data).forEach(function (k) {
        if (idx[k] !== undefined) s.getRange(r, idx[k] + 1).setValue(data[k]);
      });
      return rowToObj_(name, r);
    }
  }
  // id tidak ditemukan -> anggap data baru dengan id tsb
  data.created_at = data.created_at || now;
  const row = SCHEMAS[name].map(function (h) { return data[h] !== undefined ? data[h] : ''; });
  s.appendRow(row);
  return rowToObj_(name, s.getLastRow());
}

function remove_(name, id, idField) {
  idField = idField || 'id';
  const rows = all_(name);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][idField]) === String(id)) {
      sh_(name).deleteRow(rows[i]._row);
      return true;
    }
  }
  return false;
}

function find_(name, id, idField) {
  idField = idField || 'id';
  const rows = all_(name);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][idField]) === String(id)) return rows[i];
  }
  return null;
}

/* ================= UTIL UMUM ================= */
function now_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function uid_(p) {
  return (p || 'ID') + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMddHHmmss')
    + '-' + Math.floor(100 + Math.random() * 900);
}
function invoice_(prefix) {
  const d = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  return prefix + '-' + d + '-' + Math.floor(1000 + Math.random() * 9000);
}
function slug_(t) {
  return String(t || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function sha_(t) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function ok_(data, extra) {
  const r = { ok: true, data: data === undefined ? null : data };
  if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
  return out_(r);
}
function err_(msg, code) { return out_({ ok: false, error: msg, code: code || 'ERROR' }); }

function getApiKey_() { return PropertiesService.getScriptProperties().getProperty(PROP_API_KEY) || ''; }
function validKey_(key) {
  const k = getApiKey_();
  return k !== '' && String(key || '') === k;
}

/* ---- Settings (key-value) ---- */
function getSetting_(key, def) {
  const rows = all_('Settings');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i].key) === String(key)) return rows[i].value;
  }
  return def === undefined ? '' : def;
}
function setSetting_(key, value) {
  const s = sh_('Settings'), rows = all_('Settings');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i].key) === String(key)) {
      s.getRange(rows[i]._row, 2).setValue(value);
      s.getRange(rows[i]._row, 3).setValue(now_());
      return;
    }
  }
  s.appendRow([key, value, now_()]);
}
function allSettings_(isPublic) {
  const rows = all_('Settings'), o = {};
  const secret = ['admin_pass', 'pos_pin'];
  rows.forEach(function (r) {
    if (isPublic && secret.indexOf(String(r.key)) !== -1) return;
    o[r.key] = r.value;
  });
  return o;
}

/* ---- Auth token (CacheService) ---- */
function issueToken_(username, role) {
  const tok = Utilities.base64EncodeWebSafe(Utilities.getUuid() + ':' + Date.now());
  CacheService.getScriptCache().put('tok_' + tok, JSON.stringify({ u: username, r: role }), TOKEN_TTL_SEC);
  return tok;
}
function checkToken_(tok) {
  if (!tok) return null;
  const v = CacheService.getScriptCache().get('tok_' + tok);
  return v ? JSON.parse(v) : null;
}

/* ---- Log aktivitas ---- */
function log_(user, action, detail) {
  try {
    sh_('Logs').appendRow([uid_('LOG'), now_(), user || 'system', action, String(detail || '').substring(0, 500)]);
  } catch (e) { /* abaikan */ }
}

/* ================= ROUTER ================= */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = p.action || 'health';
    if (PUBLIC_GET.indexOf(action) === -1 && !validKey_(p.key)) {
      return err_('API key tidak valid. Sertakan parameter ?key=...', 'AUTH');
    }
    switch (action) {
      case 'health':            return ok_({ app: APP_NAME, version: APP_VERSION, time: now_() });
      case 'getSettingsPublic': return ok_(allSettings_(true));
      case 'getSettings':       return ok_(allSettings_(false));
      case 'getProducts':       return ok_(apiGetProducts_(p));
      case 'getProduct':        return ok_(find_('Products', p.id));
      case 'getCategories':     return ok_(apiGetCategories_());
      case 'getServices':       return ok_(apiGetServices_());
      case 'getTestimonials':   return ok_(apiGetTestimonials_());
      case 'getBanners':        return ok_(apiGetBanners_());
      case 'getFaqs':           return ok_(apiGetFaqs_());
      case 'trackOrder':        return ok_(apiTrackOrder_(p.code));
      case 'getOrders':         return ok_(apiGetOrders_(p), { total: all_('Orders').length });
      case 'getOrder':          return ok_(find_('Orders', p.id));
      case 'getCustomers':      return ok_(apiGetCustomers_(p));
      case 'getTradeIns':       return ok_(apiGetTradeIns_(p));
      case 'getDashboard':      return ok_(apiDashboard_());
      case 'getReport':         return ok_(apiReport_(p));
      case 'getLogs':           return ok_(all_('Logs').slice(-100).reverse());
      default:                  return err_('Aksi tidak dikenal: ' + action, 'NOT_FOUND');
    }
  } catch (ex) { return err_(String(ex && ex.message || ex), 'EXCEPTION'); }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = body.action || '';
    // Endpoint publik tulis
    if (PUBLIC_POST.indexOf(action) === -1) {
      const ses = checkToken_(body.token);
      if (!ses) return err_('Sesi berakhir / token tidak valid. Silakan login ulang.', 'AUTH');
      body._session = ses;
    } else if (action === 'createOrder' || action === 'submitTradeIn') {
      // Kunci API ringan untuk anti-spam endpoint publik
      if (!validKey_(body.key)) return err_('API key tidak valid.', 'AUTH');
    }
    lock.waitLock(15000);
    let res;
    switch (action) {
      case 'login':              res = apiLogin_(body); break;
      case 'saveSettings':       res = apiSaveSettings_(body); break;
      case 'upsertCategory':     res = upsert_('Categories', clean_(body.data, SCHEMAS.Categories)); log_(body._session.u, 'upsertCategory', body.data && body.data.name); break;
      case 'deleteCategory':     res = { deleted: remove_('Categories', body.id) }; log_(body._session.u, 'deleteCategory', body.id); break;
      case 'upsertProduct':      res = apiUpsertProduct_(body); break;
      case 'deleteProduct':      res = { deleted: remove_('Products', body.id) }; log_(body._session.u, 'deleteProduct', body.id); break;
      case 'adjustStock':        res = apiAdjustStock_(body); break;
      case 'upsertService':      res = upsert_('Services', clean_(body.data, SCHEMAS.Services)); log_(body._session.u, 'upsertService', body.data && body.data.name); break;
      case 'deleteService':      res = { deleted: remove_('Services', body.id) }; break;
      case 'upsertTestimonial':  res = upsert_('Testimonials', clean_(body.data, SCHEMAS.Testimonials)); break;
      case 'deleteTestimonial':  res = { deleted: remove_('Testimonials', body.id) }; break;
      case 'upsertBanner':       res = upsert_('Banners', clean_(body.data, SCHEMAS.Banners)); break;
      case 'deleteBanner':       res = { deleted: remove_('Banners', body.id) }; break;
      case 'upsertFaq':          res = upsert_('Faqs', clean_(body.data, SCHEMAS.Faqs)); break;
      case 'deleteFaq':          res = { deleted: remove_('Faqs', body.id) }; break;
      case 'createOrder':        res = apiCreateOrder_(body, 'online'); break;
      case 'posCheckout':        res = apiCreateOrder_(body, 'pos'); break;
      case 'updateOrder':        res = apiUpdateOrder_(body); break;
      case 'deleteOrder':        res = { deleted: remove_('Orders', body.id) }; log_(body._session.u, 'deleteOrder', body.id); break;
      case 'upsertCustomer':     res = upsert_('Customers', clean_(body.data, SCHEMAS.Customers)); break;
      case 'deleteCustomer':     res = { deleted: remove_('Customers', body.id) }; break;
      case 'submitTradeIn':      res = apiSubmitTradeIn_(body); break;
      case 'updateTradeIn':      res = apiUpdateTradeIn_(body); break;
      case 'seedDemo':           res = seedDemo_(); log_(body._session.u, 'seedDemo', 'ok'); break;
      default:                   return err_('Aksi tidak dikenal: ' + action, 'NOT_FOUND');
    }
    return ok_(res);
  } catch (ex) {
    return err_(String(ex && ex.message || ex), 'EXCEPTION');
  } finally { try { lock.releaseLock(); } catch (e2) {} }
}

/* Ambil field sesuai skema saja */
function clean_(data, schema) {
  const o = {};
  schema.forEach(function (k) { if (data && data[k] !== undefined) o[k] = data[k]; });
  return o;
}

/* ================= HANDLER BACA (GET) ================= */
function activeOnly_(rows) { return rows.filter(function (r) { return String(r.status || 'active') === 'active'; }); }
function sortBy_(rows, key, dir) {
  return rows.sort(function (a, b) {
    const x = a[key], y = b[key];
    if (x === y) return 0;
    return ((x > y) ? 1 : -1) * (dir === 'desc' ? -1 : 1);
  });
}

function apiGetProducts_(p) {
  let rows = all_('Products');
  const q = String(p.search || p.q || '').toLowerCase();
  if (q) rows = rows.filter(function (r) {
    return (String(r.name) + ' ' + String(r.brand) + ' ' + String(r.category) + ' ' + String(r.specs)).toLowerCase().indexOf(q) !== -1;
  });
  if (p.category) rows = rows.filter(function (r) { return slug_(r.category) === slug_(p.category) || String(r.category) === String(p.category); });
  if (p.brand) rows = rows.filter(function (r) { return String(r.brand).toLowerCase() === String(p.brand).toLowerCase(); });
  if (p.condition) rows = rows.filter(function (r) { return String(r.condition) === String(p.condition); });
  if (p.featured) rows = rows.filter(function (r) { return String(r.featured) === 'TRUE' || r.featured === true || r.featured === 1; });
  if (p.bestseller) rows = rows.filter(function (r) { return String(r.bestseller) === 'TRUE' || r.bestseller === true || r.bestseller === 1; });
  if (p.is_new) rows = rows.filter(function (r) { return String(r.is_new) === 'TRUE' || r.is_new === true || r.is_new === 1; });
  if (p.min_price) rows = rows.filter(function (r) { return Number(r.promo_price || r.price) >= Number(p.min_price); });
  if (p.max_price) rows = rows.filter(function (r) { return Number(r.promo_price || r.price) <= Number(p.max_price); });
  if (!p.include_draft) rows = activeOnly_(rows);
  // Sort: newest | price_asc | price_desc | popular | name
  const sort = p.sort || 'newest';
  if (sort === 'price_asc') rows.sort(function (a, b) { return effPrice_(a) - effPrice_(b); });
  else if (sort === 'price_desc') rows.sort(function (a, b) { return effPrice_(b) - effPrice_(a); });
  else if (sort === 'popular') rows.sort(function (a, b) { return Number(b.sold || 0) - Number(a.sold || 0); });
  else if (sort === 'name') rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  else rows = sortBy_(rows, 'created_at', 'desc');
  const page = Math.max(1, Number(p.page || 1));
  const limit = Math.min(100, Math.max(1, Number(p.limit || 24)));
  const total = rows.length;
  rows = rows.slice((page - 1) * limit, page * limit);
  rows.forEach(parseProduct_);
  return { items: rows, page: page, limit: limit, total: total, pages: Math.ceil(total / limit) };
}
function effPrice_(r) { const pr = Number(r.promo_price || 0); return pr > 0 ? pr : Number(r.price || 0); }
function parseProduct_(r) {
  r.price = Number(r.price || 0); r.promo_price = Number(r.promo_price || 0);
  r.stock = Number(r.stock || 0); r.rating = Number(r.rating || 0); r.sold = Number(r.sold || 0);
  r.eff_price = effPrice_(r);
  r.discount_pct = r.price > 0 && r.promo_price > 0 ? Math.round((1 - r.promo_price / r.price) * 100) : 0;
  // images bisa JSON array / dipisah koma / kosong
  if (typeof r.images === 'string' && r.images.trim().charAt(0) === '[') {
    try { r.images = JSON.parse(r.images); } catch (e) { r.images = []; }
  } else if (typeof r.images === 'string' && r.images.trim()) {
    r.images = r.images.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  } else r.images = [];
  if (r.image_url && r.images.indexOf(r.image_url) === -1) r.images.unshift(r.image_url);
  return r;
}

function apiGetCategories_() { return sortBy_(activeOnly_(all_('Categories')), 'sort').map(function (c) { c.slug = c.slug || slug_(c.name); return c; }); }
function apiGetServices_() { return sortBy_(activeOnly_(all_('Services')), 'sort'); }
function apiGetTestimonials_() { return activeOnly_(all_('Testimonials')).reverse(); }
function apiGetBanners_() { return sortBy_(activeOnly_(all_('Banners')), 'sort'); }
function apiGetFaqs_() { return sortBy_(activeOnly_(all_('Faqs')), 'sort'); }

function apiTrackOrder_(code) {
  code = String(code || '').trim();
  if (!code) return null;
  const rows = all_('Orders');
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i].invoice).toLowerCase() === code.toLowerCase() || String(rows[i].id) === code) {
      const o = rows[i];
      try { o.items = JSON.parse(o.items_json || '[]'); } catch (e) { o.items = []; }
      delete o.items_json;
      return o;
    }
  }
  return null;
}

function apiGetOrders_(p) {
  let rows = all_('Orders');
  if (p.source) rows = rows.filter(function (r) { return String(r.source) === String(p.source); });
  if (p.status) rows = rows.filter(function (r) { return String(r.order_status) === String(p.status); });
  if (p.pay_status) rows = rows.filter(function (r) { return String(r.payment_status) === String(p.pay_status); });
  if (p.date) rows = rows.filter(function (r) { return String(r.date).substring(0, 10) === String(p.date); });
  if (p.search) {
    const q = String(p.search).toLowerCase();
    rows = rows.filter(function (r) {
      return (String(r.invoice) + ' ' + String(r.customer_name) + ' ' + String(r.customer_wa)).toLowerCase().indexOf(q) !== -1;
    });
  }
  rows = sortBy_(rows, 'created_at', 'desc');
  const limit = Math.min(200, Math.max(1, Number(p.limit || 50)));
  const page = Math.max(1, Number(p.page || 1));
  return { items: rows.slice((page - 1) * limit, page * limit), total: rows.length, page: page };
}

function apiGetCustomers_(p) {
  let rows = all_('Customers');
  if (p.search) {
    const q = String(p.search).toLowerCase();
    rows = rows.filter(function (r) { return (String(r.name) + ' ' + String(r.wa)).toLowerCase().indexOf(q) !== -1; });
  }
  return sortBy_(rows, 'updated_at', 'desc').slice(0, 200);
}

function apiGetTradeIns_(p) {
  let rows = all_('TradeIns');
  if (p.status) rows = rows.filter(function (r) { return String(r.status) === String(p.status); });
  return sortBy_(rows, 'created_at', 'desc');
}

/* ---- Dashboard admin ---- */
function apiDashboard_() {
  const orders = all_('Orders');
  const paid = orders.filter(function (o) { return String(o.payment_status) === 'paid' && String(o.order_status) !== 'cancelled'; });
  const revenue = paid.reduce(function (s, o) { return s + Number(o.total || 0); }, 0);
  const today = today_();
  const todayOrders = orders.filter(function (o) { return String(o.date).substring(0, 10) === today; });
  const todayRev = todayOrders.filter(function (o) { return String(o.payment_status) === 'paid'; })
    .reduce(function (s, o) { return s + Number(o.total || 0); }, 0);
  const products = all_('Products');
  const lowStock = products.filter(function (r) { return Number(r.stock || 0) <= 3 && String(r.status) === 'active'; })
    .map(function (r) { return { id: r.id, name: r.name, stock: Number(r.stock || 0) }; });
  // Grafik 7 hari terakhir
  const days = [], map = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    days.push(k); map[k] = 0;
  }
  paid.forEach(function (o) {
    const k = String(o.date).substring(0, 10);
    if (map[k] !== undefined) map[k] += Number(o.total || 0);
  });
  const chart7 = days.map(function (d) { return { date: d, total: map[d] }; });
  // Produk terlaris
  const top = products.slice().sort(function (a, b) { return Number(b.sold || 0) - Number(a.sold || 0); })
    .slice(0, 5).map(function (r) { return { id: r.id, name: r.name, sold: Number(r.sold || 0), stock: Number(r.stock || 0) }; });
  return {
    revenue: revenue, orders_count: orders.length,
    products_count: products.filter(function (r) { return String(r.status) === 'active'; }).length,
    customers_count: all_('Customers').length,
    pending_orders: orders.filter(function (o) { return String(o.order_status) === 'pending'; }).length,
    pending_tradeins: all_('TradeIns').filter(function (t) { return String(t.status) === 'pending'; }).length,
    today_revenue: todayRev, today_orders: todayOrders.length,
    chart7: chart7, top_products: top, low_stock: lowStock,
    recent_orders: sortBy_(orders, 'created_at', 'desc').slice(0, 8)
  };
}

/* ---- Laporan POS/penjualan ---- */
function apiReport_(p) {
  const period = p.period || 'daily'; // daily | monthly
  const orders = all_('Orders').filter(function (o) {
    return String(o.payment_status) === 'paid' && String(o.order_status) !== 'cancelled';
  });
  const groups = {};
  orders.forEach(function (o) {
    const d = String(o.date).substring(0, 10);
    const k = period === 'monthly' ? d.substring(0, 7) : d;
    if (!groups[k]) groups[k] = { period: k, omzet: 0, transaksi: 0, items: 0, by_payment: {}, by_source: {} };
    groups[k].omzet += Number(o.total || 0);
    groups[k].transaksi += 1;
    try {
      const items = JSON.parse(o.items_json || '[]');
      items.forEach(function (it) { groups[k].items += Number(it.qty || 0); });
    } catch (e) {}
    const pm = o.payment_method || 'cash';
    groups[k].by_payment[pm] = (groups[k].by_payment[pm] || 0) + Number(o.total || 0);
    const sc = o.source || 'online';
    groups[k].by_source[sc] = (groups[k].by_source[sc] || 0) + 1;
  });
  return Object.keys(groups).sort().reverse().slice(0, 60).map(function (k) { return groups[k]; });
}

/* ================= HANDLER TULIS (POST) ================= */
function apiLogin_(body) {
  const user = getSetting_('admin_user', 'admin');
  const passHash = getSetting_('admin_pass', sha_('admin123'));
  const pin = getSetting_('pos_pin', '1234');
  if (body.mode === 'pos') {
    if (String(body.pin || '') === String(pin)) {
      return { token: issueToken_(body.cashier || 'kasir', 'kasir'), role: 'kasir', name: body.cashier || 'Kasir' };
    }
    throw new Error('PIN kasir salah.');
  }
  if (String(body.username || '') === String(user) && sha_(String(body.password || '')) === String(passHash)) {
    return { token: issueToken_(user, 'admin'), role: 'admin', name: user };
  }
  throw new Error('Username / password salah.');
}

function apiSaveSettings_(body) {
  const d = body.data || {};
  Object.keys(d).forEach(function (k) {
    if (k === 'admin_pass_new' && d[k]) setSetting_('admin_pass', sha_(String(d[k])));
    else if (k !== 'admin_pass' && k !== 'admin_pass_new') setSetting_(k, d[k]);
  });
  log_(body._session.u, 'saveSettings', Object.keys(d).join(','));
  return allSettings_(false);
}

function apiUpsertProduct_(body) {
  const d = clean_(body.data, SCHEMAS.Products);
  if (!d.name) throw new Error('Nama produk wajib diisi.');
  d.price = Number(d.price || 0); d.promo_price = Number(d.promo_price || 0);
  d.cost_price = Number(d.cost_price || 0); d.stock = Number(d.stock || 0);
  d.rating = Number(d.rating || 0); d.sold = Number(d.sold || 0);
  if (!d.sku) d.sku = 'SKU-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMddHHmmss');
  if (!d.status) d.status = 'active';
  if (!d.condition) d.condition = 'new';
  const r = upsert_('Products', d);
  log_(body._session.u, 'upsertProduct', d.name);
  return parseProduct_(r);
}

function apiAdjustStock_(body) {
  const p = find_('Products', body.id);
  if (!p) throw new Error('Produk tidak ditemukan.');
  const s = sh_('Products'), idx = headIdx_(s);
  const cur = Number(p.stock || 0);
  const next = body.mode === 'set' ? Number(body.qty || 0) : cur + Number(body.qty || 0);
  if (next < 0) throw new Error('Stok tidak boleh minus.');
  s.getRange(p._row, idx.stock + 1).setValue(next);
  s.getRange(p._row, idx.updated_at + 1).setValue(now_());
  log_(body._session.u, 'adjustStock', p.name + ': ' + cur + ' -> ' + next);
  return { id: p.id, stock: next };
}

/* ---- Buat order (online & POS) + potong stok atomik ---- */
function apiCreateOrder_(body, source) {
  const items = body.items || [];
  if (!items.length) throw new Error('Keranjang masih kosong.');
  const products = {};
  all_('Products').forEach(function (r) { products[String(r.id)] = r; });

  // Validasi stok & hitung total di server (anti manipulasi harga)
  let subtotal = 0;
  const lines = items.map(function (it) {
    const p = products[String(it.id)];
    if (!p) throw new Error('Produk tidak ditemukan: ' + it.id);
    if (String(p.status) !== 'active') throw new Error('Produk nonaktif: ' + p.name);
    const qty = Math.max(1, Number(it.qty || 1));
    if (Number(p.stock || 0) < qty) throw new Error('Stok kurang: ' + p.name + ' (sisa ' + p.stock + ')');
    const price = effPrice_(p);
    subtotal += price * qty;
    return { id: p.id, sku: p.sku, name: p.name, price: price, qty: qty, subtotal: price * qty };
  });

  const discount = Math.max(0, Number(body.discount || 0));
  const shipping = source === 'pos' ? 0 : Math.max(0, Number(body.shipping || 0));
  const total = Math.max(0, subtotal - discount + shipping);
  const payMethod = body.payment_method || (source === 'pos' ? 'cash' : 'transfer');
  const pay = Number(body.pay || body.cash_received || 0);

  if (source === 'pos') {
    if (payMethod === 'cash' && pay < total) throw new Error('Uang tunai kurang. Total ' + total + ', bayar ' + pay + '.');
  }

  const isPaid = source === 'pos' ? true : (String(body.payment_status || '') === 'paid');
  const order = {
    id: uid_('ORD'),
    invoice: source === 'pos' ? invoice_('POS') : invoice_('INV'),
    date: now_(),
    customer_name: body.customer_name || (source === 'pos' ? 'Pelanggan' : ''),
    customer_wa: body.customer_wa || '',
    customer_email: body.customer_email || '',
    customer_address: body.customer_address || '',
    items_json: JSON.stringify(lines),
    subtotal: subtotal, discount: discount, shipping: shipping, total: total,
    payment_method: payMethod,
    payment_status: isPaid ? 'paid' : 'unpaid',
    order_status: source === 'pos' ? 'completed' : 'pending',
    notes: body.notes || '',
    source: source,
    cashier: body.cashier || (body._session ? body._session.u : ''),
    created_at: now_(), updated_at: now_()
  };
  upsert_('Orders', order);

  // Potong stok + tambah sold
  const s = sh_('Products'), idx = headIdx_(s);
  lines.forEach(function (ln) {
    const p = products[String(ln.id)];
    s.getRange(p._row, idx.stock + 1).setValue(Number(p.stock || 0) - ln.qty);
    s.getRange(p._row, idx.sold + 1).setValue(Number(p.sold || 0) + ln.qty);
    s.getRange(p._row, idx.updated_at + 1).setValue(now_());
  });

  // Upsert customer (online ber-WA / POS bernama)
  if (order.customer_wa || (source === 'pos' && order.customer_name && order.customer_name !== 'Pelanggan')) {
    upsertCustomerTx_(order);
  }
  log_(order.cashier || 'online', source === 'pos' ? 'posCheckout' : 'createOrder', order.invoice + ' Rp' + total);
  try { order.items = JSON.parse(order.items_json); } catch (e) { order.items = lines; }
  order.change = source === 'pos' && payMethod === 'cash' ? Math.max(0, pay - total) : 0;
  order.pay = pay;
  return order;
}

function upsertCustomerTx_(order) {
  const rows = all_('Customers');
  let found = null;
  for (let i = 0; i < rows.length; i++) {
    if (order.customer_wa && String(rows[i].wa) === String(order.customer_wa)) { found = rows[i]; break; }
  }
  if (found) {
    const s = sh_('Customers'), idx = headIdx_(s);
    s.getRange(found._row, idx.total_orders + 1).setValue(Number(found.total_orders || 0) + 1);
    s.getRange(found._row, idx.total_spend + 1).setValue(Number(found.total_spend || 0) + Number(order.total || 0));
    s.getRange(found._row, idx.updated_at + 1).setValue(now_());
  } else {
    upsert_('Customers', {
      name: order.customer_name, wa: order.customer_wa, email: order.customer_email,
      address: order.customer_address, total_orders: 1, total_spend: Number(order.total || 0)
    });
  }
}

function apiUpdateOrder_(body) {
  const o = find_('Orders', body.id);
  if (!o) throw new Error('Order tidak ditemukan.');
  const d = { id: body.id, updated_at: now_() };
  ['payment_status', 'order_status', 'notes', 'customer_name', 'customer_wa', 'customer_address'].forEach(function (k) {
    if (body[k] !== undefined) d[k] = body[k];
  });
  // Jika dibatalkan -> kembalikan stok
  if (body.order_status === 'cancelled' && String(o.order_status) !== 'cancelled') {
    try {
      const items = JSON.parse(o.items_json || '[]');
      const s = sh_('Products'), idx = headIdx_(s);
      items.forEach(function (ln) {
        const p = find_('Products', ln.id);
        if (p) {
          s.getRange(p._row, idx.stock + 1).setValue(Number(p.stock || 0) + Number(ln.qty || 0));
          s.getRange(p._row, idx.sold + 1).setValue(Math.max(0, Number(p.sold || 0) - Number(ln.qty || 0)));
        }
      });
    } catch (e) {}
  }
  const r = upsert_('Orders', d);
  log_(body._session.u, 'updateOrder', o.invoice + ' -> ' + (body.order_status || '') + '/' + (body.payment_status || ''));
  return r;
}

/* ---- Trade-In (Jual device ke toko) ---- */
function apiSubmitTradeIn_(body) {
  const d = clean_(body.data || body, SCHEMAS.TradeIns);
  if (!d.name || !d.wa || !d.device_brand) throw new Error('Nama, No. WhatsApp, dan merek device wajib diisi.');
  d.date = now_(); d.status = 'pending'; d.created_at = now_();
  const r = upsert_('TradeIns', d);
  log_('online', 'submitTradeIn', d.name + ' - ' + d.device_brand + ' ' + (d.device_model || ''));
  return r;
}
function apiUpdateTradeIn_(body) {
  const t = find_('TradeIns', body.id);
  if (!t) throw new Error('Data trade-in tidak ditemukan.');
  const d = { id: body.id, updated_at: now_() };
  ['status', 'est_price', 'notes'].forEach(function (k) { if (body[k] !== undefined) d[k] = body[k]; });
  const r = upsert_('TradeIns', d);
  log_(body._session.u, 'updateTradeIn', t.name + ' -> ' + (body.status || ''));
  return r;
}

/* ================= SETUP & SEED ================= */
/** Jalankan sekali dari editor Apps Script untuk inisialisasi. */
function setup() {
  Object.keys(SCHEMAS).forEach(function (n) { sh_(n); });
  let key = getApiKey_();
  if (!key) {
    key = Utilities.base64EncodeWebSafe(Utilities.getUuid()).replace(/[^a-zA-Z0-9]/g, '').substring(0, 24);
    PropertiesService.getScriptProperties().setProperty(PROP_API_KEY, key);
  }
  const defaults = {
    store_name: 'Laptorium', store_tagline: 'Jual Beli Laptop & PC — Baru & Second Berkualitas',
    store_wa: '6281234567890', store_email: 'halo@laptorium.id',
    store_address: 'Jl. Merdeka No. 88, Bandung, Jawa Barat',
    store_hours: 'Senin–Sabtu, 09.00–20.00 WIB',
    hero_title: 'Laptop & PC Impian, Harga Jujur, Garansi Jelas.',
    hero_subtitle: 'Pusat jual beli laptop & PC baru/second. Bisa tukar tambah, servis, dan rakit PC sesuai bujet. Dipercaya 12.000+ pelanggan.',
    shipping_flat: '15000', free_shipping_min: '5000000',
    admin_user: 'admin', pos_pin: '1234',
    announcement: 'Promo bulan ini: gratis ongkir + gratis antivirus premium tiap pembelian laptop!',
    primary_color: '#2563eb', accent_color: '#7c3aed',
    bank_info: 'BCA 1234567890 a.n. Laptorium — Mandiri 9876543210 a.n. Laptorium — QRIS tersedia di kasir',
    maps_url: 'https://maps.google.com/?q=Bandung'
  };
  Object.keys(defaults).forEach(function (k) {
    if (!getSetting_(k, '')) setSetting_(k, defaults[k]);
  });
  if (!getSetting_('admin_pass', '')) setSetting_('admin_pass', sha_('admin123'));
  Logger.log('SETUP SELESAI. API KEY ANDA: ' + key);
  Logger.log('Salin API key ini ke pengaturan tema Blogspot (Admin > Pengaturan).');
  return { apiKey: key };
}

/** Isi spreadsheet dengan data demo. Bisa via editor: seedDemo() */
function seedDemo() { return seedDemo_(); }
function seedDemo_() {
  const U = function (id, w) { return 'https://images.unsplash.com/' + id + '?auto=format&fit=crop&w=' + (w || 800) + '&q=80'; };
  const t = now_();

  // Kategori
  [['Laptop Baru', 'laptop', '💻'], ['Laptop Second', 'laptop-second', '♻️'],
   ['PC & Komputer', 'pc', '🖥️'], ['PC Gaming & Rakitan', 'pc-gaming', '🎮'],
   ['Aksesoris', 'aksesoris', '🎧'], ['Sparepart & Servis', 'sparepart', '🔧']
  ].forEach(function (c, i) {
    upsert_('Categories', { name: c[0], slug: c[1], icon: c[2], description: 'Koleksi ' + c[0] + ' pilihan terbaik.', sort: i + 1, status: 'active' });
  });

  // Produk demo
  const P = [
    ['ASUS VivoBook 14 OLED', 'ASUS', 'Laptop Baru', 9499000, 8999000, 15, 'Intel Core i5-1335U • 16GB • 512GB SSD • OLED 14"', U('photo-1496181133206-80ce9b88a853'), 'Best Seller', 1, 1, 0, 4.9, 210],
    ['Lenovo ThinkPad E14 Gen 5', 'Lenovo', 'Laptop Baru', 12799000, 11999000, 8, 'Ryzen 7 7730U • 16GB • 512GB SSD • 14" IPS', U('photo-1593642632823-8f785ba67e45'), '', 1, 0, 1, 4.8, 96],
    ['MacBook Air M2 13"', 'Apple', 'Laptop Baru', 16999000, 0, 6, 'Apple M2 • 8GB • 256GB • Retina 13.6"', U('photo-1611186871348-b1ce696e52c9'), 'Premium', 1, 0, 1, 5.0, 74],
    ['HP Pavilion Gaming 15', 'HP', 'Laptop Baru', 13999000, 12799000, 10, 'i5-12450H • RTX 2050 • 16GB • 512GB SSD', U('photo-1603302576837-37561b2e2302'), '-9%', 0, 1, 0, 4.7, 158],
    ['ThinkPad X1 Carbon 2nd', 'Lenovo', 'Laptop Second', 12500000, 6900000, 4, 'i7 Gen 8 • 16GB • 512GB • Mulus 97% • Garansi toko 6 bln', U('photo-1588872657578-7efd1f1555ed'), 'Second Mulus', 1, 1, 0, 4.9, 320],
    ['MacBook Pro 2019 16" 2nd', 'Apple', 'Laptop Second', 28000000, 13500000, 3, 'i9 • 16GB • 1TB • Layar 16" • Baterai 89%', U('photo-1517336714731-489689fd1ca8'), 'Second Mulus', 0, 0, 0, 4.8, 88],
    ['PC Office Core i5 Gen 12', 'Rakitan', 'PC & Komputer', 6800000, 6250000, 12, 'i5-12400 • 16GB • 512GB NVMe • Monitor 22"', U('photo-1547082299-de196ea013d6'), 'Hemat', 0, 1, 0, 4.8, 143],
    ['PC Gaming RTX 4060', 'Rakitan', 'PC Gaming & Rakitan', 15990000, 14990000, 5, 'Ryzen 5 7600 • RTX 4060 • 32GB DDR5 • 1TB NVMe • RGB', U('photo-1587202372775-e229b06a1ea6'), 'Best Seller', 1, 1, 1, 5.0, 187],
    ['PC Creator Ryzen 9', 'Rakitan', 'PC Gaming & Rakitan', 22500000, 0, 3, 'Ryzen 9 7900 • RTX 4070 • 64GB • 2TB NVMe', U('photo-1593640408182-31c70c8268f5'), 'Pro', 0, 0, 1, 4.9, 41],
    ['Logitech MX Master 3S', 'Logitech', 'Aksesoris', 1899000, 1699000, 30, 'Mouse wireless flagship • Silent click • Garansi resmi 2 thn', U('photo-1527864550417-7fd91fc51a46'), '', 0, 1, 0, 4.9, 402],
    ['Samsung 990 Pro 1TB NVMe', 'Samsung', 'Aksesoris', 2150000, 1985000, 25, 'SSD NVMe Gen4 • Read 7.450 MB/s • Garansi 5 thn', U('photo-1597872200969-2b65d56bd16b'), '', 0, 0, 0, 4.8, 265],
    ['Kursi Gaming Ergo X1', 'Rexus', 'Aksesoris', 2799000, 2399000, 9, 'Ergonomis • Armrest 4D • Max 150kg', U('photo-1598550476439-6847785fcea6'), '-14%', 0, 0, 1, 4.7, 119]
  ];
  P.forEach(function (p, i) {
    upsert_('Products', {
      sku: 'LPT-2026-' + (1001 + i), name: p[0], brand: p[1], category: p[2],
      price: p[3], promo_price: p[4], cost_price: Math.round(p[3] * 0.82),
      stock: p[5], condition: p[2] === 'Laptop Second' ? 'second' : 'new',
      specs: p[6], description: p[0] + ' — original, bergaransi resmi/toko, gratis instalasi software dasar & antivirus premium.',
      image_url: p[7], images: p[7], badge: p[8],
      featured: p[9] ? 'TRUE' : 'FALSE', bestseller: p[10] ? 'TRUE' : 'FALSE', is_new: p[11] ? 'TRUE' : 'FALSE',
      rating: p[12], sold: p[13], weight: 2500, status: 'active', created_at: t, updated_at: t
    });
  });

  // Layanan
  [
    ['Tukar Tambah', '🔄', 'Tukar laptop/PC lamamu dengan unit baru. Estimasi harga transparan dalam 10 menit.', 'Gratis', 'Estimasi 10 menit|Bisa semua merek|Potongan langsung|Data lama aman di-wipe'],
    ['Servis & Upgrade', '🛠️', 'Servis laptop/PC, ganti SSD/RAM, instal ulang, cleaning total.', '50000', 'Teknisi bersertifikat|Sparepart original|Garansi servis 30 hari|Antar-jemput area kota'],
    ['Rakit PC Custom', '🎮', 'Rakit PC gaming, editing, atau office sesuai bujet & kebutuhan.', 'Gratis konsultasi', 'Konsultasi gratis|Cable management rapi|Stress-test 24 jam|Garansi rakitan 1 tahun'],
    ['Jual Laptop Bekas', '💰', 'Jual laptop/PC bekasmu ke kami dengan harga terbaik & pembayaran tunai hari itu juga.', 'Tunai hari ini', 'Harga terbaik|Bayar tunai/Langsung transfer|Gratis antar-jemput|Proses 15 menit'],
    ['Sewa Laptop Korporat', '🏢', 'Sewa laptop untuk event, training, & karyawan. Unit terawat + support IT.', '150000/bln', 'Minimal 5 unit|Support IT standby|Unit pengganti 1x24 jam|Kontrak fleksibel']
  ].forEach(function (s, i) {
    upsert_('Services', { name: s[0], icon: s[1], short_desc: s[2], description: s[2], price_from: s[3], features: s[4], sort: i + 1, status: 'active' });
  });

  // Testimoni
  [
    ['Rizky Pratama', 'Mahasiswa, Bandung', 5, 'Beli ThinkPad second di sini, kondisi mulus banget kayak baru. Baterai masih awet, gratis instal software. Pelayanan ramah, recommended!'],
    ['Sinta Maharani', 'Content Creator, Jakarta', 5, 'Rakit PC editing 15 juta hasilnya luar biasa. Render 4K jauh lebih cepat. Dijelasin tiap komponennya dengan jujur, nggak dipaksa ambil yang mahal.'],
    ['Budi Santoso', 'Karyawan, Surabaya', 5, 'Tukar tambah laptop lama prosesnya cuma 15 menit, harga cocok. Dapat VivoBook OLED baru dengan potongan lumayan. Mantap!'],
    ['PT Maju Jaya Abadi', 'Korporat, Bekasi', 5, 'Sewa 30 unit laptop untuk training 3 hari. Unit datang tepat waktu, semua berfungsi sempurna, ada teknisi standby. Sangat profesional.'],
    ['Dewi Anggraini', 'Guru, Yogyakarta', 5, 'Servis laptop mati total, divonis motherboard. Ternyata cuma IC power, biayanya jauh lebih murah dari perkiraan. Jujur banget tokonya.'],
    ['Fajar Nugroho', 'Gamer, Medan', 4, 'Beli PC gaming RTX 4060, FPS stabil di semua game. Cable management rapi, suhu adem. Pengiriman ke Medan aman dengan packing kayu.']
  ].forEach(function (x) {
    upsert_('Testimonials', { name: x[0], role: x[1], avatar: '', rating: x[2], text: x[3], status: 'active', created_at: t });
  });

  // Banner
  [
    ['Promo Gajian: Diskon s.d. 2 Juta', 'Tiap pembelian laptop baru + gratis tas & antivirus premium.', U('photo-1531297484001-80022131f5a1', 1200), 'Lihat Promo', '#katalog', 1],
    ['Tukar Tambah 10 Menit', 'Bawa laptop lamamu, pulang bawa unit baru. Estimasi transparan.', U('photo-1593642632823-8f785ba67e45', 1200), 'Mulai Tukar Tambah', '#tukar-tambah', 2],
    ['Rakit PC Impianmu', 'Gaming, editing, office — konsultasi gratis dengan expert kami.', U('photo-1587202372775-e229b06a1ea6', 1200), 'Konsultasi Gratis', '#layanan', 3]
  ].forEach(function (b) {
    upsert_('Banners', { title: b[0], subtitle: b[1], image_url: b[2], cta_text: b[3], cta_link: b[4], sort: b[5], status: 'active' });
  });

  // FAQ
  [
    ['Apakah produk second bergaransi?', 'Ya. Semua laptop/PC second mendapat garansi toko 6–12 bulan (tergantung unit) + garansi uang kembali 7 hari jika ada kerusakan tersembunyi yang tidak kami informasikan.'],
    ['Bagaimana sistem tukar tambah?', 'Cukup bawa device lamamu ke toko (atau isi form tukar tambah). Teknisi kami cek kondisi ±10 menit, lalu memberi penawaran harga transparan. Jika deal, nilai device langsung memotong harga unit baru.'],
    ['Apakah bisa beli secara kredit/cicilan?', 'Bisa. Kami melayani cicilan kartu kredit 0% (3/6/12 bulan), Kredivo, Akulaku, dan Home Credit. Untuk corporate tersedia termin pembayaran.'],
    ['Berapa lama pengiriman luar kota?', '1–3 hari kerja untuk Pulau Jawa, 2–5 hari untuk luar Jawa. Semua unit diasuransikan + packing kayu gratis untuk PC. Gratis ongkir untuk pembelian di atas Rp5.000.000.'],
    ['Apakah software sudah termasuk?', 'Setiap pembelian laptop/PC sudah termasuk instalasi Windows original (trial/lisensi sesuai paket), Office, antivirus premium 1 tahun, dan software dasar lain — gratis.'],
    ['Bagaimana cara klaim garansi?', 'Cukup bawa unit + nota/invoice (fisik atau digital) ke toko, atau hubungi WhatsApp kami. Proses klaim maksimal 3 hari kerja, unit pengganti tersedia untuk servis >3 hari.'],
    ['Apakah menerima servis semua merek?', 'Ya, kami menerima servis semua merek laptop & PC: ASUS, Lenovo, HP, Dell, Acer, Apple, MSI, dan lainnya. Estimasi biaya selalu disampaikan di awal — gratis jika tidak jadi diservis.'],
    ['Di mana lokasi tokonya?', 'Lihat alamat lengkap & jam operasional di bagian bawah halaman (footer) atau klik tombol WhatsApp — kami kirimkan share location. Tersedia juga layanan antar-jemput untuk area kota.']
  ].forEach(function (f, i) {
    upsert_('Faqs', { question: f[0], answer: f[1], sort: i + 1, status: 'active' });
  });

  return { seeded: true, at: t };
}

/** Tes cepat koneksi (opsional, via editor). */
function testApi() {
  Logger.log(JSON.stringify(apiDashboard_()));
}
