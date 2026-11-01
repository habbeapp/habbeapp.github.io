/* Gift notice: when the server has given the account a gift (supabase/gift-week.sql) that the user has not
   acknowledged yet, a sheet says so on open or refresh. "متوجه شدم" marks it seen on the server, so it does not
   come back on this or any other device. Closing it any other way shows it again next time. */
(window.UZHU_PLUGINS = window.UZHU_PLUGINS || []).push(function (A) {
  const STORE = A.STORE;
  if (STORE.mode !== 'supabase' || !A.modal) return;
  const fa = v => A.esc(A.fa(v));
  const date = v => { try { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long' }).format(new Date(v)); } catch (e) { return ''; } };
  const SKIP = ['login', 'signup', 'welcome', 'admin'];
  let checked = null, showing = false;
  A.H.mount = (A.H.mount || []).concat(async r => {
    const u = A.user;
    if (!u || !A.D()?.profile || SKIP.includes(r) || checked === u.id || showing) return;
    checked = u.id;
    let g; try { const res = await STORE.sb.rpc('uzhu_my_gift'); if (res.error) throw res.error; g = res.data; } catch (e) { checked = null; return; }
    if (!g || A.user?.id !== u.id) return;
    const key = 'uzhu:gift:' + u.id + ':' + g.gift;
    try { if (localStorage.getItem(key)) { STORE.sb.rpc('uzhu_gift_seen', { p_gift: g.gift }).then(() => {}, () => {}); return; } } catch (e) {}
    showing = true;
    const until = g.until ? date(g.until) : '';
    A.modal(`<div class="stack" style="gap:12px;text-align:center">
      <div class="sub-mascot" style="margin:0 auto">${A.ART.mascot('happy', { arms: 'wave' })}</div>
      <span class="eyebrow">🎁 هدیه‌ی حبه</span>
      <h2>یک هفته اشتراک هدیه گرفتید</h2>
      <p class="muted">هر چقدر از اشتراکت مونده بود، حالا ${fa(g.days || 7)} روز بیشتر شده. از همراهیت ممنونیم 💚</p>
      ${until ? `<p class="small">اشتراکت تا <b>${A.esc(until)}</b> فعاله.</p>` : ''}
      <button type="button" class="btn primary big" data-ok>متوجه شدم</button>
    </div>`, (m, close) => {
      const prev = m._cleanup; m._cleanup = () => { showing = false; if (prev) prev(); };
      m.querySelector('[data-ok]').addEventListener('click', () => {
        try { localStorage.setItem(key, '1'); } catch (e) {}
        STORE.sb.rpc('uzhu_gift_seen', { p_gift: g.gift }).then(() => {}, () => {});
        close();
      });
    });
    if (A.confetti) A.confetti();
  });
});
