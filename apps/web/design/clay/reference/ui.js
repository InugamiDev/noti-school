// noti.school Clay mockup behaviour. Vanilla stand-ins for the Solid components listed in DESIGN.md.
// intent: prove the QoL interactions (command menu, prompt input keys, toasts, citation linking, FAQ filter)
// status: done (mockup)
// next: re-implement as Solid components on Kobalte primitives; keep the same keyboard contract
// confidence: high
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = {
    get(k) { try { return localStorage.getItem('noti.' + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('noti.' + k, v); } catch { /* storage unavailable */ } },
  };
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (window.lucide) lucide.createIcons();
  if (!isMac) $$('[data-mod]').forEach(k => (k.textContent = 'Ctrl K'));

  // ---------- toast
  const toast = (msg, icon = 'check') => {
    const box = $('#toasts'); if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<i data-lucide="${icon}"></i><span></span>`;
    t.querySelector('span').textContent = msg;
    box.append(t); if (window.lucide) lucide.createIcons();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2600);
  };
  window.notiToast = toast;

  // ---------- pilot notice (dismiss remembered)
  const pilot = $('#pilot');
  if (pilot) {
    if (store.get('pilot-dismissed') === '1') pilot.hidden = true;
    $('#pilot-close')?.addEventListener('click', () => { pilot.hidden = true; store.set('pilot-dismissed', '1'); });
  }

  // ---------- sticky nav shadow
  const nav = $('#nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('stuck', scrollY > 8);
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  // ---------- mobile sheet
  const sheet = $('#sheet'), menuBtn = $('#menu-open');
  const setSheet = open => {
    if (!sheet) return;
    sheet.classList.toggle('open', open); sheet.setAttribute('aria-hidden', String(!open));
    menuBtn?.setAttribute('aria-expanded', String(open));
    if (open) sheet.querySelector('a,button')?.focus(); else menuBtn?.focus();
  };
  menuBtn?.addEventListener('click', () => setSheet(true));
  $$('[data-close-sheet]').forEach(el => el.addEventListener('click', () => setSheet(false)));

  // ---------- prompt input (shadcn Prompt Input contract)
  const form = $('#ask'), ta = $('#q');
  const send = form?.querySelector('.prompt-send');
  const syncSend = () => { if (send) send.disabled = !ta.value.trim(); };
  const focusAsk = () => { ta?.focus({ preventScroll: true }); ta?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); };
  if (form && ta) {
    const draft = store.get('draft'); if (draft) ta.value = draft;
    syncSend();
    ta.addEventListener('input', () => { syncSend(); store.set('draft', ta.value); });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!send.disabled) form.requestSubmit(); }
      if (e.key === 'Escape') ta.blur();
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (!ta.value.trim()) return;
      // Mockup only: the answer service is not connected here. Show the loading state honestly.
      send.innerHTML = '<span class="spin" aria-hidden="true"></span>'; send.disabled = true;
      setTimeout(() => {
        send.innerHTML = '<i data-lucide="arrow-up"></i>'; lucide.createIcons(); syncSend();
        toast('Preview only: the answer service is not connected here.', 'info');
      }, 900);
    });
    const langs = $$('.seg [data-lang]', form);
    const setLang = l => langs.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === l)));
    setLang(store.get('lang') || 'en');
    langs.forEach(b => b.addEventListener('click', () => { setLang(b.dataset.lang); store.set('lang', b.dataset.lang); }));
  }
  $$('[data-fill]').forEach(c => c.addEventListener('click', () => {
    if (!ta) return;
    ta.value = c.dataset.fill; store.set('draft', ta.value); syncSend();
    if (/[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i.test(c.dataset.fill)) $('.seg [data-lang="vi"]')?.click();
    focusAsk();
  }));
  $$('[data-focus-ask]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); focusAsk(); }));

  // ---------- citations: chip <-> highlighted passage <-> 3D pin
  const cites = $$('.cite[data-cite]'), marks = $$('mark[data-mark]');
  const setCite = id => {
    cites.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.cite === id)));
    marks.forEach(m => m.classList.toggle('on', m.dataset.mark === id));
    window.dispatchEvent(new CustomEvent('noti:cite', { detail: id }));
  };
  cites.forEach(c => c.addEventListener('click', () => setCite(c.dataset.cite)));
  $('#copy-cite')?.addEventListener('click', async () => {
    const txt = 'Sample Student Handbook, 2025 edition, page 31, section 4.2';
    try { await navigator.clipboard.writeText(txt); toast('Citation copied'); } catch { toast('Copy failed. Select the citation text instead.', 'triangle-alert'); }
  });

  // ---------- FAQ filter
  const filter = $('#faq-filter');
  if (filter) {
    const items = $$('#faq-list details'), empty = $('#faq-empty');
    const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
    filter.addEventListener('input', () => {
      const q = norm(filter.value.trim()); let shown = 0;
      items.forEach(d => { const hit = !q || norm(d.textContent).includes(q); d.hidden = !hit; if (hit) shown++; if (q && hit) d.open = true; });
      empty.hidden = shown > 0;
    });
  }

  // ---------- tabs (components page)
  $$('.tabs').forEach(t => {
    const tabs = $$('[role="tab"]', t);
    const pick = tab => { tabs.forEach(x => { const on = x === tab; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; $('#' + x.getAttribute('aria-controls')).hidden = !on; }); };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => pick(tab));
      tab.addEventListener('keydown', e => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { const n = tabs[(i + d + tabs.length) % tabs.length]; pick(n); n.focus(); }
      });
    });
  });

  // ---------- school scope picker (Kobalte Popover + Listbox in the port)
  // Each account belongs to one school; switching here only previews scope on the landing page.
  const sBtn = $('#scope-btn'), sPop = $('#scope-pop'), sQ = $('#scope-q'), sLabel = $('#scope-label');
  if (sBtn && sPop) {
    const opts = $$('.scope-opt', sPop);
    let kb = -1;
    const visibleOpts = () => opts.filter(o => !o.hidden);
    const setKb = i => { const v = visibleOpts(); kb = (i + v.length) % v.length; opts.forEach(o => o.classList.toggle('kb', o === v[kb])); v[kb]?.scrollIntoView({ block: 'nearest' }); };
    const openPop = () => { sPop.hidden = false; sBtn.setAttribute('aria-expanded', 'true'); sQ.value = ''; opts.forEach(o => (o.hidden = false)); setKb(0); sQ.focus(); };
    const closePop = (refocus = true) => { sPop.hidden = true; sBtn.setAttribute('aria-expanded', 'false'); if (refocus) sBtn.focus(); };
    const choose = o => {
      const id = o.dataset.scope;
      opts.forEach(x => x.setAttribute('aria-selected', String(x === o)));
      sLabel.textContent = id === 'hcmiu' ? 'HCMIU' : 'Your university';
      $('#answer-main') && ($('#answer-main').hidden = id !== 'hcmiu');
      $('#answer-alt') && ($('#answer-alt').hidden = id === 'hcmiu');
      store.set('scope', id); sBtn.dataset.scope = id;
      window.dispatchEvent(new CustomEvent('noti:scope', { detail: id }));
      closePop();
      if (id !== 'hcmiu') toast('Your university is not set up yet. You can request it below.', 'info');
    };
    window.notiOpenScope = openPop;
    sBtn.addEventListener('click', () => (sPop.hidden ? openPop() : closePop()));
    opts.forEach(o => o.addEventListener('click', () => choose(o)));
    sQ.addEventListener('input', () => {
      const q = sQ.value.trim().toLowerCase();
      opts.forEach(o => (o.hidden = !(o.dataset.search === '*' || !q || o.dataset.search.includes(q) || o.textContent.toLowerCase().includes(q))));
      setKb(0);
    });
    sQ.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setKb(kb + 1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setKb(kb - 1); }
      if (e.key === 'Enter') { e.preventDefault(); const o = visibleOpts()[kb]; if (o) choose(o); }
      if (e.key === 'Escape') { e.stopPropagation(); closePop(); }
    });
    document.addEventListener('pointerdown', e => { if (!sPop.hidden && !sPop.contains(e.target) && !sBtn.contains(e.target)) closePop(false); });
    const saved = store.get('scope');
    if (saved && saved !== 'hcmiu') { const o = opts.find(x => x.dataset.scope === saved); if (o) setTimeout(() => { choose(o); }, 0); }
  }

  // ---------- request-your-university form (mockup: validates, sends nothing)
  const jf = $('#join-form');
  if (jf) {
    const uni = $('#j-uni'), em = $('#j-email');
    const check = (el, err, ok) => { $(err).hidden = ok; el.setAttribute('aria-invalid', String(!ok)); if (!ok) el.setAttribute('aria-describedby', err.slice(1)); else el.removeAttribute('aria-describedby'); return ok; };
    jf.addEventListener('submit', e => {
      e.preventDefault();
      const a = check(uni, '#j-uni-err', uni.value.trim().length > 1);
      const b = check(em, '#j-email-err', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value.trim()));
      if (!a) return uni.focus(); if (!b) return em.focus();
      toast('Preview only: this request was not sent anywhere.', 'info');
    });
  }

  // ---------- command menu (Ctrl/Cmd+K)
  const dlg = $('#cmdk'), input = $('#cmdk-input'), list = $('#cmdk-list');
  const go = hash => () => { location.hash = hash; };
  const commands = [
    { g: 'Actions', label: 'Ask a question', icon: 'message-square', key: '/', run: () => focusAsk() },
    { g: 'Actions', label: 'Switch answer language', icon: 'languages', run: () => { const off = $('.seg [aria-pressed="false"]'); off?.click(); toast('Answer language: ' + (off?.querySelector('.long')?.textContent || off?.textContent || '')); } },
    { g: 'Actions', label: 'Change university', icon: 'school', run: () => { focusAsk(); window.notiOpenScope?.(); } },
    { g: 'Actions', label: 'Request your university', icon: 'send', run: go('#join') },
    { g: 'Actions', label: 'Copy sample citation', icon: 'copy', run: () => $('#copy-cite')?.click() },
    { g: 'Sample questions', label: 'How do I register for courses?', icon: 'corner-down-right', run: () => $('[data-fill^="How do I"]')?.click() },
    { g: 'Sample questions', label: 'Khi nào hạn rút môn học?', icon: 'corner-down-right', run: () => $('[data-fill^="Khi"]')?.click() },
    { g: 'Pages', label: 'How it works', icon: 'list-checks', run: go('#how') },
    { g: 'Pages', label: 'What it reads', icon: 'library', run: go('#reads') },
    { g: 'Pages', label: 'Every school gets its own sources', icon: 'lock', run: go('#scope') },
    { g: 'Pages', label: 'Who it is for', icon: 'users', run: go('#roles') },
    { g: 'Pages', label: 'Help and questions', icon: 'circle-help', run: go('#faq') },
    { g: 'Pages', label: 'Component library', icon: 'shapes', run: () => { location.href = 'components.html'; } },
  ];
  let active = 0, shown = [];
  const render = () => {
    const q = input.value.trim().toLowerCase();
    shown = commands.filter(c => c.label.toLowerCase().includes(q));
    active = Math.min(active, Math.max(0, shown.length - 1));
    list.innerHTML = '';
    if (!shown.length) { list.innerHTML = '<li class="cmdk-empty">No results. Press Enter to ask it as a question.</li>'; return; }
    let group = '';
    shown.forEach((c, i) => {
      if (c.g !== group) { group = c.g; const h = document.createElement('li'); h.className = 'cmdk-group'; h.textContent = group; h.setAttribute('role', 'presentation'); list.append(h); }
      const li = document.createElement('li');
      li.className = 'cmdk-item'; li.id = 'cmd-' + i; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', String(i === active));
      li.innerHTML = `<i data-lucide="${c.icon}"></i><span></span>${c.key ? `<span class="kbd">${c.key}</span>` : ''}`;
      li.querySelector('span').textContent = c.label;
      li.addEventListener('mousemove', () => { if (active !== i) { active = i; mark(); } });
      li.addEventListener('click', () => run(i));
      list.append(li);
    });
    input.setAttribute('aria-activedescendant', 'cmd-' + active);
    lucide.createIcons();
  };
  const mark = () => { $$('.cmdk-item', list).forEach((li, i) => li.setAttribute('aria-selected', String(i === active))); input.setAttribute('aria-activedescendant', 'cmd-' + active); $('#cmd-' + active)?.scrollIntoView({ block: 'nearest' }); };
  const open = () => { if (!dlg) return; input.value = ''; active = 0; render(); dlg.showModal(); input.focus(); };
  const close = () => dlg?.close();
  const run = i => {
    const c = shown[i]; close();
    if (c) c.run();
    else if (input.value.trim() && ta) { ta.value = input.value.trim(); syncSend(); focusAsk(); }
  };
  if (dlg) {
    input.addEventListener('input', () => { active = 0; render(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(1, shown.length); mark(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + shown.length) % Math.max(1, shown.length); mark(); }
      if (e.key === 'Enter') { e.preventDefault(); run(active); }
    });
    dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
    $$('[data-open-cmdk]').forEach(b => b.addEventListener('click', open));
  }

  // ---------- global shortcuts
  addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); dlg?.open ? close() : open(); }
    else if (e.key === '/' && !typing && ta) { e.preventDefault(); focusAsk(); }
    else if (e.key === 'Escape' && sheet?.classList.contains('open')) setSheet(false);
  });

  // ---------- reveal on scroll
  const io = 'IntersectionObserver' in window && !reduce ? new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
  $$('.reveal').forEach(el => (io ? io.observe(el) : el.classList.add('in')));
})();
