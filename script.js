(() => {
  // ---------- nav scrolled state ----------
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // ---------- mobile menu ----------
  const navLinks = document.getElementById('navLinks');
  const navToggle = document.getElementById('navToggle');
  const closeMenu = () => {
    navLinks.classList.remove('open');
    navToggle.classList.remove('active');
  };
  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    navToggle.classList.toggle('active');
  });
  navLinks.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeMenu));

  // ---------- theme toggle ----------
  const themeBtn = document.getElementById('themeToggle');
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('sk_theme', next); } catch {}
  });

  // ---------- year ----------
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // ---------- site data ----------
  const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  let siteData = null;

  async function loadSite() {
    try {
      const res = await fetch('/api/site');
      if (!res.ok) throw new Error();
      siteData = await res.json();
    } catch {
      // backend offline → fall back to baked-in defaults so the static page still works
      siteData = DEFAULTS;
    }
    renderSite();
    initReveal();
  }

  function renderSite() {
    const { address, lat, lng, phone, kashrut, schedule, gallery } = siteData;

    // address
    const addrLink = document.getElementById('addressLink');
    addrLink.textContent = address;
    addrLink.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

    // phone
    const phoneLink = document.getElementById('phoneLink');
    const phoneDigits = String(phone).replace(/\D/g, '');
    phoneLink.textContent = formatPhone(phone);
    phoneLink.href = `tel:${phoneDigits}`;
    document.getElementById('fabCall').href = `tel:${phoneDigits}`;

    // kashrut
    document.getElementById('kashrutText').textContent = kashrut;

    // hours (display + live status)
    const hoursList = document.getElementById('hoursList');
    hoursList.innerHTML = groupSchedule(schedule)
      .map((g) => `${g.label} · ${g.value}`)
      .join('<br>');
    updateOpenStatus();
    setInterval(updateOpenStatus, 60_000);

    // map
    const bbox = bboxAround(lat, lng, 0.004);
    document.getElementById('mapFrame').src =
      `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
    document.getElementById('mapCta').href =
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

    // gallery
    const gal = document.getElementById('galleryGrid');
    gal.innerHTML = '';
    gallery.forEach((url) => {
      const fig = document.createElement('figure');
      fig.className = 'g-item reveal';
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      fig.appendChild(img);
      gal.appendChild(fig);
    });
  }

  function formatPhone(p) {
    const d = String(p).replace(/\D/g, '');
    if (d.length === 10 && d.startsWith('0')) {
      return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    }
    return p;
  }

  function bboxAround(lat, lng, d) {
    const south = (lat - d).toFixed(4);
    const north = (lat + d).toFixed(4);
    const west = (lng - d).toFixed(4);
    const east = (lng + d).toFixed(4);
    return `${west}%2C${south}%2C${east}%2C${north}`;
  }

  // group consecutive days with identical hours: [{label, value}, ...]
  function groupSchedule(schedule) {
    const out = [];
    let i = 0;
    while (i < 7) {
      const cur = schedule[i];
      let j = i;
      while (
        j + 1 < 7 &&
        sameSlot(schedule[j + 1], cur)
      ) j++;
      const label = i === j ? DAY_NAMES[i] : `${DAY_NAMES[i]}–${DAY_NAMES[j]}`;
      const value = cur.isOpen ? `${cur.open}–${cur.close}` : 'סגור';
      out.push({ label, value });
      i = j + 1;
    }
    return out;
  }
  function sameSlot(a, b) {
    if (a.isOpen !== b.isOpen) return false;
    if (!a.isOpen) return true;
    return a.open === b.open && a.close === b.close;
  }

  function updateOpenStatus() {
    const el = document.getElementById('openStatus');
    if (!el || !siteData) return;
    const now = new Date();
    const day = now.getDay();
    const today = siteData.schedule[day];
    const minutes = now.getHours() * 60 + now.getMinutes();
    let open = false;
    if (today && today.isOpen) {
      const o = parseTime(today.open);
      const c = parseTime(today.close);
      if (minutes >= o && minutes < c) open = true;
    }
    el.textContent = open ? 'פתוח עכשיו' : 'סגור עכשיו';
    el.className = 'open-status ' + (open ? 'is-open' : 'is-closed');
  }
  function parseTime(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
  }

  // ---------- reveal on scroll (called after content rendered) ----------
  function initReveal() {
    const reveals = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('in');
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
      );
      reveals.forEach((el) => io.observe(el));
    } else {
      reveals.forEach((el) => el.classList.add('in'));
    }
  }

  // baked-in defaults — used if backend is unreachable
  const DEFAULTS = {
    address: 'הרב הרצוג 10, אשדוד',
    lat: 31.8033502,
    lng: 34.6525539,
    phone: '077-330-5337',
    kashrut: 'רבנות אשדוד',
    schedule: [
      { isOpen: true, open: '12:00', close: '20:00' },
      { isOpen: true, open: '12:00', close: '20:00' },
      { isOpen: true, open: '12:00', close: '20:00' },
      { isOpen: true, open: '12:00', close: '20:00' },
      { isOpen: true, open: '12:00', close: '16:00' },
      { isOpen: false }, { isOpen: false },
    ],
    gallery: [
      'https://images.unsplash.com/photo-1607013251379-e6eecfffe234?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1432139509613-5c4255815697?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1606756790138-261d2b21cd75?auto=format&fit=crop&w=900&q=80',
    ],
  };

  loadSite();
})();
