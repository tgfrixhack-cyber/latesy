/* Motion layer: short fade-in on route change and a highlight for newly arrived table rows.
   Pure progressive enhancement: everything is visible without it and it respects prefers-reduced-motion. */
'use strict';
(() => {
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const app = document.getElementById('app');
  const MAX_STAGGER = 6;
  let pending = true;            // a route change happened, next content render gets the full entrance
  let seenRows = new Set();      // row signatures of the current route (for "new row" flashes)
  window.addEventListener('hashchange', () => { pending = true; seenRows = new Set(); });

  function done(e) { if (e.target !== this || !/^fx(In|Row)$|^rise$/.test(e.animationName)) return; this.classList.remove('fx-in', 'fx-row'); this.removeEventListener('animationend', done); }
  function reveal(el, i, cls = 'fx-in') {
    el.style.setProperty('--i', Math.min(i, MAX_STAGGER));
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    el.addEventListener('animationend', done);
  }
  const isSkel = el => el.classList?.contains('skel') || (el.querySelector && el.querySelector(':scope > .skel') && !el.querySelector('.card'));
  const rowSig = tr => tr.textContent.replace(/\s+/g, ' ').trim().slice(0, 160);

  function animateBlocks(root) {
    let i = 0;
    for (const el of root.children) {
      if (el.matches('.grid')) { for (const c of el.children) reveal(c, i++); }
      else reveal(el, i++);
    }
    root.querySelectorAll('tbody').forEach(tb => [...tb.rows].slice(0, 16).forEach((tr, k) => reveal(tr, k + 2, 'fx-row')));
    root.querySelectorAll('.st-bars').forEach(b => { [...b.children].forEach((x, k) => x.style.setProperty('--j', k)); b.classList.add('fx-bars'); });
  }
  function flashRows(root) {
    const rows = [...root.querySelectorAll('tbody tr')]; if (!rows.length) return;
    const sigs = rows.map(rowSig), overlap = sigs.some(s => seenRows.has(s));
    if (overlap && seenRows.size) rows.forEach((tr, k) => { if (!seenRows.has(sigs[k])) tr.classList.add('fx-new'); });
    sigs.forEach(s => seenRows.add(s));
  }

  const mo = new MutationObserver(muts => {
    if (reduced()) return;
    const content = document.getElementById('content');
    if (!content) return; // public screens (login, status) ship their own entrance choreography
    for (const m of muts) {
      if (!m.addedNodes.length) continue;
      const t = m.target;
      if (t === content) {
        const hadSkel = [...m.removedNodes].some(n => n.nodeType === 1 && (n.classList.contains('skel') || n.querySelector?.('.skel')));
        const nowSkel = [...content.children].every(isSkel);
        if (pending || hadSkel) { animateBlocks(content); if (!nowSkel) pending = false; }
        flashRows(content);
      } else if (t.nodeType === 1 && content.contains(t) && t !== content) {
        // partial re-render inside a page (catalog filters, tables, lists)
        let i = 0;
        m.addedNodes.forEach(n => { if (n.nodeType === 1 && n.matches('.card, .tbl-wrap, .bar-row')) reveal(n, i++); });
        if (t.matches('tbody') || t.querySelector?.('tbody')) flashRows(t.closest('.tbl-wrap, .card') || t);
      }
    }
  });
  mo.observe(app, { childList: true, subtree: true });

  // elevated top bar once the page is scrolled
  let topRaf = 0;
  addEventListener('scroll', () => { if (topRaf) return; topRaf = requestAnimationFrame(() => { topRaf = 0; document.querySelector('.top')?.classList.toggle('scrolled', scrollY > 4); }); }, { passive: true });
})();
