/* Subscription: the app is free; the Pro sections (chosen by the admin) need a paid plan by card-to-card transfer.
   The user uploads the transfer receipt (private storage), an admin approves it in the admin panel (#admin → پرداخت‌ها).
   Pro access is decided by the server (supabase/subscription.sql + free-pro.sql); this file shows the status, sends
   accounts without Pro from a Pro section to the #pro lock page, and fills in the day texts that the server returns. */
(window.UZHU_PLUGINS = window.UZHU_PLUGINS || []).push(function (A) {
  const { esc, STORE, PROGRAM } = A;
  const fa = v => esc(A.fa(v));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const online = STORE.mode === 'supabase' && !!STORE.pay;

  // Same prices as uzhu_plan_price on the server (the server's numbers are the ones charged).
  const MONTH = 100000;
  const PLANS = [
    { id: '1m', months: 1, price: 100000, title: 'یک ماهه' },
    { id: '3m', months: 3, price: 270000, title: 'سه ماهه' },
    { id: '6m', months: 6, price: 510000, title: 'شش ماهه', badge: 'محبوب‌ترین' },
    { id: '12m', months: 12, price: 960000, title: 'یک ساله', badge: 'بیشترین صرفه' },
  ].map(p => ({ ...p, off: Math.round((1 - p.price / (p.months * MONTH)) * 100), gift: Math.round((p.months * MONTH - p.price) / MONTH * 30), daily: Math.round(p.price / (p.months * 30.4) / 100) * 100 }));
  const plan = id => PLANS.find(p => p.id === id) || PLANS[0];
  const money = n => A.money(n);
  const DAY = 864e5;

  /* ---------- status ---------- */
  let sub = null, subAt = 0, skew = 0, subFor = null;
  async function loadSub() {
    if (!online || !A.user) { sub = null; subFor = null; return; }
    try {
      const s = await STORE.pay.status();
      sub = s; subAt = Date.now(); subFor = A.user.id;
      if (s && s.now) skew = Date.parse(s.now) - Date.now();
      remember();
    } catch (e) { /* offline: the server still enforces access */ }
  }
  const now = () => Date.now() + skew;
  const ts = v => v ? Date.parse(v) : 0;
  const trialEnd = () => ts(sub?.trial_ends), paidEnd = () => ts(sub?.paid_until);
  const pending = () => (sub?.payments || []).find(p => p.status === 'pending');
  const daysLeft = t => Math.max(0, Math.ceil((t - now()) / DAY));
  const date = v => { try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(v)); } catch (e) { return ''; } };
  const leftText = t => { const ms = t - now(); if (ms <= 0) return 'تموم شده'; const h = Math.ceil(ms / 36e5); return h < 24 ? `${fa(h)} ساعت` : `${fa(Math.ceil(ms / DAY))} روز`; };
  const isFree = () => !sub || sub.admin || paidEnd() > now() ? false : trialEnd() > now();

  /* ---------- paid day texts ---------- */
  // Days whose text is not loaded yet carry locked: true (js/program.js keeps titles only).
  const CACHE = 'uzhu:prog';
  const progReady = () => !PROGRAM.cycles.some(c => c.days.some(d => d.locked));
  function merge(rows) {
    rows.forEach(r => {
      const m = /^c(\d)d(\d+)$/.exec(r.id || ''); if (!m || !r.data) return;
      const d = PROGRAM.cycles.find(c => c.id === +m[1])?.days[+m[2] - 1];
      if (d) { Object.assign(d, r.data); delete d.locked; }
    });
  }
  let inflight = null;
  A.loadProgram = () => {
    if (!online || !A.user || progReady()) return Promise.resolve();
    return inflight || (inflight = (async () => {
      let rows;
      try { rows = await STORE.pay.program(); }
      catch (e) { try { rows = JSON.parse(localStorage.getItem(CACHE) || '[]'); } catch (er) { rows = []; } merge(rows); return; }
      if (!rows.length) return; // no access: the server returned nothing
      merge(rows);
      try { localStorage.setItem(CACHE, JSON.stringify(rows)); } catch (e) {}
    })().finally(() => { inflight = null; }));
  };

  A.H.load = (A.H.load || []).concat(loadSub);
  A.H.signedIn = (A.H.signedIn || []).concat(loadSub);

  /* ---------- Pro sections ---------- */
  // The app is free; only the routes in the admin's "pro" setting need an active subscription (supabase/free-pro.sql).
  // Pro = admin, a trial or paid period that has not ended, or a receipt waiting for review (sub.access from the server).
  const PRO_DEFAULT = ['period', 'pregnancy', 'move', 'recipes'];
  const proList = () => { const s = A.site.settings.pro?.sections; return Array.isArray(s) ? s : PRO_DEFAULT; };
  const isPro = r => online && proList().includes(r);
  // Last known Pro state per account, so a reload without internet does not lock or unlock by mistake.
  const PKEY = () => 'uzhu:pro:' + (A.user?.id || '');
  function remember() { try { if (sub && A.user) localStorage.setItem(PKEY(), JSON.stringify({ access: !!sub.access, admin: !!sub.admin, until: Math.max(trialEnd(), paidEnd()) })); } catch (e) {} }
  A.hasPro = () => {
    if (!online) return true;
    if (!A.user) return false;
    if (sub && subFor === A.user.id) return !!sub.access;
    try { const c = JSON.parse(localStorage.getItem(PKEY()) || 'null'); return !!c && (c.admin || c.until > Date.now() || c.access); } catch (e) { return false; }
  };
  A.proSections = proList;
  let proFrom = '';
  A.H.route = (A.H.route || []).concat(r => {
    if (!isPro(r) || A.hasPro()) return;
    proFrom = r; return 'pro';
  });
  // Program text missing (first open without internet): the reload card on #subscribe.
  A.H.route = (A.H.route || []).concat(r => {
    if (!online || !A.user || subFor !== A.user.id) return;
    if (['today', 'night'].includes(r) && A.D()?.profile && !progReady()) return 'subscribe';
  });
  // Section names for the lock page and the admin list.
  const SECTION_NAMES = { move: ['🧘', 'ورزش'], recipes: ['🍰', 'رسپی‌های بی‌قند'], learn: ['📖', 'علم قند'], journey: ['🌱', 'مسیر من'] };
  A.sectionInfo = r => { const t = A.tools.find(x => x.route === r); return t ? [t.icon, t.title] : SECTION_NAMES[r] || ['✨', A.titles[r] || r]; };
  // A small "PRO" badge on every link to a locked section (menus, tab bar, tool cards).
  A.H.mount = (A.H.mount || []).concat(() => {
    const locked = online && !A.hasPro() ? proList() : [];
    $$('a.pro-lock').forEach(a => { if (!locked.includes(a.getAttribute('href').slice(1))) a.classList.remove('pro-lock'); });
    locked.forEach(r => $$(`a[href="#${r}"]`).forEach(a => a.classList.add('pro-lock')));
  });
  A.titles.pro = 'بخش پرو';
  A.views.pro = () => {
    const [icon, title] = A.sectionInfo(proFrom);
    const ended = A.user && sub && !sub.access && paidEnd() > 0;
    const others = proList().map(A.sectionInfo);
    return `<section class="wrap stack sub pro-page" style="gap:16px;max-width:720px">
      <div class="card pop sub-hero"><div class="sub-mascot">${A.ART.mascot('happy', { arms: 'wave' })}</div>
        <div class="stack" style="gap:6px"><span class="eyebrow"><span class="pro-tag">PRO</span> ${icon} ${esc(title)}</span>
          <h2>«${esc(title)}» مخصوص اشتراک پروئه</h2>
          <p class="muted">${ended ? 'اشتراکت تموم شده. برنامه‌ی روزانه، چک‌لیست شب و بقیه‌ی حبه همچنان رایگان برات بازه؛ برای باز شدن دوباره‌ی این بخش، اشتراکت رو تمدید کن. چیزهایی که قبلاً ثبت کردی سر جاشه.'
            : 'برنامه‌ی روزانه، چک‌لیست شب، دکمه‌ی «هوس دارم» و خیلی از ابزارها برای همه رایگانه. این بخش با اشتراک پرو باز می‌شه.'}</p>
          <div class="row">${A.user ? `<a class="btn primary big" href="#subscribe">${ended ? 'تمدید اشتراک' : 'گرفتن اشتراک پرو'}</a><a class="btn ghost" href="#today">برگشت به امروز</a>`
            : '<a class="btn primary big" href="#signup">ثبت‌نام رایگان</a><a class="btn ghost" href="#login">ورود</a>'}</div></div></div>
      <div class="card stack" style="gap:8px"><b>با اشتراک پرو این بخش‌ها برات باز می‌شه:</b>
        <div class="pro-list">${others.map(([i, t]) => `<span>${i} ${esc(t)}</span>`).join('')}</div>
        <p class="small muted">از ماهی ${fa(Math.round(plan('12m').price / 12 / 1000))} هزار تومن.</p></div>
    </section>`;
  };
  // Opening the app signed out shows #welcome first (once per visit): a free start, or sign-up and Pro.
  // Choosing payment remembers the intent, so right after sign-up the account goes to #subscribe instead of onboarding.
  const ss = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} } };
  A.H.route = (A.H.route || []).concat(r => {
    if (!online) return;
    const h = location.hash.slice(1);
    if (!A.user) {
      if (ss.get('uzhu:welcomed')) return;
      if ((r === 'home' && !h) || (r === 'signup' && h !== 'signup')) return 'welcome';
      return;
    }
    if (r === 'onboard' && ss.get('uzhu:intent') === 'pay') { ss.set('uzhu:intent', null); history.replaceState(null, '', '#subscribe'); return 'subscribe'; }
  });

  A.titles.welcome = 'خوش اومدی';
  A.views.welcome = () => {
    const y = plan('12m'), from = Math.round(y.price / y.months / 1000);
    return `<section class="wrap stack sub-welcome" style="gap:18px;max-width:880px">
      <div class="stack" style="gap:6px;text-align:center;align-items:center"><div class="sub-mascot">${A.ART.mascot('happy', { arms: 'wave' })}</div><span class="eyebrow">به حبه خوش اومدی</span><h2>یار روزهای بی‌قند، قدم به قدم</h2><p class="muted">برنامه‌ی روزانه، چک‌لیست شب، یادآورهای مهربون و دکمه‌ی «هوس دارم».</p></div>
      <div class="sub-ways">
        <div class="card pop stack sub-way free"><span class="sub-badge">پیشنهاد ما</span><b class="sub-title">🎁 حبه‌ی رایگان</b>
          <p>برنامه‌ی روزانه‌ی ترک قند، چک‌لیست شب و یادآورها <b>برای همیشه رایگانه</b>؛ فقط با یک ایمیل ثبت‌نام کن.</p>
          <p class="small muted">هر وقت خواستی، بخش‌های پرو رو هم با اشتراک باز می‌کنی.</p>
          <a class="btn primary big" href="#signup" data-way="free">شروع رایگان</a></div>
        <div class="card stack sub-way"><b class="sub-title"><span class="pro-tag">PRO</span> ثبت‌نام و اشتراک پرو</b>
          <p>${proList().map(r => esc(A.sectionInfo(r)[1])).join('، ')}. ماهانه ${fa(money(MONTH))} تومن، و با اشتراک بلندتر ارزون‌تر: از ماهی ${fa(from)} هزار تومن.</p>
          <div class="sub-mini">${PLANS.map(p => `<span><b>${p.title}</b><span class="num">${fa(money(p.price / 1000))} هزار</span>${p.gift ? `<small>🎁 ${fa(p.gift)} روز هدیه</small>` : '<small>&nbsp;</small>'}</span>`).join('')}</div>
          <p class="small muted">پرداخت کارت به کارت؛ رسید رو می‌فرستی و بعد از تأیید فعال می‌شه.</p>
          <a class="btn ghost big" href="#signup" data-way="pay">ثبت‌نام و پرداخت</a></div>
      </div>
      <p class="small muted" style="text-align:center">حساب داری؟ <a href="#login" data-way="login">وارد شو</a> · <a href="#home" data-way="look">اول یه نگاهی به سایت بندازم</a></p>
    </section>`;
  };
  A.mounts.welcome = () => $$('[data-way]').forEach(a => a.onclick = () => { ss.set('uzhu:welcomed', '1'); ss.set('uzhu:intent', a.dataset.way === 'pay' ? 'pay' : null); });

  // Check again when the app comes back after a while (the trial may have ended, or a receipt been approved).
  A.H.mount = (A.H.mount || []).concat(() => {
    if (!online || !A.user) return;
    const had = subFor === A.user.id;
    if (Date.now() - subAt > (had ? 10 * 60e3 : 30e3)) {
      subAt = Date.now();
      const before = had && sub ? sub.access : null;
      loadSub().then(async () => {
        if (subFor !== A.user?.id || !sub || sub.access === before) return;
        if (sub.access) await A.loadProgram();
        A.render();
      });
    }
  });

  /* ---------- reminders of the trial / period end ---------- */
  // Trial day n of 3 (the trial is the 3 days before trial_ends).
  const TRIAL = 3;
  const trialDay = () => Math.min(TRIAL, Math.max(1, Math.ceil((now() - (trialEnd() - TRIAL * DAY)) / DAY)));
  const lastDay = () => trialEnd() - now() <= DAY;
  const fromMonthly = () => { const y = plan('12m'); return Math.round(y.price / y.months / 1000); };
  const meter = () => `<div class="sub-meter" role="img" aria-label="روز ${fa(trialDay())} از ${fa(TRIAL)} دوره‌ی رایگان">${Array.from({ length: TRIAL }, (_, i) => `<span class="${i < trialDay() - 1 ? 'done' : i === trialDay() - 1 ? 'now' : ''}"><i></i><small>روز ${fa(i + 1)}</small></span>`).join('')}</div>`;
  // One short line for the header chip and a fuller card for #today, both from the same state.
  function state() {
    if (!online || !A.user || !sub || sub.admin || subFor !== A.user.id) return null;
    if (pending()) return { kind: 'pending', chip: '🧾 در انتظار تأیید', label: 'رسیدت در انتظار تأییده' };
    if (isFree()) return { kind: 'trial', warn: lastDay(), chip: lastDay() ? `⏳ ${leftText(trialEnd())} تا پایان رایگان` : `🎁 ${leftText(trialEnd())} رایگان`, label: `${leftText(trialEnd())} از دوره‌ی رایگانت مونده` };
    if (paidEnd() > now() && paidEnd() - now() < 5 * DAY) return { kind: 'renew', warn: true, chip: `⏳ ${leftText(paidEnd())} تا تمدید`, label: `اشتراکت ${leftText(paidEnd())} دیگه تموم می‌شه` };
    return null;
  }
  // Header chip: visible on every page of the app (phones too), one tap to the plans.
  A.H.mount = (A.H.mount || []).concat(r => {
    const w = $('.topbar .wrap'); if (!w) return;
    let c = $('.sub-chip', w);
    const st = A.user && A.D()?.profile && r !== 'subscribe' ? state() : null;
    if (!st) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement('a'); c.className = 'sub-chip'; c.href = '#subscribe'; $('.brand', w).after(c); }
    c.className = 'sub-chip' + (st.warn ? ' warn' : '') + (st.kind === 'pending' ? ' wait' : '');
    c.textContent = st.chip; c.setAttribute('aria-label', st.label + '؛ دیدن اشتراک‌ها');
  });
  // First on #today, above the other plugins' widgets.
  A.H.todayTop = [() => {
    const st = state(); if (!st || !sub.access) return '';
    if (st.kind === 'pending') return `<a class="card sub-strip" href="#subscribe"><span>🧾</span><span>رسید پرداختت رسید و منتظر تأییده. تا تأیید، بخش‌های پرو برات بازه.</span></a>`;
    if (st.kind === 'renew') return `<a class="card sub-strip warn" href="#subscribe"><span>⏳</span><span>${st.label}؛ بعدش بخش‌های پرو قفل می‌شن. <b>تمدید</b></span></a>`;
    const d = trialDay(), end = new Date(trialEnd());
    const time = (() => { try { return new Intl.DateTimeFormat('fa-IR', { weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(end); } catch (e) { return ''; } })();
    const line = st.warn ? 'امروز روز آخر پرو رایگانته. برنامه‌ی روزانه همیشه رایگان می‌مونه؛ برای اینکه بخش‌های پرو هم باز بمونن، یه اشتراک انتخاب کن.'
      : d === 1 ? 'بخش‌های پرو هم برات بازه. با خیال راحت امتحانشون کن؛ هیچ پرداختی لازم نیست.'
      : 'اگه بخش‌های پرو رو دوست داشتی، الان اشتراک بگیری هم روزهای رایگانت سر جاشه؛ اشتراک از بعد از اون‌ها شروع می‌شه.';
    return `<div class="card sub-trial${st.warn ? ' warn' : ''}">
      <div class="row" style="justify-content:space-between;gap:8px"><span class="eyebrow">دوره‌ی رایگان · روز ${fa(d)} از ${fa(TRIAL)}</span><span class="chip ${st.warn ? 'berry' : 'mint'}">${st.label}</span></div>
      ${meter()}
      <p class="small">${line}</p>
      ${time ? `<p class="small muted">پایان دوره‌ی رایگان: ${esc(time)}</p>` : ''}
      <div class="row"><a class="btn ${st.warn || d > 1 ? 'primary' : 'ghost'}" href="#subscribe">انتخاب اشتراک</a><span class="small muted">از ماهی ${fa(fromMonthly())} هزار تومن</span></div>
    </div>`;
 }].concat(A.H.todayTop || []);
  // From day 2 of the trial, a friendly reminder sheet once a day on #today.
  A.H.mount = (A.H.mount || []).concat(r => {
    if (r !== 'today' || !A.modal) return;
    const st = state(); if (!st || st.kind !== 'trial' || trialDay() < 2) return;
    const key = 'uzhu:trialNudge:' + A.user.id, today = new Date().toDateString();
    try { if (localStorage.getItem(key) === today) return; localStorage.setItem(key, today); } catch (e) { return; }
    const pick = ['1m', '6m', '12m'].map(plan);
    setTimeout(() => A.modal(`<div class="stack sub-nudge" style="gap:12px;text-align:center">
      <div class="sub-mascot" style="margin:0 auto">${A.ART.mascot(st.warn ? 'calm' : 'happy', st.warn ? undefined : { arms: 'wave' })}</div>
      <span class="eyebrow">دوره‌ی رایگان · روز ${fa(trialDay())} از ${fa(TRIAL)}</span>
      <h2>${st.warn ? 'امروز روز آخر رایگانه' : st.label}</h2>
      ${meter()}
      <p class="muted">${st.warn ? 'برنامه‌ی روزانه همیشه رایگانه؛ فقط بخش‌های پرو بعد از امروز قفل می‌شن تا اشتراک بگیری. هر چی ثبت کردی سر جاش می‌مونه.' : 'خوشحالیم که اینجایی! برنامه‌ی روزانه همیشه رایگانه. اگه می‌خوای بخش‌های پرو هم باز بمونن، از همین حالا اشتراکت رو انتخاب کن؛ از بعد از روزهای رایگان شروع می‌شه.'}</p>
      <div class="sub-mini">${pick.map(p => `<span><b>${p.title}</b><span class="num">${fa(money(p.price / 1000))} هزار</span>${p.gift ? `<small>🎁 ${fa(p.gift)} روز هدیه</small>` : '<small>&nbsp;</small>'}</span>`).join('')}</div>
      <a class="btn primary big" href="#subscribe" data-close>انتخاب اشتراک</a>
      <button type="button" class="btn ghost" data-close>فعلاً ادامه می‌دم</button>
    </div>`, (m, close) => $$('[data-close]', m).forEach(b => b.addEventListener('click', close))), 600);
  });
  A.H.settings = (A.H.settings || []).concat(() => online && A.user ? `<a class="btn ghost" href="#subscribe">💳 اشتراک من</a>` : '');
  if (online) A.tools.push({ route: 'subscribe', icon: '💳', title: 'اشتراک', desc: 'وضعیت اشتراک، تمدید و ارسال رسید پرداخت' });

  /* ---------- #subscribe ---------- */
  A.titles.subscribe = 'اشتراک';
  let chosen = '6m', file = null, preview = '', busy = false, err = '';
  const card = () => Object.assign({ card: 'xxxx-xxxx-xxxx-xxxx', holder: 'xxxx', bank: 'xxxx' }, A.site.settings.payment || {});

  function statusCard() {
    const p = pending();
    if (!A.user) return `<div class="card pop sub-hero"><div class="sub-mascot">${A.ART.mascot('happy', { arms: 'wave' })}</div><div class="stack" style="gap:6px"><span class="eyebrow">حبه رایگانه</span><h2>رایگان ثبت‌نام کن، هر وقت خواستی پرو شو</h2><p class="muted">برنامه‌ی روزانه رایگانه. برای بخش‌های پرو، بعد از ثبت‌نام یکی از اشتراک‌های پایین رو انتخاب کن.</p><div class="row"><a class="btn primary" href="#signup">ثبت‌نام</a><a class="btn ghost" href="#login">ورود</a></div></div></div>`;
    if (!sub) return `<div class="card pop sub-hero"><div class="sub-mascot">${A.ART.mascot('calm')}</div><div class="stack" style="gap:6px"><h2>وضعیت اشتراک بارگذاری نشد</h2><p class="muted">اتصال اینترنتت رو بررسی کن و دوباره امتحان کن.</p><div class="row"><button class="btn primary" id="sub-retry">دوباره امتحان کن</button></div></div></div>`;
    let mood = 'happy', eyebrow, title, text;
    if (sub.admin) { eyebrow = 'مدیر سایت'; title = 'دسترسی تو همیشه بازه'; text = 'رسیدهای کاربرها رو از پنل مدیریت، بخش «پرداخت‌ها» تأیید کن.'; }
    else if (paidEnd() > now()) { eyebrow = 'اشتراک فعال'; title = `اشتراکت تا ${esc(date(paidEnd()))} فعاله`; text = `${leftText(paidEnd())} مونده. هر وقت بخوای می‌تونی از همین حالا تمدید کنی؛ روزهای باقی‌مونده‌ات سوخت نمی‌شه.`; }
    else if (trialEnd() > now()) { eyebrow = 'دوره‌ی رایگان'; title = `${leftText(trialEnd())} از پرو رایگانت مونده`; text = 'اگه همین الان اشتراک بگیری، اشتراکت از بعد از پایان روزهای رایگان شروع می‌شه؛ یعنی هیچ روزی از دستت نمی‌ره.'; }
    else if (p && sub.access) { mood = 'calm'; eyebrow = 'در انتظار تأیید'; title = 'رسیدت رسید، ممنون!'; text = 'به‌محض تأیید، اشتراکت فعال می‌شه. تا اون موقع بخش‌های پرو برات بازه.'; }
    else if (p) { mood = 'calm'; eyebrow = 'در انتظار تأیید'; title = 'رسیدت رسید، ممنون!'; text = 'به‌محض تأیید پرداخت، بخش‌های پرو برات باز می‌شن.'; }
    else if (paidEnd() > 0) { mood = 'calm'; eyebrow = 'نسخه‌ی رایگان'; title = 'اشتراک پروت تموم شده'; text = 'برنامه‌ی روزانه و بقیه‌ی حبه همچنان رایگان برات بازه. برای باز شدن دوباره‌ی بخش‌های پرو، یک اشتراک انتخاب کن؛ هر چی ثبت کردی سر جاشه.'; }
    else { eyebrow = 'نسخه‌ی رایگان'; title = 'حبه برات رایگانه؛ پرو شو تا همه‌چی باز بشه'; text = 'برنامه‌ی روزانه، چک‌لیست شب و «هوس دارم» رایگانه. با اشتراک پرو این بخش‌ها هم باز می‌شن: ' + proList().map(r => esc(A.sectionInfo(r)[1])).join('، ') + '.'; }
    return `<div class="card pop sub-hero"><div class="sub-mascot">${A.ART.mascot(mood, mood === 'happy' ? { arms: 'up' } : undefined)}</div><div class="stack" style="gap:6px"><span class="eyebrow">${eyebrow}</span><h2>${title}</h2><p class="muted">${text}</p></div></div>`;
  }
  function savedLine() {
    try { const t = A.user && A.D()?.profile ? A.stats().toman : 0; return t > 0 ? `<p class="small sub-saved">🍬 تا امروز با نخریدن شیرینی حدود <b>${fa(money(t))} تومن</b> کمتر خرج کردی.</p>` : ''; } catch (e) { return ''; }
  }
  function plansView() {
    return `<div class="sub-plans" role="radiogroup" aria-label="انتخاب اشتراک">${PLANS.map(p => `
      <button type="button" class="card sub-plan${chosen === p.id ? ' on' : ''}${p.badge ? ' hot' : ''}" role="radio" aria-checked="${chosen === p.id}" data-plan="${p.id}">
        ${p.badge ? `<span class="sub-badge">${p.badge}</span>` : ''}
        <b class="sub-title">${p.title}</b>
        <span class="sub-price"><b class="num">${fa(money(p.price / 1000))}</b> هزار تومن</span>
        ${p.off ? `<span class="sub-was num">${fa(money(p.months * MONTH / 1000))} هزار</span>` : '<span class="sub-was none">&nbsp;</span>'}
        ${p.gift ? `<span class="chip mint">🎁 ${fa(p.gift)} روز هدیه</span>` : '<span class="chip">شروع سبک</span>'}
        <span class="small muted">${p.off ? `${fa(p.off)}٪ کمتر · ` : ''}روزی حدود ${fa(money(p.daily))} تومن</span>
        <span class="sub-check">✓ انتخاب شد</span>
      </button>`).join('')}</div>
      <p class="small muted sub-note">🍫 اشتراک یک ساله روزی حدود ${fa(money(plan('12m').daily))} تومنه؛ کمتر از قیمت یه شکلات.</p>`;
  }
  function payView() {
    const p = plan(chosen), c = card();
    if (!A.user) return '';
    if (pending()) return `<div class="card stack sub-wait"><b>🧾 یک رسید در انتظار تأیید داری</b><p class="small muted">بعد از بررسی (معمولاً چند ساعت) نتیجه همین‌جا نشون داده می‌شه. اگه رسید رو اشتباه فرستادی، صبر کن تا بررسی بشه و بعد دوباره بفرست.</p></div>`;
    return `<div class="card stack sub-pay" style="gap:14px">
      <div class="row" style="justify-content:space-between"><b>پرداخت اشتراک ${p.title}</b><span class="chip sun num">${fa(money(p.price))} تومن</span></div>
      <ol class="sub-steps">
        <li><b>مبلغ <span class="num">${fa(money(p.price))}</span> تومن رو به این کارت، کارت به کارت کن:</b>
          <div class="sub-bank">
            <div class="sub-cardno" dir="ltr">${esc(c.card)}</div>
            <div class="row" style="justify-content:space-between"><span class="small">به نام <b>${esc(c.holder)}</b> · بانک ${esc(c.bank)}</span><button type="button" class="btn ghost" id="sub-copy">کپی شماره کارت</button></div>
          </div></li>
        <li><b>از صفحه‌ی رسید پرداخت اسکرین‌شات بگیر و اینجا بفرست:</b>
          <form id="sub-form" class="stack" style="gap:10px;margin-top:8px">
            <label class="sub-drop" for="sub-file">${preview ? `<img src="${esc(preview)}" alt="پیش‌نمایش رسید">` : '<span>📷 انتخاب عکس رسید</span><span class="small muted">JPG یا PNG</span>'}</label>
            <input type="file" id="sub-file" accept="image/png,image/jpeg,image/webp" hidden>
            <div class="err" id="sub-err">${esc(err)}</div>
            <button class="btn primary big" type="submit" ${!file || busy ? 'disabled' : ''}>${busy ? 'در حال ارسال…' : 'ارسال رسید'}</button>
          </form></li>
        <li><b>منتظر تأیید باش.</b> <span class="muted">معمولاً چند ساعت بیشتر طول نمی‌کشه و تا اون موقع (تا ۲۴ ساعت) بخش‌های پرو برات بازه.</span></li>
      </ol></div>`;
  }
  const ST = { pending: ['sun', 'در انتظار تأیید'], approved: ['mint', 'تأیید شد'], rejected: ['berry', 'رد شد'] };
  function historyView() {
    const list = sub?.payments || [];
    if (!list.length) return '';
    return `<div class="card stack" style="gap:8px"><b>پرداخت‌های من</b>${list.map(p => `<div class="sub-row"><span>${plan(p.plan).title} · <span class="num">${fa(money(p.amount))}</span> تومن<br><span class="small muted">${esc(date(p.created_at))}</span>${p.note ? `<br><span class="small">📝 ${esc(p.note)}</span>` : ''}</span><span class="chip ${(ST[p.status] || ST.pending)[0]}">${(ST[p.status] || ST.pending)[1]}</span></div>`).join('')}</div>`;
  }
  A.views.subscribe = () => {
    if (!online) return `<section class="wrap auth stack"><div class="card">اشتراک فقط در نسخه‌ی آنلاین سایت فعاله.</div></section>`;
    const loading = A.user && sub?.access && !progReady();
    return `<section class="wrap stack sub" style="gap:16px;max-width:880px">
      ${loading ? `<div class="card stack" style="gap:8px"><b>متن برنامه هنوز بارگذاری نشده</b><p class="small muted">برای بار اول به اینترنت نیاز داریم. اتصالت رو بررسی کن.</p><div class="row"><button class="btn primary" id="sub-reload">دوباره امتحان کن</button></div></div>` : ''}
      ${statusCard()}
      ${sub?.admin ? '' : `<div class="section-head" style="margin:0"><span class="eyebrow"><span class="pro-tag">PRO</span> اشتراک پرو</span><h2>هر چی طولانی‌تر، به‌صرفه‌تر</h2><p class="muted">ماهانه ${fa(money(MONTH))} تومن. با اشتراک‌های بلندتر، چند روز تا چند ماه مهمون حبه‌ای.</p>
        <div class="pro-list">${proList().map(A.sectionInfo).map(([i, t]) => `<span>${i} ${esc(t)}</span>`).join('')}</div></div>
      ${plansView()}${savedLine()}${payView()}`}
      ${historyView()}
      <details class="card sub-faq"><summary><b>سؤال‌های رایج</b></summary>
        <p><b>بدون اشتراک چی دارم؟</b><br>برنامه‌ی روزانه‌ی ترک قند، چک‌لیست شب، یادآورها، دکمه‌ی «هوس دارم» و بیشتر ابزارها برای همه رایگانه. اشتراک فقط بخش‌های پرو رو باز می‌کنه.</p>
        <p><b>اشتراکم از کِی حساب می‌شه؟</b><br>از روز تأیید، یا اگه هنوز روز رایگان یا اشتراک فعال داری، از روز بعد از تموم شدنش. هیچ روزی سوخت نمی‌شه.</p>
        <p><b>پیشرفتم چی می‌شه؟</b><br>همه‌ی روزها، چک‌لیست‌ها و چیزهایی که توی بخش‌های پرو ثبت کردی ذخیره‌ست؛ اگه اشتراک تموم بشه هم پاک نمی‌شن و با تمدید دوباره در دسترسن.</p>
        <p><b>رسیدم رد شد، چی کار کنم؟</b><br>دلیلش کنار پرداخت نوشته شده. مشکل رو برطرف کن و رسید درست رو دوباره بفرست.</p>
      </details>
    </section>`;
  };
  // Re-encode the photo as a JPEG of at most 1600px (smaller upload, and drops the photo's metadata).
  async function shrink(f) {
    if (!/^image\//.test(f.type)) throw new Error('فقط عکس رسید رو انتخاب کن.');
    if (f.size > 20 * 1024 * 1024) throw new Error('حجم عکس خیلی زیاده.');
    try {
      const bmp = await createImageBitmap(f), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bmp, 0, 0, cv.width, cv.height);
      const b = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.85));
      if (b) return b;
    } catch (e) { /* fall back to the original file */ }
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 5 * 1024 * 1024) throw new Error('این عکس قابل خوندن نیست. یک اسکرین‌شات JPG یا PNG انتخاب کن.');
    return f;
  }
  const payError = m => /already pending/.test(m) ? 'یک رسید در انتظار تأیید داری. لطفاً صبر کن تا بررسی بشه.'
    : /too many/.test(m) ? 'امروز چند بار رسید فرستادی. فردا دوباره امتحان کن.'
    : /size|large|mime|type/i.test(m) ? 'این فایل قابل قبول نیست. یک عکس JPG یا PNG کمتر از ۵ مگابایت بفرست.'
    : /fetch|network|Failed|timeout/i.test(m) ? 'اتصال به سرور برقرار نشد. اینترنتت رو بررسی کن و دوباره امتحان کن.'
    : 'ارسال انجام نشد. دوباره امتحان کن.';
  A.mounts.subscribe = () => {
    if (!online) return;
    const retry = $('#sub-retry'); if (retry) retry.onclick = async () => { await loadSub(); A.render(); };
    const reload = $('#sub-reload'); if (reload) reload.onclick = async () => { await A.loadProgram(); await loadSub(); progReady() ? A.go('today') : A.render(); };
    $$('[data-plan]').forEach(b => b.onclick = () => { chosen = b.dataset.plan; A.render(); });
    const copy = $('#sub-copy'); if (copy) copy.onclick = () => {
      const n = card().card.replace(/[^\dx]/gi, '');
      (navigator.clipboard ? navigator.clipboard.writeText(n) : Promise.reject()).then(() => A.toast('شماره کارت کپی شد.', 'bell'), () => A.toast('کپی نشد؛ شماره رو از روی صفحه بردار.', 'bell'));
    };
    const inp = $('#sub-file'); if (inp) inp.onchange = async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      err = '';
      try { file = await shrink(f); if (preview) URL.revokeObjectURL(preview); preview = URL.createObjectURL(file); }
      catch (e) { file = null; err = e.message; }
      A.render();
    };
    const form = $('#sub-form'); if (form) form.onsubmit = async e => {
      e.preventDefault(); if (!file || busy) return;
      busy = true; err = ''; A.render();
      try {
        const path = await STORE.pay.upload(file, file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg');
        await STORE.pay.submit(chosen, path);
        file = null; if (preview) URL.revokeObjectURL(preview); preview = '';
        await loadSub();
        if (sub?.access) await A.loadProgram();
        A.confetti(); A.toast('رسیدت رسید! به‌محض تأیید، اشتراکت فعال می‌شه.', null, 'happy');
      } catch (er) { err = payError(String(er.message || er)); }
      busy = false; A.render();
    };
  };

  /* ---------- admin panel tab: Pro sections ---------- */
  // The admin ticks which sections need a subscription; saved in the "pro" site setting for everyone.
  const NOT_PRO = ['today', 'night', 'onboard', 'profile', 'subscribe', 'admin', 'settings', 'more', 'pro'];
  const candidates = () => [...new Set(['move', 'recipes', 'learn', 'journey', ...A.tools.map(t => t.route), ...proList()])].filter(r => r && !NOT_PRO.includes(r) && (A.views[r] || ['move', 'recipes', 'learn', 'journey'].includes(r)));
  A.adminTabs = A.adminTabs || {};
  if (online) A.adminTabs.pro = {
    title: 'بخش‌های پرو',
    view() {
      const on = proList();
      return `<form id="pro-form" class="card stack" style="gap:12px"><b><span class="pro-tag">PRO</span> بخش‌هایی که اشتراک لازم دارن</b>
        <p class="small muted">بقیه‌ی برنامه برای همه رایگانه. هر بخشی که تیک بخوره، فقط برای کسایی بازه که اشتراک فعال (یا رسید در انتظار تأیید) دارن. کسی که اشتراکش تموم بشه، با باز کردن این بخش‌ها صفحه‌ی «مخصوص پرو» رو می‌بینه.</p>
        <div class="pro-pick">${candidates().map(r => { const [i, t] = A.sectionInfo(r); return `<label class="check"><input type="checkbox" name="pro" value="${esc(r)}" ${on.includes(r) ? 'checked' : ''}><span>${i} ${esc(t)}</span></label>`; }).join('')}</div>
        <div class="row"><button class="btn primary" type="submit">ذخیره</button><button class="btn ghost" type="button" id="pro-default">برگشت به پیش‌فرض</button></div></form>`;
    },
    mount() {
      const save = async list => {
        try { await STORE.setSetting('pro', { sections: list }); A.site.settings.pro = { sections: list }; A.toast('بخش‌های پرو ذخیره شد.', 'bell'); A.render(); }
        catch (er) { A.toast('ذخیره نشد: ' + er.message, 'bell'); }
      };
      $('#pro-form').onsubmit = e => { e.preventDefault(); save($$('input[name=pro]:checked').map(i => i.value)); };
      $('#pro-default').onclick = () => save(PRO_DEFAULT.slice());
    },
  };

  /* ---------- admin panel tab: payments ---------- */
  let pays = null, paysErr = '', paysAll = false;
  const receipts = {};
  async function loadPays() {
    try { pays = await STORE.pay.list(); if (!pays) throw new Error('دسترسی مدیر تأیید نشد.'); paysErr = ''; } catch (e) { paysErr = e.message; pays = []; }
    if (location.hash === '#admin') A.render();
  }
  const npending = () => (pays || []).filter(p => p.status === 'pending').length;
  A.adminTabs = A.adminTabs || {};
  if (online) A.adminTabs.payments = {
    get title() { return 'پرداخت‌ها' + (npending() ? ` (${A.fa(npending())})` : ''); },
    view() {
      const c = card();
      const list = (pays || []).filter(p => paysAll || p.status === 'pending');
      const rows = !pays ? '<div class="card">در حال بارگذاری…</div>' : paysErr ? `<div class="card">${esc(paysErr)}</div>` : !list.length ? `<div class="card muted">${paysAll ? 'هنوز پرداختی ثبت نشده.' : 'رسید تازه‌ای در انتظار تأیید نیست. ✨'}</div>` :
        list.map(p => { const st = ST[p.status] || ST.pending, pl = plan(p.plan), until = ts(p.paid_until) > now() ? `اشتراک تا ${esc(date(p.paid_until))}` : ts(p.trial_ends) > now() ? `رایگان تا ${esc(date(p.trial_ends))}` : 'بدون اشتراک فعال'; return `
        <div class="card stack sub-adm" style="gap:8px">
          <div class="row" style="justify-content:space-between"><b>${esc(p.name || '-')} <span class="small muted" dir="ltr">${esc(p.email)}</span></b><span class="chip ${st[0]}">${st[1]}</span></div>
          <div class="small">${pl.title} · <b class="num">${fa(money(p.amount))}</b> تومن · ${esc(date(p.created_at))} · <span class="muted">${until}</span></div>
          ${p.note ? `<div class="small">📝 ${esc(p.note)}</div>` : ''}${p.reviewed_by ? `<div class="small muted">بررسی: ${esc(p.reviewed_by)}، ${esc(date(p.reviewed_at))}</div>` : ''}
          <div class="sub-receipt">${receipts[p.id] ? `<img src="${esc(receipts[p.id])}" alt="رسید">` : `<button class="btn ghost" type="button" data-rc="${esc(String(p.id))}">🧾 دیدن رسید</button>`}</div>
          ${p.status === 'pending' ? `<div class="row"><button class="btn primary" type="button" data-ok="${esc(String(p.id))}">تأیید و فعال کردن ${fa(pl.months)} ماه</button><input class="input" id="nt-${esc(String(p.id))}" placeholder="دلیل رد (به کاربر نشون داده می‌شه)" style="flex:1;min-width:180px"><button class="btn ghost" type="button" data-no="${esc(String(p.id))}">رد</button></div>` : ''}
        </div>`; }).join('');
      return `<div class="stack" style="gap:16px">
        <div class="row" style="justify-content:space-between"><div class="filters"><button data-pf="0" class="${paysAll ? '' : 'on'}">در انتظار تأیید</button><button data-pf="1" class="${paysAll ? 'on' : ''}">همه</button></div><button class="btn ghost" id="pay-reload">به‌روزرسانی</button></div>
        <p class="small muted">قبل از تأیید، مبلغ و تاریخ رسید رو با واریزی حساب مقایسه کن. با تأیید، مدت اشتراک بعد از پایان روزهای رایگان یا اشتراک فعلی کاربر اضافه می‌شه.</p>
        ${rows}
        <form id="pay-card" class="card stack"><b>💳 اطلاعات کارت مقصد</b><p class="small muted">همین‌ها در صفحه‌ی پرداخت به کاربر نشون داده می‌شه.</p>
          <div class="field"><label for="pc-card">شماره کارت</label><input class="input" id="pc-card" dir="ltr" value="${esc(c.card)}"></div>
          <div class="field"><label for="pc-holder">به نام</label><input class="input" id="pc-holder" value="${esc(c.holder)}"></div>
          <div class="field"><label for="pc-bank">بانک</label><input class="input" id="pc-bank" value="${esc(c.bank)}"></div>
          <div class="row"><button class="btn primary" type="submit">ذخیره</button></div></form>
        <form id="pay-grant" class="card stack"><b>🎁 هدیه یا اصلاح روزهای اشتراک</b><p class="small muted">به اشتراک یک کاربر روز اضافه کن (برای کم کردن، عدد منفی بنویس).</p>
          <div class="row"><input class="input" id="pg-email" type="email" dir="ltr" placeholder="email@example.com" aria-label="ایمیل کاربر" style="flex:2;min-width:200px"><input class="input" id="pg-days" type="number" value="7" aria-label="تعداد روز" style="flex:1;min-width:90px"><button class="btn ghost" type="submit">اعمال</button></div></form>
      </div>`;
    },
    mount() {
      if (!pays && !paysErr) loadPays();
      $$('[data-pf]').forEach(b => b.onclick = () => { paysAll = b.dataset.pf === '1'; A.render(); });
      $('#pay-reload').onclick = () => { pays = null; paysErr = ''; A.render(); };
      $$('[data-rc]').forEach(b => b.onclick = async () => {
        const p = pays.find(x => String(x.id) === b.dataset.rc); if (!p) return;
        b.disabled = true; b.textContent = 'در حال بارگذاری…';
        try { receipts[p.id] = await STORE.pay.receipt(p.receipt); A.render(); } catch (e) { b.disabled = false; b.textContent = 'رسید باز نشد، دوباره امتحان کن'; }
      });
      const review = async (id, ok) => {
        const note = ($('#nt-' + id)?.value || '').trim();
        try { const r = await STORE.pay.review(+id, ok, note); A.toast(ok ? `تأیید شد. اشتراک تا ${date(r.paid_until)} فعاله.` : 'رد شد.', 'bell'); pays = null; A.render(); }
        catch (e) { A.toast('انجام نشد: ' + e.message, 'bell'); }
      };
      $$('[data-ok]').forEach(b => b.onclick = () => { b.disabled = true; review(b.dataset.ok, true); });
      $$('[data-no]').forEach(b => b.onclick = () => { b.disabled = true; review(b.dataset.no, false); });
      $('#pay-card').onsubmit = async e => {
        e.preventDefault();
        const v = { card: $('#pc-card').value.trim(), holder: $('#pc-holder').value.trim(), bank: $('#pc-bank').value.trim() };
        try { await STORE.setSetting('payment', v); A.site.settings.payment = v; A.toast('اطلاعات کارت ذخیره شد.', 'bell'); } catch (er) { A.toast('ذخیره نشد: ' + er.message, 'bell'); }
      };
      $('#pay-grant').onsubmit = async e => {
        e.preventDefault();
        const email = $('#pg-email').value.trim(), days = parseInt($('#pg-days').value, 10);
        if (!email || !days) return A.toast('ایمیل و تعداد روز رو بنویس.', 'bell');
        try { const r = await STORE.pay.grant(email, days); A.toast(`انجام شد. اشتراک تا ${date(r.paid_until)} فعاله.`, 'bell'); pays = null; A.render(); }
        catch (er) { A.toast(/no such user/.test(er.message) ? 'کاربری با این ایمیل پیدا نشد.' : 'انجام نشد: ' + er.message, 'bell'); }
      };
    },
  };
});
