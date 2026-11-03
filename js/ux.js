/* Usability round (آبان ۱۴۰۵): easier settings (auto-save, section chips, search), a Today page the user can arrange
   (hide / pin cards, simple preset), a choosable bottom tab bar, a start page, quiet hours and quiet weekdays for
   reminders, reading time + progress + focus mode for the day's text, a night-checklist draft that survives leaving
   the page, floating buttons that shrink while scrolling, a back button on tool pages and swipe-to-close toasts.
   State: A.D().ux (account, synced); floating-button side, focus text size and drafts live on this device. */
(window.UZHU_PLUGINS = window.UZHU_PLUGINS || []).push(function (A) {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const fa = A.fa, esc = A.esc;
  const on = k => { const f = A.site?.settings?.features; return !f || f[k] !== false; };
  const add = (name, fn) => { A.H[name] = (A.H[name] || []).concat(fn); };
  const inApp = () => !!(A.user && A.D() && A.D().profile);
  const U = () => { const d = A.D(); const u = d.ux = d.ux || {}; u.today = u.today || { hide: [], pin: [] }; u.quiet = u.quiet || {}; return u; };
  const ls = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
  const cur = () => (location.hash || '#').slice(1).split('?')[0];

  A.moreFeatures = (A.moreFeatures || []).concat([
    ['ux_settings', 'تنظیمات: ذخیره‌ی خودکار، فهرست و جست‌وجو'], ['ux_today', 'چیدمان دلخواه صفحه‌ی امروز'], ['ux_tabs', 'انتخاب دکمه‌های نوار پایین'],
    ['ux_start', 'صفحه‌ی شروع دلخواه'], ['ux_quiet', 'ساعت و روزهای بی‌یادآور'], ['ux_reading', 'زمان مطالعه و حالت تمرکز متن روز'],
    ['ux_draft', 'پیش‌نویس خودکار چک‌لیست شب'], ['ux_fab', 'دکمه‌های شناور جمع‌شونده'], ['ux_back', 'دکمه‌ی برگشت در صفحه‌های ابزار'],
  ]);

  /* ================= 1. settings: auto-save, section chips, search, theme state ================= */
  let saveT = null;
  const savedMark = (txt = 'ذخیره شد ✓') => { const m = $('#ux-saved'); if (!m) return; m.textContent = txt; m.classList.add('on'); clearTimeout(m._t); m._t = setTimeout(() => m.classList.remove('on'), 1800); };
  add('mount', r => {
    if (r !== 'settings' || !inApp() || !on('ux_settings')) return;
    const sec = $('#app .view > section'), h2 = sec && $(':scope > h2', sec); if (!h2) return;
    const cards = $$(':scope > .card', sec).filter(c => !c.querySelector('#reset'));
    const heads = cards.map((c, i) => { c.id = c.id || 'ux-s' + i; const b = $(':scope > b, :scope > .stack > b, :scope b', c); return [c.id, (b ? b.textContent : '').trim().replace(/\s+/g, ' ')]; }).filter(x => x[1]);
    h2.insertAdjacentHTML('afterend', `<div class="ux-snav" role="search">
      <div class="row" style="gap:8px;flex-wrap:nowrap"><input class="input" id="ux-sq" type="search" placeholder="🔍 جست‌وجو: یادآور، تم، رمز…" aria-label="جست‌وجو در تنظیمات"><span class="ux-saved" id="ux-saved" aria-live="polite"></span></div>
      <div class="ux-chips" aria-label="بخش‌های تنظیمات">${heads.map(([id, t]) => `<a href="#settings" data-ux-jump="${id}" class="chip">${esc(t.length > 26 ? t.slice(0, 25) + '…' : t)}</a>`).join('')}</div>
      <p class="small muted ux-auto">✨ تغییرها خودکار ذخیره می‌شن؛ لازم نیست دکمه‌ای بزنی.</p></div>
      <p class="muted ux-none" id="ux-none" hidden>تنظیمی با این اسم پیدا نشد. یه کلمه‌ی دیگه امتحان کن.</p>`);
    $$('[data-ux-jump]').forEach(a => a.onclick = e => { e.preventDefault(); const t = document.getElementById(a.dataset.uxJump); if (!t) return; const y = t.getBoundingClientRect().top + scrollY - ($('.topbar')?.offsetHeight || 0) - ($('.ux-snav')?.offsetHeight || 0) - 12; scrollTo({ top: y, behavior: 'smooth' }); t.classList.add('ux-flash'); setTimeout(() => t.classList.remove('ux-flash'), 1200); });
    const nav = $('.ux-snav'); if (nav) nav.style.top = ($('.topbar')?.offsetHeight || 0) + 'px';
    const norm = s =>s.replace(/[ً-ٟ‌]/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLowerCase();
    $('#ux-sq').oninput = e => {
      const q = norm(e.target.value.trim()); let n = 0;
      $$(':scope > .card, :scope > a.card', sec).forEach(c => { const hit = !q || norm(c.textContent).includes(q); c.classList.toggle('ux-hid', !hit); n += hit; });
      $('#ux-none').hidden = n > 0;
    };
    // Auto-save every field change; the button still works and stays as a fallback.
    sec.addEventListener('change', e => {
      const t = e.target;
      if (!t.matches('input, select, textarea') || t.type === 'file' || t.type === 'password' || t.id === 'ux-sq' || t.closest('[data-noauto], .ux-noauto')) return;
      clearTimeout(saveT);
      saveT = setTimeout(() => { const b = $('#sv'); if (!b || !document.contains(b)) return; b.dataset.quiet = '1'; b.click(); savedMark(); }, 450);
    });
    const sv = $('#sv'); if (sv) sv.textContent = 'ذخیره';
    // The light/dark buttons now show which one is on.
    const mark = () => $$('[data-th]').forEach(b => { const v = (() => { try { return localStorage.getItem('uzhu:theme') || 'light'; } catch (e) { return 'light'; } })(); b.setAttribute('aria-pressed', String(b.dataset.th === v)); });
    mark(); $$('[data-th]').forEach(b => b.addEventListener('click', () => { setTimeout(mark, 0); savedMark(); }));
  });

  /* ================= 2. Today: hide / pin cards, simple preset ================= */
  const GENERIC = /^(card|stack|row|pop|btn|big|ghost|sun|primary|berry|chip|wrap|small|muted|on|two|mint|lav|reveal|in|ux-.*|ss-.*|sb-.*|nt-.*|th-.*|sn-.*|deco.*)$/;
  const ESSENTIAL = el => el.matches('.greet, .reading, .reading-done, .mission, a[href="#night"], .ux-tbar, script, style, p.small.muted') || el.tagName === 'P';
  const labelOf = el => {
    const h = $('h2, h3, summary b, b, .eyebrow, summary', el);
    let t = (h ? h.textContent : el.getAttribute('data-cap') || el.textContent).trim().replace(/\s+/g, ' ');
    if (el.dataset.cap) t = el.dataset.cap;
    return t.length > 46 ? t.slice(0, 45) + '…' : t || 'کارت';
  };
  const keyOf = el => {
    if (el.dataset.uxKey) return el.dataset.uxKey;
    let k = el.id && !/^ux-/.test(el.id) ? '#' + el.id : '';
    if (!k) { const c = [...el.classList].filter(x => !GENERIC.test(x)); if (c.length) k = '.' + c.sort().join('.'); }
    if (!k) k = 't:' + labelOf(el).replace(/[0-9۰-۹]+/g, '#').replace(A.user?.name || '\u0000', '').slice(0, 30);
    return (el.dataset.uxKey = k);
  };
  const todayItems = () => {
    const sec = $('#app .view > section'); if (!sec || !$('.today-grid', sec)) return [];
    return [...$$(':scope > *', sec), ...$$('.today-grid > .stack > *, .today-grid > aside > *', sec), ...$$(':scope > .ux-pinned > *', sec)]
      .filter(el => !el.matches('.today-grid, .ux-pinned, .ss-x, [aria-hidden="true"]') &&!ESSENTIAL(el) && (el.offsetHeight > 0 || el.classList.contains('ux-hid')));
  };
  function applyToday() {
    if (cur() !== 'today' && cur() !== '') return;
    const sec = $('#app .view > section'); if (!sec || !$('.today-grid', sec)) return;
    const t = U().today, items = todayItems();
    items.forEach(el => { el.classList.toggle('ux-hid', t.hide.includes(keyOf(el))); });
    let box = $(':scope > .ux-pinned', sec);
    if (t.pin.length) {
      if (!box) { box = document.createElement('div'); box.className = 'ux-pinned stack'; const a = $(':scope > .ux-tbar', sec) || $(':scope > .greet', sec); if (a) a.after(box); else sec.prepend(box); }
      t.pin.forEach(k => { const el = items.find(x => keyOf(x) === k); if (el && el.parentNode !== box) box.appendChild(el); });
    }
    const n = items.filter(el => el.classList.contains('ux-hid')).length, c = $('#ux-hidn');
    if (c) c.textContent = n ? `${fa(n)} کارت پنهانه` : '';
  }
  const PRESET_KEEP = /reading|mission|growth|stat-row|ifthen|night/;
  function openLayout() {
    const items = todayItems(), t = U().today;
    const row = el => { const k = keyOf(el); return `<li class="ux-li"><label class="check" style="flex:1"><input type="checkbox" data-uxv="${esc(k)}" ${t.hide.includes(k) ? '' : 'checked'}><span>${esc(labelOf(el))}</span></label>
      <button type="button" class="btn ghost ux-pin ${t.pin.includes(k) ? 'on' : ''}" data-uxp="${esc(k)}" aria-pressed="${t.pin.includes(k)}" title="بیار بالای صفحه">📌</button></li>`; };
    A.modal(`<div class="stack" style="gap:12px"><span class="eyebrow">صفحه‌ی امروز</span><h2>چیدمان دلخواهت</h2>
      <p class="small muted">تیک هر کارت رو برداری، از صفحه‌ی امروز پنهان می‌شه (پاک نمی‌شه). با 📌 کارت میاد بالای صفحه. متن روز، مأموریت و دکمه‌ی چک‌لیست شب همیشه سر جاشونن.</p>
      <div class="row" style="gap:8px"><button type="button" class="btn sun" id="ux-simple">🍃 ساده (فقط ضروری‌ها)</button><button type="button" class="btn ghost" id="ux-full">همه رو نشون بده</button></div>
      <ul class="ux-list">${items.map(row).join('')}</ul>
      <button type="button" class="btn primary" id="ux-done">تموم شد</button></div>`, (m, close) => {
      const sync = () => { A.save(); applyToday(); };
      $$('[data-uxv]', m).forEach(i => i.onchange = () => { const k = i.dataset.uxv; t.hide = t.hide.filter(x => x !== k); if (!i.checked) t.hide.push(k); sync(); });
      $$('[data-uxp]', m).forEach(b => b.onclick = () => { const k = b.dataset.uxp, onp = !t.pin.includes(k); t.pin = t.pin.filter(x => x !== k); if (onp) t.pin.push(k); b.classList.toggle('on', onp); b.setAttribute('aria-pressed', String(onp)); A.save(); });
      $('#ux-simple', m).onclick = () => { t.hide = items.filter(el => !PRESET_KEEP.test(el.className)).map(keyOf); $$('[data-uxv]', m).forEach(i => i.checked = !t.hide.includes(i.dataset.uxv)); sync(); A.toast('صفحه‌ی امروز ساده شد. هر وقت خواستی از «چیدمان» برش گردون.', 'bell'); };
      $('#ux-full', m).onclick = () => { t.hide = []; t.pin = []; $$('[data-uxv]', m).forEach(i => i.checked = true); $$('[data-uxp]', m).forEach(b => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }); sync(); };
      $('#ux-done', m).onclick = () => { close(); A.render(); };
    });
  }
  add('mount', r => {
    if (r !== 'today' || !inApp() || !on('ux_today')) return;
    const sec = $('#app .view > section'); if (!sec || !$('.today-grid', sec)) return;
    sec.insertAdjacentHTML('afterbegin', `<div class="ux-tbar row"><span class="small muted" id="ux-hidn"></span><button type="button" class="btn ghost ux-edit" id="ux-edit">✏️ چیدمان صفحه</button></div>`);
    $('#ux-edit').onclick = openLayout;
    applyToday(); setTimeout(applyToday, 250); setTimeout(applyToday, 900);
  });

  /* ================= 3. bottom tab bar the user chooses ================= */
  const BASE_TABS = () => [['today', 'امروز', '☀️'], ['night', 'چک‌لیست', '🌙'], ['move', 'ورزش', '🧘'], ['recipes', 'رسپی', '🍰'], A.views.sleep && on('sleep') && ['sleep', 'خواب', '😴'], ['journey', 'مسیر من', '🌱'], ['learn', 'علم قند', '📖']].filter(Boolean);
  const SHORT = t => { t = t.replace(/[«»]/g, ''); const w = t.split(/\s+/); return w.length > 2 ? w.slice(0, 2).join(' ') : t; };
  const tabPool = () => {
    const seen = new Set(), out = [];
    BASE_TABS().forEach(x => { seen.add(x[0]); out.push(x); });
    (A.tools || []).forEach(t => { if (!t.route || seen.has(t.route) || !A.views[t.route] || t.route === 'settings' || t.route === 'admin') return; try { if (t.show && !t.show()) return; } catch (e) { return; } seen.add(t.route); out.push([t.route, SHORT(t.title || t.route), t.icon || '•']); });
    return out;
  };
  const MAXTABS = 6;
  function runTabs(r = cur()) {
    if (!inApp() || !on('ux_tabs')) return;
    const picks = U().tabs; if (!Array.isArray(picks) || !picks.length) return;
    const pool = tabPool(), tabs = picks.map(k => pool.find(x => x[0] === k)).filter(Boolean).slice(0, MAXTABS);
    tabs.push(['more', 'ابزارها', '🧰']);
    const tb = $('#tabbar'); if (!tb) return;
    tb.style.setProperty('--tabs', tabs.length);
    tb.innerHTML = tabs.map(([k, t, i]) => `<a href="#${k}" class="${r === k || (k === 'sleep' && /^sleep/.test(r)) ? 'on' : ''}"${r === k ? ' aria-current="page"' : ''}><span class="i">${i}</span>${esc(t)}</a>`).join('');
  }
  add('mount', r => runTabs(r));

  /* ================= 4. start page ================= */
  const STARTS = [['today', 'امروز'], ['night', 'چک‌لیست شب'], ['journey', 'مسیر من'], ['more', 'ابزارها'], ['recipes', 'رسپی‌ها'], ['move', 'ورزش'], ['sleep', 'خواب'], ['last', 'همون صفحه‌ای که آخر بار باز بود']];
  add('boot', () => {
    if (!inApp() || !on('ux_start') || location.hash) return;
    let to = U().start; if (!to || to === 'today') return;
    if (to === 'last') to = ls.get('uzhu:uxlast', '');
    if (to && A.views[to]) history.replaceState(null, '', '#' + to);
  });
  add('mount', r => { if (inApp() && A.appRoutes.includes(r) && !['settings', 'admin', 'subscribe', 'onboard'].includes(r)) ls.set('uzhu:uxlast', r); });

  /* ================= 5. quiet hours, quiet weekdays, reminder types ================= */
  const toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  add('reminderFilter', (list, date) => {
    if (!on('ux_quiet') || !A.user) return list;
    const q = (A.D().ux || {}).quiet || {}, u = A.D().ux || {};
    if ((q.days || []).includes(date.getDay())) return [];
    let out = list.filter(r => !(r.kind === 'night' && u.remNight === false) && !(r.kind === 'crave' && u.remCrave === false));
    if (q.on && q.from && q.to && q.from !== q.to) {
      const f = toMin(q.from), t = toMin(q.to);
      const inside = m => f < t ? m >= f && m < t : m >= f || m < t;
      out = out.flatMap(r => { const m = toMin(r.time); if (!inside(m)) return [r]; return m < t ? [{ ...r, time: q.to }] : []; });
    }
    return out;
  });
  const WD = [[6, 'ش'], [0, 'ی'], [1, 'د'], [2, 'س'], [3, 'چ'], [4, 'پ'], [5, 'ج']];
  add('settings', () => {
    if (!inApp()) return '';
    const u = U(), q = u.quiet;
    let out = '';
    if (on('ux_quiet')) out += `<div class="card stack" style="gap:10px"><b>🔕 وقت‌های بی‌یادآور</b>
      <label class="check" for="ux-qon"><input type="checkbox" id="ux-qon" ${q.on ? 'checked' : ''}><span>ساعت آرامش: این وسط یادآور نفرست</span></label>
      <div class="row"><label class="small">از ساعت<br><input class="input" type="time" id="ux-qf" value="${esc(q.from || '23:00')}" style="width:auto"></label><label class="small">تا ساعت<br><input class="input" type="time" id="ux-qt" value="${esc(q.to || '08:00')}" style="width:auto"></label></div>
      <p class="small muted">یادآورهای صبحِ زودِ این بازه، سر ساعتِ پایانش میان؛ بقیه اون روز فرستاده نمی‌شن.</p>
      <div class="stack" style="gap:6px"><span class="small">روزهای استراحت از یادآور (مثلاً جمعه‌ها):</span><div class="row ux-wd" role="group" aria-label="روزهای بی‌یادآور">${WD.map(([d, t]) => `<label class="ux-day"><input type="checkbox" data-uxd="${d}" ${(q.days || []).includes(d) ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div></div>
      <b class="small">کدوم یادآورها بیان؟</b>
      <label class="check" for="ux-rn"><input type="checkbox" id="ux-rn" ${u.remNight !== false ? 'checked' : ''}><span>یادآور چک‌لیست آخر شب</span></label>
      <label class="check" for="ux-rc"><input type="checkbox" id="ux-rc" ${u.remCrave !== false ? 'checked' : ''}><span>هشدار ساعتی که معمولاً هوس میاد</span></label>
      <label class="check" for="ux-rm"><input type="checkbox" id="ux-rm" ${u.miss !== false ? 'checked' : ''}><span>پیام «دلمون برات تنگ شده» وقتی چند روز نمیای</span></label></div>`;
    const prefs = [];
    if (on('ux_start')) prefs.push(`<label class="small">وقتی برنامه رو باز می‌کنم، اول این صفحه بیاد<br><select class="input" id="ux-start" style="width:auto">${STARTS.filter(([k]) => k === 'last' || A.views[k]).map(([k, t]) => `<option value="${k}" ${(u.start || 'today') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`);
    if (on('ux_tabs')) {
      const pool = tabPool(), sel = Array.isArray(u.tabs) && u.tabs.length ? u.tabs : BASE_TABS().map(x => x[0]).slice(0, MAXTABS);
      prefs.push(`<div class="stack" style="gap:6px"><span class="small">دکمه‌های نوار پایین گوشی (تا ${fa(MAXTABS)} تا؛ «ابزارها» همیشه هست). به ترتیبی که می‌زنی چیده می‌شن:</span>
        <div class="ux-tabpick" id="ux-tabpick">${pool.map(([k, t, i]) => { const n = sel.indexOf(k); return `<button type="button" class="chip ${n >= 0 ? 'mint' : ''}" data-uxt="${k}" aria-pressed="${n >= 0}">${n >= 0 ? `<span class="ux-n">${fa(n + 1)}</span>` : ''}${i} ${esc(t)}</button>`; }).join('')}</div>
        <div class="row"><button type="button" class="btn ghost small" id="ux-tabreset">برگردون به حالت اول</button></div></div>`);
    }
    if (on('ux_today')) prefs.push(`<div class="row"><a class="btn ghost small" href="#today" id="ux-golayout">✏️ چیدمان صفحه‌ی امروز</a>${U().today.hide.length ? `<span class="small muted">${fa(U().today.hide.length)} کارت پنهانه</span>` : ''}</div>`);
    if (on('ux_fab')) { const f = ls.get('uzhu:uxfab', {}); prefs.push(`<div class="stack ux-noauto" style="gap:6px"><span class="small">دکمه‌ی «هوس دارم» و ➕ (روی همین گوشی):</span><div class="row">${[['', 'سمت راست'], ['left', 'سمت چپ']].map(([v, t]) => `<button type="button" class="chip ${(f.side || '') === v ? 'mint' : ''}" data-uxside="${v}">${t}</button>`).join('')}<label class="check" for="ux-fsm" style="margin:0"><input type="checkbox" id="ux-fsm" ${f.small ? 'checked' : ''}><span>همیشه کوچیک</span></label></div></div>`); }
    if (prefs.length) out += `<div class="card stack" style="gap:12px"><b>🧭 راحتی و چیدمان</b>${prefs.join('')}</div>`;
    return out;
  });
  add('settingsSave', () => {
    if (!inApp()) return;
    const u = U(), q = u.quiet;
    if ($('#ux-qon')) {
      q.on = $('#ux-qon').checked; q.from = $('#ux-qf').value || '23:00'; q.to = $('#ux-qt').value || '08:00';
      q.days = $$('[data-uxd]').filter(i => i.checked).map(i => Number(i.dataset.uxd));
      u.remNight = $('#ux-rn').checked; u.remCrave = $('#ux-rc').checked; u.miss = $('#ux-rm').checked;
    }
    if ($('#ux-start')) u.start = $('#ux-start').value;
  });
  add('mount', r => {
    if (r !== 'settings' || !inApp()) return;
    const tp = $('#ux-tabpick');
    if (tp) {
      const draw = () => { const sel = U().tabs || []; $$('[data-uxt]', tp).forEach(b => { const n = sel.indexOf(b.dataset.uxt); b.classList.toggle('mint', n >= 0); b.setAttribute('aria-pressed', String(n >= 0)); const old = $('.ux-n', b); if (old) old.remove(); if (n >= 0) b.insertAdjacentHTML('afterbegin', `<span class="ux-n">${fa(n + 1)}</span>`); }); };
      if (!Array.isArray(U().tabs) || !U().tabs.length) U().tabs = BASE_TABS().map(x => x[0]).slice(0, MAXTABS);
      $$('[data-uxt]', tp).forEach(b => b.onclick = () => {
        const u = U(), k = b.dataset.uxt;
        if (u.tabs.includes(k)) { if (u.tabs.length <= 1) return A.toast('دست‌کم یک دکمه لازمه.'); u.tabs = u.tabs.filter(x => x !== k); }
        else { if (u.tabs.length >= MAXTABS) return A.toast(`حداکثر ${fa(MAXTABS)} دکمه جا می‌شه. اول یکی رو بردار.`, 'bell'); u.tabs.push(k); }
        draw(); A.save(); runTabs(); savedMark();
      });
      $('#ux-tabreset').onclick = () => { delete U().tabs; A.save(); A.render(); };
    }
    $$('[data-uxside]').forEach(b => b.onclick = () => { ls.set('uzhu:uxfab', { ...ls.get('uzhu:uxfab', {}), side: b.dataset.uxside }); applyFab(); $$('[data-uxside]').forEach(x => x.classList.toggle('mint', x === b)); savedMark(); });
    const sm = $('#ux-fsm'); if (sm) sm.onchange = () => { ls.set('uzhu:uxfab', { ...ls.get('uzhu:uxfab', {}), small: sm.checked }); applyFab(); savedMark(); };
  });

  /* ================= 6. day text: reading time, progress, focus mode ================= */
  const fsKey = 'uzhu:uxfocus';
  function openFocus(art) {
    const title = $('h2', art)?.textContent || '', paras = $$('p', art).filter(p => !p.closest('.ux-rt, .row, .p2-say')).map(p => p.textContent.trim()).filter(Boolean);
    const st = ls.get(fsKey, { size: 1.15, tone: '' });
    const ov = document.createElement('div');
    ov.className = 'ux-focus'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'حالت تمرکز');
    const paint = () => { ov.style.setProperty('--fz', st.size + 'rem'); ov.dataset.tone = st.tone; };
    ov.innerHTML = `<div class="ux-fbar"><i id="ux-fprog"></i></div>
      <div class="ux-ftools row"><button type="button" class="btn ghost" data-f="-" aria-label="متن کوچیک‌تر">آ−</button><button type="button" class="btn ghost" data-f="+" aria-label="متن بزرگ‌تر">آ+</button><button type="button" class="btn ghost" data-f="tone" aria-label="رنگ صفحه">🌗</button><span style="flex:1"></span><button type="button" class="btn ghost" data-f="x" aria-label="بستن">✕</button></div>
      <article class="ux-ftext"><span class="eyebrow">متن امروز</span><h2>${esc(title)}</h2>${paras.map(p => `<p>${esc(p)}</p>`).join('')}
      <div class="row" style="justify-content:center;margin:28px 0 60px"><button type="button" class="btn primary big" data-f="done">✓ خوندم</button></div></article>`;
    document.body.appendChild(ov); document.body.classList.add('ux-lock'); paint();
    const prev = document.activeElement, close = () => { ov.remove(); document.body.classList.remove('ux-lock'); document.removeEventListener('keydown', key); prev?.focus?.(); };
    const key = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    ov.addEventListener('scroll', () => { const h = ov.scrollHeight - ov.clientHeight; $('#ux-fprog', ov).style.width = (h > 0 ? Math.min(100, ov.scrollTop / h * 100) : 100) + '%'; });
    ov.onclick = e => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      const f = b.dataset.f;
      if (f === '+') st.size = Math.min(1.9, +(st.size + .1).toFixed(2));
      if (f === '-') st.size = Math.max(.9, +(st.size - .1).toFixed(2));
      if (f === 'tone') st.tone = { '': 'sepia', sepia: 'night', night: '' }[st.tone || ''];
      if (f === 'x') return close();
      if (f === 'done') { close(); const rd = $('[data-rd]'); if (rd) rd.click(); return; }
      ls.set(fsKey, st); paint();
    };
    $('[data-f="x"]', ov).focus();
  }
  let progOff = null;
  add('mount', r => {
    if (progOff) { progOff(); progOff = null; }
    if (r !== 'today' || !inApp() || !on('ux_reading')) return;
    const art = $('#app article.reading'); if (!art) return;
    const words = $$('p', art).map(p => p.textContent).join(' ').split(/\s+/).filter(Boolean).length;
    const min = Math.max(1, Math.round(words / 170));
    const h2 = $('h2', art);
    h2 && h2.insertAdjacentHTML('afterend', `<div class="row ux-rt"><span class="chip">⏱ حدود ${fa(min)} دقیقه خوندن</span><button type="button" class="btn ghost small" id="ux-focus">📖 حالت تمرکز</button></div>`);
    $('#ux-focus').onclick = () => openFocus(art);
    document.body.insertAdjacentHTML('beforeend', '<div class="ux-rprog" id="ux-rprog" aria-hidden="true"><i></i></div>');
    const bar = $('#ux-rprog'), fill = $('i', bar);
    const onS = () => { const b = art.getBoundingClientRect(), vh = innerHeight; const p = (vh - b.top) / (b.height + vh * .2); const show = b.top < vh * .6 && b.bottom > 0; bar.classList.toggle('on', show); fill.style.width = Math.max(0, Math.min(100, p * 100)) + '%'; };
    addEventListener('scroll', onS, { passive: true }); onS();
    progOff = () => { removeEventListener('scroll', onS); bar.remove(); };
  });

  /* ================= 7. night checklist draft ================= */
  const draftKey = () => `uzhu:nightdraft:${A.user?.email || ''}:${A.logKey()}`;
  const fieldKey = (el, i) => el.id ? '#' + el.id : el.name ? `${el.name}=${el.type === 'radio' || el.type === 'checkbox' ? el.value : ''}` : '@' + i;
  add('mount', r => {
    if (r !== 'night' || !inApp() || !on('ux_draft')) return;
    const f = $('#nf'); if (!f) return;
    const done = !!A.D().log[A.logKey()]?.done;
    const fields = () => [...f.elements].filter(el => el.matches('input, textarea, select') && el.type !== 'file' && el.type !== 'submit' && el.type !== 'button');
    // older drafts (yesterday and before) are dropped
    try { Object.keys(localStorage).filter(k => k.startsWith(`uzhu:nightdraft:${A.user?.email || ''}:`) && k !== draftKey()).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    const dr = ls.get(draftKey(), null);
    if (dr && !done) {
      fields().forEach((el, i) => { const k = fieldKey(el, i); if (!(k in dr)) return; if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!dr[k]; else el.value = dr[k]; });
      fields().forEach(el => { if (el.type === 'checkbox' || el.type === 'radio') el.dispatchEvent(new Event('change', { bubbles: true })); });
      f.insertAdjacentHTML('afterbegin', `<p class="small ux-draft" role="status">✓ چیزهایی که قبلاً پر کرده بودی برگشت. <button type="button" class="ux-link" id="ux-drx">از اول پر می‌کنم</button></p>`);
      $('#ux-drx').onclick = () => { ls.del(draftKey()); A.render(); };
    }
    const store = () => { const o = {}; fields().forEach((el, i) => { const k = fieldKey(el, i); o[k] = el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value; }); ls.set(draftKey(), o); };
    let t = null;
    if (!done) { f.addEventListener('input', () => { clearTimeout(t); t = setTimeout(store, 300); }); f.addEventListener('change', store); }
    f.addEventListener('submit', () => { clearTimeout(t); ls.del(draftKey()); });
  });

  /* ================= 8. floating buttons: shrink while scrolling, side, size ================= */
  function applyFab() {
    const f = ls.get('uzhu:uxfab', {}), b = document.body;
    b.classList.toggle('ux-fab-left', on('ux_fab') && f.side === 'left');
    b.classList.toggle('ux-fab-small', on('ux_fab') && !!f.small);
  }
  add('boot', () => {
    applyFab();
    let last = scrollY, tk = false;
    addEventListener('scroll', () => {
      if (tk) return; tk = true;
      requestAnimationFrame(() => { tk = false; if (!on('ux_fab')) return; const y = scrollY, d = y - last; if (Math.abs(d) > 6) { document.body.classList.toggle('ux-scrolled', d > 0 && y > 160); last = y; } });
    }, { passive: true });
    // swipe a toast sideways to close it
    let sx = 0, el = null;
    document.addEventListener('touchstart', e => { el = e.target.closest('.toast'); if (el) sx = e.touches[0].clientX; }, { passive: true });
    document.addEventListener('touchmove', e => { if (!el) return; const dx = e.touches[0].clientX - sx; el.style.transform = `translateX(${dx}px)`; el.style.opacity = String(Math.max(.2, 1 - Math.abs(dx) / 220)); }, { passive: true });
    document.addEventListener('touchend', e => { if (!el) return; const dx = (e.changedTouches[0]?.clientX || sx) - sx; if (Math.abs(dx) > 70) el.remove(); else { el.style.transform = ''; el.style.opacity = ''; } el = null; });
  });
  // Put the words of «هوس دارم» in their own span so they can fold away; the icon stays visible.
  const wrapSos = () => {
    const s = $('#sos'); if (!s || $('.ux-tx', s)) return;
    [...s.childNodes].forEach(n => {
      if (n.nodeType !== 3) return;
      const m = n.textContent.match(/^([^؀-ۿa-zA-Z]*)(.+?)\s*$/s); if (!m || !m[2].trim()) return;
      const sp = document.createElement('span'); sp.className = 'ux-tx'; sp.textContent = m[2].trim();
      n.textContent = m[1]; n.after(sp);
    });
    s.setAttribute('aria-label', 'هوس دارم');
  };
  add('mount', () => { applyFab(); wrapSos(); setTimeout(wrapSos, 300); document.body.classList.remove('ux-scrolled'); });

  /* ================= 9. back button on tool pages ================= */
  const MAIN = ['today', 'night', 'journey', 'more', 'move', 'recipes', 'learn', 'settings', 'home', 'sleep', 'admin', 'signup', 'login', 'verify', 'newpass', 'onboard', 'welcome', 'subscribe', ''];
  let prevRoute = '';
  add('mount', r => {
    const from = prevRoute; prevRoute = r;
    if (!on('ux_back') || !inApp() || MAIN.includes(r)) return;
    const sec = $('#app .view > section'); if (!sec || $('.ux-back', sec)) return;
    const back = from && from !== r ? from : 'more';
    const name = { today: 'امروز', more: 'ابزارها', journey: 'مسیر من', night: 'چک‌لیست شب', recipes: 'رسپی‌ها', learn: 'علم قند', move: 'ورزش', settings: 'تنظیمات', sleep: 'خواب', profile: 'پروفایل' }[back] || 'قبلی';
    sec.insertAdjacentHTML('afterbegin', `<a class="ux-back" href="#${esc(back)}">→ برگشت به ${name}</a>`);
  });
});
