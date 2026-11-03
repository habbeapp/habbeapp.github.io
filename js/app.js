/* Uzhu app: routing, views, daily program, nightly checklist, reminders. */
(function () {
  const ART = window.UZHU_ART;
  const STORE = window.UZHU_STORE;
  const PROGRAM = window.UZHU_PROGRAM || { cycles: [], sos: [], quotes: [] };
  const RECIPES = window.UZHU_RECIPES || [];
  const ARTICLES = window.UZHU_ARTICLES || { articles: [], hidden: [] };
  const EX = window.UZHU_EXERCISE || { moves: {}, days: [], reminders: [], breathing: null };
  const POSE = window.UZHU_POSES;
  const CFG = window.UZHU_CONFIG || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const app = $('#app');

  /* ---------- helpers ---------- */
  const fa = v => String(v).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hhmm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const jalali = (d = new Date()) => { try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long' }).format(d); } catch (e) { return ''; } };
  const money = n => fa(Math.round(n).toLocaleString('en-US')).replace(/,/g, '٬');
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  // The program day ends at 4 a.m., so a checklist filled in after midnight still counts for the evening before.
  const nightKey = () => dateKey(new Date(Date.now() - 4 * 3600e3));
  const dayDiff = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);

  /* ---------- extension hooks (used by features.js and admin.js) ---------- */
  const H = {};
  const hook = (name, ...a) => (H[name] || []).map(f => { try { return f(...a) || ''; } catch (e) { console.error(e); return ''; } }).join('');
  const runHooks = (name, ...a) => (H[name] || []).forEach(f => { try { f(...a); } catch (e) { console.error(e); } });
  const tools = [];
  // Async hooks awaited after sign-up/login, before the first page of the account is shown.
  const signedIn = () => Promise.all((H.signedIn || []).map(f => Promise.resolve().then(() => f(user)).catch(e => console.error(e))));
  const A_SITE_ON = k => window.UZHU_APP?.site?.settings?.features?.[k] !== false;

  /* ---------- state ---------- */
  let user = null;
  const defaults = () => ({
    profile: null,
    settings: { reminders: true, times: ['09:00', '13:00', '16:30', '21:30'], demo: false, moveRem: true, moveTime: '18:00' },
    cycle: 1, day: 1, cycleDone: false, completedCycles: [], lastCompleteDate: null, startedAt: dateKey(),
    log: {}, move: {}, sos: { beaten: 0, gave: 0, events: [] }, fired: {},
  });
  // Fills fields that older saved data may lack, one level deep for the nested objects.
  function normalize(d) {
    const def = defaults(), out = Object.assign(def, d || {});
    out.settings = Object.assign(defaults().settings, (d || {}).settings || {});
    out.sos = Object.assign({ beaten: 0, gave: 0, events: [] }, (d || {}).sos || {});
    if (!Array.isArray(out.sos.events)) out.sos.events = [];
    ['log', 'move', 'fired'].forEach(k => { if (!out[k] || typeof out[k] !== 'object') out[k] = {}; });
    if (!Array.isArray(out.completedCycles)) out.completedCycles = [];
    if (!Array.isArray(out.settings.times) || out.settings.times.length !== 4) out.settings.times = defaults().settings.times;
    if (out.profile) { out.profile.goal = out.profile.goal || []; out.profile.trigger = out.profile.trigger || []; }
    return out;
  }
  const D = () => user.data;
  const save = () => { if (typeof pushSync === 'function') pushSync(); return STORE.save(user).catch(() => toast('ذخیره‌ی آنلاین انجام نشد. اتصال اینترنت را بررسی کن.', 'bell')); };
  const cycleObj = n => PROGRAM.cycles.find(c => c.id === n) || PROGRAM.cycles[0];
  const dayObj = () => { const c = cycleObj(D().cycle); return c ? c.days[Math.min(D().day, c.days.length) - 1] : null; };
  const logKey = (c = D().cycle, d = D().day) => `c${c}d${d}`;
  const exIndex = (c = D().cycle, d = D().day) => (c - 1) * 21 + d - 1;
  // Plugins (move21) may supply the day's exercise plan via H.exDay; otherwise the built-in 63-day plan is used.
  const exDay = (c, d) => { for (const f of H.exDay || []) { try { const r = f(c, d); if (r) return r; } catch (e) { console.error(e); } } return EX.days[exIndex(c, d)] || EX.days[0] || null; };
  const moveLog = () => (D().move[logKey()] = D().move[logKey()] || { walk: 0, breaths: 0, routine: false });

  // Move to the next program day once the calendar day has changed after finishing today's checklist.
  function advanceIfNewDay() {
    const s = D();
    if (s.cycleDone) return;
    const cur = s.log[logKey()];
    if (cur && cur.done && s.lastCompleteDate && s.lastCompleteDate !== nightKey()) {
      if (s.day >= 21) { s.cycleDone = true; if (!s.completedCycles.includes(s.cycle)) s.completedCycles.push(s.cycle); }
      else s.day += 1;
      save();
    }
  }
  const demoOn = () => /[?&]demo\b/.test(location.search) || !!window.UZHU_APP?.isAdmin;
  function forceNextDay() { // demo mode
    const s = D();
    if (!s.log[logKey()]?.done) s.log[logKey()] = { done: true, date: dateKey(), tasks: [], craving: 1, slip: 'no', demo: true };
    s.lastCompleteDate = '2000-01-01';
    advanceIfNewDay();
  }
  function startNextCycle() {
    const s = D();
    s.cycle = s.cycle >= PROGRAM.cycles.length ? 1 : s.cycle + 1;
    // A cycle may be repeated: archive its old logs so the new round starts clean (finished days still count in stats).
    const old = Object.keys(s.log).filter(k => k.startsWith(`c${s.cycle}d`));
    s.pastDone = (s.pastDone || 0) + old.filter(k => s.log[k].done && !s.log[k].demo).length;
    old.forEach(k => delete s.log[k]);
    Object.keys(s.move || {}).filter(k => k.startsWith(`c${s.cycle}d`)).forEach(k => delete s.move[k]);
    s.day = 1; s.cycleDone = false; s.lastCompleteDate = null; s.startedAt = dateKey();
    save(); go('today');
  }

  function stats() {
    const s = D();
    const done = Object.values(s.log).filter(l => l.done && !l.demo);
    // Safe days (features-a "روز امن") bridge missed calendar days in the streak.
    const freeze = A_SITE_ON('freeze') ? (s.fa_freeze?.used || []) : [];
    const dates = [...new Set([...done.map(l => l.date), ...freeze])].sort();
    let streak = 0;
    if (dates.length) {
      const last = dates[dates.length - 1];
      if (dayDiff(last, dateKey()) <= 1) {
        streak = 1;
        for (let i = dates.length - 1; i > 0; i--) { if (dayDiff(dates[i - 1], dates[i]) === 1) streak++; else break; }
      }
    }
    const p = s.profile || {};
    const servings = p.servings ?? 3, spend = p.spend || 60000;
    const cleanDays = done.filter(l => l.slip !== 'lot').length;
    return { total: done.length + (s.pastDone || 0), streak, cubes: Math.round(cleanDays * servings * 5), toman: cleanDays * spend, beaten: s.sos.beaten };
  }

  /* ---------- visuals ---------- */
  function ring(day, total, color = 'var(--mint)') {
    const r = 52, C = 2 * Math.PI * r, f = Math.min(day / total, 1);
    return `<div class="ring" aria-label="روز ${fa(day)} از ${fa(total)}"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="12"/><circle cx="60" cy="60" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - f)}"/></svg><div class="lbl"><div><b>${fa(day)}</b><div class="small muted">از ${fa(total)} روز</div></div></div></div>`;
  }
  // A sapling that grows over the 21 days of a cycle.
  function plant(day) {
    const st = Math.min(5, Math.ceil(day / 4.2));
    const ink = '#3b2a3a';
    const stem = 40 + st * 14;
    let leaves = '';
    for (let i = 0; i < st; i++) {
      const y = 150 - 20 - i * 14, side = i % 2 ? 1 : -1;
      leaves += `<path d="M60 ${y} c${side * 10} -14 ${side * 30} -14 ${side * 34} -4 c${side * -8} 12 ${side * -26} 14 ${side * -34} 4z" fill="${i % 2 ? '#8fd9b6' : '#5cc28f'}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>`;
    }
    const flower = st >= 5 ? `<g transform="translate(60 ${150 - stem})">${[0, 72, 144, 216, 288].map(a => `<ellipse rx="9" ry="14" transform="rotate(${a}) translate(0 -12)" fill="#ff9eb5" stroke="${ink}" stroke-width="3"/>`).join('')}<circle r="9" fill="#ffd166" stroke="${ink}" stroke-width="3"/></g>` : `<circle cx="60" cy="${150 - stem}" r="6" fill="#8fd9b6" stroke="${ink}" stroke-width="3"/>`;
    return `<svg viewBox="0 0 120 200" aria-label="نهال تو"><path d="M60 150 V${150 - stem}" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>${leaves}${flower}<path d="M28 150 h64 l-8 40 h-48z" fill="#e8916b" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/><path d="M24 146 h72 v10 h-72z" fill="#f2a882" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/><circle cx="50" cy="172" r="3" fill="${ink}"/><circle cx="70" cy="172" r="3" fill="${ink}"/><path d="M54 180 q6 5 12 0" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/></svg>`;
  }

  function toast(text, spot = 'bell', mood) {
    let box = $('.toasts'); if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = `<div>${mood ? ART.mascot(mood) : spot === 'walk' && POSE ? POSE.svgFor('walk-march', .5) : ART.spots[spot] || ART.spots.bell}</div><div class="small">${esc(text)}</div><button aria-label="بستن">✕</button>`;
    t.querySelector('button').onclick = () => t.remove();
    box.prepend(t); [...box.children].slice(2).forEach(x => x.remove()); setTimeout(() => t.remove(), 7000);
  }
  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas'); c.className = 'confetti'; document.body.appendChild(c);
    const x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
    const cols = ['#e2557a', '#2fa877', '#ffc94d', '#9b84d6', '#7cc8f2'];
    const ps = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * .5, r: 4 + Math.random() * 6, vy: 2 + Math.random() * 4, vx: -2 + Math.random() * 4, a: Math.random() * 6, c: pick(cols) }));
    let n = 0; (function f() { x.clearRect(0, 0, c.width, c.height); ps.forEach(p => { p.y += p.vy; p.x += p.vx; p.a += .1; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6); x.restore(); }); if (n++ < 180) requestAnimationFrame(f); else c.remove(); })();
  }
  function modal(html, onMount) {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><button class="x" aria-label="بستن">✕</button>${html}</div>`;
    const back = document.activeElement;
    const close = () => { if (!m.isConnected) return; m.remove(); document.removeEventListener('keydown', key); if (m._cleanup) m._cleanup(); if (back && back.isConnected && back.focus) back.focus({ preventScroll: true }); };
    const key = e => {
      if (e.key === 'Escape') close();
      else if (e.key === 'Tab') { // keep keyboard focus inside the dialog
        const f = [...m.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent);
        if (!f.length) return; const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    m.addEventListener('click', e => { if (e.target === m) close(); });
    m.querySelector('.x').onclick = close; document.addEventListener('keydown', key);
    document.body.appendChild(m); if (onMount) onMount(m, close);
    const h = m.querySelector('h2, h3'); if (h) { h.id = h.id || 'dlg-' + Date.now(); m.firstElementChild.setAttribute('aria-labelledby', h.id); }
    m.querySelector('.x').focus({ preventScroll: true });
    return close;
  }

  /* ---------- notifications ---------- */
  let swReg = null;
  async function setupSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    const hadCtl = !!navigator.serviceWorker.controller;
    try { swReg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }); await navigator.serviceWorker.ready; pushSync(); } catch (e) { swReg = null; return; }
    // Installed app: a new version takes over → refresh quietly if the app is in the background, otherwise offer a button.
    let newVer = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadCtl || newVer) return; newVer = true;
      if (document.hidden) return location.reload();
      const b = document.createElement('div'); b.className = 'upd-bar'; b.setAttribute('role', 'status');
      b.innerHTML = '<span>نسخه‌ی جدید حبه اومد 🌱</span><button class="btn primary">تازه‌اش کن</button><button class="x" aria-label="بعداً">✕</button>';
      b.querySelector('.btn').onclick = () => location.reload(); b.querySelector('.x').onclick = () => b.remove();
      document.body.appendChild(b);
    });
    // The home-screen app is usually resumed, not reopened, so look for updates every time it comes back.
    let lastCheck = Date.now();
    const check = () => { if (Date.now() - lastCheck < 60000) return; lastCheck = Date.now(); swReg.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (newVer) location.reload(); } else check(); });
    setInterval(check, 30 * 60000);
  }
  const canNotify = () => 'Notification' in window && Notification.permission === 'granted';
  async function askNotify() {
    if (!('Notification' in window)) { toast('این مرورگر اعلان سیستمی ندارد. یادآورها داخل همین صفحه نمایش داده می‌شوند.'); return 'unsupported'; }
    try { const p = await Notification.requestPermission(); return p; } catch (e) { return 'denied'; }
  }
  let pushOn = false;
  function notify(text, spot) {
    toast(text, spot);
    if (!canNotify() || pushOn) return;
    const opts = { body: text, icon: 'img/icon.svg', badge: 'img/icon.svg', lang: 'fa', dir: 'rtl', tag: 'uzhu-' + Date.now() };
    try { if (swReg) swReg.showNotification('حبه 🌱', opts); else new Notification('حبه 🌱', opts); } catch (e) {}
  }
  function todaysReminders(d = dayObj(), dayN = D().day, date = new Date()) {
    const s = D(); if (!d || !s.profile) return [];
    const times = [...s.settings.times].sort();
    const list = (d.reminders || []).slice(0, 4).map((r, i) => ({ time: times[Math.min(i, times.length - 1)], text: r.text }));
    const night = times[times.length - 1];
    list.push({ time: addMinDay(night, 15), text: 'وقت چک‌لیست شبانه‌ست 🌙 دو دقیقه وقت بذار و روزت رو تیک بزن.', spot: 'moon', kind: 'night' });
    const ct = { morning: '11:00', afternoon: '16:00', evening: '19:30', night: '22:30' }[s.profile.cravingTime];
    if (ct) list.push({ time: ct, text: 'این ساعت‌ها معمولاً هوس شیرینی سراغت میاد. یه لیوان آب و چند تا گردو آماده کن. اگه سخت شد، دکمه‌ی «هوس دارم» رو بزن.', spot: 'water', kind: 'crave' });
    if (s.settings.moveRem !== false) {
      const ex = exDay(s.cycle, dayN);
      const rs = EX.reminders || [];
      const txt = rs.length ? rs[(exIndex(s.cycle, dayN) * 2) % rs.length] : 'وقت ورزش امروزه! کفش‌هات رو بپوش 🚶‍♀️';
      list.push({ time: s.settings.moveTime || '18:00', text: ex ? `${txt} (امروز: ${fa(ex.walk)} دقیقه پیاده‌روی + ${ex.routine.title})` : txt, spot: 'walk', url: '#move' });
      list.push({ time: addMinDay(times[0], 150), text: rs.length ? rs[(exIndex(s.cycle, dayN) * 2 + 1) % rs.length] : '۱۰ تا نفس شکمی؛ همین الان، همون‌جا که نشستی 🌬️', spot: 'water', url: '#move' });
    }
    (H.reminders || []).forEach(f => { try { list.push(...(f(dayN) || [])); } catch (e) {} });
    // Plugins may drop or move reminders (js/ux.js: quiet hours, quiet weekdays, reminder types).
    let out = list;
    for (const f of H.reminderFilter || []) { try { out = f(out, date, dayN) || out; } catch (e) { console.error(e); } }
    return out.sort((a, b) => a.time.localeCompare(b.time));
  }
  // Upcoming reminders for the next 7 days, handed to the server so they arrive even when the site is closed.
  function buildSchedule() {
    const s = D(), out = [], now = Date.now();
    if (!s.profile || !s.settings.reminders || s.cycleDone) return out;
    const c = cycleObj(s.cycle);
    const at = (off, t) => { const d = new Date(); d.setDate(d.getDate() + off); const [h, m] = t.split(':').map(Number); d.setHours(h, m, 0, 0); return d.getTime(); };
    let last = 0;
    for (let off = 0; off < 7; off++) {
      const n = s.day + off; if (n > 21) break;
      const day = new Date(); day.setDate(day.getDate() + off);
      todaysReminders(c.days[n - 1], n, day).forEach(r => { const t = at(off, r.time); if (t > now) { out.push({ at: new Date(t).toISOString(), text: r.text, url: './' + (r.url || '#today') }); last = off; } });
    }
    if (s.ux?.miss !== false) [last + 2, last + 4, last + 8].forEach(off => out.push({ at: new Date(at(off, s.settings.times[0])).toISOString(), text: 'دلمون برات تنگ شده 🌱 برنامه‌ی امروزت منتظرته. حتی اگه چند روز دور بودی، از همین امروز ادامه بده.', url: './#today' }));
    return out;
  }
  const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); };
  let pushTimer = null;
  function pushSync() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      if (!user || !STORE.syncPush || !swReg || !canNotify() || !CFG.vapidPublic || !('PushManager' in window)) return;
      try {
        let sub = await swReg.pushManager.getSubscription();
        if (!sub) sub = await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(CFG.vapidPublic) });
        await STORE.syncPush(sub, buildSchedule());
        pushOn = true;
      } catch (e) { pushOn = false; }
    }, 800);
  }
  // Same as addMin, but never wraps past midnight (a reminder must stay on its own day).
  function addMinDay(t, m) { const [h, mm] = t.split(':').map(Number); const x = Math.min(23 * 60 + 59, h * 60 + mm + m); return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; }
  function addMin(t, m) { const [h, mm] = t.split(':').map(Number); const x = h * 60 + mm + m; return `${pad(Math.floor(x / 60) % 24)}:${pad(x % 60)}`; }
  function tick() {
    if (!user || !D().profile || !D().settings.reminders) return;
    advanceIfNewDay();
    const s = D(), k = dateKey(), now = hhmm();
    s.fired = { [k]: s.fired[k] || [] };
    const fired = s.fired[k];
    let changed = false;
    todaysReminders().forEach(r => {
      if (fired.includes(r.time + r.text.slice(0, 8)) || r.time > now) return;
      const late = (Number(now.slice(0, 2)) * 60 + Number(now.slice(3))) - (Number(r.time.slice(0, 2)) * 60 + Number(r.time.slice(3)));
      if (late <= 45) notify(r.text, r.spot || 'bell');
      fired.push(r.time + r.text.slice(0, 8)); changed = true;
    });
    if (changed) save();
  }

  /* ---------- router ---------- */
  const appRoutes = ['today', 'move', 'night', 'journey', 'more', 'recipes', 'learn', 'settings'];
  function go(r) { if (location.hash !== '#' + r) location.hash = r; else render(); }
  function route() {
    let r = (location.hash || '#').slice(1) || (user ? 'today' : 'home');
    if (appRoutes.includes(r) && !['recipes', 'learn'].includes(r) && !user) r = 'signup';
    if (user && !D().profile && appRoutes.includes(r) && !['recipes', 'learn'].includes(r)) r = 'onboard';
    if (user && ['signup', 'login'].includes(r)) r = D().profile ? 'today' : 'onboard';
    // Plugins may send the visitor elsewhere (subscription.js: no access yet → #subscribe).
    for (const f of H.route || []) { try { r = f(r) || r; } catch (e) { console.error(e); } }
    return r;
  }
  function render() {
    const r = route();
    if (user) advanceIfNewDay();
    chrome(r);
    const v = views[r] || views.home;
    app.innerHTML = `<div class="view">${v()}</div>`;
    (mounts[r] || (() => {}))();
    runHooks('mount', r);
    if (POSE && $('[data-pose]')) POSE.animate();
    window.scrollTo(0, 0);
    document.title = (titles[r] ? titles[r] + ' · ' : '') + 'حبه';
  }
  const titles = { more: 'ابزارها', move: 'ورزش', today: 'امروز', night: 'چک‌لیست شب', journey: 'مسیر من', recipes: 'خوراکی‌های بی‌قند', learn: 'علم قند', settings: 'تنظیمات', signup: 'ثبت‌نام', login: 'ورود', newpass: 'رمز تازه', verify: 'کد تأیید', onboard: 'شروع' };

  function chrome(r) {
    const inApp = user && D().profile;
    const links = inApp
      ? [['today', 'امروز', '☀️'], ['move', 'ورزش', '🧘'], ['night', 'چک‌لیست شب', '🌙'], ['journey', 'مسیر من', '🌱'], ['more', 'ابزارها', '🧰'], ['recipes', 'رسپی‌ها', '🍰'], ['learn', 'علم قند', '📖']]
      : [['home', 'خانه', '🏠'], ['recipes', 'رسپی‌ها', '🍰'], ['learn', 'علم قند', '📖']];
    $('#nav').className = 'nav' + (inApp ? ' app' : '');
    $('#nav').innerHTML = links.map(([k, t]) => `<a href="#${k}" class="${r === k ? 'on' : ''}">${t}</a>`).join('') +
      (inApp ? `<a href="#settings" class="${r === 'settings' ? 'on' : ''}" aria-label="تنظیمات">⚙️</a>` : user ? '' : `<a href="#login" class="${r === 'login' ? 'on' : ''}">ورود</a>`);
    const tb = $('#tabbar');
    tb.className = 'tabbar' + (inApp ? ' on' : '');
    // Phone tab bar: short labels; sleep only when that section is on.
    const tabs = [['today', 'امروز', '☀️'], ['night', 'چک‌لیست', '🌙'], ['move', 'ورزش', '🧘'], ['recipes', 'رسپی', '🍰'], views.sleep && A_SITE_ON('sleep') && ['sleep', 'خواب', '😴'], ['journey', 'مسیر من', '🌱'], ['more', 'ابزارها', '🧰']].filter(Boolean);
    tb.style.setProperty('--tabs', tabs.length);
    tb.innerHTML = inApp ? tabs.map(([k, t, i]) => `<a href="#${k}" class="${r === k || (k === 'sleep' && /^sleep/.test(r)) ? 'on' : ''}"${r === k ? ' aria-current="page"' : ''}><span class="i">${i}</span>${t}</a>`).join('') : '';
    $('#sos').hidden = !inApp;
  }

  /* ---------- views ---------- */
  const views = {}, mounts = {};

  views.home = () => {
    const cyc = PROGRAM.cycles.map(c => `<div class="card cycle-card stack" style="gap:8px"><div class="n" style="color:${c.color}">${fa(c.id)}</div><h3>${esc(c.title)}</h3><p class="muted">${esc(c.subtitle)}</p><div class="row small">${c.weeks.map(w => `<span class="chip">${esc(w)}</span>`).join('')}</div></div>`).join('');
    const arts = ARTICLES.articles.slice(0, 3).map(a => articleCard(a)).join('');
    return `
    <section class="hero wrap">
      <div class="stack" style="gap:20px">
        <span class="eyebrow">برنامه‌ی روان‌شناختی ترک قند، قدم به قدم</span>
        <h1>با حبه، <span class="hl">شیرینی</span> رو آروم‌آروم از زندگیت خداحافظی کن</h1>
        <p class="lead">هر روز یک متن کوتاه برای خوندن، یک مأموریت کوچک، یادآورهای مهربون و یک چک‌لیست شبانه. دوره‌های ۲۱ روزه که پشت هم میان، تا عادت سالم جای ریزه‌خواری و هوس شیرینی رو بگیره.</p>
        <div class="row"><a class="btn primary big" href="#${user ? 'today' : 'signup'}">${user ? 'برو به برنامه‌ی امروز' : '۳ روز رایگان شروع کن'}</a><a class="btn ghost" href="#recipes">دیدن رسپی‌های بی‌قند</a>${hook('homeHero')}</div>
        <div class="trust"><div><b>${fa(PROGRAM.cycles.length * 21 || 63)} روز</b>برنامه‌ی روزبه‌روز</div><div><b>${fa(RECIPES.length || 18)}+</b>کیک و دسر بی‌قند</div><div><b>${fa(4)} بار</b>یادآور در روز</div></div>
      </div>
      <div class="hero-art"><figure class="sb-polaroid">${ART.hero()}<figcaption class="sb-hand sb-only">قدم به قدم، با هم</figcaption></figure></div>
    </section>
    <section class="section wrap">
      <div class="section-head"><span class="eyebrow">چی تو حبه هست</span><h2>هر چیزی که برای ترک یک عادت سخت لازم داری</h2></div>
      <div class="features">
        ${feature('book', 'متن روزانه', 'هر روز یک متن ۲ دقیقه‌ای بر پایه‌ی تکنیک‌های درمان شناختی‌رفتاری: موج‌سواری روی هوس، برنامه‌ی «اگر… آنگاه…»، طراحی محیط و مهربانی با خود.')}
        ${feature('moon', 'چک‌لیست آخر شب', 'آخر هر شب کارهایی رو که انجام دادی تیک بزن، شدت هوست رو ثبت کن و یک سؤال کوتاه رو جواب بده. همین دو دقیقه، روزت رو کامل می‌کنه.')}
        ${feature('bell', 'یادآورهای مهربون', '«آفرین که ادامه می‌دی! پاشو یه لیوان آب بخور.» یادآورها ساعت‌هایی میان که خودت انتخاب کردی، به‌خصوص همون ساعتی که معمولاً هوس سراغت میاد.')}
        ${feature('water', 'دکمه‌ی «هوس دارم»', 'وقتی هوس شیرینی امونت رو بریده، یه تمرین تنفس، یک تکنیک فوری و یک جایگزین خوشمزه جلوت میاد. بیشتر هوس‌ها بعد از ۱۰ تا ۲۰ دقیقه فروکش می‌کنن.')}
        ${feature('trophy', 'نهالی که بزرگ می‌شه', 'هر روزی که تموم می‌کنی، نهالت یک برگ تازه می‌ده. روز ۲۱ گل می‌ده. نشان روزهای ۳، ۷، ۱۴ و ۲۱ رو هم می‌گیری.')}
        ${feature('brain', 'علم به زبان ساده', 'مقاله‌هایی بر پایه‌ی پژوهش‌های تازه درباره‌ی مقاومت به انسولین، تخمدان پلی‌کیستیک، ریزش مو، پوست، خلق‌وخو و قندهای پنهان.')}
      </div>
    </section>
    <section class="section wrap">
      <div class="section-head"><span class="eyebrow">سه دوره‌ی ۲۱ روزه</span><h2>از آگاهی، تا جایگزینی، تا یک هویت تازه</h2><p class="muted">هر دوره ادامه‌ی دوره‌ی قبله. بعد از دوره‌ی سوم می‌تونی دوباره از اول شروع کنی تا عادت محکم‌تر بشه.</p></div>
      <div class="cycles">${cyc}</div>
    </section>
    <section class="section wrap">
      <div class="section-head"><span class="eyebrow">چطور کار می‌کنه</span><h2>روزت با حبه</h2></div>
      <div class="steps-line">
        <div class="card"><h3>صبح</h3><p class="muted">متن امروز رو می‌خونی و مأموریت روز رو می‌بینی.</p></div>
        <div class="card"><h3>طول روز</h3><p class="muted">یادآورها سراغت میان: آب، میوه، قدم زدن، یک نفس عمیق.</p></div>
        <div class="card"><h3>لحظه‌ی هوس</h3><p class="muted">دکمه‌ی «هوس دارم» رو می‌زنی و ۱۰ دقیقه کنارت هستیم.</p></div>
        <div class="card"><h3>آخر شب</h3><p class="muted">چک‌لیست رو تیک می‌زنی و فردا روز بعدی باز می‌شه.</p></div>
      </div>
    </section>
    ${arts ? `<section class="section wrap"><div class="section-head"><span class="eyebrow">علم قند</span><h2>قند با بدنت چه می‌کنه؟</h2></div><div class="article-list">${arts}</div></section>` : ''}
    <section class="section wrap"><div class="band"><div class="spot">${ART.mascot('happy', { arms: 'up' })}</div><div class="stack"><p class="sb-hand sb-only sb-sidenote">تو از پسش برمیای!</p><h2>امروز روز اوله. فقط یک قدم کوچک.</h2><p class="muted">لازم نیست از فردا همه‌چیز رو کنار بذاری. حبه آروم و قدم به قدم پیش می‌ره و اگر یک روز لغزیدی، از همون‌جا ادامه می‌دی.</p><div><a class="btn berry big" href="#${user ? 'today' : 'signup'}">شروع دوره‌ی اول</a></div></div></div></section>`;
  };
  const feature = (spot, t, d) => `<div class="card feature"><div class="spot">${ART.spots[spot]}</div><h3>${t}</h3><p class="muted">${d}</p></div>`;
  mounts.home = () => bindArticles();

  /* auth */
  views.signup = () => `<section class="wrap auth stack" style="gap:20px">
    <div style="width:130px;margin:0 auto">${ART.mascot('happy', { arms: 'wave' })}</div>
    <div class="stack" style="gap:4px;text-align:center"><h2>بیا با هم شروع کنیم</h2><p class="muted">یک حساب بساز تا برنامه‌ات، چک‌لیست‌ها و یادآورهات ذخیره بشن. ۳ روز اول کاملاً رایگانه.</p></div>
    <form id="f" class="card pop stack" novalidate>
      <div class="field"><label for="name">اسمت</label><input class="input" id="name" required autocomplete="given-name" placeholder="مثلاً سارا"></div>
      <div class="field"><label for="email">ایمیل</label><input class="input" id="email" type="email" required autocomplete="email" dir="ltr" placeholder="you@example.com"></div>
      <div class="field"><label for="pass">رمز عبور</label><input class="input" id="pass" type="password" required minlength="6" autocomplete="new-password" dir="ltr"><span class="small muted">دست‌کم ۶ نویسه</span></div>
      <div class="err" id="err"></div>
      <button class="btn primary big" type="submit">ساخت حساب و شروع</button>
      <p class="small muted" style="text-align:center">حساب داری؟ <a href="#login">وارد شو</a></p>
    </form>${STORE.mode === 'local' ? `<p class="small muted" style="text-align:center">در این نسخه‌ی آزمایشی، اطلاعات فقط در همین مرورگر ذخیره می‌شه.</p>` : ''}</section>`;
  mounts.signup = () => $('#f').onsubmit = async e => {
    e.preventDefault();
    const name = $('#name').value.trim(), email = $('#email').value.trim(), pass = $('#pass').value;
    if (!name) return ($('#err').textContent = 'اسمت رو بنویس.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return ($('#err').textContent = 'ایمیل درست به نظر نمی‌رسه. مثل you@example.com بنویسش.');
    if (pass.length < 6) return ($('#err').textContent = 'رمز باید دست‌کم ۶ نویسه باشه.');
    try { user = await STORE.signup(name, email, pass); user.data = defaults(); await save(); await signedIn(); go('onboard'); }
    catch (er) { if (er.verify) return askCode(email, er.verify, er.message); $('#err').textContent = er.message; }
  };
  views.login = () => `<section class="wrap auth stack" style="gap:20px">
    <div style="width:120px;margin:0 auto">${ART.mascot('calm')}</div>
    <h2 style="text-align:center">خوش برگشتی</h2>
    <form id="f" class="card pop stack" novalidate>
      <div class="field"><label for="email">ایمیل</label><input class="input" id="email" type="email" required autocomplete="email" dir="ltr"></div>
      <div class="field"><label for="pass">رمز عبور</label><input class="input" id="pass" type="password" required autocomplete="current-password" dir="ltr"></div>
      <div class="err" id="err"></div>
      <button class="btn primary big" type="submit">ورود</button>
      <button class="btn ghost small" type="button" id="forgot" style="align-self:center">رمز رو فراموش کردم؟</button>
      <p class="small muted" style="text-align:center">هنوز حساب نداری؟ <a href="#signup">ثبت‌نام کن</a></p>
    </form></section>`;
  mounts.login = () => {
    $('#f').onsubmit = async e => {
      e.preventDefault();
      try { user = await STORE.login($('#email').value, $('#pass').value); user.data = normalize(user.data); await signedIn(); go(user.data.profile ? 'today' : 'onboard'); }
      catch (er) { if (er.verify) return askCode($('#email').value.trim(), er.verify, er.message); $('#err').textContent = er.message; }
    };
    $('#forgot').onclick = async () => {
      const email = $('#email').value.trim(), err = $('#err');
      if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'اول ایمیلت رو توی کادر بالا بنویس، بعد این دکمه رو بزن.'; $('#email').focus(); return; }
      const b = $('#forgot'); b.disabled = true;
      try { await STORE.resetPassword(email); askCode(email, 'recovery', 'اگه با این ایمیل حساب داشته باشی، یه کد برای تغییر رمز برات فرستادیم.'); }
      catch (er) { err.textContent = er.message; b.disabled = false; }
    };
  };
  // Emails carry a 6-digit code instead of a link (people rightly hesitate to click links in emails).
  // Turn on together with the Supabase email templates that carry {{ .Token }}; until then the emails still hold a link.
  const CODE_MAIL = true;
  const LINK_NOTE = { signup: 'ایمیل تأیید برات فرستادیم. روی لینک داخلش بزن و بعد وارد شو. اگه توی صندوق ورودی نبود، پوشه‌ی اسپم (Spam) رو هم نگاه کن.', recovery: 'اگه با این ایمیل حساب داشته باشی، لینک تغییر رمز برات فرستادیم. ایمیلت رو ببین و اگه توی صندوق ورودی نبود، پوشه‌ی اسپم (Spam) رو هم نگاه کن.' };
  const VKEY = 'uzhu:verify';
  const pendingCode = () => { try { return JSON.parse(sessionStorage.getItem(VKEY) || 'null'); } catch (e) { return null; } };
  function askCode(email, type, note) {
    if (!CODE_MAIL) { const err = $('#err'); if (err) err.textContent = LINK_NOTE[type]; return; }
    try { sessionStorage.setItem(VKEY, JSON.stringify({ email, type, note, at: Date.now() })); } catch (e) {}
    go('verify');
  }
  views.verify = () => {
    const v = pendingCode();
    if (!v) return `<section class="wrap auth stack" style="gap:16px;text-align:center"><h2>کدی در انتظار نیست</h2><p class="muted">از صفحه‌ی ثبت‌نام یا ورود شروع کن.</p><a class="btn primary big" href="#login">رفتن به ورود</a></section>`;
    return `<section class="wrap auth stack" style="gap:20px">
    <div style="width:120px;margin:0 auto">${ART.mascot('happy')}</div>
    <div class="stack" style="gap:6px;text-align:center"><h2>${v.type === 'recovery' ? 'کد تغییر رمز' : 'کد تأیید ایمیل'}</h2>
      <p class="muted">${esc(v.note || '')} کد رو از ایمیلی که به <b dir="ltr">${esc(v.email)}</b> فرستادیم بردار و اینجا بنویس.</p>
      <p class="small muted">اگه توی صندوق ورودی نبود، پوشه‌ی اسپم (Spam) رو هم نگاه کن. لازم نیست روی هیچ لینکی بزنی.</p></div>
    <form id="f" class="card pop stack" novalidate>
      <div class="field"><label for="code">کد</label><input class="input" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" dir="ltr" placeholder="123456" style="text-align:center;font-size:1.5rem;letter-spacing:.3em"></div>
      <div class="err" id="err"></div>
      <button class="btn primary big" type="submit">تأیید</button>
      <button class="btn ghost small" type="button" id="resend" style="align-self:center">کد نیومد؟ دوباره بفرست</button>
      <p class="small muted" style="text-align:center">ایمیل رو اشتباه نوشتی؟ <a href="#${v.type === 'recovery' ? 'login' : 'signup'}">برگرد و درستش کن</a></p>
    </form></section>`;
  };
  mounts.verify = () => {
    const v = pendingCode(), f = $('#f'); if (!v || !f) return;
    const box = $('#code'); box.focus();
    // Accept Persian/Arabic digits and pasted text with spaces.
    const digits = s => s.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
    box.oninput = () => { const d = digits(box.value); if (d !== box.value) box.value = d; };
    f.onsubmit = async e => {
      e.preventDefault();
      const code = digits(box.value);
      if (code.length < 6) return ($('#err').textContent = 'کد ۶ رقمیه. کامل بنویسش.');
      const b = f.querySelector('[type=submit]'); b.disabled = true;
      try {
        user = await STORE.verifyCode(v.email, code, v.type);
        try { sessionStorage.removeItem(VKEY); } catch (er) {}
        if (v.type === 'recovery') { user.data = user.data ? normalize(user.data) : defaults(); return go('newpass'); }
        if (user.data) user.data = normalize(user.data); else { user.data = defaults(); await save(); }
        await signedIn(); toast('ایمیلت تأیید شد. خوش اومدی!'); go(D().profile ? 'today' : 'onboard');
      } catch (er) { $('#err').textContent = er.message; b.disabled = false; }
    };
    let wait = 0, t = 0;
    const rb = $('#resend');
    const tick = () => { if (!rb.isConnected) return clearInterval(t); if (wait > 0) { rb.disabled = true; rb.textContent = `دوباره بفرست (${(wait--).toLocaleString('fa-IR')})`; } else { clearInterval(t); rb.disabled = false; rb.textContent = 'کد نیومد؟ دوباره بفرست'; } };
    rb.onclick = async () => {
      rb.disabled = true;
      try { await STORE.resendCode(v.email, v.type); $('#err').textContent = 'یه کد تازه فرستادیم. کد قبلی دیگه کار نمی‌کنه.'; wait = 60; t = setInterval(tick, 1000); tick(); }
      catch (er) { $('#err').textContent = er.message; rb.disabled = false; }
    };
  };
  // Reached from the password-reset email: the link signs the user in, then they choose a new password.
  views.newpass = () => !user ? `<section class="wrap auth stack" style="gap:16px;text-align:center"><h2>لینک تغییر رمز منقضی شده</h2><p class="muted">دوباره از صفحه‌ی ورود «رمز رو فراموش کردم؟» رو بزن تا یه لینک تازه برات بفرستیم.</p><a class="btn primary big" href="#login">رفتن به ورود</a></section>` : `<section class="wrap auth stack" style="gap:20px">
    <div style="width:120px;margin:0 auto">${ART.mascot('calm')}</div>
    <div class="stack" style="gap:4px;text-align:center"><h2>یه رمز تازه انتخاب کن</h2><p class="muted" dir="ltr">${esc(user.email || '')}</p></div>
    <form id="f" class="card pop stack" novalidate>
      <div class="field"><label for="pass">رمز جدید</label><input class="input" id="pass" type="password" required minlength="6" autocomplete="new-password" dir="ltr"><span class="small muted">دست‌کم ۶ نویسه</span></div>
      <div class="field"><label for="pass2">تکرار رمز جدید</label><input class="input" id="pass2" type="password" required minlength="6" autocomplete="new-password" dir="ltr"></div>
      <div class="err" id="err"></div>
      <button class="btn primary big" type="submit">ذخیره‌ی رمز جدید</button>
    </form></section>`;
  mounts.newpass = () => { const f = $('#f'); if (f) f.onsubmit = async e => {
    e.preventDefault();
    const p1 = $('#pass').value, p2 = $('#pass2').value;
    if (p1.length < 6) return ($('#err').textContent = 'رمز باید دست‌کم ۶ نویسه باشه.');
    if (p1 !== p2) return ($('#err').textContent = 'دو رمز با هم یکی نیستن.');
    try { await STORE.setPassword(p1); toast('رمزت عوض شد.'); go(D().profile ? 'today' : 'onboard'); }
    catch (er) { $('#err').textContent = er.message; }
  }; };

  /* onboarding quiz */
  const QUIZ = [
    { k: 'servings', q: 'روزی چند بار چیز شیرین می‌خوری؟ (شیرینی، شکلات، نوشابه، چای با قند، بیسکویت…)', o: [[0, 'اصلاً، تقریباً هیچ‌وقت'], [1, 'یکی دو بار'], [3, 'سه چهار بار'], [6, 'پنج بار یا بیشتر'], [9, 'تقریباً یک‌سره، حساب از دستم در رفته']] },
    { k: 'control', q: 'وقتی شروع به خوردن شیرینی می‌کنی، چقدر می‌تونی دست نگه داری؟', o: [[1, 'معمولاً راحت'], [2, 'گاهی سخته'], [3, 'اغلب بیشتر از چیزی که می‌خواستم می‌خورم'], [4, 'تقریباً هیچ‌وقت نمی‌تونم']] },
    { k: 'trigger', multi: true, q: 'بیشتر کِی سراغ شیرینی می‌ری؟ (هر چندتا که درسته)', o: [['stress', 'وقتی استرس دارم یا ناراحتم'], ['bored', 'وقتی حوصله‌ام سر رفته'], ['meal', 'بعد از غذا'], ['tea', 'کنار چای'], ['tired', 'وقتی خسته‌ام یا کم خوابیدم'], ['social', 'مهمونی و دورهمی'], ['period', 'روزهای قبل از پریود']] },
    { k: 'cravingTime', q: 'هوس شیرینی بیشتر چه ساعتی سراغت میاد؟', o: [['morning', 'صبح و نزدیک ظهر'], ['afternoon', 'عصر'], ['evening', 'سر شب'], ['night', 'آخر شب']] },
    { k: 'spend', q: 'حدوداً روزی چقدر خرج خوراکی شیرین و نوشیدنی شیرین می‌کنی؟', o: [[50000, 'کمتر از ۱۰۰ هزار تومان'], [200000, '۱۰۰ تا ۳۰۰ هزار تومان'], [450000, 'بیشتر از ۴۰۰ هزار تومان']] },
    { k: 'goal', multi: true, q: 'مهم‌ترین دلیلت برای ترک قند چیه؟', o: [['weight', 'کاهش وزن'], ['skin', 'پوست و مو'], ['pcos', 'تخمدان پلی‌کیستیک یا تعادل هورمونی'], ['insulin', 'مقاومت به انسولین یا پیش‌دیابت'], ['energy', 'انرژی و خلق‌وخوی بهتر'], ['teeth', 'دندان'], ['control', 'می‌خوام کنترلم رو پس بگیرم']] },
  ];
  let ob = { step: 0, a: {} };
  views.onboard = () => {
    const total = QUIZ.length + 2;
    const pct = Math.round(ob.step / total * 100);
    let body;
    if (ob.step < QUIZ.length) {
      const q = QUIZ[ob.step];
      body = `<h2>${esc(q.q)}</h2><div class="opts">${q.o.map(([v, t], i) => `<label class="opt"><input type="${q.multi ? 'checkbox' : 'radio'}" name="q" value="${v}" id="o${i}" ${[].concat(ob.a[q.k] ?? []).map(String).includes(String(v)) ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>`;
    } else if (ob.step === QUIZ.length) {
      const sc = (ob.a.servings ?? 3) + (ob.a.control || 2) * 2;
      const level = sc >= 12 ? 'gentle' : sc >= 7 ? 'steady' : 'full';
      ob.a.suggested = level;
      body = `<h2>سطح شروعت رو انتخاب کن</h2><p class="muted">بر اساس جواب‌هات، سطح <b>${LEVELS[level].t}</b> رو پیشنهاد می‌کنیم. هر وقت خواستی می‌تونی عوضش کنی.</p>
      <div class="opts">${Object.entries(LEVELS).map(([k, l]) => `<label class="opt"><input type="radio" name="q" value="${k}" ${(ob.a.level || level) === k ? 'checked' : ''}><span><b>${l.t}</b><br><span class="small muted">${l.d}</span></span></label>`).join('')}</div>`;
    } else {
      body = `<h2>تعهد کوچک تو</h2><p class="muted">پژوهش‌ها نشون می‌دن کسی که دلیلش رو می‌نویسه و برای لحظه‌های سخت برنامه‌ی «اگر… آنگاه…» داره، احتمال موفقیت بیشتری داره.</p>
      <div class="field"><label for="why">چرا می‌خوای قند رو کنار بذاری؟ با کلمه‌های خودت</label><textarea class="input" id="why" rows="3" placeholder="مثلاً: می‌خوام صبح‌ها با انرژی بیدار بشم و پوستم آروم بشه">${esc(ob.a.why || '')}</textarea></div>
      <div class="field"><label for="ifthen">اگر هوس شیرینی کردم، آنگاه…</label><input class="input" id="ifthen" value="${esc(ob.a.ifthen || '')}" placeholder="یه لیوان آب می‌خورم و ۱۰ دقیقه صبر می‌کنم"></div>
      <div class="field"><label>ساعت یادآورهای روزانه</label><div class="row">${['صبح', 'ظهر', 'عصر', 'شب'].map((t, i) => `<label class="small">${t}<br><input class="input" type="time" id="t${i}" value="${['09:00', '13:00', '16:30', '21:30'][i]}" style="width:auto"></label>`).join('')}</div></div>
      <div class="field"><label for="mtime">ساعت مناسب برای ورزش روزانه</label><input class="input" type="time" id="mtime" value="18:00" style="width:auto"></div>
      <div class="field"><label for="sign">برای امضای تعهد، اسمت رو بنویس</label><input class="input" id="sign" placeholder="${esc(user.name)}"></div>
      <div class="err" id="err"></div>`;
    }
    return `<section class="wrap auth stack" style="gap:18px">
      <div class="row"><div style="width:70px">${ART.mascot(ob.step > QUIZ.length ? 'happy' : 'calm')}</div><div class="stack" style="gap:6px;flex:1;min-width:0"><span class="small muted">قدم ${fa(ob.step + 1)} از ${fa(total)}</span><div class="progress"><i style="width:${pct}%"></i></div></div></div>
      <div class="card pop stack">${body}
      <div class="row" style="justify-content:space-between"><button class="btn ghost" id="back" ${ob.step ? '' : 'disabled'}>قبلی</button><button class="btn primary" id="next">${ob.step === total - 1 ? 'امضا و شروع برنامه' : 'بعدی'}</button></div></div></section>`;
  };
  const LEVELS = {
    gentle: { t: 'ملایم', d: 'اول نوشیدنی‌های شیرین و قند چای رو کم می‌کنیم، بعد کم‌کم بقیه. مناسب وابستگی زیاد.' },
    steady: { t: 'متوسط', d: 'از هفته‌ی اول قند افزوده رو حذف می‌کنیم و میوه‌ی کامل آزاده.' },
    full: { t: 'کامل', d: 'حذف کامل قند افزوده و شیرین‌کننده‌ها از روز اول، فقط میوه‌ی کامل.' },
  };
  mounts.onboard = () => {
    $('#back').onclick = () => { ob.step--; render(); };
    $('#next').onclick = async () => {
      if (ob.step < QUIZ.length) {
        const q = QUIZ[ob.step];
        const vals = $$('input[name=q]:checked').map(i => isNaN(i.value) ? i.value : Number(i.value));
        if (!vals.length) return toast('یکی از گزینه‌ها رو انتخاب کن.', 'bell');
        ob.a[q.k] = q.multi ? vals : vals[0];
        ob.step++; return render();
      }
      if (ob.step === QUIZ.length) { ob.a.level = $('input[name=q]:checked')?.value || ob.a.suggested; ob.step++; return render(); }
      ob.a.why = $('#why').value.trim(); ob.a.ifthen = $('#ifthen').value.trim();
      const sign = $('#sign').value.trim();
      if (!sign) return ($('#err').textContent = 'برای امضا اسمت رو بنویس.');
      const times = [0, 1, 2, 3].map(i => $('#t' + i).value || ['09:00', '13:00', '16:30', '21:30'][i]);
      const s = D();
      s.profile = { ...ob.a, trigger: ob.a.trigger || [], goal: ob.a.goal || [], sign, signedAt: dateKey() };
      s.settings.times = times; s.settings.moveTime = $('#mtime').value || '18:00'; s.startedAt = dateKey();
      await save();
      const p = await askNotify();
      ob = { step: 0, a: {} };
      runHooks('onboardDone', s);
      go('today'); confetti();
      toast(p === 'granted' ? 'یادآورها روشن شدن. اولین پیام رو سر ساعت انتخابی‌ات می‌فرستیم.' : 'یادآورها داخل همین صفحه نشون داده می‌شن. برای اعلان روی گوشی، از تنظیمات اجازه‌ی اعلان بده.', null, 'happy');
    };
  };

  /* today */
  views.today = () => {
    const s = D(), c = cycleObj(s.cycle), d = dayObj(), st = stats();
    if (!c || !d) return `<section class="wrap"><div class="card">محتوای برنامه بارگذاری نشد.</div></section>`;
    if (s.cycleDone) return cycleDoneView(c);
    const doneToday = s.log[logKey()]?.done;
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'صبح بخیر' : hour < 17 ? 'روزت بخیر' : 'عصرت بخیر';
    const week = c.weeks[Math.floor((s.day - 1) / 7)] || '';
    const rem = todaysReminders();
    const now = hhmm();
    return `<section class="wrap stack" style="gap:16px">
      ${hook('todayTop')}
      <div class="card pop greet"><div>${ART.mascot(doneToday ? 'happy' : hour >= 21 ? 'sleepy' : 'happy', doneToday ? { arms: 'up' } : {})}</div>
        <div class="stack" style="gap:4px;min-width:0"><span class="small muted sb-date">${esc(jalali())}</span><h2>${hello}، ${esc(user.name)}!</h2><p class="muted">دوره‌ی ${fa(s.cycle)}: ${esc(c.title)}، ${esc(week)}</p></div></div>
      <div class="today-grid">
        <div class="stack">
          <article class="card reading stack">
            <div class="row" style="justify-content:space-between"><span class="eyebrow">متن امروز، روز ${fa(s.day)}</span><span class="chip lav">${esc(d.technique)}</span></div>
            <h2>${esc(d.title)}</h2>
            ${d.read.map(p => `<p>${esc(p)}</p>`).join('')}
            ${hook('readingEnd', d)}
          </article>
          <div class="mission stack" style="gap:6px"><b>🎯 مأموریت امروز</b><p>${esc(d.mission)}</p></div>
          ${hook('todayMain')}
          <div class="card stack tip-card" style="gap:6px"><b>🔬 نکته‌ی علمی</b><p>${esc(d.tip)}</p></div>
          ${s.profile.ifthen ? `<div class="card stack ifthen-card" style="gap:4px"><b>برنامه‌ی «اگر… آنگاه…» تو</b><p class="muted">اگر هوس شیرینی کردم، آنگاه ${esc(s.profile.ifthen)}</p></div>` : ''}
        </div>
        <aside class="stack">
          ${hook('todayAside')}
          <div class="card row growth-card" data-cap="نهال من" style="justify-content:space-around">${ring(s.day - (doneToday ? 0 : 1), 21, c.color)}<div style="width:90px">${plant(s.day - (doneToday ? 0 : 1))}</div></div>
          <div class="card stat-row"><div><b class="num">${fa(st.streak)}</b><span class="small muted">روز پیاپی</span></div><div><b class="num">${fa(st.beaten)}</b><span class="small muted">هوسِ شکست‌خورده</span></div><div><b class="num">${fa(st.total)}</b><span class="small muted">روز کامل</span></div></div>
          <div class="card stack saved-card" style="gap:6px"><b>تا الان بهت نخورده</b><p><span class="display" style="font-size:1.6rem">${fa(st.cubes)}</span> حبه‌قند <span class="muted small">(تخمینی)</span></p><p><span class="display" style="font-size:1.6rem">${money(st.toman)}</span> تومان پس‌انداز</p></div>
          ${(() => { const ex = exDay(s.cycle, s.day); if (!ex) return ''; const lg = s.move[logKey()] || {}; const n = (lg.walk >= ex.walk) + (lg.breaths >= ex.breath) + !!lg.routine;
            return `<a class="card row move-link" href="#move" style="flex-wrap:nowrap;text-decoration:none;color:inherit"><div style="width:84px;flex:none" data-pose="${esc(ex.routine.moves[0].id)}"></div><div class="stack" style="gap:2px;min-width:0"><b>ورزش امروز، ${fa(n)} از ۳</b><span class="small muted">${fa(ex.walk)} دقیقه پیاده‌روی، ${fa(ex.breath)} نفس شکمی و ${esc(ex.routine.title)}</span></div></a>`; })()}
          <a class="btn ${doneToday ? 'ghost' : 'sun'} big" href="#night">${doneToday ? '✓ چک‌لیست امشب ثبت شد' : '🌙 چک‌لیست آخر شب'}</a>
          ${doneToday ? `<p class="small muted" style="text-align:center">روز ${fa(Math.min(s.day + 1, 21))} فردا صبح باز می‌شه.</p>` : ''}
          <details class="card stack rem-list" style="gap:8px"><summary><b>یادآورهای امروز</b> <span class="chip num">${fa(rem.length)}</span></summary>${rem.map(r => `<div class="row small" style="flex-wrap:nowrap;align-items:flex-start;opacity:${r.time <= now ? .55 : 1}"><span class="chip num">${fa(r.time)}</span><span style="min-width:0">${esc(r.text)}</span></div>`).join('')}</details>
        </aside>
      </div></section>`;
  };
  function cycleDoneView(c) {
    const extra = hook('cycleDone', D().cycle);
    const s = D(), next = s.cycle >= PROGRAM.cycles.length ? null : cycleObj(s.cycle + 1);
    return `<section class="wrap auth stack" style="gap:16px;text-align:center"><div style="width:180px;margin:0 auto">${ART.mascot('wow', { arms: 'up' })}</div>
      <h1>دوره‌ی ${fa(s.cycle)} تموم شد!</h1><p class="muted">۲۱ روز «${esc(c.title)}» رو پشت سر گذاشتی. این یعنی مغزت حالا چند صد بار تمرین کرده که بدون شیرینی هم آروم بشه.</p>
      <div style="width:120px;margin:0 auto">${plant(21)}</div>
      ${next ? `<div class="card pop stack"><span class="eyebrow">دوره‌ی بعدی</span><h3>${esc(next.title)}</h3><p class="muted">${esc(next.subtitle)}</p></div><button class="btn primary big" id="nextc">شروع دوره‌ی ${fa(next.id)}</button>`
        : `<div class="card pop"><p>هر سه دوره رو کامل کردی. از این به بعد، تکرار دوره‌ها عادت تازه‌ات رو محکم‌تر می‌کنه.</p></div><button class="btn primary big" id="nextc">تکرار از دوره‌ی ۱</button>`}${extra}</section>`;
  }
  mounts.today = () => { const b = $('#nextc'); if (b) b.onclick = startNextCycle; if (D().cycleDone) confetti(); };

  /* night checklist */
  views.night = () => {
    const s = D(), d = dayObj(); if (!d) return '';
    if (s.cycleDone) return cycleDoneView(cycleObj(s.cycle));
    const prev = s.log[logKey()] || {};
    const hour = new Date().getHours();
    return `<section class="wrap auth stack night-page" style="gap:16px;max-width:620px">
      <div class="row nt-head"><div class="nt-moon" style="width:90px">${ART.spots.moon}</div><div class="stack nt-titles" style="gap:2px;flex:1;min-width:0"><span class="eyebrow">روز ${fa(s.day)} از ۲۱</span><h2>چک‌لیست آخر شب</h2>${hour < 18 && !prev.done ? '<span class="small muted">بهترین زمان برای پر کردنش آخر شبه، ولی هر وقت خواستی می‌تونی ثبتش کنی.</span>' : ''}</div></div>
      <form id="nf" class="stack">
        <div class="card stack nt-sec nt-tasks" style="gap:10px"><b>امروز چه کارهایی کردی؟</b>
          ${d.tasks.map((t, i) => `<label class="check" for="k${i}"><input type="checkbox" id="k${i}" ${prev.tasks?.[i] ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}
          <div class="progress"><i id="bar" style="width:0"></i></div>
        </div>
        ${(() => { const ex = exDay(s.cycle, s.day); if (!ex) return ''; const lg = s.move[logKey()] || {}; const items = [[`${fa(ex.walk)} دقیقه پیاده‌روی کردم`, lg.walk >= ex.walk], [`${fa(ex.breath)} نفس شکمی انجام دادم`, lg.breaths >= ex.breath], [`جلسه‌ی «${esc(ex.routine.title)}» رو انجام دادم`, !!lg.routine]];
          return `<div class="card stack nt-sec nt-move" style="gap:10px"><div class="row" style="justify-content:space-between"><b>ورزش امروز</b><a class="small" href="#move">رفتن به بخش ورزش</a></div>${items.map(([t, on], i) => `<label class="check" for="x${i}"><input type="checkbox" id="x${i}" ${on || prev.move?.[i] ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>`; })()}
        <div class="card stack nt-sec nt-slip" style="gap:10px"><b id="nt-slip-q">امروز قند افزوده خوردی؟</b>
          <div class="scale" role="radiogroup" aria-labelledby="nt-slip-q">${[['no', '🌿 نه'], ['bit', '🍬 یه کم'], ['lot', '🍰 زیاد']].map(([v, t]) => `<label><input type="radio" name="slip" value="${v}" ${(prev.slip || 'no') === v ? 'checked' : ''}><span style="font-size:1rem;padding:8px 14px">${t}</span></label>`).join('')}</div>
        </div>
        <div class="card stack nt-sec nt-crave" style="gap:10px"><b id="nt-crave-q">شدیدترین هوس امروز چقدر بود؟</b>
          <div class="scale" role="radiogroup" aria-labelledby="nt-crave-q">${['😌', '🙂', '😐', '😣', '😫'].map((e, i) => `<label title="${fa(i)}"><input type="radio" name="crave" value="${i}" aria-label="${['اصلاً', 'کم', 'متوسط', 'زیاد', 'خیلی زیاد'][i]}" ${(prev.craving ?? 1) === i ? 'checked' : ''}><span>${e}</span></label>`).join('')}</div>
        </div>
        <div class="card stack nt-sec nt-ref" style="gap:8px"><label for="ref"><b>سؤال امشب:</b> ${esc(d.reflect)}</label><textarea id="ref" class="input" rows="3" placeholder="چند خط برای خودت بنویس…">${esc(prev.reflect || '')}</textarea></div>
        ${hook('nightExtra', prev)}
        <button class="btn primary big nt-submit" type="submit">${prev.done ? 'به‌روزرسانی چک‌لیست' : 'ثبت و تموم کردن روز ' + fa(s.day)}</button>
      </form></section>`;
  };
  mounts.night = () => {
    const f = $('#nf'); if (!f) return mounts.today();
    const upd = () => { const b = $$('.check input[id^=k]'); $('#bar').style.width = (b.filter(x => x.checked).length / b.length * 100) + '%'; };
    $$('.check input').forEach(i => i.onchange = upd); upd();
    f.onsubmit = async e => {
      e.preventDefault();
      const s = D(), was = s.log[logKey()]?.done;
      const tasks = $$('.check input[id^=k]').map(i => i.checked);
      const mv = [0, 1, 2].map(i => $('#x' + i)?.checked || false);
      const ex = exDay(s.cycle, s.day);
      if (ex) { const l = moveLog(); if (mv[0] && l.walk < ex.walk) l.walk = ex.walk; if (mv[1] && l.breaths < ex.breath) l.breaths = ex.breath; if (mv[2]) l.routine = true; }
      const slip = $('input[name=slip]:checked').value;
      s.log[logKey()] = { done: true, date: s.log[logKey()]?.date || nightKey(), tasks, move: mv, slip, craving: Number($('input[name=crave]:checked').value), reflect: $('#ref').value.trim() };
      if (!was) s.lastCompleteDate = nightKey();
      runHooks('nightSubmit', s.log[logKey()], !was);
      await save();
      go('today');
      if (!was) {
        confetti();
        const n = tasks.filter(Boolean).length;
        const msg = slip === 'lot'
          ? 'ممنون که صادقانه ثبتش کردی. یک لغزش یعنی شکست نیست، یعنی یک داده‌ی تازه. ببین چی باعثش شد و فردا از همون‌جا ادامه بده. روزت حساب شد.'
          : n >= tasks.length - 1 ? `آفرین! روز ${fa(s.day)} با ${fa(n)} تیک تموم شد. نهالت یک برگ تازه داد 🌱` : `روز ${fa(s.day)} ثبت شد. همین که تا اینجا اومدی یعنی داری ادامه می‌دی.`;
        toast(msg, null, slip === 'lot' ? 'calm' : 'happy');
        [3, 7, 14, 21].includes(s.day) && setTimeout(() => toast(`نشان روز ${fa(s.day)} رو گرفتی! 🏅`, 'trophy'), 1200);
      }
    };
  };

  /* journey */
  const BADGES = [[3, '🥉', 'سه روز اول', 'سخت‌ترین روزها رو رد کردی'], [7, '⭐', 'یک هفته', 'هفته‌ی اول تموم شد'], [14, '🌟', 'دو هفته', 'ذائقه‌ات داره عوض می‌شه'], [21, '🏆', 'یک دوره', '۲۱ روز کامل']];
  views.journey = () => {
    const s = D(), st = stats();
    const cyc = PROGRAM.cycles.map(c => {
      const dots = c.days.map(d => {
        const l = s.log[`c${c.id}d${d.day}`];
        const now = c.id === s.cycle && d.day === s.day && !s.cycleDone && !l?.done;
        return `<div class="dot ${l?.done ? (l.slip === 'lot' ? 'lapse' : 'done') : now ? 'now' : ''}" title="${esc(d.title)}">${l?.done ? (l.slip === 'lot' ? '•' : '✓') : fa(d.day)}</div>`;
      }).join('');
      const doneN = c.days.filter(d => s.log[`c${c.id}d${d.day}`]?.done).length;
      return `<div class="card stack"><div class="row" style="justify-content:space-between"><h3 style="color:${c.color}">دوره‌ی ${fa(c.id)}: ${esc(c.title)}</h3><span class="chip">${fa(doneN)} از ۲۱</span></div><div class="path">${dots}</div></div>`;
    }).join('');
    const maxDay = s.cycleDone ? 21 : s.day - (s.log[logKey()]?.done ? 0 : 1);
    const badges = BADGES.map(([n, i, t, d]) => `<div class="badge ${maxDay >= n || s.completedCycles.length ? 'got' : ''}"><div class="ico">${i}</div><b class="small">${t}</b><div class="small muted">${d}</div></div>`).join('') +
      PROGRAM.cycles.map(c => `<div class="badge ${s.completedCycles.includes(c.id) ? 'got' : ''}"><div class="ico">🌸</div><b class="small">دوره‌ی ${fa(c.id)}</b><div class="small muted">${esc(c.title)}</div></div>`).join('');
    // Craving insight: when SOS was used, by time of day.
    const slots = [['صبح', 5, 12], ['ظهر', 12, 15], ['عصر', 15, 19], ['شب', 19, 24], ['نیمه‌شب', 0, 5]];
    const counts = slots.map(([, a, b]) => s.sos.events.filter(e => e.hour >= a && e.hour < b).length);
    const mx = Math.max(1, ...counts);
    const top = counts.indexOf(Math.max(...counts));
    const insight = s.sos.events.length ? `<div class="stack" style="gap:8px">${slots.map(([t], i) => `<div class="row small" style="flex-wrap:nowrap"><span style="width:56px">${t}</span><div class="progress" style="flex:1"><i style="width:${counts[i] / mx * 100}%;background:var(--berry)"></i></div><span class="num" style="width:24px">${fa(counts[i])}</span></div>`).join('')}<p class="small muted">بیشترین هوس‌ها ${slots[top][0]} سراغت اومده. برای همین ساعت یک میان‌وعده‌ی پروتئین‌دار و یک لیوان آب آماده کن.</p></div>`
      : `<p class="muted small">هر بار دکمه‌ی «هوس دارم» رو بزنی، اینجا می‌بینی هوس‌ها بیشتر چه ساعتی میان.</p>`;
    const journal = Object.entries(s.log).filter(([, l]) => l.reflect).slice(-5).reverse().map(([k, l]) => `<div class="stack" style="gap:2px"><span class="small muted">${k.replace(/c(\d)d(\d+)/, (m, a, b) => `دوره‌ی ${fa(a)}، روز ${fa(b)}`)}</span><p>${esc(l.reflect)}</p></div>`).join('');
    return `<section class="wrap stack" style="gap:16px">
      <div class="section-head" style="margin:0"><span class="eyebrow">مسیر من</span><h2>${fa(st.total)} روز از مسیر رو اومدی</h2></div>
      ${cyc}
      <div class="two"><div class="card stack"><b>نشان‌ها</b><div class="badges">${badges}</div></div>
      <div class="stack"><div class="card stack"><b>هوس‌ها چه ساعتی میان؟</b>${insight}</div>
      <div class="card stack"><b>دکمه‌ی «هوس دارم»</b><p><span class="display" style="font-size:1.6rem;color:var(--mint)">${fa(s.sos.beaten)}</span> بار هوس رو رد کردی و <span class="display" style="font-size:1.6rem">${fa(s.sos.gave)}</span> بار تسلیم شدی.</p></div></div></div>
      ${hook('journey')}
      ${journal ? `<div class="card stack"><b>از دفترچه‌ی شب‌هات</b>${journal}</div>` : ''}
    </section>`;
  };

  /* exercise */
  const fig = (id, cls = '') => `<div class="fig ${cls}" data-pose="${esc(id)}">${POSE ? POSE.svgFor(id, 0) : ''}</div>`;
  const amount = mv => mv.reps ? `${fa(mv.reps)} بار` : `${fa(mv.secs)} ثانیه`;
  let moveFilter = 'همه';
  views.move = () => {
    const s = D(), ex = exDay(s.cycle, s.day), lg = moveLog(), prog = hook('moveProgram');
    if (!ex) return `<section class="wrap"><div class="card">برنامه‌ی ورزش بارگذاری نشد.</div></section>`;
    const mins = ex.routine.moves.reduce((a, mv) => a + (mv.secs || mv.reps * 4) + 10, 0) / 60;
    const types = ['همه', ...new Set(Object.values(EX.moves).map(m => m.type))];
    const lib = Object.entries(EX.moves).filter(([, m]) => moveFilter === 'همه' || m.type === moveFilter);
    const doneN = (lg.walk >= ex.walk) + (lg.breaths >= ex.breath) + !!lg.routine;
    return `<section class="wrap stack" style="gap:16px">
      <div class="section-head" style="margin:0"><span class="eyebrow">${prog ? 'ورزش، قدم‌به‌قدم' : `ورزش امروز، روز ${fa(s.day)} از ۲۱`}</span><h2>بدنت هم توی این مسیر همراهته</h2>${EX.intro ? (prog ? `<details class="m21-intro"><summary class="small muted">چرا ورزش توی ترک قند کمک می‌کنه؟</summary><p class="muted small">${esc(EX.intro)}</p></details>` : `<p class="muted">${esc(EX.intro)}</p>`) : ''}</div>
      ${prog}
      ${hook('moveTop')}
      <div class="card pop row" style="justify-content:space-between"><div class="stack" style="gap:2px"><b>${fa(doneN)} از ۳ کار ورزشی امروز انجام شده</b><span class="small muted">${esc(ex.note || '')}</span></div><div class="progress" style="flex:1;min-width:160px;max-width:320px"><i style="width:${doneN / 3 * 100}%"></i></div></div>
      <div class="move-grid${ex.m21 ? ' m21-g2' : ''}">
        <div class="card stack ${lg.walk >= ex.walk ? 'done-card' : ''}"><div class="row" style="justify-content:space-between"><b>🚶‍♀️ پیاده‌روی</b><span class="chip ${lg.walk >= ex.walk ? 'mint' : ''}">${fa(lg.walk)} از ${fa(ex.walk)} دقیقه</span></div>
          ${fig('walk-march', 'sm')}
          <p class="small muted">بیرون، روی تردمیل یا حتی درجا توی خونه. ۱۰ دقیقه بعد از ناهار یا شام، قند خونت رو آروم‌تر نگه می‌داره.</p>
          <div class="timer num" id="wt">${fa('00:00')}</div>
          <div class="row"><button class="btn primary" id="wgo">شروع پیاده‌روی</button><button class="btn ghost" id="wadd">ثبت دستی ${fa(10)} دقیقه</button></div></div>
        <div class="card stack ${lg.breaths >= ex.breath ? 'done-card' : ''}"><div class="row" style="justify-content:space-between"><b>🌬️ تنفس شکمی</b><span class="chip ${lg.breaths >= ex.breath ? 'mint' : ''}">${fa(lg.breaths)} از ${fa(ex.breath)} نفس</span></div>
          ${fig('breath-belly', 'sm')}
          <p class="small muted">${esc(EX.breathing?.how?.[0] || 'یک دست روی سینه و یک دست روی شکم. از بینی دم بگیر طوری که فقط شکمت بالا بیاد.')}</p>
          <button class="btn primary" id="bgo">شروع تمرین تنفس</button></div>
        ${ex.m21 ? '' : `<div class="card stack ${lg.routine ? 'done-card' : ''}"><div class="row" style="justify-content:space-between"><b>🧘 ${esc(ex.routine.title)}</b><span class="chip lav">${esc(ex.routine.style)}، حدود ${fa(Math.max(1, Math.round(mins)))} دقیقه</span></div>
          <div class="routine-list">${ex.routine.moves.map(mv => { const M = EX.moves[mv.id] || {}; return `<button class="mini" data-mv="${esc(mv.id)}">${fig(mv.id)}<span class="small"><b>${esc(M.name || mv.id)}</b><br><span class="muted">${amount(mv)}</span></span></button>`; }).join('')}</div>
          <button class="btn ${lg.routine ? 'ghost' : 'berry'}" id="rgo">${lg.routine ? '✓ انجام شد، دوباره؟' : 'شروع جلسه'}</button></div>`}
      </div>
      <div class="card stack"><div class="row" style="justify-content:space-between"><h3>کتابخانه‌ی حرکت‌ها</h3><div class="filters">${types.map(t => `<button data-mf="${esc(t)}" class="${t === moveFilter ? 'on' : ''}">${esc(t)}</button>`).join('')}</div></div>
        <div class="lib-grid">${lib.map(([id, M]) => `<button class="card mini-card" data-mv="${esc(id)}">${fig(id)}<b>${esc(M.name)}</b><span class="small muted">${esc(M.type)}، سطح ${fa(M.level)}</span></button>`).join('')}</div></div>
      <p class="small muted">اگه درد، سرگیجه یا تنگی نفس داشتی، حرکت رو متوقف کن. اگه بارداری، آسیب کمر یا زانو، یا بیماری قلبی داری، قبل از شروع با پزشک یا فیزیوتراپ مشورت کن.</p>
    </section>`;
  };
  let walkIv = null;
  mounts.move = () => {
    const s = D(), ex = exDay(s.cycle, s.day); if (!ex) return;
    const lg = moveLog();
    $$('[data-mf]').forEach(b => b.onclick = () => { moveFilter = b.dataset.mf; render(); });
    $$('[data-mv]').forEach(b => b.onclick = () => openMove(b.dataset.mv));
    const addWalk = async m => { const l = moveLog(); const was = l.walk >= ex.walk; l.walk += m; await save(); if (!was && l.walk >= ex.walk) { confetti(); toast(`آفرین! ${fa(ex.walk)} دقیقه پیاده‌روی امروز کامل شد.`, null, 'happy'); } render(); };
    $('#wadd').onclick = () => addWalk(10);
    clearInterval(walkIv); walkIv = null;
    $('#wgo').onclick = () => {
      const b = $('#wgo');
      if (walkIv) { clearInterval(walkIv); const m = Math.round((Date.now() - b._t) / 60000); walkIv = null; if (m > 0) addWalk(m); else { toast('کمتر از یک دقیقه بود و ثبت نشد.', 'bell'); render(); } return; }
      b._t = Date.now(); b.textContent = 'پایان و ثبت'; b.classList.replace('primary', 'berry');
      walkIv = setInterval(() => { const el = $('#wt'); if (!el) return clearInterval(walkIv); const sec = Math.floor((Date.now() - b._t) / 1000); el.textContent = fa(`${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`); }, 1000);
    };
    $('#bgo').onclick = () => openBreath(ex.breath);
    if ($('#rgo')) $('#rgo').onclick = () => openSession(ex);
  };
  function openMove(id) {
    const M = EX.moves[id]; if (!M) return;
    modal(`<div class="stack"><div class="fig big" data-pose="${esc(id)}"></div>
      <div class="row"><span class="chip lav">${esc(M.type)}</span><span class="chip">سطح ${fa(M.level)}</span>${M.en ? `<span class="chip" dir="ltr">${esc(M.en)}</span>` : ''}</div>
      <h2>${esc(M.name)}</h2>${M.benefit ? `<p class="muted">${esc(M.benefit)}</p>` : ''}
      <ol class="steps">${(M.how || []).map(h => `<li>${esc(h)}</li>`).join('')}</ol>
      ${M.cue ? `<div class="mission"><b>🎯 نکته‌ی کلیدی</b><p>${esc(M.cue)}</p></div>` : ''}
      <div class="two">${M.avoid ? `<div class="card stack" style="gap:4px;background:var(--berry-soft);border-color:transparent"><b>اشتباه رایج</b><p class="small">${esc(M.avoid)}</p></div>` : ''}${M.easier ? `<div class="card stack" style="gap:4px;background:var(--mint-soft);border-color:transparent"><b>نسخه‌ی آسان‌تر</b><p class="small">${esc(M.easier)}</p></div>` : ''}</div>
      ${M.video?.url ? `<a class="btn ghost" href="${esc(M.video.url)}" target="_blank" rel="noopener">▶ ویدیوی آموزشی: ${esc(M.video.channel || '')}</a><span class="small muted" dir="ltr" style="text-align:left">${esc(M.video.title || '')}</span>` : ''}</div>`, () => POSE && POSE.animate());
  }
  function openBreath(target) {
    const r = EX.breathing?.rhythm || { inhale: 4, hold: 0, exhale: 6 };
    let n = 0, on = false, timer = null;
    modal(`<div class="stack" style="text-align:center;gap:12px"><span class="eyebrow">تنفس شکمی (دیافراگمی)</span><h2>${fa(target)} نفس آروم</h2>
      <div class="breath-big" id="bb"><div class="belly-circle" id="bc"></div><span id="bt">آماده‌ای؟</span></div>
      <div class="timer num" id="bn">${fa(0)} / ${fa(target)}</div>
      <ol class="steps small" style="text-align:start">${(EX.breathing?.how || ['راحت بشین یا به پشت دراز بکش.', 'یک دست روی سینه، یک دست روی شکم.', 'از بینی دم بگیر تا شکمت بالا بیاد و سینه‌ات تقریباً ثابت بمونه.', 'آروم از دهان یا بینی بازدم کن و بذار شکمت پایین بره.']).map(h => `<li>${esc(h)}</li>`).join('')}</ol>
      <div class="row" style="justify-content:center"><button class="btn primary big" id="bs">شروع</button></div></div>`,
      (m, close) => {
        const circle = $('#bc', m), label = $('#bt', m);
        const phase = (name, sec, scale) => new Promise(res => { label.textContent = name; circle.style.transition = `transform ${sec}s ease-in-out`; circle.style.transform = `scale(${scale})`; timer = setTimeout(res, sec * 1000); });
        const finish = async () => { const l = moveLog(); const add = n; l.breaths += add; await save(); close(); render(); if (add) toast(`${fa(add)} نفس شکمی ثبت شد. بدنت آروم‌تر شد 🌬️`, 'water'); };
        m._cleanup = () => { clearTimeout(timer); on = false; };
        $('#bs', m).onclick = async () => {
          if (on) { on = false; clearTimeout(timer); return finish(); }
          on = true; $('#bs', m).textContent = 'پایان و ثبت';
          while (on && n < target) {
            await phase('دم… شکم بالا', r.inhale, 1);
            if (!on) break;
            if (r.hold) await phase('نگه دار', r.hold, 1);
            if (!on) break;
            await phase('بازدم… شکم پایین', r.exhale, .55);
            if (!on) break;
            n++; $('#bn', m).textContent = `${fa(n)} / ${fa(target)}`;
          }
          if (on) { on = false; confetti(); finish(); }
        };
      });
  }
  function openSession(ex) {
    const list = ex.routine.moves; let i = 0, left = 0, iv = null, paused = false;
    modal(`<div class="stack" style="text-align:center;gap:10px"><span class="eyebrow">${esc(ex.routine.title)}</span>
      <div class="progress"><i id="sp" style="width:0"></i></div>
      <div class="fig big" id="sf"></div><h2 id="sn"></h2><p class="small muted" id="sc"></p>
      <div class="timer num" id="st"></div>
      <div class="row" style="justify-content:center"><button class="btn ghost" id="sb">قبلی</button><button class="btn primary big" id="sm"></button><button class="btn ghost" id="sx">بعدی</button></div>
      <p class="small muted" id="snext"></p></div>`,
      (m, close) => {
        const show = () => {
          clearInterval(iv); const mv = list[i], M = EX.moves[mv.id] || {};
          $('#sf', m).dataset.pose = mv.id; $('#sf', m).innerHTML = POSE ? POSE.svgFor(mv.id, 0) : ''; POSE && POSE.animate();
          $('#sn', m).textContent = M.name || mv.id; $('#sc', m).textContent = M.cue || '';
          $('#sp', m).style.width = (i / list.length * 100) + '%';
          $('#snext', m).textContent = list[i + 1] ? 'بعدی: ' + (EX.moves[list[i + 1].id]?.name || '') : 'این آخرین حرکته 💪';
          if (mv.reps) { $('#st', m).textContent = fa(mv.reps) + ' بار'; $('#sm', m).textContent = 'انجام دادم'; }
          else {
            left = mv.secs; paused = false; $('#sm', m).textContent = 'مکث';
            const tickT = () => { $('#st', m).textContent = fa(`${pad(Math.floor(left / 60))}:${pad(left % 60)}`); };
            tickT(); iv = setInterval(() => { if (paused) return; left--; tickT(); if (left <= 0) next(); }, 1000);
          }
        };
        let finished = false;
        const done = async () => { if (finished) return; finished = true; clearInterval(iv); const l = moveLog(); l.routine = true; await save(); close(); render(); confetti(); toast('جلسه‌ی امروز تموم شد! بدنت ازت ممنونه 🧘', null, 'happy'); };
        const next = () => { if (i >= list.length - 1) return done(); i++; show(); };
        $('#sm', m).onclick = () => { if (list[i].reps) next(); else { paused = !paused; $('#sm', m).textContent = paused ? 'ادامه' : 'مکث'; } };
        $('#sx', m).onclick = next;
        $('#sb', m).onclick = () => { if (i > 0) { i--; show(); } };
        m._cleanup = () => clearInterval(iv);
        show();
      });
  }

  /* tools hub: every extra tool registered by features.js / admin.js */
  views.more = () => `<section class="wrap stack" style="gap:16px">
    <div class="section-head" style="margin:0"><span class="eyebrow">ابزارها</span><h2>هر چیزی که برای این مسیر لازم داری</h2></div>
    <div class="tools-grid">${[...tools, { route: 'recipes', icon: '🍰', title: 'رسپی‌های بی‌قند', desc: 'کیک، دسر و میان‌وعده بدون قند افزوده' }, { route: 'learn', icon: '📖', title: 'علم قند', desc: 'مقاله‌های علمی و راهنمای قندهای پنهان' }, { route: 'settings', icon: '⚙️', title: 'تنظیمات', desc: 'یادآورها، سطح برنامه، ظاهر' }].filter(t => !t.show || t.show()).map(t => `<a class="card tool" href="#${t.route}"><span class="tool-i">${t.icon}</span><b>${esc(t.title)}</b><span class="small muted">${esc(t.desc)}</span></a>`).join('')}</div></section>`;

  /* recipes */
  let recipeCat = 'همه';
  views.recipes = () => {
    const cats = ['همه', ...new Set(RECIPES.map(r => r.category))];
    const list = RECIPES.filter(r => recipeCat === 'همه' || r.category === recipeCat);
    return `<section class="wrap stack" style="gap:18px">
      <div class="section-head" style="margin:0"><span class="eyebrow">خوراکی‌های بی‌قند</span><h2>کیک، دسر و میان‌وعده، بدون قند افزوده</h2><p class="muted">شیرینی این رسپی‌ها از میوه، خرما (به اندازه)، دارچین، وانیل و کاکائو میاد. همه‌ی مواد در ایران پیدا می‌شن.</p></div>
      ${hook('recipesTop')}
      <div class="filters" role="tablist">${cats.map(c => `<button data-c="${esc(c)}" class="${c === recipeCat ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>
      ${list.length ? `<div class="recipe-grid">${list.map(r => `<button class="card recipe" data-r="${esc(r.id)}"><div class="art">${r.svg}</div><div class="body"><span class="chip mint" style="align-self:flex-start">${esc(r.category)}</span><h3>${esc(r.title)}</h3><span class="small muted">⏱ ${esc(r.time)}، ${esc(r.difficulty)}</span></div></button>`).join('')}</div>` : '<div class="card">رسپی‌ها به‌زودی اضافه می‌شن.</div>'}
    </section>`;
  };
  mounts.recipes = () => {
    $$('.filters button').forEach(b => b.onclick = () => { recipeCat = b.dataset.c; render(); });
    $$('[data-r]').forEach(b => b.onclick = () => openRecipe(b.dataset.r));
  };
  function openRecipe(id) {
    const r = RECIPES.find(x => x.id === id); if (!r) return;
    modal(`<div class="stack"><div style="max-width:300px;margin:0 auto;width:100%">${r.svg}</div>
      <div class="row">${[r.category, r.time, r.difficulty, r.serves].filter(Boolean).map(t => `<span class="chip">${esc(t)}</span>`).join('')}${(r.tags || []).map(t => `<span class="chip mint">${esc(t)}</span>`).join('')}</div>
      <h2>${esc(r.title)}</h2><p class="muted">${esc(r.intro)}</p>
      ${hook('recipeModal', r)}
      <div class="two"><div class="stack" style="gap:6px"><h3>مواد لازم</h3><ul class="ing">${r.ingredients.map(i => `<li>${esc(i)}</li>`).join('')}</ul>${r.calories ? `<p class="small muted">${esc(r.calories)}</p>` : ''}</div>
      <div class="stack" style="gap:6px"><h3>طرز تهیه</h3><ol class="steps">${r.steps.map(i => `<li>${esc(i)}</li>`).join('')}</ol></div></div>
      ${r.tip ? `<div class="mission"><b>💡 نکته</b><p>${esc(r.tip)}</p></div>` : ''}${hook('recipeEnd', r)}</div>`, (el, close) => runHooks('recipeMount', r, el, close));
  }

  /* learn */
  const articleCard = a => `<button class="card article" data-a="${esc(a.id)}"><div style="width:64px">${ART.spots[a.spot] || ART.spots.brain}</div><h3>${esc(a.title)}</h3><p class="muted small">${esc(a.summary)}</p><span class="small" style="color:var(--mint);font-weight:800">خوندن مقاله ←</span></button>`;
  function bindArticles() { $$('[data-a]').forEach(b => b.onclick = () => openArticle(b.dataset.a)); }
  function openArticle(id) {
    const a = ARTICLES.articles.find(x => x.id === id); if (!a) return;
    modal(`<div class="stack article-body"><span class="eyebrow">علم قند</span><h2>${esc(a.title)}</h2>${hook('articleTop', a)}${a.html}${hook('articleEnd', a)}
      ${a.refs?.length ? `<h3>منابع</h3><ol class="refs">${a.refs.map(r => `<li>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.text)}</a>` : esc(r.text)}</li>`).join('')}</ol>` : ''}
      <p class="small muted">این مطالب جای مشاوره‌ی پزشکی رو نمی‌گیره. اگر دیابت داری و دارو مصرف می‌کنی، باردار یا شیرده هستی یا سابقه‌ی اختلال خوردن داری، قبل از تغییر رژیم با پزشکت مشورت کن.</p></div>`, (el, close) => runHooks('articleMount', a, el, close));
  }
  views.learn = () => `<section class="wrap stack" style="gap:18px">
    <div class="section-head" style="margin:0"><span class="eyebrow">علم قند</span><h2>قند با بدن و ذهنت چه می‌کنه، و ترکش چه چیزی بهت می‌ده</h2><p class="muted">خلاصه‌ی پژوهش‌های تازه‌ی پزشکی، به زبان ساده و با منبع.</p></div>
    ${hook('learnTop')}
    <div class="article-list">${ARTICLES.articles.map(articleCard).join('')}</div>
    ${ARTICLES.hidden?.length ? `<div class="card stack"><h3>راهنمای قندهای پنهان</h3><p class="muted small">روی برچسب خوراکی‌ها دنبال این اسم‌ها بگرد. هر ۴ گرم قند تقریباً یک حبه‌قنده.</p><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:520px">${ARTICLES.hidden.map(h => `<tr style="border-top:1px solid var(--line)"><td style="padding:8px"><span class="chip ${h.level === 'red' ? 'berry' : h.level === 'yellow' ? 'sun' : 'mint'}">${h.level === 'red' ? 'پرقند' : h.level === 'yellow' ? 'با احتیاط' : 'خوبه'}</span></td><td style="padding:8px"><b>${esc(h.food)}</b></td><td style="padding:8px" class="small muted">${esc(h.note)}</td></tr>`).join('')}</table></div></div>` : ''}
    </section>`;
  mounts.learn = bindArticles;

  /* settings */
  views.settings = () => {
    const s = D(), p = s.profile;
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    return `<section class="wrap auth stack" style="gap:16px;max-width:620px">
      <h2>تنظیمات</h2>
      <div class="card stack"><b>حساب</b><p>${esc(user.name)}، <span dir="ltr">${esc(user.email)}</span></p><p class="small muted">سطح: ${LEVELS[p.level]?.t || '-'}، شروع: ${p.signedAt ? esc(jalali(new Date(p.signedAt + 'T12:00'))) : '-'}${STORE.mode === 'local' ? '، ذخیره در همین مرورگر' : '، ذخیره‌ی آنلاین'}</p>
        <div class="field"><label for="lvl">سطح برنامه</label><select class="input" id="lvl">${Object.entries(LEVELS).map(([k, l]) => `<option value="${k}" ${p.level === k ? 'selected' : ''}>${l.t}</option>`).join('')}</select></div></div>
      <div class="card stack"><b>یادآورها</b>
        <label class="check" for="rem"><input type="checkbox" id="rem" ${s.settings.reminders ? 'checked' : ''}><span>یادآورهای روزانه روشن باشه</span></label>
        <div class="row">${['صبح', 'ظهر', 'عصر', 'شب'].map((t, i) => `<label class="small">${t}<br><input class="input" type="time" id="t${i}" value="${s.settings.times[i]}" style="width:auto"></label>`).join('')}</div>
        <label class="check" for="mrem"><input type="checkbox" id="mrem" ${s.settings.moveRem !== false ? 'checked' : ''}><span>یادآور ورزش و تنفس شکمی</span></label>
        <label class="small">ساعت ورزش<br><input class="input" type="time" id="mt" value="${s.settings.moveTime || '18:00'}" style="width:auto"></label>
        <p class="small muted">اعلان سیستمی: ${{ granted: 'مجاز', denied: 'مسدود (از تنظیمات مرورگر باز کن)', default: 'هنوز اجازه نگرفتیم', unsupported: 'این مرورگر پشتیبانی نمی‌کنه' }[perm]}</p>
        <div class="row"><button class="btn" id="perm" type="button">اجازه‌ی اعلان</button><button class="btn ghost" id="test" type="button">ارسال یک یادآور آزمایشی</button></div></div>
      ${demoOn() ? `<div class="card stack"><b>حالت آزمایشی</b><p class="small muted">برای دیدن روزهای بعدی برنامه بدون صبر کردن تا فردا.</p><div class="row"><button class="btn" id="skip" type="button">برو به روز بعد</button></div></div>` : ''}
      <a class="card row" href="#learn" style="text-decoration:none;color:inherit;flex-wrap:nowrap"><div style="width:48px;flex:none">${ART.spots.book}</div><b>علم قند: مقاله‌ها و راهنمای قندهای پنهان</b></a>
      <div class="card stack"><b>ظاهر</b><div class="row"><button class="btn ghost" data-th="light">روشن</button><button class="btn ghost" data-th="dark">تیره</button><button class="btn ghost" data-th="system">مثل سیستم</button></div></div>
      ${hook('settings')}
      <div class="row"><button class="btn primary" id="sv">ذخیره</button><button class="btn ghost" id="out">خروج از حساب</button></div>
      <div class="card stack" style="border-color:var(--berry-soft)"><b>شروع دوباره</b><p class="small muted">همه‌ی پیشرفت و جواب‌های پرسش‌نامه پاک می‌شه.</p><div class="row"><button class="btn ghost" id="reset">پاک کردن پیشرفت</button><button class="btn berry" id="resetok" hidden>بله، پاک کن</button></div></div>
    </section>`;
  };
  mounts.settings = () => {
    $('#perm').onclick = async () => { await askNotify(); render(); };
    $('#test').onclick = () => notify(pick(PROGRAM.quotes.length ? PROGRAM.quotes : ['آفرین که ادامه می‌دی! پاشو یه لیوان آب بخور 💧']), 'water');
    if ($('#skip')) $('#skip').onclick = () => { forceNextDay(); save(); go('today'); toast('رفتی به روز بعد (حالت آزمایشی).', 'bell'); };
    $$('[data-th]').forEach(b => b.onclick = () => { const t = b.dataset.th; if (t !== 'system') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; try { localStorage.setItem('uzhu:theme', t); } catch (e) {} });
    $('#sv').onclick = async () => {
      const s = D(); s.settings.reminders = $('#rem').checked; s.settings.times = [0, 1, 2, 3].map(i => $('#t' + i).value || s.settings.times[i]); s.profile.level = $('#lvl').value; s.settings.moveRem = $('#mrem').checked; s.settings.moveTime = $('#mt').value || '18:00';
      runHooks('settingsSave'); await save();
      // js/ux.js auto-saves on every change and shows its own quiet "saved" mark instead of a toast.
      if ($('#sv').dataset.quiet) delete $('#sv').dataset.quiet; else toast('ذخیره شد.', 'bell');
    };
    $('#out').onclick = async () => { let ep = null; try { const sub = swReg && await swReg.pushManager.getSubscription(); if (sub) { ep = sub.endpoint; await STORE.logout(ep); await sub.unsubscribe(); } else await STORE.logout(); } catch (e) { await STORE.logout(ep).catch(() => {}); } pushOn = false; user = null; go('home'); };
    $('#reset').onclick = () => { $('#resetok').hidden = false; };
    $('#resetok').onclick = async () => { user.data = defaults(); await save(); go('onboard'); };
  };

  /* SOS: craving emergency */
  function openSOS() {
    const tech = pick(PROGRAM.sos.length ? PROGRAM.sos : [{ title: 'تنفس ۴-۷-۸', text: '۴ ثانیه دم، ۷ ثانیه نگه‌دار، ۸ ثانیه بازدم. چهار بار تکرار کن.', seconds: 60 }]);
    const swaps = ['۲ عدد خرما با ۲ مغز گردو', 'یک سیب یا پرتقال کامل', 'یک لیوان چای دارچین بدون قند', 'یک کاسه ماست ساده با چند حبه توت‌فرنگی', 'یک مشت نخودچی', 'یک تکه شکلات تلخ ۸۵٪ (یک مربع کوچک)'];
    let left = 600;
    modal(`<div class="stack" style="text-align:center;gap:12px"><span class="eyebrow">هوس شیرینی؟ با هم ردش می‌کنیم</span>
      <div class="breath" id="br">نفس بکش</div>
      <div class="timer num" id="tm">۱۰:۰۰</div>
      <p class="small muted">هوس مثل موج بالا میاد، به اوج می‌رسه و بعد فروکش می‌کنه. معمولاً کمتر از ۲۰ دقیقه طول می‌کشه.</p>
      <div class="card stack" style="text-align:start;gap:6px"><b>${esc(tech.title)}</b><p>${esc(tech.text)}</p></div>
      <div class="card stack" style="text-align:start;gap:6px;background:var(--mint-soft);border-color:transparent"><b>اگه گرسنه‌ای، یه جایگزین:</b><p>${pick(swaps)}</p></div>
      ${D().profile?.why ? `<div class="card" style="text-align:start"><b>یادت باشه چرا شروع کردی:</b><p class="muted">«${esc(D().profile.why)}»</p></div>` : ''}
      <div class="row" style="justify-content:center"><button class="btn primary big" id="win">رد شد! 💪</button><button class="btn ghost" id="lose">خوردم</button></div></div>`,
      (m, close) => {
        const phases = [['دم…', 4], ['نگه‌دار…', 7], ['بازدم…', 8]]; let pi = 0, pt = 0;
        const iv = setInterval(() => {
          left = Math.max(0, left - 1); $('#tm', m).textContent = fa(`${pad(Math.floor(left / 60))}:${pad(left % 60)}`);
          if (++pt >= phases[pi][1]) { pi = (pi + 1) % 3; pt = 0; } $('#br', m).textContent = phases[pi][0];
          if (!left) { clearInterval(iv); $('#br', m).textContent = 'تموم شد 🌿'; }
        }, 1000);
        m._cleanup = () => clearInterval(iv);
        let logged = false;
        const log = async beaten => { if (logged) return; logged = true; const s = D(); s.sos[beaten ? 'beaten' : 'gave']++; s.sos.events.push({ t: Date.now(), hour: new Date().getHours(), beaten }); s.sos.events = s.sos.events.slice(-200); close(); render(); await save(); };
        $('#win', m).onclick = () => { log(true); confetti(); toast('آفرین! یک هوس دیگه رو رد کردی. هر بار که این کار رو می‌کنی، مسیر عادت قدیمی در مغزت ضعیف‌تر می‌شه.', null, 'happy'); };
        $('#lose', m).onclick = () => { log(false); toast('اشکالی نداره. با مهربانی به خودت نگاه کن، نه با سرزنش. آب بخور، چند قدم راه برو و برنامه رو ادامه بده.', null, 'calm'); };
      });
  }

  /* ---------- public API for feature modules ---------- */
  window.UZHU_APP = {
    H, hook, runHooks, tools, views, mounts, appRoutes, titles, site: { settings: {}, content: [] },
    get user() { return user; }, D, save, render, go, toast, modal, confetti, notify, normalize, nightKey,
    signedOut() { user = null; toast('از حسابت خارج شدی. دوباره وارد شو.', 'bell'); go('login'); },
    fa, esc, pad, dateKey, jalali, money, pick, dayDiff, addMin,
    ART, POSE, EX, PROGRAM, RECIPES, ARTICLES, STORE, LEVELS,
    stats, dayObj, cycleObj, exDay, exIndex, logKey, moveLog, plant, ring, fig, openRecipe, openArticle, openMove, openSOS,
  };

  (window.UZHU_PLUGINS || []).forEach(f => { try { f(window.UZHU_APP); } catch (e) { console.error(e); } });

  /* ---------- boot ---------- */
  async function boot() {
    // light by default; 'system' follows the phone's dark mode (js/splash.js sets this before first paint too)
    try { const t = localStorage.getItem('uzhu:theme') || 'light'; if (t !== 'system') document.documentElement.dataset.theme = t; } catch (e) { document.documentElement.dataset.theme = 'light'; }
    $('#logo').innerHTML = '<img src="img/icon.svg" alt="" width="40" height="40" style="display:block;width:100%;height:auto;border-radius:10px">';
    $('#sos').onclick = openSOS;
    try { user = await STORE.init(STORE.config); }
    catch (e) {
      user = null;
      if (STORE.mode !== 'local') {
        app.innerHTML = `<section class="wrap auth stack" style="gap:14px;text-align:center;max-width:520px"><div style="width:120px;margin:0 auto">${ART.mascot('calm')}</div><h2>به اینترنت وصل نیستیم</h2><p class="muted">${esc(String(e.message || '').includes('اتصال') ? e.message : 'اتصال به سرور برقرار نشد. اینترنتت رو بررسی کن و دوباره امتحان کن.')}</p><button class="btn primary big" id="retry">دوباره امتحان کن</button></section>`;
        $('#retry').onclick = () => location.reload();
        return;
      }
    }
    if (user) user.data = normalize(user.data);
    addEventListener('hashchange', render);
    // Site settings from the admin panel: wait a little, then render anyway.
    await Promise.race([Promise.all((H.load || []).map(f => Promise.resolve().then(f).catch(e => console.error(e)))), new Promise(r => setTimeout(r, 4000))]);
    runHooks('boot');
    render();
    setupSW();
    tick(); setInterval(tick, 20000);
    document.addEventListener('visibilitychange', async () => {
      if (document.hidden || !user) return;
      // Another device may have saved since this tab was last open.
      if (STORE.refresh && !document.querySelector('.modal, input:focus, textarea:focus')) { try { const u = await STORE.refresh(); if (u) { user.data = normalize(u.data); render(); } } catch (e) {} }
      const before = D().day; advanceIfNewDay(); if (D().day !== before) render(); tick();
    });
  }
  boot();
})();
