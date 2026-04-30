const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');                 // serves index.html, styles.css, etc.
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const SITE_FILE = path.join(DATA_DIR, 'site.json');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');

const IS_PROD = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'sumsum-change-me';
const DEFAULT_ADMIN = { username: 'admin', password: 'sumsum2025' };

if (IS_PROD && JWT_SECRET === 'sumsum-change-me') {
  console.error('[fatal] JWT_SECRET must be set to a strong value in production. Refusing to start.');
  process.exit(1);
}
if (!IS_PROD && JWT_SECRET === 'sumsum-change-me') {
  console.warn('[warn] JWT_SECRET not set — using insecure dev default.');
}

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DEFAULT_SITE = {
  address: 'הרב הרצוג 10, אשדוד',
  lat: 31.8033502,
  lng: 34.6525539,
  phone: '077-330-5337',
  kashrut: 'רבנות אשדוד',
  schedule: [
    { isOpen: true,  open: '12:00', close: '20:00' }, // Sunday
    { isOpen: true,  open: '12:00', close: '20:00' }, // Monday
    { isOpen: true,  open: '12:00', close: '20:00' }, // Tuesday
    { isOpen: true,  open: '12:00', close: '20:00' }, // Wednesday
    { isOpen: true,  open: '12:00', close: '16:00' }, // Thursday
    { isOpen: false, open: '00:00', close: '00:00' }, // Friday
    { isOpen: false, open: '00:00', close: '00:00' }, // Saturday
  ],
  gallery: [
    { url: 'https://images.unsplash.com/photo-1607013251379-e6eecfffe234?auto=format&fit=crop&w=900&q=80', hidden: false },
    { url: 'https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&w=900&q=80', hidden: false },
    { url: 'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&w=900&q=80', hidden: false },
    { url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80', hidden: false },
    { url: 'https://images.unsplash.com/photo-1432139509613-5c4255815697?auto=format&fit=crop&w=900&q=80', hidden: false },
    { url: 'https://images.unsplash.com/photo-1606756790138-261d2b21cd75?auto=format&fit=crop&w=900&q=80', hidden: false },
  ],
};

if (!fs.existsSync(SITE_FILE)) {
  fs.writeFileSync(SITE_FILE, JSON.stringify(DEFAULT_SITE, null, 2), 'utf8');
}
if (!fs.existsSync(ADMIN_FILE)) {
  const hash = bcrypt.hashSync(DEFAULT_ADMIN.password, 10);
  fs.writeFileSync(ADMIN_FILE, JSON.stringify({ username: DEFAULT_ADMIN.username, hash }, null, 2), 'utf8');
  console.log(`[init] seeded admin: ${DEFAULT_ADMIN.username} / ${DEFAULT_ADMIN.password}`);
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8'); }
function readSite() {
  const s = readJson(SITE_FILE);
  // normalize gallery: legacy entries are bare URL strings
  let dirty = false;
  s.gallery = (s.gallery || []).map((item) => {
    if (typeof item === 'string') { dirty = true; return { url: item, hidden: false }; }
    return { url: item.url, hidden: !!item.hidden };
  });
  if (dirty) writeJson(SITE_FILE, s);
  return s;
}
function writeSite(s) { writeJson(SITE_FILE, s); }

// ---- multer (image upload) ----
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    let ext = path.extname(file.originalname).toLowerCase().replace(/[^.\w]/g, '');
    if (!ALLOWED_EXT.has(ext)) ext = '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const okMime = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (okMime && ALLOWED_EXT.has(ext)) cb(null, true);
    else cb(new Error('Invalid file type'));
  },
});

// ---- auth middleware ----
function authRequired(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ---- app ----
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// security headers — CSP disabled because index.html uses an inline script
// for the no-flash theme set; default helmet protections (X-Frame-Options,
// X-Content-Type-Options, Referrer-Policy, etc.) are still on.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

if (IS_PROD) {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') return next();
    res.redirect(308, `https://${req.headers.host}${req.url}`);
  });
}

