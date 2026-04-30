(() => {
  console.log('[admin] script loaded');
  const TOKEN_KEY = 'sk_admin_token';
  const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  const $ = (id) => document.getElementById(id);
  let site = null;

  // ---------- auth ----------
  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }

  async function api(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (!(opts.body instanceof FormData) && opts.body) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(path, { ...opts, headers });
    if (res.status === 401) {
      clearToken();
      showLogin();
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, isError = false) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast' + (isError ? ' is-error' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2400);
  }

  // ---------- screens ----------
  function showLogin() {
    $('loginScreen').hidden = false;
    $('dashboard').hidden = true;
  }
  function showDashboard() {
    $('loginScreen').hidden = true;
    $('dashboard').hidden = false;
  }

  // ---------- login ----------
  $('loginForm').addEventListener('submit', async (e) => {
    console.log('[admin] login submit');
    e.preventDefault();
    const err = $('loginError');
    err.hidden = true;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: $('lUser').value, password: $('lPass').value }),
      });
      console.log('[admin] login response', res.status);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error ||
          (res.status === 401 ? 'שם משתמש או סיסמה שגויים' : `שגיאה (${res.status})`)
        );
      }
      const { token } = await res.json();
      console.log('[admin] got token, length', token?.length);
      setToken(token);
      $('lPass').value = '';
      await boot();
    } catch (e) {
      console.error('[admin] login flow error', e);
      err.textContent = e.message;
      err.hidden = false;
    }
  });

  $('logoutBtn').addEventListener('click', () => {
    clearToken();
    showLogin();
  });

  // ---------- info form ----------
  function fillInfo() {
    $('fAddress').value = site.address;
    $('fLat').value = site.lat;
    $('fLng').value = site.lng;
    $('fPhone').value = site.phone;
    $('fKashrut').value = site.kashrut;
  }

  // ---------- password change ----------
  $('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur = $('pCurrent').value;
    const next = $('pNew').value;
    const confirmVal = $('pConfirm').value;
    if (next !== confirmVal) { toast('אימות הסיסמה אינו תואם', true); return; }
    if (next.length < 6) { toast('הסיסמה חייבת להיות באורך 6 תווים לפחות', true); return; }
    if (next === cur) { toast('הסיסמה החדשה זהה לנוכחית', true); return; }
    try {
      await api('/api/admin/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: cur, newPassword: next }),
      });
      $('pCurrent').value = '';
      $('pNew').value = '';
      $('pConfirm').value = '';
      toast('הסיסמה הוחלפה בהצלחה');
    } catch (err) {
      toast(err.message, true);
    }
  });

  $('infoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const updated = await api('/api/admin/site', {
        method: 'PUT',
        body: JSON.stringify({
          address: $('fAddress').value.trim(),
          lat: Number($('fLat').value),
          lng: Number($('fLng').value),
          phone: $('fPhone').value.trim(),
          kashrut: $('fKashrut').value.trim(),
        }),
      });
      site = updated;
      toast('הפרטים נשמרו');
    } catch (e) { toast(e.message, true); }
  });

  // ---------- hours form ----------
  function buildHoursForm() {
    const form = $('hoursForm');
    form.innerHTML = '';
    site.schedule.forEach((slot, i) => {
      const row = document.createElement('div');
      row.className = 'hours-row' + (slot.isOpen ? '' : ' is-closed');
      row.innerHTML = `
        <strong>${DAY_NAMES[i]}</strong>
        <label class="toggle">
          <input type="checkbox" data-day="${i}" data-field="isOpen" ${slot.isOpen ? 'checked' : ''} />
          פתוח
        </label>
        <label>פתיחה
          <input type="time" data-day="${i}" data-field="open" value="${slot.open || '12:00'}" />
        </label>
        <label>סגירה
          <input type="time" data-day="${i}" data-field="close" value="${slot.close || '20:00'}" />
        </label>
      `;
      form.appendChild(row);
    });

    const saveRow = document.createElement('div');
    saveRow.className = 'save-row';
    saveRow.innerHTML = `<button type="submit" class="btn btn-primary">שמירת שעות</button>`;
    form.appendChild(saveRow);

    form.addEventListener('change', (e) => {
      const t = e.target;
      if (!t.dataset.day) return;
      const i = Number(t.dataset.day);
      const field = t.dataset.field;
      const value = t.type === 'checkbox' ? t.checked : t.value;
      site.schedule[i][field] = value;
      if (field === 'isOpen') {
        t.closest('.hours-row').classList.toggle('is-closed', !value);
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const updated = await api('/api/admin/site', {
          method: 'PUT',
          body: JSON.stringify({ schedule: site.schedule }),
        });
        site = updated;
        toast('שעות הפעילות נשמרו');
      } catch (e) { toast(e.message, true); }
    });
  }

  // ---------- gallery ----------
  function renderGallery() {
    const grid = $('galleryGrid');
    grid.innerHTML = '';
    site.gallery.forEach((item) => {
      const url = item.url;
      const isHidden = !!item.hidden;
      const tile = document.createElement('div');
      tile.className = 'gallery-tile' + (isHidden ? ' is-hidden' : '');
      tile.innerHTML = `
        <img src="${url}" alt="" />
        ${isHidden ? '<span class="tile-badge">מוסתר</span>' : ''}
        <div class="tile-actions">
          <button type="button" class="tile-btn" data-act="toggle">${isHidden ? 'הצגה' : 'הסתרה'}</button>
          <button type="button" class="tile-btn tile-btn-danger" data-act="remove">הסרה</button>
        </div>
      `;
      tile.querySelector('[data-act="toggle"]').addEventListener('click', () => toggleHide(url));
      tile.querySelector('[data-act="remove"]').addEventListener('click', () => removeImage(url));
      grid.appendChild(tile);
    });
  }

  async function saveGallery(next) {
    const updated = await api('/api/admin/gallery', {
      method: 'PUT',
      body: JSON.stringify({ gallery: next }),
    });
    site.gallery = updated.gallery;
    renderGallery();
  }

  async function toggleHide(url) {
    try {
      const next = site.gallery.map((g) => g.url === url ? { ...g, hidden: !g.hidden } : g);
      await saveGallery(next);
      const item = site.gallery.find((g) => g.url === url);
      toast(item.hidden ? 'התמונה הוסתרה' : 'התמונה מוצגת שוב');
    } catch (e) { toast(e.message, true); }
  }

  async function removeImage(url) {
    if (!confirm('להסיר את התמונה לצמיתות?')) return;
    try {
      await saveGallery(site.gallery.filter((g) => g.url !== url));
      toast('התמונה הוסרה');
    } catch (e) { toast(e.message, true); }
  }

  $('upload').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    $('uploadStatus').textContent = 'מעלה…';
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await api('/api/admin/gallery', { method: 'POST', body: fd });
      site.gallery = res.gallery;
      renderGallery();
      toast('התמונה נוספה');
    } catch (err) {
      toast(err.message, true);
    } finally {
      $('uploadStatus').textContent = '';
      e.target.value = '';
    }
  });

  // ---------- boot ----------
  async function boot() {
    if (!getToken()) { showLogin(); return; }
    try {
      console.log('[admin] boot — fetching /api/admin/site');
      site = await api('/api/admin/site');
      console.log('[admin] site loaded', site);
      fillInfo();
      buildHoursForm();
      renderGallery();
      showDashboard();
      console.log('[admin] dashboard shown');
    } catch (e) {
      console.error('[admin] boot error', e);
      const errEl = $('loginError');
      if (errEl) {
        errEl.textContent = 'תקלה בטעינת לוח הניהול: ' + (e?.message || e);
        errEl.hidden = false;
      }
      showLogin();
    }
  }

  boot();
})();