app.use(express.json({ limit: '256kb' }));
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', dotfiles: 'deny' }));

// rate limiters — applied per-route below
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'יותר מדי נסיונות התחברות, נסו שוב בעוד מספר דקות' },
});
const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'יותר מדי נסיונות שינוי סיסמה, נסו שוב מאוחר יותר' },
});
const adminWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// public site data — gallery is filtered to visible items only, returned as URL strings
app.get('/api/site', (_req, res) => {
  const s = readSite();
  res.json({ ...s, gallery: s.gallery.filter((g) => !g.hidden).map((g) => g.url) });
});

// admin: full site data including hidden gallery items
app.get('/api/admin/site', authRequired, (_req, res) => res.json(readSite()));

// admin login (rate-limited)
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  const admin = readJson(ADMIN_FILE);
  if (username !== admin.username || !bcrypt.compareSync(password, admin.hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ u: admin.username }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});

// admin: update top-level fields (address, lat, lng, phone, kashrut, schedule)
app.post('/api/admin/password', passwordLimiter, authRequired, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'נדרשים סיסמה נוכחית וחדשה' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'הסיסמה החדשה חייבת להיות באורך 6 תווים לפחות' });
  }
  const admin = readJson(ADMIN_FILE);
  if (!bcrypt.compareSync(currentPassword, admin.hash)) {
    return res.status(401).json({ error: 'הסיסמה הנוכחית שגויה' });
  }
  admin.hash = bcrypt.hashSync(newPassword, 10);
  writeJson(ADMIN_FILE, admin);
  res.json({ ok: true });
});

app.put('/api/admin/site', adminWriteLimiter, authRequired, (req, res) => {
  const site = readSite();
  const allowed = ['address', 'lat', 'lng', 'phone', 'kashrut', 'schedule'];
  for (const k of allowed) {
    if (k in req.body) site[k] = req.body[k];
  }
  // basic schedule validation
  if (!Array.isArray(site.schedule) || site.schedule.length !== 7) {
    return res.status(400).json({ error: 'schedule must be array of 7 items' });
  }
  site.lat = Number(site.lat);
  site.lng = Number(site.lng);
  writeSite(site);
  res.json(site);
});

// admin: upload gallery image
app.post('/api/admin/gallery', adminWriteLimiter, authRequired, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const url = `/uploads/${req.file.filename}`;
  const site = readSite();
  site.gallery.push({ url, hidden: false });
  writeSite(site);
  res.json({ url, gallery: site.gallery });
});

// admin: replace gallery list — items are { url, hidden }
app.put('/api/admin/gallery', adminWriteLimiter, authRequired, (req, res) => {
  const { gallery } = req.body || {};
  if (!Array.isArray(gallery)) return res.status(400).json({ error: 'gallery must be array' });
  const normalized = gallery.map((g) => ({ url: String(g.url || g), hidden: !!g.hidden }));
  const site = readSite();
  const keptUrls = new Set(normalized.map((g) => g.url));
  // delete files no longer referenced
  const removed = site.gallery.filter((g) => !keptUrls.has(g.url) && g.url.startsWith('/uploads/'));
  for (const g of removed) {
    const f = path.join(UPLOAD_DIR, path.basename(g.url));
    fs.unlink(f, () => {});
  }
  site.gallery = normalized;
  writeSite(site);
  res.json({ gallery: site.gallery });
});

// static frontend last (so /api/* takes priority)
app.use(express.static(ROOT, { extensions: ['html'] }));

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  // don't leak internal stack details to clients
  const message = status >= 500 ? 'שגיאת שרת' : (err.message || 'Bad request');
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`[sumsum] http://localhost:${PORT}`);
  console.log(`[sumsum] admin:  http://localhost:${PORT}/manage-grill`);
});
