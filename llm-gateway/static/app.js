/* AI Gateway SPA — vanilla JS, no build step */
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const S = { token: localStorage.getItem('token'), user: null, cfg: { site_name: 'kvotum' } };

// ---------- icons (lucide paths)
const IC = {
  gift:'<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  pulse:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  play:'<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5 3.5-5 3.5z"/>',
  help:'<path d="M21 12a9 9 0 0 1-13.3 7.9L3 21l1.1-4.7A9 9 0 1 1 21 12Z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.7-.8 1.2v.4M12 16.5h.01"/>',
  home:'<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>', key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14 9l2 2"/>',
  box:'<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>', card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>',
  chat:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  chart:'<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/>', server:'<rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 7h.01M6 17h.01"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  wallet:'<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  receipt:'<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check:'<path d="M20 6 9 17l-5-5"/>', x:'<path d="M18 6 6 18M6 6l12 12"/>', trash:'<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', out:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  menu:'<path d="M3 6h18M3 12h18M3 18h18"/>', zap:'<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>', shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  refresh:'<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>', edit:'<path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/>',
  layers:'<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>', globe:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>',
  img:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  up:'<path d="m18 15-6-6-6 6"/>', down:'<path d="m6 9 6 6 6-6"/>', ext:'<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
};
const LOGO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M7.1 4.5v15M7.1 14.5l7.2-6.2M10.8 11.3l4.3 6.2"/><circle cx="16.2" cy="6.7" r="2.2" fill="currentColor" stroke="none"/><circle cx="16.4" cy="18.6" r="2.2" fill="currentColor" stroke="none"/></svg>'; // «k»: one key (the stem) routed to several providers (the nodes)
const ic = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[n] || ''}</svg>`;

// ---------- formatting
const money = (v, d) => { v = Number(v || 0); const a = Math.abs(v);
  if (d === undefined) d = a === 0 ? 2 : a < 0.01 ? 6 : a < 1 ? 4 : 2;
  return (v < 0 ? '-$' : '$') + a.toLocaleString('en-US', { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d }); };
const RATE = () => (typeof S !== 'undefined' && S.cfg && +S.cfg.usd_rub_rate) || 95;
// The cabinet shows money in rubles: balances are kept in USD and shown at the top-up rate, the rate payments are credited at.
// money() stays for the admin pages, where purchase prices are in USD.
const rubv = (x, d) => { x = Number(x || 0); const a = Math.abs(x);
  if (d === undefined) d = a === 0 || a >= 1 ? 2 : a >= 0.01 ? 3 : 4; // a request can cost a fraction of a kopeck
  return (a >= 1 && Math.abs(x - Math.round(x)) < 0.005 ? Math.round(x) : x).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: d }) + ' ₽'; };
const rub = (v, d) => rubv(Number(v || 0) * RATE(), d);
const tok = n => { n = Number(n || 0); return n >= 1e9 ? (n/1e9).toFixed(1)+'B' : n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n); };
const nf = n => Number(n || 0).toLocaleString(I18N.locale());
const dt = s => s ? new Date(s + (s.endsWith('Z') || s.includes('+') ? '' : 'Z')).toLocaleString(I18N.locale(), { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
const ago = s => { if (!s) return 'никогда'; const m = (Date.now() - new Date(s + 'Z')) / 6e4; return m < 1 ? 'только что' : m < 60 ? Math.round(m)+' мин назад' : m < 1440 ? Math.round(m/60)+' ч назад' : Math.round(m/1440)+' дн назад'; };
const pct = (a, b) => b ? ((a - b) / Math.abs(b) * 100) : (a ? 100 : 0);
const PCOL = { openai:'#10A37F', anthropic:'#D97757', google:'#4285F4', deepseek:'#4D6BFE', xai:'#52525B', mistral:'#FA520F', groq:'#F55036', openrouter:'#6467F2', together:'#0F6FFF', custom:'#71717A' };
const plogo = (preset, name, sm) => brandTile(PRESET_BRAND[preset] || brandOf(name), name, sm);
const famPreset = f => { f = (f || '').toLowerCase(); return f.includes('openai') ? 'openai' : f.includes('anthropic') ? 'anthropic' : f.includes('google') || f.includes('gemini') ? 'google' : f.includes('deepseek') ? 'deepseek' : f.includes('xai') || f.includes('grok') ? 'xai' : f.includes('mistral') ? 'mistral' : 'custom'; };

// ---------- api
async function api(path, opts = {}) {
  const o = { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' } };
  if (S.token) o.headers.Authorization = 'Bearer ' + S.token;
  if (opts.body) o.body = JSON.stringify(opts.body);
  const r = await fetch(path, o);
  let data = null; try { data = await r.json(); } catch {}
  if (r.status === 401 && S.token && !path.startsWith('/api/auth')) { logout(); throw new Error('Сессия истекла'); }
  if (!r.ok) throw new Error((data && (data.detail || data.error?.message)) || 'Ошибка ' + r.status);
  return data;
}
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function toast(msg, type = 'ok') {
  const t = document.createElement('div'); t.className = 'toast ' + type; t.setAttribute('role', 'status');
  t.innerHTML = `<span class="t-ic">${ic(type === 'err' ? 'x' : type === 'warn' ? 'help' : 'check')}</span><span class="t-m"></span><i class="t-bar"></i>`;
  t.querySelector('.t-m').textContent = msg; $('#toasts').append(t);
  const close = () => { if (t._c) return; t._c = 1; if (REDUCED()) return t.remove(); t.classList.add('out'); setTimeout(() => t.remove(), 260); };
  t.onclick = close; t.querySelector('.t-bar').addEventListener('animationend', close);
  if (REDUCED()) setTimeout(close, 3800);
}
const fail = e => toast(e.message || String(e), 'err');
async function busy(btn, fn) { const html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + html;
  try { return await fn(); } catch (e) { fail(e); } finally { btn.disabled = false; btn.innerHTML = html; } }
function copy(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (!btn) return toast('Скопировано');
    if (btn._ct) clearTimeout(btn._ct); else btn._h = btn.innerHTML;
    btn.classList.remove('copied'); void btn.offsetWidth; btn.classList.add('copied'); btn.innerHTML = ic('check'); fxTip(btn, 'Скопировано');
    btn._ct = setTimeout(() => { btn.innerHTML = btn._h; btn.classList.remove('copied'); btn._ct = null; }, 1600);
  }).catch(() => toast('Не удалось скопировать', 'err'));
}
function fxTip(el, text) {
  const r = el.getBoundingClientRect(), t = document.createElement('div'); t.className = 'fx-tip'; t.textContent = text;
  t.style.left = r.left + r.width / 2 + 'px'; t.style.top = r.top + 'px'; document.body.append(t); setTimeout(() => t.remove(), 1300);
}
const copyBtn = (text, cls = 'btn sm icon ghost') => `<button class="${cls}" data-copy="${esc(text)}" title="Копировать">${ic('copy')}</button>`;
document.addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) { e.preventDefault(); e.stopPropagation(); copy(b.dataset.copy, b); } });

function modal(title, body, { foot = '', size = '', drawer = false } = {}) {
  const ov = document.createElement('div'); ov.className = 'ov' + (drawer ? ' drawer-ov' : '');
  ov.innerHTML = `<div class="${drawer ? 'drawer' : 'modal ' + size}" role="dialog"><div class="modal-h"><h3>${title}</h3><button class="btn sm icon ghost" data-x>${ic('x')}</button></div><div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ''}</div>`;
  const close = () => { if (ov._c) return; ov._c = 1; document.removeEventListener('keydown', k);
    if (REDUCED()) return ov.remove(); ov.classList.add('closing'); setTimeout(() => ov.remove(), 190); };
  const k = e => e.key === 'Escape' && close();
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  ov.querySelector('[data-x]').onclick = close; document.addEventListener('keydown', k);
  document.body.append(ov); ov.close = close; return ov;
}
function confirmBox(text, { ok = 'Подтвердить', danger = true } = {}) {
  return new Promise(res => { const m = modal('Подтверждение', `<p style="margin:0">${text}</p>`, { foot: `<button class="btn" data-c>Отмена</button><button class="btn ${danger ? 'danger' : 'pri'}" data-o>${ok}</button>` });
    m.querySelector('[data-c]').onclick = () => { m.close(); res(false); }; m.querySelector('[data-o]').onclick = () => { m.close(); res(true); }; });
}
function promptBox(title, fields, okText = 'Сохранить') {
  return new Promise(res => {
    const m = modal(title, `<form class="col" id="pf">${fields.map(f => `<div class="field"><label>${f.label}</label>${f.type === 'textarea' ? `<textarea class="inp" name="${f.name}">${esc(f.value ?? '')}</textarea>` : `<input class="inp" name="${f.name}" type="${f.type || 'text'}" step="any" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}">`}${f.hint ? `<div class="hint">${f.hint}</div>` : ''}</div>`).join('')}<button hidden></button></form>`,
      { foot: `<button class="btn" data-c>Отмена</button><button class="btn pri" data-o>${okText}</button>` });
    const done = () => { const fd = Object.fromEntries(new FormData(m.querySelector('form'))); m.close(); res(fd); };
    m.querySelector('form').onsubmit = e => { e.preventDefault(); done(); };
    m.querySelector('[data-o]').onclick = done; m.querySelector('[data-c]').onclick = () => { m.close(); res(null); };
    setTimeout(() => m.querySelector('input,textarea')?.focus(), 50);
  });
}
const sw = (attrs, on) => `<label class="sw"><input type="checkbox" ${attrs} ${on ? 'checked' : ''}><span></span></label>`;
const empty = (icon, title, text = '', cta = '') => `<div class="empty"><div class="ic">${ic(icon)}</div><div style="font-weight:600;color:var(--tx)">${title}</div><div class="small mt" style="margin-top:6px">${text}</div>${cta ? `<div class="mt">${cta}</div>` : ''}</div>`;
const skel = (n = 3, h = 80) => `<div class="grid g3">${Array(n).fill(`<div class="skel" style="height:${h}px"></div>`).join('')}</div>`;
const statusBadge = c => `<span class="badge ${c < 400 ? 'ok' : c < 500 ? 'warn' : 'err'}">${c}</span>`;
const PAY_ST = { pending: ['warn', 'Ожидает'], paid: ['ok', 'Оплачен'], canceled: ['', 'Отменён'], refunded: ['err', 'Возврат'] };
const payBadge = s => `<span class="badge ${PAY_ST[s]?.[0] || ''}">${PAY_ST[s]?.[1] || s}</span>`;
const hl = code => esc(code).replace(/(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="tk-s">$1</span>').replace(/\b(import|from|const|await|async|for|in|print|curl|new|return)\b/g, '<span class="tk-k">$1</span>').replace(/(^|\n)(\s*#[^\n]*)/g, '$1<span class="tk-c">$2</span>');
const codeBlock = code => (code = I18N.t(code), `<div class="code">${copyBtn(code, 'btn sm icon copy')}${hl(code)}</div>`);
const estTok = t => t ? Math.max(1, Math.floor(t.length / 3)) : 0; // same estimate as the server
const linkify = t => esc(t).replace(/https?:\/\/[^\s<]*[^\s<.,;)]/g, u => `<a href="${u}" target="_blank" style="color:inherit;text-decoration:underline">${u}</a>`);
async function download(path, fallback) {
  const r = await fetch(path, { headers: { Authorization: 'Bearer ' + S.token } });
  if (!r.ok) { let m = 'Ошибка ' + r.status; try { m = (await r.json()).detail || m; } catch {} throw new Error(m); }
  const name = (r.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || fallback;
  const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ---------- charts (SVG)
function areaChart(labels, series, { h = 220, fmt = v => v } = {}) {
  const W = 800, H = h, P = { l: 48, r: 10, t: 10, b: 24 };
  if (!labels.length) return `<div class="empty small">Нет данных за период</div>`;
  const max = Math.max(1e-9, ...series.flatMap(s => s.data)) * 1.1;
  const n = labels.length, x = i => P.l + (n === 1 ? (W - P.l - P.r) / 2 : i * (W - P.l - P.r) / (n - 1)), y = v => P.t + (H - P.t - P.b) * (1 - v / max);
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = max * i / 4, yy = y(v); g += `<line x1="${P.l}" x2="${W - P.r}" y1="${yy}" y2="${yy}" stroke="var(--bd)" stroke-dasharray="3 4"/><text x="${P.l - 6}" y="${yy + 3}" text-anchor="end">${esc(fmt(v))}</text>`; }
  const step = Math.ceil(n / 8); labels.forEach((l, i) => { if (i % step === 0) g += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(l.slice(5))}</text>`; });
  series.forEach((s, si) => { const pts = s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    g += `<defs><linearGradient id="gr${si}${s.color.slice(1)}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".35"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs>`;
    if (s.fill !== false) g += `<polygon class="ar" style="--d:${si * 120}ms" points="${x(0)},${y(0)} ${pts} ${x(n - 1)},${y(0)}" fill="url(#gr${si}${s.color.slice(1)})"/>`;
    g += `<polyline class="ln" style="--d:${si * 120}ms" pathLength="1" points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
    s.data.forEach((v, i) => g += `<circle cx="${x(i)}" cy="${y(v)}" r="7" fill="transparent"><title>${labels[i]}: ${s.name} ${fmt(v)}</title></circle>`); });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${h}px">${g}</svg>`;
}
const legend = items => `<div class="legend">${items.map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('')}</div>`;
function barList(rows, val, label, fmt) { const max = Math.max(1e-9, ...rows.map(val));
  return rows.length ? rows.map((r, i) => `<div class="bar-row"><div class="mono" style="overflow:hidden;text-overflow:ellipsis">${esc(label(r))}</div><div class="bar"><i style="width:${val(r) / max * 100}%;--i:${i}"></i></div><div class="num small muted">${fmt(r)}</div></div>`).join('') : `<div class="empty small">Нет данных</div>`; }
function fillDays(daily, days) { const map = Object.fromEntries(daily.map(d => [d.date, d])), out = [];
  for (let i = days - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); out.push(map[d] || { date: d, requests: 0, revenue: 0, cost: 0, tokens: 0 }); } return out; }
function countUp(root) { $$('[data-count]', root).forEach(el => { const end = +el.dataset.count, f = el.dataset.fmt, t0 = performance.now(), orig = el.textContent;
  const fm = v => f === 'money' ? money(v, 2) : f === 'rub' ? rub(v, 2) : f === 'tok' ? tok(Math.round(v)) : f === 'pct' ? v.toFixed(1) + '%' : nf(Math.round(v));
  if (REDUCED()) { el.textContent = fm(end); return; }
  const step = t => { const k = Math.min(1, (t - t0) / 1100), e = k === 1 ? 1 : 1 - Math.pow(2, -10 * k); el.textContent = k === 1 && orig !== '0' ? orig : fm(end * e); if (k < 1 && el.isConnected) requestAnimationFrame(step); }; requestAnimationFrame(step); }); }

// ---------- ready-made configs for popular apps
function integrations(base, origin, m, key, site, ids = []) {
  const li = a => `<ol class="steps-ol">${a.map(s => `<li>${s}</li>`).join('')}</ol>`, mono = v => `<span class="mono">${esc(v)}</span>`;
  const slug = (site || 'gateway').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gateway';
  const pid = ['openai', 'ollama', 'lmstudio'].includes(slug) ? slug + '-gateway' : slug; // ids reserved by Codex
  const envk = pid.toUpperCase().replace(/-/g, '_') + '_API_KEY';
  const fast = ids.find(i => /haiku/i.test(i)) || m; // Claude Code sends background tasks to the Haiku slot
  const step = (n, t) => `<ol class="steps-ol" start="${n}"><li>${t}</li></ol>`; // numbering continues across code blocks
  return {
    claude: { name: 'Claude Code', html: step(1, `Откройте ${mono('~/.claude/settings.json')} (на Windows ${mono('%USERPROFILE%\\.claude\\settings.json')}) и добавьте блок ${mono('env')}:`) +
      codeBlock(JSON.stringify({ env: { ANTHROPIC_BASE_URL: origin, ANTHROPIC_AUTH_TOKEN: key, ANTHROPIC_MODEL: m, ANTHROPIC_DEFAULT_HAIKU_MODEL: fast, CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1' } }, null, 2)) +
      step(2, `Запустите ${mono('claude')} и отправьте сообщение. Команда ${mono('/status')} покажет адрес шлюза, ${mono('/model')} — модели Claude из каталога.`) +
      '<div class="alert info small mt">Claude Code работает в формате Anthropic, поэтому нужны модели Claude. Thinking, кеш промптов и подсчёт токенов поддерживаются: повторно прочитанный из кеша контекст стоит 10% от цены входа.</div>' },
    codex: { name: 'Codex CLI', html: step(1, `Добавьте в ${mono('~/.codex/config.toml')}:`) +
      codeBlock(`model = "${m}"\nmodel_provider = "${pid}"\n\n[model_providers.${pid}]\nname = "${site}"\nbase_url = "${base}"\nenv_key = "${envk}"\nwire_api = "responses"`) +
      step(2, `Передайте ключ через переменную окружения (в PowerShell: ${mono(`$env:${envk}="${key}"`)}):`) + codeBlock(`export ${envk}=${key}`) +
      step(3, `Запустите ${mono('codex')}.`) +
      '<div class="alert info small mt">Подходит любая чат-модель каталога. Запросы к моделям не от OpenAI шлюз сам переводит из Responses API в их формат.</div>' },
    cline: { name: 'Cline', html: li(['Откройте Cline → шестерёнка <b>Settings</b>.', '<b>API Provider</b>: выберите <b>OpenAI Compatible</b>.', `<b>Base URL</b>: ${mono(base)} ${copyBtn(base)}`, `<b>API Key</b>: ${mono(key)}`, `<b>Model ID</b>: ${mono(m)} ${copyBtn(m)}`, 'Нажмите <b>Done</b>.']) },
    roo: { name: 'Roo Code', html: li(['Откройте Roo Code → шестерёнка <b>Settings → Providers</b>.', '<b>API Provider</b>: выберите <b>OpenAI Compatible</b>.', `<b>Base URL</b>: ${mono(base)} ${copyBtn(base)}`, `<b>API Key</b>: ${mono(key)}`, `<b>Model</b>: ${mono(m)} ${copyBtn(m)}`, 'Сохраните профиль.']) },
    aider: { name: 'Aider', html: li(['Передайте адрес и ключ через переменные окружения:']) +
      codeBlock(`export OPENAI_API_BASE=${base}\nexport OPENAI_API_KEY=${key}`) + li([`Запустите, добавив ${mono('openai/')} перед ID модели:`]) + codeBlock(`aider --model openai/${m}`) },
    cursor: { name: 'Cursor', html: li(['Откройте <b>Cursor Settings → Models</b>.', `В блоке <b>API Keys</b> вставьте ключ в поле <b>OpenAI API Key</b>: ${mono(key)}`, `Включите <b>Override OpenAI Base URL</b> и укажите ${mono(base)} ${copyBtn(base)}`, `Нажмите <b>+ Add Custom Model</b>, введите ${mono(m)} ${copyBtn(m)} и включите её.`, 'Нажмите <b>Verify</b>. Если проверка падает, временно отключите в списке остальные модели.']) +
      '<div class="alert warn small mt">Cursor ходит к API через свои серверы, поэтому шлюз должен быть доступен из интернета по HTTPS. Адрес localhost работать не будет.</div>' },
    continue: { name: 'Continue', html: li(['Откройте панель Continue → шестерёнка → <b>Open config file</b> (файл <span class="mono">~/.continue/config.yaml</span>).', 'Добавьте модель в раздел <span class="mono">models</span> и сохраните файл:']) +
      codeBlock(`name: ${site}\nversion: 1.0.0\nschema: v1\nmodels:\n  - name: ${m}\n    provider: openai\n    model: ${m}\n    apiBase: ${base}\n    apiKey: ${key}\n    roles:\n      - chat\n      - edit\n      - apply`) },
    sillytavern: { name: 'SillyTavern', html: li(['Откройте <b>API Connections</b> (значок вилки на верхней панели).', 'API: <b>Chat Completion</b>.', 'Chat Completion Source: <b>Custom (OpenAI-compatible)</b>.', `Custom Endpoint (Base URL): ${mono(base)} ${copyBtn(base)}`, `Custom API Key: ${mono(key)}`, `Enter a Model ID: ${mono(m)} → <b>Connect</b>.`]) },
    librechat: { name: 'LibreChat', html: li(['Добавьте эндпоинт в <span class="mono">librechat.yaml</span>:']) +
      codeBlock(`version: 1.2.1\nendpoints:\n  custom:\n    - name: "${site}"\n      apiKey: "\${GATEWAY_API_KEY}"\n      baseURL: "${base}"\n      models:\n        default: ["${m}"]\n        fetch: true\n      titleConvo: true\n      titleModel: "current_model"\n      modelDisplayLabel: "${site}"`) +
      li(['Добавьте ключ в <span class="mono">.env</span>:']) + codeBlock(`GATEWAY_API_KEY=${key}`) + li(['Перезапустите LibreChat: <span class="mono">docker compose restart</span>.']) },
    n8n: { name: 'n8n', html: li(['<b>Credentials → Add credential → OpenAI</b>.', `API Key: ${mono(key)}`, `Base URL: ${mono(base)} ${copyBtn(base)} → <b>Save</b>.`, 'В воркфлоу добавьте узел <b>OpenAI Chat Model</b> (для AI Agent) или <b>OpenAI → Message a model</b> и выберите эту учётную запись.', `Model → <b>By ID</b> → ${mono(m)}.`]) },
    langchain: { name: 'LangChain', html: `<p class="small muted">Python: <span class="mono">pip install langchain-openai</span></p>` +
      codeBlock(`from langchain_openai import ChatOpenAI\n\nllm = ChatOpenAI(\n    model="${m}",\n    base_url="${base}",\n    api_key="${key}",\n)\nprint(llm.invoke("Привет!").content)`) +
      `<p class="small muted mt">JavaScript: <span class="mono">npm i @langchain/openai</span></p>` +
      codeBlock(`import { ChatOpenAI } from "@langchain/openai";\n\nconst llm = new ChatOpenAI({\n  model: "${m}",\n  apiKey: "${key}",\n  configuration: { baseURL: "${base}" },\n});\nconst r = await llm.invoke("Привет!");\nconsole.log(r.content);`) },
    openwebui: { name: 'Open WebUI', html: li(['<b>Admin Panel → Settings → Connections</b>.', `В разделе <b>OpenAI API</b> нажмите «+»: URL ${mono(base)} ${copyBtn(base)}, Key — ваш ключ → <b>Save</b>.`, 'Модели шлюза появятся в списке выбора модели.']) +
      `<p class="small muted mt">Или сразу при запуске через Docker:</p>` + codeBlock(`docker run -d -p 3000:8080 \\\n  -e OPENAI_API_BASE_URL=${base} \\\n  -e OPENAI_API_KEY=${key} \\\n  -v open-webui:/app/backend/data \\\n  --name open-webui ghcr.io/open-webui/open-webui:main`) },
  };
}

// ---------- auth & routing
function logout() { S.token = null; S.user = null; localStorage.removeItem('token'); location.hash = '#/login'; }
function setTheme(t) { document.documentElement.dataset.theme = t; localStorage.setItem('theme', t); }
const routes = {};
const route = (path, fn, opt = {}) => routes[path] = { fn, ...opt };
let renderGen = 0;
async function render() {
  const gen = ++renderGen;
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  let r = routes[path], params = {};
  if (!r) for (const k in routes) { const m = k.match(/:(\w+)/); if (m) { const re = new RegExp('^' + k.replace(/:(\w+)/, '([^/]+)') + '$'), mm = path.match(re); if (mm) { r = routes[k]; params[m[1]] = mm[1]; break; } } }
  if (!r) r = routes['/'];
  if (r.auth && !S.token) { location.hash = '#/login'; return; }
  if (S.token && !S.user) { try { S.user = await api('/api/me'); } catch { return; } }
  if (r.admin && S.user?.role !== 'admin') { location.hash = '#/dashboard'; return; }
  if (r.guest && S.user) { location.hash = S.user.role === 'admin' ? '#/admin' : '#/dashboard'; return; }
  document.title = (r.title ? r.title + ' — ' : '') + S.cfg.site_name;
  if (gen !== renderGen) return;
  const stale = e => { if (gen === renderGen) console.error(e); };
  if (r.auth) { renderShell(path, r); Promise.resolve(r.fn($('#content'), params, q)).catch(stale); } else { $('#app').innerHTML = ''; Promise.resolve(r.fn($('#app'), params, q)).catch(stale); }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { document.querySelectorAll('.ov').forEach(o => o.remove()); render(); });

const USER_NAV = [['Обзор', '#/dashboard', 'home'], ['API-ключи', '#/keys', 'key'], ['Модели и цены', '#/models', 'box'], ['Баланс', '#/billing', 'wallet'], ['Расходы', '#/usage', 'chart'], ['Пригласить друга', '#/referral', 'gift'], ['История запросов', '#/logs', 'list'], ['Playground', '#/playground', 'chat'], ['Документация', '#/docs', 'book'], ['Статус сервиса', '#/status', 'pulse'], ['Поддержка', '#/support', 'help'], ['Настройки', '#/account', 'gear']];
const ADMIN_NAV = [['Дашборд', '#/admin', 'chart'], ['Провайдеры', '#/admin/providers', 'server'], ['Модели и цены', '#/admin/models', 'layers'], ['Пользователи', '#/admin/users', 'users'], ['Поддержка', '#/admin/support', 'help'], ['Платежи', '#/admin/payments', 'card'], ['Транзакции', '#/admin/transactions', 'receipt'], ['Логи запросов', '#/admin/logs', 'list'], ['Настройки', '#/admin/settings', 'gear']];
function renderShell(path, r) {
  const prevInd = $('#side .nav-ind'), prevY = prevInd && prevInd.dataset.y, prevScroll = $('#side .nav')?.scrollTop || 0;
  const isAdmin = path.startsWith('/admin'), u = S.user;
  const navHtml = (items) => items.map(([t, h, i]) => `<a href="${h}" class="${('#' + path) === h || (h !== '#/admin' && ('#' + path).startsWith(h + '/')) ? 'on' : ''}">${ic(i)}${t}</a>`).join('');
  $('#app').innerHTML = `<div class="shell"><aside class="side" id="side">
    <div class="brand"><div class="logo">${LOGO}</div><span>${esc(S.cfg.site_name)}</span>${isAdmin ? '<span class="tag-admin">Admin</span>' : ''}</div>
    <nav class="nav"><span class="nav-ind" aria-hidden="true"></span>${isAdmin ? navHtml(ADMIN_NAV) + `<div class="sec">Кабинет</div><a href="#/dashboard">${ic('home')}Мой кабинет</a>` : navHtml(USER_NAV) + (u.role === 'admin' ? `<div class="sec">Управление</div><a href="#/admin">${ic('shield')}Админ-панель</a>` : '')}</nav>
    <div class="side-foot"><a class="bal" href="#/billing"><span class="small muted">Баланс</span><b class="num" id="side-bal">${rub(u.balance)}</b></a>
    <div class="row between"><div style="min-width:0"><div class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u.email)}</div></div><button class="btn sm icon ghost" id="lo" title="Выйти">${ic('out')}</button></div></div></aside>
    <div class="main"><header class="top"><button class="btn sm icon ghost burger" id="bg">${ic('menu')}</button><div class="crumbs grow">${isAdmin ? 'Админ-панель' : 'Кабинет'} / <b>${esc(r.title || '')}</b></div>
    ${langSw()}<button class="btn sm icon ghost" id="th" title="Тема">${ic(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button></header>
    <div class="content" id="content"></div></div></div>`;
  supBadges();
  const nav = $('#side .nav'); nav.scrollTop = prevScroll; navIndicator(nav, prevY);
  $('#lo').onclick = logout; $('#bg').onclick = e => { e.stopPropagation(); $('#side').classList.toggle('open'); };
  $('.main').addEventListener('click', e => { if ($('#side').classList.contains('open') && !e.target.closest('#bg')) $('#side').classList.remove('open'); });
  $('#th').onclick = e => themeSwitch(e.currentTarget);
  $$('#side a').forEach(a => a.addEventListener('click', () => $('#side').classList.remove('open')));
}
function navIndicator(nav, fromY) {
  const ind = $('.nav-ind', nav), a = $('a.on', nav);
  if (!a) { ind.style.opacity = 0; return; }
  const y = a.offsetTop, put = v => { ind.style.transform = `translateY(${v}px)`; ind.dataset.y = v; };
  ind.style.height = a.offsetHeight + 'px';
  if (fromY != null && fromY !== '' && !REDUCED()) { ind.style.transition = 'none'; put(fromY); void ind.offsetWidth; ind.style.transition = ''; }
  requestAnimationFrame(() => put(y));
}
function themeSwitch(btn) {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(next); btn.innerHTML = ic(next === 'dark' ? 'sun' : 'moon');
}
async function refreshMe() { try { S.user = await api('/api/me'); const b = $('#side-bal'); if (b) b.textContent = rub(S.user.balance); } catch {} }
const pageHead = (title, sub = '', actions = '') => `<div class="page-h"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="row wrap">${actions}</div></div>`;

// =====================================================================  PUBLIC
const GH_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/></svg>';
const G_SVG = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.81Z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z"/><path fill="#FBBC05" d="M5.29 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.28a12 12 0 0 0 0 10.8l4.01-3.1Z"/><path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 1.28 6.6l4.01 3.1C6.23 6.86 8.88 4.75 12 4.75Z"/></svg>';
const words = (t, i0, cls = '') => t.split(' ').map((w, i) => `<span class="w ${cls}" style="--i:${i0 + i}">${w}</span>`).join(' ');
route('/', (el, p, q) => landingPage(el, p, q), { guest: true, title: 'GPT и Claude по API с оплатой в рублях' });
route('/login', (el, p, q) => landingPage(el, p, q, { login: true }), { guest: true, title: 'Вход' });
route('/register', (el, p, q) => landingPage(el, p, q, { login: true }), { guest: true, title: 'Вход' });
route('/oauth', async (el, p, q) => {
  history.replaceState(null, '', '#/');
  if (!q.token) { location.hash = '#/login'; return; }
  S.token = q.token; localStorage.setItem('token', q.token); S.user = null; localStorage.removeItem('ref'); document.cookie = 'ref=; max-age=0; path=/';
  if (q.key) sessionStorage.setItem('first_key', q.key);
  try { S.user = await api('/api/me'); } catch { return; }
  location.hash = S.user.role === 'admin' ? '#/admin' : '#/dashboard';
});
route('/admin-login', (el) => {
  el.innerHTML = `<div class="auth"><div class="card">${langSw('lang-fixed')}<a class="brand" style="padding:0 0 18px" href="#/"><div class="logo">${LOGO}</div>${esc(S.cfg.site_name)}</a>
    <h2>Вход администратора</h2><p class="muted" style="margin:6px 0 20px">По email и паролю из .env</p>
    <form class="col" id="af"><div class="field"><label>Email</label><input class="inp" name="email" type="email" required autocomplete="username"></div>
    <div class="field"><label>Пароль</label><input class="inp" name="password" type="password" required autocomplete="current-password"></div>
    <button class="btn pri" style="height:40px">Войти</button></form></div></div>`;
  const f = $('#af');
  f.onsubmit = e => { e.preventDefault(); busy(f.querySelector('button.pri'), async () => {
    const r = await api('/api/auth/login', { body: Object.fromEntries(new FormData(f)) });
    S.token = r.token; localStorage.setItem('token', r.token); S.user = await api('/api/me');
    location.hash = S.user.role === 'admin' ? '#/admin' : '#/dashboard'; }); };
}, { guest: true, title: 'Вход администратора' });

// =====================================================================  USER CABINET
route('/dashboard', async (el) => {
  el.innerHTML = pageHead('Обзор', 'Ваш баланс, расходы и быстрый старт') + skel(3, 110);
  const fk = sessionStorage.getItem('first_key');
  const [u, st, logs] = await Promise.all([api('/api/me'), api('/api/me/usage?days=30'), api('/api/me/logs?limit=8')]);
  S.user = u; const days = fillDays(st.daily, 30);
  const month = st.totals.revenue;
  el.innerHTML = pageHead('Обзор', 'Ваш баланс, расходы и быстрый старт', `<a class="btn pri" href="#/billing">${ic('plus')}Пополнить</a>`) +
    (fk ? `<div class="card mb" style="border-color:var(--accent)"><div class="card-h"><h3>Ваш первый API-ключ</h3><button class="btn sm ghost" id="hidefk">Скрыть</button></div><div class="keybox"><span class="grow">${esc(fk)}</span>${copyBtn(fk)}</div><p class="small warn" style="margin:8px 0 0">Сохраните ключ — он показывается только один раз.</p></div>` : '') +
    `<div class="grid g4"><div class="card kpi kpi-hero"><span class="kpi-ic">${ic('wallet')}</span><div class="l">Баланс</div><div class="v" data-count="${u.balance}" data-fmt="rub">${rub(u.balance)}</div><div class="d"><a href="#/billing" style="color:var(--link)">Пополнить →</a></div></div>
    <div class="card kpi"><span class="kpi-ic">${ic('zap')}</span><div class="l">Потрачено сегодня</div><div class="v" data-count="${st.today_spent}" data-fmt="rub">${rub(st.today_spent)}</div></div>
    <div class="card kpi"><span class="kpi-ic">${ic('chart')}</span><div class="l">За 30 дней</div><div class="v" data-count="${month}" data-fmt="rub">${rub(month)}</div><div class="d muted">${nf(st.totals.requests)} запросов</div></div>
    <div class="card kpi"><span class="kpi-ic">${ic('layers')}</span><div class="l">Токены за 30 дней</div><div class="v" data-count="${st.totals.prompt_tokens + st.totals.completion_tokens}" data-fmt="tok">0</div><div class="d muted">вход ${tok(st.totals.prompt_tokens)} · выход ${tok(st.totals.completion_tokens)}</div></div></div>
    <div class="grid g2 mt"><div class="card"><div class="card-h"><h3>Расход по дням</h3>${legend([['₽', '#FF5B1F']])}</div>${areaChart(days.map(d => d.date), [{ name: 'Расход', color: '#FF5B1F', data: days.map(d => d.revenue * RATE()) }], { fmt: v => rubv(v) })}</div>
    <div class="card"><div class="card-h"><h3>По моделям</h3></div>${barList(st.by_model, r => r.revenue, r => r.model, r => rub(r.revenue))}</div></div>
    <div class="grid g2 mt"><div class="card"><div class="card-h"><h3>Быстрый старт</h3><a class="small" style="color:var(--link)" href="#/docs">Документация →</a></div>${codeBlock(`curl ${location.origin}/v1/chat/completions \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Привет!"}]}'`)}</div>
    <div class="card"><div class="card-h"><h3>Последние запросы</h3><a class="small" style="color:var(--link)" href="#/logs">Все →</a></div>${logs.length ? `<table class="compact"><tbody>${logs.map(l => `<tr><td class="mono">${esc(l.model)}</td><td class="num muted">${tok(l.prompt_tokens + l.completion_tokens)}</td><td class="num r">${rub(l.price)}</td><td>${statusBadge(l.status_code)}</td></tr>`).join('')}</tbody></table>` : empty('list', 'Запросов пока нет', 'Сделайте первый запрос по примеру слева')}</div></div>`;
  countUp(el); const h = $('#hidefk'); if (h) h.onclick = () => { sessionStorage.removeItem('first_key'); render(); };
}, { auth: true, title: 'Обзор' });

// ---------- API keys: spending limit per period, allowed models, expiry, own rate limit (app/keys.py)
const PERIOD = { total: 'на всё время', day: 'в сутки', month: 'в месяц' };
const plural = (n, f) => f[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2];
const dmy = d => d ? d.split('-').reverse().join('.') : '';
function keyForm(k, models) {
  k = k || { name: '', spend_limit: null, limit_period: 'total', allowed_models: [], expires_on: null, rpm_limit: null };
  const sel = new Set(k.allowed_models), ids = [...new Set([...models.map(m => m.id), ...k.allowed_models])];
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // Moscow date
  return new Promise(res => {
    const md = modal(k.id ? 'Настройки ключа' : 'Новый API-ключ', `<form class="col" id="kf">
      <div class="field"><label>Название</label><input class="inp" name="name" value="${esc(k.name)}" placeholder="Например: мой бот" maxlength="100"></div>
      <div class="grid g2"><div class="field"><label>Лимит расходов, ₽</label><input class="inp" name="limit" type="number" min="0" step="any" value="${k.spend_limit != null ? +(k.spend_limit * RATE()).toFixed(2) : ''}" placeholder="без лимита"></div>
        <div class="field"><label>Период лимита</label><select class="inp" name="period">${Object.entries(PERIOD).map(([v, t]) => `<option value="${v}" ${v === k.limit_period ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
      <div class="small dim" style="margin-top:-6px">Когда лимит исчерпан, ключ перестаёт принимать запросы до конца периода. Сутки и месяц считаются по московскому времени.</div>
      <div class="field"><label>Модели</label><div class="pills" id="kmm"><button type="button" data-mm="all" class="${sel.size ? '' : 'on'}">Все модели</button><button type="button" data-mm="some" class="${sel.size ? 'on' : ''}">Только выбранные</button></div>
        <div id="kml" ${sel.size ? '' : 'hidden'}><input class="inp mt" id="kmq" type="search" placeholder="Поиск модели" autocomplete="off"><div class="mlist" id="kmb">${ids.map(id => `<label class="chk" data-id="${esc(id.toLowerCase())}"><input type="checkbox" value="${esc(id)}" ${sel.has(id) ? 'checked' : ''}><span class="mono">${esc(id)}</span></label>`).join('')}</div><div class="hint" id="kmn"></div></div></div>
      <div class="grid g2"><div class="field"><label>Действует до</label><input class="inp" name="exp" type="date" min="${today}" value="${k.expires_on || ''}"><div class="hint">Включительно. Пусто — бессрочно</div></div>
        <div class="field"><label>Запросов в минуту</label><input class="inp" name="rpm" type="number" min="1" step="1" value="${k.rpm_limit ?? ''}" placeholder="без отдельного лимита"><div class="hint">Только для этого ключа</div></div></div>
    </form>`, { foot: `<button class="btn" data-c>Отмена</button><button class="btn pri" data-o>${k.id ? 'Сохранить' : 'Создать ключ'}</button>` });
    let mode = sel.size ? 'some' : 'all';
    const f = $('#kf', md), cnt = () => { const n = $$('#kmb input:checked', md).length; $('#kmn', md).textContent = n ? `Выбрано: ${n}` : 'Отметьте хотя бы одну модель'; };
    $$('[data-mm]', md).forEach(b => b.onclick = () => { mode = b.dataset.mm; $$('[data-mm]', md).forEach(x => x.classList.toggle('on', x === b)); $('#kml', md).hidden = mode === 'all'; });
    $('#kmq', md).oninput = e => { const q = e.target.value.trim().toLowerCase(); $$('#kmb [data-id]', md).forEach(l => { l.hidden = !!q && !l.dataset.id.includes(q); }); };
    $('#kmb', md).onchange = cnt; cnt();
    const done = () => { const d = Object.fromEntries(new FormData(f)), chosen = $$('#kmb input:checked', md).map(i => i.value), lim = +d.limit;
      if (mode === 'some' && !chosen.length) { toast('Отметьте хотя бы одну модель или выберите «Все модели»', 'err'); return; }
      md.close(); res({ name: d.name.trim() || 'key', spend_limit: lim > 0 ? lim / RATE() : null, clear_limit: !(lim > 0), limit_period: d.period,
        allowed_models: mode === 'some' ? chosen : [], expires_on: d.exp || null, rpm_limit: +d.rpm > 0 ? Math.round(+d.rpm) : null }); };
    f.onsubmit = e => { e.preventDefault(); done(); };
    $('[data-o]', md).onclick = done; $('[data-c]', md).onclick = () => { md.close(); res(null); };
    setTimeout(() => $('[name=name]', md).focus(), 50);
  });
}
// Shown once after creation: the key, a live check and ready-made configs with the key already filled in.
function keyCreated(k, models) {
  const chat = models.filter(m => m.kind === 'chat'), ok = k.allowed_models.length ? chat.filter(m => k.allowed_models.includes(m.id)) : chat;
  const ids = ok.map(m => m.id), m0 = (ok.find(m => m.popular) || ok[0] || {}).id || 'gpt-4o-mini', mc = ids.find(i => /claude/i.test(i)) || m0;
  const base = location.origin + '/v1', site = S.cfg.site_name || 'Gateway', a = integrations(base, location.origin, m0, k.key, site, ids);
  const apps = { curl: { name: 'curl', html: codeBlock(`curl ${base}/chat/completions \\\n  -H "Authorization: Bearer ${k.key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model": "${m0}", "messages": [{"role": "user", "content": "Привет!"}]}'`) },
    claude: integrations(base, location.origin, mc, k.key, site, ids).claude, codex: a.codex, cursor: a.cursor, cline: a.cline };
  let app = 'curl';
  const md = modal('Ключ создан', `<div class="keybox"><span class="grow">${esc(k.key)}</span>${copyBtn(k.key)}</div><div class="alert warn mt">Скопируйте и сохраните ключ — он показывается <b>только один раз</b>.</div>
    <div class="kchk mt"><span id="kchk" class="small muted">Проверьте, что ключ принимается и запросы пройдут.</span><button class="btn sm" id="kck">${ic('check')}Проверить ключ</button></div>
    <h3 class="mt2">Подключение</h3><div class="pills mt" id="kap" style="flex-wrap:wrap"></div><div id="kab" class="mt"></div>`, { size: 'lg' });
  const draw = () => { $('#kap', md).innerHTML = Object.entries(apps).map(([id, v]) => `<button class="${id === app ? 'on' : ''}" data-ka="${id}">${v.name}</button>`).join('');
    $('#kab', md).innerHTML = apps[app].html; $$('[data-ka]', md).forEach(b => b.onclick = () => { app = b.dataset.ka; draw(); }); };
  draw();
  $('#kck', md).onclick = e => busy(e.currentTarget, async () => {
    const out = $('#kchk', md);
    try {
      const r = await fetch('/v1/balance', { headers: { Authorization: 'Bearer ' + k.key } }), d = await r.json();
      out.innerHTML = !r.ok ? `<span class="err">${esc(d.error?.message || 'Ключ не принят')}</span>`
        : d.ready ? `<span class="ok">Ключ работает. На балансе ${rub(d.balance_usd)}.</span>`
        : `<span class="warn">Ключ принят, но запросы пока не пройдут: ${esc(d.problem)}</span>${d.balance_usd <= 0 ? ' <a href="#/billing" style="color:var(--link)">Пополнить →</a>' : ''}`;
    } catch { out.innerHTML = '<span class="err">Не удалось связаться с API</span>'; }
  });
}
route('/keys', async (el) => {
  let models = [];
  const load = async () => {
    const [keys, ms] = await Promise.all([api('/api/me/keys'), models.length ? models : api('/api/public/models').catch(() => [])]); models = ms;
    const used = k => k.limit_period === 'total' ? k.spent : k.period_spent;
    const limit = k => { if (k.spend_limit == null) return '<span class="dim">без лимита</span>';
      const p = Math.min(100, used(k) / k.spend_limit * 100);
      return `${rub(used(k))} <span class="dim">из ${rub(k.spend_limit)}${k.limit_period === 'total' ? '' : ' ' + PERIOD[k.limit_period]}</span><div class="kbar ${p >= 100 ? 'full' : ''}"><i style="width:${p}%"></i></div>`; };
    const rules = k => [k.allowed_models.length ? `<span class="badge" title="${esc(k.allowed_models.join(', '))}">${k.allowed_models.length === 1 ? esc(k.allowed_models[0]) : `${k.allowed_models.length} ${plural(k.allowed_models.length, ['модель', 'модели', 'моделей'])}`}</span>` : '',
      k.expires_on ? `<span class="badge ${k.expired ? 'err' : ''}">${k.expired ? 'истёк' : 'до'} ${dmy(k.expires_on)}</span>` : '',
      k.rpm_limit ? `<span class="badge">${nf(k.rpm_limit)}/мин</span>` : ''].filter(Boolean).join(' ') || '<span class="dim">нет</span>';
    el.innerHTML = pageHead('API-ключи', 'Ключ передаётся в заголовке Authorization: Bearer. Для каждого можно задать лимит, модели и срок действия.', `<button class="btn pri" id="nk">${ic('plus')}Создать ключ</button>`) +
      (keys.length ? `<div class="tbl-wrap"><table><thead><tr><th>Название</th><th>Ключ</th><th class="r">Потрачено</th><th>Лимит</th><th>Ограничения</th><th>Использован</th><th>Активен</th><th></th></tr></thead><tbody>${keys.map(k => `<tr>
        <td><b>${esc(k.name)}</b><div class="small dim">${dt(k.created_at)}</div></td><td class="mono">${esc(k.display)}</td><td class="r num">${rub(k.spent)}</td>
        <td class="num klim">${limit(k)}</td><td>${rules(k)}</td><td class="muted small">${ago(k.last_used_at)}</td>
        <td>${sw(`data-tg="${k.id}"`, k.is_active)}</td><td class="r nowrap"><button class="btn sm ghost" data-ed="${k.id}" title="Настройки">${ic('edit')}</button><button class="btn sm ghost" data-del="${k.id}" title="Удалить">${ic('trash')}</button></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="card">${empty('key', 'Ключей пока нет', 'Создайте ключ, чтобы начать работу с API', '<button class="btn pri" onclick="$(\'#nk\').click()">Создать ключ</button>')}</div>`);
    $('#nk').onclick = async () => { const d = await keyForm(null, models); if (!d) return;
      try { const k = await api('/api/me/keys', { body: d }); keyCreated(k, models); load(); } catch (e) { fail(e); } };
    $$('[data-tg]').forEach(i => i.onchange = () => api('/api/me/keys/' + i.dataset.tg, { method: 'PATCH', body: { is_active: i.checked } }).then(() => toast(i.checked ? 'Ключ включён' : 'Ключ отключён')).catch(fail));
    $$('[data-del]').forEach(b => b.onclick = async () => { if (await confirmBox('Удалить ключ? Приложения, использующие его, перестанут работать.', { ok: 'Удалить' })) api('/api/me/keys/' + b.dataset.del, { method: 'DELETE' }).then(() => { toast('Ключ удалён'); load(); }).catch(fail); });
    $$('[data-ed]').forEach(b => b.onclick = async () => { const k = keys.find(x => x.id == b.dataset.ed), d = await keyForm(k, models);
      if (d) api('/api/me/keys/' + k.id, { method: 'PATCH', body: d }).then(() => { toast('Сохранено'); load(); }).catch(fail); });
  };
  el.innerHTML = skel(1, 200); load().catch(fail);
}, { auth: true, title: 'API-ключи' });

route('/models', async (el, p, qq) => {
  el.innerHTML = skel(3, 140);
  const ms = await api('/api/public/models'); const chat = ms.filter(m => m.kind === 'chat');
  const F = { q: '', fam: '', sort: 'popular', vision: false, tools: false }, cmp = new Set();
  let tab = qq.tab === 'calc' ? 'calc' : 'cat', calcText = '', calcIn = 0, calcOut = 500, calcN = 1;
  const fams = [...new Set(ms.map(m => m.family).filter(Boolean))];
  const SORTS = { popular: (a, b) => (b.popular - a.popular) || a.id.localeCompare(b.id), cheap: (a, b) => (a.price_in + a.price_out) - (b.price_in + b.price_out),
    exp: (a, b) => (b.price_in + b.price_out) - (a.price_in + a.price_out), ctx: (a, b) => b.context_length - a.context_length, name: (a, b) => a.id.localeCompare(b.id) };
  const popB = m => m.popular ? '<span class="badge">Популярная</span>' : '';
  const card = m => `<div class="card hov ${cmp.has(m.id) ? 'sel' : ''}"><div class="row between"><div class="row">${modelLogo(m)}<div><b class="mono">${esc(m.id)}</b><div class="small muted">${esc(m.family)}${m.kind === 'embedding' ? ' · embeddings' : ''}</div></div></div>${copyBtn(m.id)}</div>
    ${m.description ? `<p class="small muted">${esc(m.description)}</p>` : ''}<div class="row wrap mt">${popB(m)}${m.vision ? '<span class="badge info">Картинки</span>' : ''}${m.tools ? '<span class="badge">Функции</span>' : ''}<span class="badge">${tok(m.context_length)} контекст</span></div>
    <div class="grid g2 mt"><div><div class="small dim">Вход / 1M</div><b class="num">${rub(m.price_in)}</b></div><div><div class="small dim">Выход / 1M</div><b class="num">${rub(m.price_out)}</b></div></div>
    <label class="chk small mt"><input type="checkbox" data-cmp="${esc(m.id)}" ${cmp.has(m.id) ? 'checked' : ''}>Сравнить</label></div>`;
  const drawCat = () => {
    const list = ms.filter(m => (!F.q || (m.id + ' ' + m.name + ' ' + m.family).toLowerCase().includes(F.q)) && (!F.fam || m.family === F.fam) && (!F.vision || m.vision) && (!F.tools || m.tools)).sort(SORTS[F.sort]);
    $('#ml').innerHTML = list.length ? list.map(card).join('') : `<div class="card" style="grid-column:1/-1">${empty('box', 'Ничего не найдено', 'Попробуйте убрать часть фильтров')}</div>`;
    $('#mcount').textContent = `Показано ${list.length} из ${ms.length}`;
    $$('[data-cmp]').forEach(i => i.onchange = () => { if (i.checked && cmp.size >= 3) { i.checked = false; return toast('Можно сравнить не больше 3 моделей', 'err'); } i.checked ? cmp.add(i.dataset.cmp) : cmp.delete(i.dataset.cmp); drawBar(); i.closest('.card').classList.toggle('sel', i.checked); });
    drawBar(); };
  const drawBar = () => { const b = $('#cmpbar'); if (!b) return; b.hidden = !cmp.size;
    b.innerHTML = `<span>Выбрано для сравнения: <b>${cmp.size}</b> из 3</span><button class="btn sm pri" id="cmpgo" ${cmp.size < 2 ? 'disabled' : ''}>Сравнить</button><button class="btn sm ghost" id="cmpclr">Сбросить</button>`;
    $('#cmpclr').onclick = () => { cmp.clear(); drawCat(); }; $('#cmpgo').onclick = showCmp; };
  const showCmp = () => { const sel = ms.filter(m => cmp.has(m.id)), cost = m => (1000 * m.price_in + 500 * m.price_out) / 1e6 * 1000;
    const best = (f, low) => { const v = sel.map(f); return low ? Math.min(...v) : Math.max(...v); };
    const row = (label, f, fmt, mode) => `<tr><td class="muted">${label}</td>${sel.map(m => { const v = f(m); const good = mode && sel.length > 1 && v === best(f, mode === 'low') && new Set(sel.map(f)).size > 1; return `<td class="${good ? 'ok' : ''}">${fmt(v, m)}</td>`; }).join('')}</tr>`;
    const yes = v => v ? '✓ да' : '<span class="dim">нет</span>';
    modal('Сравнение моделей', `<div class="tbl-wrap"><table><thead><tr><th></th>${sel.map(m => `<th class="mono">${esc(m.id)} ${m.popular ? '<span class="dim small">· популярная</span>' : ''}</th>`).join('')}</tr></thead><tbody>
      ${row('Провайдер', m => m.family || '—', esc)}${row('Контекст', m => m.context_length, v => tok(v) + ' токенов', 'high')}${row('Макс. ответ', m => m.max_output, v => tok(v) + ' токенов', 'high')}
      ${row('Вход / 1M', m => m.price_in, v => rub(v), 'low')}${row('Выход / 1M', m => m.price_out, v => rub(v), 'low')}${row('Картинки', m => m.vision, yes)}${row('Функции (tools)', m => m.tools, yes)}
      ${row('1000 запросов*', cost, v => '<b>' + rub(v) + '</b>', 'low')}</tbody></table></div><p class="small dim mt">* Пример: 1000 запросов по 1000 токенов на входе и 500 на выходе. Зелёным отмечено лучшее значение.</p>`, { size: 'lg' }); };
  const drawCalc = () => { const n = Math.max(1, +calcN || 1), rows = chat.map(m => { const ci = calcIn * m.price_in / 1e6 * n, co = calcOut * m.price_out / 1e6 * n; return { m, ci, co, t: ci + co }; }).sort((a, b) => a.t - b.t);
    $('#cres').innerHTML = rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Модель</th><th class="r">Вход</th><th class="r">Выход</th><th class="r">Итого${n > 1 ? ` за ${nf(n)} запр.` : ''}</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td><span class="mono">${esc(r.m.id)}</span> ${i === 0 ? '<span class="badge ok">дешевле всех</span>' : ''} ${r.m.popular ? '<span class="dim small">популярная</span>' : ''}${calcIn + calcOut > r.m.context_length ? ' <span class="badge err" title="Текст не поместится в контекст модели">не влезет</span>' : ''}</td><td class="r num muted">${rub(r.ci)}</td><td class="r num muted">${rub(r.co)}</td><td class="r num"><b>${rub(r.t)}</b></td></tr>`).join('')}</tbody></table></div>` : empty('box', 'Нет чат-моделей'); };
  el.innerHTML = pageHead('Модели и цены', `${ms.length} моделей · цены в ₽ за 1 млн токенов`) + `<div class="tabs"><button data-tab="cat" class="${tab === 'cat' ? 'on' : ''}">Каталог</button><button data-tab="calc" class="${tab === 'calc' ? 'on' : ''}">Калькулятор стоимости</button></div>
    <div id="tcat" ${tab === 'cat' ? '' : 'hidden'}><div class="row wrap mb"><input class="inp" id="mq" placeholder="Поиск модели…" style="max-width:280px"><select class="inp" id="mf" style="max-width:200px"><option value="">Все провайдеры</option>${fams.map(f => `<option>${esc(f)}</option>`).join('')}</select>
      <select class="inp" id="ms" style="max-width:200px"><option value="popular">Сначала популярные</option><option value="cheap">Сначала дешёвые</option><option value="exp">Сначала дорогие</option><option value="ctx">Больше контекст</option><option value="name">По названию</option></select>
      <label class="chk small"><input type="checkbox" id="fv">Картинки</label><label class="chk small"><input type="checkbox" id="ft">Функции</label><span class="small dim grow r" id="mcount"></span></div><div class="grid gauto" id="ml"></div><div class="cmpbar" id="cmpbar" hidden></div></div>
    <div id="tcalc" ${tab === 'calc' ? '' : 'hidden'}><div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1.4fr)"><div class="card col"><div class="field"><label>Текст запроса</label><textarea class="inp" id="ct" style="min-height:180px;font-family:var(--font)" placeholder="Вставьте промт, документ или переписку…"></textarea></div>
      <div class="grid g3"><div class="field"><label>Токены на входе</label><input class="inp" id="cin" type="number" min="0" value="0"><div class="hint">Считается из текста ≈, можно ввести вручную</div></div><div class="field"><label>Длина ответа, токенов</label><input class="inp" id="cout" type="number" min="0" value="500"></div><div class="field"><label>Количество запросов</label><input class="inp" id="cn" type="number" min="1" value="1"></div></div>
      <div class="alert small">Оценка приблизительная: 1 токен ≈ 3 символа. Точную стоимость каждого запроса видно в «Истории запросов».</div></div><div id="cres"></div></div></div>`;
  $$('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; $$('[data-tab]').forEach(x => x.classList.toggle('on', x === b)); $('#tcat').hidden = tab !== 'cat'; $('#tcalc').hidden = tab !== 'calc'; });
  $('#mq').oninput = e => { F.q = e.target.value.toLowerCase().trim(); drawCat(); }; $('#mf').onchange = e => { F.fam = e.target.value; drawCat(); }; $('#ms').onchange = e => { F.sort = e.target.value; drawCat(); };
  $('#fv').onchange = e => { F.vision = e.target.checked; drawCat(); }; $('#ft').onchange = e => { F.tools = e.target.checked; drawCat(); };
  $('#ct').oninput = e => { calcText = e.target.value; calcIn = estTok(calcText); $('#cin').value = calcIn; drawCalc(); };
  $('#cin').oninput = e => { calcIn = Math.max(0, +e.target.value || 0); drawCalc(); }; $('#cout').oninput = e => { calcOut = Math.max(0, +e.target.value || 0); drawCalc(); }; $('#cn').oninput = e => { calcN = e.target.value; drawCalc(); };
  drawCat(); drawCalc();
}, { auth: true, title: 'Модели и цены' });

route('/billing', async (el, p, q) => {
  el.innerHTML = skel(2, 160);
  const [methods, pays, txs] = await Promise.all([api('/api/pay/methods'), api('/api/me/payments'), api('/api/me/transactions')]);
  await refreshMe(); let m = methods[0], amount = m?.presets?.[1] || 0;
  el.innerHTML = pageHead('Баланс', 'Пополнение и история операций') + `<div class="grid g2"><div class="card"><div class="l muted small">Текущий баланс</div><div style="font-size:36px;font-weight:600;letter-spacing:-.03em" class="num">${rub(S.user.balance)}</div></div>
    <div class="card" id="topup">${methods.length ? '' : empty('card', 'Оплата пока не настроена', 'Свяжитесь с поддержкой для пополнения')}</div></div>
    <div class="tabs mt2"><button class="on" data-t="p">Платежи</button><button data-t="t">Операции</button></div><div id="hist"></div>`;
  const drawTop = () => { if (!methods.length) return;
    const usdv = m.currency === 'RUB' ? amount / m.rate : amount, tiers = S.cfg.topup_bonus || [];
    const pct = tiers.reduce((p, [a, x]) => usdv >= a ? x : p, 0), bon = usdv * pct / 100, nextT = tiers.find(([a]) => usdv < a);
    const tierHint = tiers.length ? `<div class="alert info ico small mt">${ic('gift')}<span>Бонус к пополнению: ${tiers.map(([a, x]) => `от ${m.currency === 'RUB' ? rub(a, 0) : '$' + a} <b>+${x}%</b>`).join(', ')}${nextT ? ` · до +${nextT[1]}% не хватает ${m.currency === 'RUB' ? nf(Math.ceil((nextT[0] - usdv) * m.rate)) + ' ₽' : money(nextT[0] - usdv, 2)}` : ''}</span></div>` : '';
    $('#topup').innerHTML = `<h3>Пополнить баланс</h3><div class="field mt"><label>Способ оплаты</label><div class="grid g2">${methods.map(x => `<div class="preset ${x.id === m.id ? 'on' : ''}" data-m="${x.id}">${ic(x.id === 'cryptobot' ? 'globe' : 'card')}${esc(x.title)}</div>`).join('')}</div></div>
      <div class="field mt"><label>Сумма, ${m.currency === 'RUB' ? '₽' : '$'}</label><div class="row wrap">${m.presets.map(a => `<button class="btn amount-btn ${a == amount ? 'on' : ''}" data-a="${a}">${m.currency === 'RUB' ? nf(a) + ' ₽' : '$' + a}</button>`).join('')}</div>
      <input class="inp mt" id="amt" type="number" min="${m.min}" step="any" value="${amount}"><div class="hint">Минимум ${m.currency === 'RUB' ? nf(m.min) + ' ₽' : '$' + m.min}${m.currency === 'RUB' ? '' : ` · $1 = ${rub(1)} на балансе`}</div></div>
      ${tierHint}<div class="row between mt"><span class="muted">Будет зачислено: <b class="num" style="color:var(--tx)">${rub(usdv + bon)}</b>${bon ? ` <span class="ok small">(в т. ч. бонус +${pct}%: ${rub(bon)})</span>` : ''}</span><button class="btn pri" id="pay">Перейти к оплате</button></div>`;
    $$('[data-m]').forEach(b => b.onclick = () => { m = methods.find(x => x.id === b.dataset.m); amount = m.presets[1]; drawTop(); });
    $$('[data-a]').forEach(b => b.onclick = () => { amount = +b.dataset.a; drawTop(); });
    $('#amt').onchange = e => { amount = +e.target.value; drawTop(); };
    $('#pay').onclick = e => busy(e.currentTarget, async () => { const r = await api('/api/pay/create', { body: { method: m.id, amount } });
      window.open(r.pay_url, '_blank'); waitPay(r.payment_id, r.pay_url); }); };
  const drawHist = t => { $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    $('#hist').innerHTML = t === 'p' ? (pays.length ? `<div class="tbl-wrap"><table><thead><tr><th>Дата</th><th>Способ</th><th class="r">Сумма</th><th class="r">Зачислено</th><th>Статус</th><th></th></tr></thead><tbody>${pays.map(x => `<tr><td>${dt(x.created_at)}</td><td>${x.method === 'cryptobot' ? 'CryptoBot' : 'Platega'}</td><td class="r num">${x.currency === 'RUB' ? nf(x.amount) + ' ₽' : '$' + x.amount}</td><td class="r num">${rub(x.amount_usd)}</td><td>${payBadge(x.status)}</td><td class="r">${x.status === 'pending' ? `<a class="btn sm" href="${esc(x.pay_url)}" target="_blank">Оплатить</a> <button class="btn sm" data-chk="${x.id}">Проверить</button>` : x.status === 'paid' ? `<button class="btn sm" data-rc="${x.id}">${ic('receipt')}Квитанция PDF</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${empty('card', 'Платежей пока нет')}</div>`)
      : (txs.length ? `<div class="tbl-wrap"><table><thead><tr><th>Дата</th><th>Тип</th><th>Описание</th><th class="r">Сумма</th></tr></thead><tbody>${txs.map(x => `<tr><td>${dt(x.created_at)}</td><td><span class="badge">${esc(x.type)}</span></td><td class="muted">${esc(x.description)}</td><td class="r num ${x.amount > 0 ? 'ok' : 'err'}">${x.amount > 0 ? '+' : ''}${rub(x.amount)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${empty('receipt', 'Операций пока нет')}</div>`);
    $$('[data-rc]').forEach(b => b.onclick = () => busy(b, () => download(`/api/me/payments/${b.dataset.rc}/receipt.pdf`, 'receipt.pdf')));
    $$('[data-chk]').forEach(b => b.onclick = () => busy(b, async () => { const r = await api(`/api/pay/${b.dataset.chk}/check`); toast(r.status === 'paid' ? 'Платёж зачислен!' : r.status === 'pending' ? 'Оплата ещё не поступила' : 'Платёж отменён', r.status === 'paid' ? 'ok' : 'err'); if (r.status !== 'pending') render(); })); };
  $$('.tabs button').forEach(b => b.onclick = () => drawHist(b.dataset.t)); drawTop(); drawHist('p');
  if (q.payment) waitPay(q.payment);
}, { auth: true, title: 'Баланс' });

function waitPay(id, url) {
  const m = modal('Ожидаем оплату', `<div style="text-align:center;padding:10px 0"><div class="spin" style="width:32px;height:32px;margin:0 auto;border:3px solid var(--accent);border-right-color:transparent;border-radius:50%;animation:sp .8s linear infinite"></div><p class="muted mt">Завершите оплату в открывшейся вкладке. Баланс пополнится автоматически.</p>${url ? `<a class="btn" href="${esc(url)}" target="_blank">${ic('ext')}Открыть страницу оплаты</a>` : ''}</div>`);
  let n = 0; const tick = async () => { if (!document.body.contains(m) || n++ > 120) return;
    try { const r = await api(`/api/pay/${id}/check`); if (r.status === 'paid') { m.close(); toast('Баланс пополнен!'); history.replaceState(null, '', '#/billing'); render(); return; }
      if (r.status === 'canceled') { m.close(); toast('Платёж отменён', 'err'); history.replaceState(null, '', '#/billing'); return; } } catch {}
    setTimeout(tick, 5000); }; setTimeout(tick, 3000);
}

route('/logs', async (el) => {
  let off = 0; const load = async () => { const logs = await api(`/api/me/logs?limit=50&offset=${off}`);
    el.innerHTML = pageHead('История запросов', 'Каждый запрос к API и его стоимость') + (logs.length || off ? `<div class="tbl-wrap"><table class="compact"><thead><tr><th>Время</th><th>Модель</th><th>Endpoint</th><th class="r">Вход</th><th class="r">Выход</th><th class="r">Стоимость</th><th class="r">Задержка</th><th>Статус</th></tr></thead><tbody>${logs.map(l => `<tr><td class="muted">${dt(l.created_at)}</td><td class="mono">${esc(l.model)}</td><td class="small muted">${esc(l.endpoint)}${l.stream ? ' · stream' : ''}</td><td class="r num">${nf(l.prompt_tokens)}${l.cached_tokens ? `<div class="small dim">из кеша ${nf(l.cached_tokens)}</div>` : ''}</td><td class="r num">${nf(l.completion_tokens)}</td><td class="r num">${rub(l.price)}</td><td class="r num muted">${(l.latency_ms / 1000).toFixed(2)}s</td><td title="${esc(l.error || '')}">${statusBadge(l.status_code)}${l.error ? ` <span class="small muted">${esc(l.error)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>
      <div class="row mt"><button class="btn sm" id="pv" ${off ? '' : 'disabled'}>← Назад</button><button class="btn sm" id="nx" ${logs.length < 50 ? 'disabled' : ''}>Далее →</button></div>` : `<div class="card">${empty('list', 'Запросов пока нет', 'Здесь появится история обращений к API')}</div>`);
    const pv = $('#pv'), nx = $('#nx'); if (pv) { pv.onclick = () => { off -= 50; load(); }; nx.onclick = () => { off += 50; load(); }; } };
  el.innerHTML = skel(1, 300); load().catch(fail);
}, { auth: true, title: 'История запросов' });

route('/docs', async (el) => {
  const base = location.origin + '/v1';
  const ex = { curl: `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer sk-gw-..." \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "gpt-4o-mini",\n    "messages": [{"role": "user", "content": "Привет!"}],\n    "stream": false\n  }'`,
    python: `from openai import OpenAI\n\nclient = OpenAI(\n    base_url="${base}",\n    api_key="sk-gw-...",\n)\n\nstream = client.chat.completions.create(\n    model="claude-sonnet-4-5",\n    messages=[{"role": "user", "content": "Напиши хайку"}],\n    stream=True,\n)\nfor chunk in stream:\n    print(chunk.choices[0].delta.content or "", end="")`,
    js: `import OpenAI from "openai";\n\nconst client = new OpenAI({\n  baseURL: "${base}",\n  apiKey: "sk-gw-...",\n});\n\nconst r = await client.chat.completions.create({\n  model: "gpt-4o",\n  messages: [{ role: "user", content: "Привет!" }],\n});\nconsole.log(r.choices[0].message.content);`,
    anthropic: `import anthropic\n\nclient = anthropic.Anthropic(\n    base_url="${location.origin}",\n    api_key="sk-gw-...",\n)\nmsg = client.messages.create(\n    model="claude-sonnet-4-5",\n    max_tokens=1024,\n    messages=[{"role": "user", "content": "Привет!"}],\n)\nprint(msg.content[0].text)` };
  const cms = (await api('/api/public/models').catch(() => [])).filter(m => m.kind === 'chat'); let app = 'claude', im = cms[0]?.id || 'gpt-4o-mini', ik = '';
  el.innerHTML = pageHead('Документация', 'API совместим с OpenAI и Anthropic') + `<div class="grid" style="grid-template-columns:220px minmax(0,1fr)"><div class="card" style="height:fit-content;position:sticky;top:76px"><div class="col small"><a href="#/docs" data-s="s1">Быстрый старт</a><a href="#/docs" data-s="s2">Эндпоинты</a><a href="#/docs" data-s="s3">Ошибки</a><a href="#/docs" data-s="s4">Готовые настройки</a></div></div><div class="col">
    <div class="card" id="s1"><h3>Быстрый старт</h3><p class="muted">Base URL: <span class="mono">${base}</span> ${copyBtn(base)}</p><div class="pills mb" id="lt">${Object.keys(ex).map((k, i) => `<button class="${i ? '' : 'on'}" data-l="${k}">${{ curl: 'curl', python: 'Python', js: 'JavaScript', anthropic: 'Anthropic SDK' }[k]}</button>`).join('')}</div><div id="lc">${codeBlock(ex.curl)}</div></div>
    <div class="card" id="s2"><h3>Эндпоинты</h3><div class="tbl-wrap mt"><table><tbody>${[['POST', '/v1/chat/completions', 'Чат (OpenAI-формат), поддерживает stream, tools, vision'], ['POST', '/v1/responses', 'OpenAI Responses API: на нём работает Codex CLI'], ['POST', '/v1/messages', 'Anthropic Messages API (для моделей Claude)'], ['POST', '/v1/messages/count_tokens', 'Подсчёт токенов запроса без списания (Claude Code)'], ['POST', '/v1/embeddings', 'Эмбеддинги'], ['GET', '/v1/models', 'Список доступных моделей'], ['GET', '/v1/balance', 'Баланс и расход ключа']].map(([m, p, d]) => `<tr><td><span class="badge ${m === 'GET' ? 'ok' : 'info'}">${m}</span></td><td class="mono">${p}</td><td class="muted">${d}</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted mt">Заголовки ответа: <span class="mono">X-Request-ID</span> — ID запроса для поддержки, <span class="mono">X-Cost</span> — стоимость запроса в USD.</p></div>
    <div class="card" id="s3"><h3>Ошибки</h3><div class="tbl-wrap mt"><table><tbody>${[[401, 'Неверный или отключённый ключ'], [402, 'Недостаточно средств или исчерпан лимит ключа'], [404, 'Модель не найдена'], [429, 'Превышен лимит запросов в минуту'], [400, 'Ошибка в запросе: в тексте ошибки написано, что исправить'], [502, 'Провайдер временно недоступен — повторите запрос'], [503, 'Модель временно недоступна']].map(([c, d]) => `<tr><td>${statusBadge(c)}</td><td class="muted">${d}</td></tr>`).join('')}</tbody></table></div><p class="small muted mt">Все ошибки приходят в формате OpenAI: <span class="mono">{"error": {"message": "...", "code": "..."}}</span>. В message — понятное описание на русском и, если нужно, ссылка на нужный раздел кабинета.</p></div>
    <div class="card" id="s4"><h3>Готовые настройки для программ</h3><p class="muted">Base URL и модель уже подставлены. Можно вставить свой ключ: он нужен только для подстановки в примеры и никуда не отправляется.</p>
      <div class="grid g2 mb"><div class="field"><label>Модель</label><select class="inp" id="im">${cms.map(m => `<option>${esc(m.id)}</option>`).join('')}</select></div><div class="field"><label>Ваш API-ключ (необязательно)</label><input class="inp mono" id="ik" placeholder="sk-gw-..." autocomplete="off"></div></div>
      <div class="pills mb" id="it" style="flex-wrap:wrap"></div><div id="ib"></div></div></div></div>`;
  const drawI = () => { const all = integrations(base, location.origin, im, ik || 'sk-gw-...', S.cfg.site_name || 'Gateway', cms.map(x => x.id));
    $('#it').innerHTML = Object.entries(all).map(([k, v]) => `<button class="${k === app ? 'on' : ''}" data-app="${k}">${v.name}</button>`).join(''); $('#ib').innerHTML = all[app].html;
    $$('[data-app]').forEach(b => b.onclick = () => { app = b.dataset.app; drawI(); }); };
  $('#im').onchange = e => { im = e.target.value; drawI(); }; $('#ik').oninput = e => { ik = e.target.value.trim(); drawI(); }; drawI();
  $$('#lt button').forEach(b => b.onclick = () => { $$('#lt button').forEach(x => x.classList.toggle('on', x === b)); $('#lc').innerHTML = codeBlock(ex[b.dataset.l]); });
  $$('[data-s]').forEach(a => a.onclick = e => { e.preventDefault(); $('#' + a.dataset.s).scrollIntoView({ behavior: 'smooth' }); });
}, { auth: true, title: 'Документация' });

route('/playground', async (el) => {
  const ms = (await api('/api/public/models')).filter(m => m.kind === 'chat');
  if (!ms.length) { el.innerHTML = pageHead('Playground') + `<div class="card">${empty('chat', 'Нет доступных моделей')}</div>`; return; }
  const LS = 'pg_chats', mById = id => ms.find(m => m.id === id);
  let chats = []; try { chats = JSON.parse(localStorage.getItem(LS) || '[]'); } catch {}
  const save = () => { chats = chats.slice(0, 30); try { localStorage.setItem(LS, JSON.stringify(chats)); } catch {
    chats.forEach(c => [c.a, c.b].forEach(h => h.forEach(x => { if (x.imgs?.length) { x.lost = (x.lost || 0) + x.imgs.length; x.imgs = []; } })));
    try { localStorage.setItem(LS, JSON.stringify(chats)); } catch {} } };
  const newChat = () => ({ id: Date.now().toString(36), title: 'Новый чат', model: ms[0].id, model2: (ms[1] || ms[0]).id, compare: false, system: '', temp: 0.7, max: 1024, a: [], b: [], ts: Date.now() });
  let cur = chats[0] || newChat(), pending = [], ctrl = null;
  if (!chats.length) chats.unshift(cur);
  el.innerHTML = pageHead('Playground', 'Проверьте модели прямо в браузере. Запросы списываются с баланса') + `<div class="pg"><div class="card col pg-list"><button class="btn sm pri" id="pnew">${ic('plus')}Новый чат</button><div class="col" id="plist" style="gap:2px"></div></div>
    <div class="card col pg-main"><div class="pg-cols" id="pcols"></div><div class="row wrap" id="pimgs"></div>
    <form class="row" id="cf"><label class="btn icon" title="Прикрепить картинку" style="height:44px">${ic('img')}<input type="file" id="pf" accept="image/*" multiple hidden></label><textarea class="inp grow" id="ci" style="min-height:44px;height:44px;font-family:var(--font);font-size:14px" placeholder="Сообщение… (Enter — отправить, Shift+Enter — новая строка)"></textarea><button class="btn pri" id="psend" style="height:44px">Отправить</button></form></div>
    <div class="card col pg-set"><div class="field"><label>API-ключ</label><input class="inp mono" id="pk" type="password" value="${esc(localStorage.getItem('pg_key') || '')}" placeholder="sk-gw-..."><div class="hint">Хранится только в вашем браузере</div></div>
    <div class="field"><label>Модель</label><select class="inp" id="pm"></select></div>
    <label class="chk small"><input type="checkbox" id="pcmp">Сравнить с другой моделью</label><div class="field" id="pm2w"><label>Вторая модель</label><select class="inp" id="pm2"></select></div>
    <div class="field"><label>System prompt</label><textarea class="inp" id="ps" style="font-family:var(--font);min-height:80px" placeholder="Например: Ты — вежливый помощник. Отвечай кратко."></textarea></div>
    <div class="field"><label>Temperature: <span id="tv"></span></label><input type="range" id="pt" min="0" max="2" step="0.1"></div>
    <div class="field"><label>Max tokens</label><input class="inp" id="pmax" type="number"></div><button class="btn sm" id="pclr">Очистить чат</button></div></div>`;
  const opts = sel => ms.map(m => `<option value="${esc(m.id)}" ${m.id === sel ? 'selected' : ''}>${esc(m.id)}${m.vision ? ' (изображения)' : ''}</option>`).join('');
  const msgHtml = x => x.role === 'user' ? `<div class="msg user">${esc(x.text)}${x.imgs?.length ? `<div class="row wrap" style="margin-top:6px">${x.imgs.map(u => `<img class="pg-thumb" src="${u}">`).join('')}</div>` : ''}${x.lost ? `<div class="small" style="opacity:.8">${x.lost} изобр. (не сохранено в истории)</div>` : ''}</div>`
    : `<div class="msg assistant ${x.err ? 'err' : ''}">${x.err ? linkify(x.text) : esc(x.text)}${x.cost ? `<div class="small dim" style="margin-top:6px">${x.cost}</div>` : ''}</div>`;
  const col = (h, model, k) => `<div class="col grow" style="min-width:0">${cur.compare ? `<div class="small muted mono">${esc(model)}</div>` : ''}<div class="chat-log" id="cl${k}">${h.length ? h.map(msgHtml).join('') : empty('chat', 'Начните диалог', 'Выберите модель справа и напишите сообщение')}</div></div>`;
  const drawList = () => { $('#plist').innerHTML = chats.map(c => `<div class="pg-item ${c.id === cur.id ? 'on' : ''}" data-c="${c.id}"><span class="grow">${esc(c.title)}</span><button class="btn sm icon ghost" data-dc="${c.id}" title="Удалить">${ic('trash')}</button></div>`).join('');
    $$('[data-c]').forEach(d => d.onclick = e => { if (e.target.closest('[data-dc]') || ctrl) return; cur = chats.find(c => c.id === d.dataset.c); drawAll(); });
    $$('[data-dc]').forEach(b => b.onclick = () => { if (ctrl) return; chats = chats.filter(c => c.id !== b.dataset.dc); if (!chats.length) chats.push(newChat()); if (cur.id === b.dataset.dc) cur = chats[0]; save(); drawAll(); }); };
  const drawChat = () => { $('#pcols').innerHTML = col(cur.a, cur.model, 'a') + (cur.compare ? col(cur.b, cur.model2, 'b') : ''); $$('.chat-log').forEach(c => c.scrollTop = 1e9); };
  const drawImgs = () => { $('#pimgs').innerHTML = pending.map((u, i) => `<div class="pg-pend"><img class="pg-thumb" src="${u}"><button type="button" data-ri="${i}">×</button></div>`).join(''); $$('[data-ri]').forEach(b => b.onclick = () => { pending.splice(+b.dataset.ri, 1); drawImgs(); }); };
  const drawAll = () => { $('#pm').innerHTML = opts(cur.model); $('#pm2').innerHTML = opts(cur.model2); $('#pcmp').checked = cur.compare; $('#pm2w').hidden = !cur.compare;
    $('#ps').value = cur.system; $('#pt').value = cur.temp; $('#tv').textContent = cur.temp; $('#pmax').value = cur.max; drawList(); drawChat(); };
  const upd = (k, v) => { cur[k] = v; save(); };
  $('#pm').onchange = e => upd('model', e.target.value); $('#pm2').onchange = e => { upd('model2', e.target.value); drawChat(); };
  $('#pcmp').onchange = e => { if (e.target.checked && !cur.b.length) cur.b = cur.a.filter(x => x.role === 'user').length ? JSON.parse(JSON.stringify(cur.a)) : []; upd('compare', e.target.checked); $('#pm2w').hidden = !cur.compare; drawChat(); };
  $('#ps').onchange = e => upd('system', e.target.value); $('#pt').oninput = e => { $('#tv').textContent = e.target.value; upd('temp', +e.target.value); }; $('#pmax').onchange = e => upd('max', +e.target.value || 1024);
  $('#pk').onchange = e => localStorage.setItem('pg_key', e.target.value.trim());
  $('#pnew').onclick = () => { if (ctrl) return; cur = { ...newChat(), model: cur.model, model2: cur.model2, compare: cur.compare, system: cur.system }; chats.unshift(cur); save(); drawAll(); };
  $('#pclr').onclick = () => { if (ctrl) return; cur.a = []; cur.b = []; save(); drawChat(); };
  $('#pf').onchange = async e => { for (const f of e.target.files) { if (pending.length >= 4) { toast('Не больше 4 картинок в сообщении', 'err'); break; } try { pending.push(await shrinkImage(f)); } catch (err) { fail(err); } } e.target.value = ''; drawImgs(); };
  $('#ci').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!ctrl) $('#cf').requestSubmit(); } };
  const toApi = h => h.filter(x => !x.err).map(x => x.role === 'user' && x.imgs?.length ? { role: 'user', content: [{ type: 'text', text: x.text }, ...x.imgs.map(u => ({ type: 'image_url', image_url: { url: u } }))] } : { role: x.role, content: x.text });
  async function run(h, model, k, key) {
    const out = h[h.length - 1], box = $('#cl' + k).lastElementChild; box.textContent = '…';
    const msgs = cur.system.trim() ? [{ role: 'system', content: cur.system.trim() }, ...toApi(h.slice(0, -1))] : toApi(h.slice(0, -1)); let usage = null;
    try { const r = await fetch('/v1/chat/completions', { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify({ model, messages: msgs, stream: true, stream_options: { include_usage: true }, temperature: cur.temp, max_tokens: cur.max }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error?.message || 'Ошибка ' + r.status); }
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      while (true) { const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop();
        for (const ln of lines) { if (!ln.startsWith('data:')) continue; const d = ln.slice(5).trim(); if (d === '[DONE]') continue; try { const j = JSON.parse(d); if (j.usage) usage = j.usage; const c = j.choices?.[0]?.delta?.content; if (c) { out.text += c; box.textContent = out.text; box.parentElement.scrollTop = 1e9; } } catch {} } }
      const m = mById(model); if (usage && m) out.cost = `${nf(usage.prompt_tokens)} → ${nf(usage.completion_tokens)} токенов · ≈ ${rub((usage.prompt_tokens * m.price_in + usage.completion_tokens * m.price_out) / 1e6, 4)}`;
    } catch (err) { if (err.name === 'AbortError') { out.cost = 'Остановлено'; } else { out.err = true; out.text = err.message; } }
    if (!out.text && !out.err) out.text = '(пустой ответ)';
  }
  $('#cf').onsubmit = async e => { e.preventDefault();
    if (ctrl) { ctrl.abort(); return; }
    const text = $('#ci').value.trim(), key = $('#pk').value.trim(); if (!text && !pending.length) return; if (!key) return toast('Укажите API-ключ (раздел «API-ключи»)', 'err');
    const models = cur.compare ? [cur.model, cur.model2] : [cur.model];
    if (pending.length) { const nv = models.filter(id => !mById(id)?.vision); if (nv.length) return toast(`Модель ${nv.join(', ')} не принимает картинки. Выберите модель с пометкой «изображения»`, 'err'); }
    const um = { role: 'user', text, imgs: pending.slice() }; cur.a.push(um); if (cur.compare) cur.b.push(JSON.parse(JSON.stringify(um)));
    if (cur.title === 'Новый чат') cur.title = (text || 'Картинка').slice(0, 40); cur.ts = Date.now();
    chats = [cur, ...chats.filter(c => c.id !== cur.id)]; $('#ci').value = ''; pending = []; drawImgs(); drawList();
    ctrl = new AbortController(); const btn = $('#psend'); btn.textContent = 'Стоп'; btn.classList.remove('pri');
    cur.a.push({ role: 'assistant', text: '' }); if (cur.compare) cur.b.push({ role: 'assistant', text: '' }); drawChat();
    try { await Promise.all([run(cur.a, cur.model, 'a', key), cur.compare ? run(cur.b, cur.model2, 'b', key) : null]); }
    finally { ctrl = null; btn.textContent = 'Отправить'; btn.classList.add('pri'); save(); drawChat(); refreshMe(); } };
  drawAll();
}, { auth: true, title: 'Playground' });

function shrinkImage(f) {
  return new Promise((res, rej) => { if (!f.type.startsWith('image/')) return rej(new Error('Можно прикреплять только изображения'));
    const img = new Image(); img.onload = () => { const k = Math.min(1, 1568 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', 0.85)); };
    img.onerror = () => rej(new Error('Не удалось открыть изображение ' + f.name)); img.src = URL.createObjectURL(f); });
}

route('/usage', async (el, p, q) => {
  const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  let from = q.from || day(29), to = q.to || day(0);
  const load = async () => {
    el.querySelector('#ures') && ($('#ures').style.opacity = .5);
    const st = await api(`/api/me/usage?date_from=${from}&date_to=${to}`); if (!el.isConnected) return; const map = Object.fromEntries(st.daily.map(d => [d.date, d])), days = [];
    for (let t = new Date(from + 'T00:00:00Z'); t <= new Date(to + 'T00:00:00Z'); t = new Date(+t + 864e5)) { const d = t.toISOString().slice(0, 10); days.push(map[d] || { date: d, requests: 0, revenue: 0, tokens: 0 }); }
    const T = st.totals, preset = [7, 30, 90].find(n => from === day(n - 1) && to === day(0));
    el.innerHTML = pageHead('Расходы', 'Статистика по ключам и моделям за выбранный период', `<button class="btn" id="ucsv">${ic('down')}Скачать CSV</button>`) +
      `<div class="row wrap mb"><div class="pills">${[7, 30, 90].map(n => `<button class="${preset === n ? 'on' : ''}" data-pr="${n}">${n} дней</button>`).join('')}</div>
      <span class="small muted">с</span><input class="inp" type="date" id="uf" value="${from}" max="${day(0)}" style="width:160px"><span class="small muted">по</span><input class="inp" type="date" id="ut" value="${to}" max="${day(0)}" style="width:160px"></div>
      <div id="ures"><div class="grid g4"><div class="card kpi"><div class="l">Потрачено</div><div class="v">${rub(T.revenue, 2)}</div></div><div class="card kpi"><div class="l">Запросов</div><div class="v">${nf(T.requests)}</div><div class="d muted">ошибок: ${nf(T.errors)}</div></div>
      <div class="card kpi"><div class="l">Токены</div><div class="v">${tok(T.prompt_tokens + T.completion_tokens)}</div><div class="d muted">вход ${tok(T.prompt_tokens)} · выход ${tok(T.completion_tokens)}</div></div><div class="card kpi"><div class="l">Средняя задержка</div><div class="v">${(T.avg_latency_ms / 1000).toFixed(2)} с</div></div></div>
      <div class="card mt"><div class="card-h"><h3>Расход по дням</h3>${legend([['₽', '#FF5B1F']])}</div>${areaChart(days.map(d => d.date), [{ name: 'Расход', color: '#FF5B1F', data: days.map(d => d.revenue * RATE()) }], { fmt: v => rubv(v) })}</div>
      <div class="grid g2 mt"><div class="card"><div class="card-h"><h3>По ключам</h3><a class="small" style="color:var(--link)" href="#/keys">Ключи →</a></div>${barList(st.by_key, r => r.revenue, r => r.name, r => `${rub(r.revenue)} · ${nf(r.requests)} запр.`)}</div>
      <div class="card"><div class="card-h"><h3>По моделям</h3></div>${barList(st.by_model, r => r.revenue, r => r.model, r => `${rub(r.revenue)} · ${nf(r.requests)} запр.`)}</div></div></div>`;
    $$('[data-pr]').forEach(b => b.onclick = () => { from = day(+b.dataset.pr - 1); to = day(0); load().catch(fail); });
    $('#uf').onchange = e => { if (e.target.value) { from = e.target.value; if (from > to) to = from; load().catch(fail); } };
    $('#ut').onchange = e => { if (e.target.value) { to = e.target.value; if (to < from) from = to; load().catch(fail); } };
    $('#ucsv').onclick = e => busy(e.currentTarget, () => download(`/api/me/usage.csv?date_from=${from}&date_to=${to}`, 'usage.csv'));
  };
  el.innerHTML = skel(4, 110); load().catch(fail);
}, { auth: true, title: 'Расходы' });

route('/account', async (el) => {
  el.innerHTML = pageHead('Настройки аккаунта') + `<div class="grid g2"><div class="card"><h3>Профиль</h3><div class="col mt"><div><div class="small dim">Email</div>${esc(S.user.email)}</div><div><div class="small dim">Зарегистрирован</div>${dt(S.user.created_at)}</div></div></div>
    ${S.user.has_password ? `<div class="card"><h3>Смена пароля</h3><form class="col mt" id="pw"><div class="field"><label>Текущий пароль</label><input class="inp" type="password" name="old_password" required></div><div class="field"><label>Новый пароль</label><input class="inp" type="password" name="new_password" minlength="8" required></div><button class="btn pri" style="align-self:flex-start">Сменить пароль</button></form></div>` : `<div class="card"><h3>Вход</h3><p class="muted mt">Вы входите через GitHub или Google — пароль не нужен.</p></div>`}</div>`;
  if ($('#pw')) $('#pw').onsubmit = e => { e.preventDefault(); busy(e.target.querySelector('button'), async () => { await api('/api/me/password', { body: Object.fromEntries(new FormData(e.target)) }); toast('Пароль изменён'); e.target.reset(); }); };
}, { auth: true, title: 'Настройки' });

// =====================================================================  ADMIN
const delta = (a, b) => { const p = pct(a, b); return `<span class="${p >= 0 ? 'ok' : 'err'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(1)}%</span> <span class="dim">к прошлому периоду</span>`; };
route('/admin', async (el, p, q) => {
  const days = +(q.days || 30);
  el.innerHTML = pageHead('Дашборд', 'Выручка, расходы и состояние провайдеров') + skel(6, 100);
  const st = await api('/api/admin/stats?days=' + days), t = st.totals, pv = st.prev, d = fillDays(st.daily, Math.min(days, 90));
  const margin = t.revenue ? t.profit / t.revenue * 100 : 0;
  el.innerHTML = pageHead('Дашборд', 'Выручка, расходы и состояние провайдеров', `<div class="pills">${[1, 7, 30, 90].map(n => `<button class="${n === days ? 'on' : ''}" onclick="location.hash='#/admin?days=${n}'">${n === 1 ? '24ч' : n + 'д'}</button>`).join('')}</div>`) +
    `<div class="grid g6">${[['Выручка', t.revenue, 'money', delta(t.revenue, pv.revenue)], ['Себестоимость', t.cost, 'money', delta(t.cost, pv.cost)], ['Прибыль', t.profit, 'money', delta(t.profit, pv.profit)], ['Маржа', margin, 'pct', '<span class="dim">прибыль / выручка</span>'], ['Запросы', t.requests, 'n', delta(t.requests, pv.requests)], ['Токены', t.prompt_tokens + t.completion_tokens, 'tok', delta(t.prompt_tokens + t.completion_tokens, pv.tokens)]]
      .map(([l, v, f, dd], i) => `<div class="card kpi"><span class="kpi-ic">${ic(['wallet', 'server', 'chart', 'pulse', 'list', 'layers'][i] || 'chart')}</span><div class="l">${l}</div><div class="v" data-count="${v}" data-fmt="${f}">0</div><div class="d">${dd}</div></div>`).join('')}</div>
    <div class="grid g4 mt">${[['Пользователи', nf(st.users_total), `+${st.users_new} за период`], ['Пополнения за период', money(st.payments_sum), ''], ['Балансы клиентов', money(st.balances_total), 'обязательства перед клиентами'], ['Ошибки', nf(t.errors), t.requests ? (t.errors / t.requests * 100).toFixed(2) + '% запросов' : '']].map(([l, v, s]) => `<div class="card kpi"><div class="l">${l}</div><div class="v" style="font-size:20px">${v}</div><div class="d dim">${s}</div></div>`).join('')}</div>
    <div class="grid mt" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr)"><div class="card"><div class="card-h"><h3>Выручка и прибыль</h3>${legend([['Выручка', '#FF5B1F'], ['Себестоимость', '#F59E0B'], ['Прибыль', '#22C55E']])}</div>${areaChart(d.map(x => x.date), [{ name: 'Выручка', color: '#FF5B1F', data: d.map(x => x.revenue) }, { name: 'Себестоимость', color: '#F59E0B', data: d.map(x => x.cost), fill: false }, { name: 'Прибыль', color: '#22C55E', data: d.map(x => x.revenue - x.cost), fill: false }], { fmt: v => money(v, 2) })}</div>
      <div class="card"><div class="card-h"><h3>Провайдеры</h3><a class="small" style="color:var(--link)" href="#/admin/providers">Все →</a></div>${st.providers.length ? st.providers.map(x => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--bd)"><div class="row">${plogo(x.preset, x.name, 1)}<span>${esc(x.name)}</span></div><div class="row small"><span class="muted">${x.keys_active}/${x.keys_total} ключей</span><span class="dot ${!x.is_enabled ? '' : x.status === 'ok' ? 'ok' : x.status === 'error' ? 'err' : 'warn'}"></span></div></div>`).join('') : empty('server', 'Нет провайдеров', '', '<a class="btn pri sm" href="#/admin/providers">Добавить</a>')}</div></div>
    <div class="grid g2 mt"><div class="card"><div class="card-h"><h3>Запросы по дням</h3></div>${areaChart(d.map(x => x.date), [{ name: 'Запросы', color: '#8A877E', data: d.map(x => x.requests) }], { h: 180, fmt: v => nf(Math.round(v)) })}</div>
      <div class="card"><div class="card-h"><h3>Топ моделей</h3></div>${barList(st.by_model, r => r.revenue, r => r.model, r => `${money(r.revenue)} · <span class="ok">${money(r.profit)}</span>`)}</div></div>
    <div class="grid g2 mt"><div class="card"><div class="card-h"><h3>Топ клиентов</h3></div>${st.top_users.length ? `<table class="compact"><thead><tr><th>Email</th><th class="r">Запросы</th><th class="r">Выручка</th><th class="r">Прибыль</th></tr></thead><tbody>${st.top_users.map(u => `<tr><td>${esc(u.email)}</td><td class="r num">${nf(u.requests)}</td><td class="r num">${money(u.revenue)}</td><td class="r num ok">${money(u.profit)}</td></tr>`).join('')}</tbody></table>` : empty('users', 'Нет данных')}</div>
      <div class="card"><div class="card-h"><h3>Провайдеры: нагрузка</h3></div>${st.by_provider.length ? `<table class="compact"><thead><tr><th>Провайдер</th><th class="r">Запросы</th><th class="r">Ошибки</th><th class="r">Ср. задержка</th></tr></thead><tbody>${st.by_provider.map(x => `<tr><td>${esc(x.provider)}</td><td class="r num">${nf(x.requests)}</td><td class="r num ${x.errors ? 'err' : ''}">${x.errors}</td><td class="r num">${(x.avg_latency_ms / 1000).toFixed(2)}s</td></tr>`).join('')}</tbody></table>` : empty('server', 'Нет данных')}</div></div>
    <div class="card mt"><div class="card-h"><h3>Последние ошибки</h3><a class="small" style="color:var(--link)" href="#/admin/logs?status=error">Все →</a></div>${st.recent_errors.length ? `<table class="compact"><tbody>${st.recent_errors.map(l => `<tr><td class="muted">${dt(l.created_at)}</td><td class="mono">${esc(l.model)}</td><td>${statusBadge(l.status_code)}</td><td class="small muted" style="white-space:normal;max-width:600px">${esc((l.error || '').slice(0, 200))}</td></tr>`).join('')}</tbody></table>` : empty('check', 'Ошибок нет')}</div>`;
  countUp(el);
}, { auth: true, admin: true, title: 'Дашборд' });

// ---------- providers
let PRESETS = null;
async function presets() { return PRESETS ||= await api('/api/admin/presets'); }
const TYPE_L = { openai: 'OpenAI', anthropic: 'Anthropic', openai_compatible: 'OpenAI-совместимый' };
const KEY_ST = { active: ['ok', 'Активен'], paused: ['warn', 'Пауза'], error: ['err', 'Ошибка'] };
route('/admin/providers', async (el) => {
  const load = async () => { const ps = await api('/api/admin/providers');
    el.innerHTML = pageHead('Провайдеры', 'Источники моделей: URL + API-ключи. Запросы распределяются по приоритету с автоматическим fallback', `<button class="btn pri" id="np">${ic('plus')}Добавить провайдера</button>`) +
      (ps.length ? `<div class="grid gauto">${ps.map(p => { const act = p.keys.filter(k => k.is_enabled && k.status === 'active').length;
        return `<div class="card hov"><div class="row between"><div class="row">${plogo(p.preset, p.name)}<div><b>${esc(p.name)}</b><div class="small muted">${TYPE_L[p.type]} · приоритет ${p.priority}</div></div></div>${sw(`data-en="${p.id}"`, p.is_enabled)}</div>
        <div class="mono small muted mt" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.base_url)}</div>
        <div class="row between mt"><div class="row small"><span class="dot ${p.status === 'ok' ? 'ok' : p.status === 'error' ? 'err' : 'warn'}"></span>${p.status === 'ok' ? 'Работает' : p.status === 'error' ? 'Ошибка' : 'Не проверен'}<span class="dim">· ${act}/${p.keys.length} ключей</span></div><span class="small dim">${p.last_check_at ? ago(p.last_check_at) : ''}</span></div>
        ${p.status === 'error' && p.last_error ? `<div class="alert small mt" style="max-height:60px;overflow:hidden;border-color:rgba(239,68,68,.3)">${esc(p.last_error.slice(0, 160))}</div>` : ''}
        <div class="row mt"><button class="btn sm" data-test="${p.id}">${ic('refresh')}Проверить</button><button class="btn sm" data-imp="${p.id}">${ic('layers')}Модели</button><button class="btn sm" data-open="${p.id}">${ic('edit')}Настроить</button></div></div>`; }).join('')}</div>`
        : `<div class="card">${empty('server', 'Провайдеров пока нет', 'Добавьте OpenAI, Anthropic или любой OpenAI-совместимый API — укажите URL и ключ', '<button class="btn pri" onclick="$(\'#np\').click()">Добавить провайдера</button>')}</div>`);
    $('#np').onclick = () => providerWizard(load);
    $$('[data-en]').forEach(i => i.onchange = () => api('/api/admin/providers/' + i.dataset.en, { method: 'PATCH', body: { is_enabled: i.checked } }).then(() => toast(i.checked ? 'Включён' : 'Выключен')).catch(fail));
    $$('[data-test]').forEach(b => b.onclick = () => busy(b, async () => { const r = await api(`/api/admin/providers/${b.dataset.test}/test`, { method: 'POST' }); r.ok ? toast(`Подключение работает · ${r.models} моделей`) : toast('Ошибка: ' + r.error, 'err'); load(); }));
    $$('[data-imp]').forEach(b => b.onclick = () => importModels(+b.dataset.imp, load));
    $$('[data-open]').forEach(b => b.onclick = () => providerDrawer(ps.find(p => p.id == b.dataset.open), load));
  };
  el.innerHTML = skel(3, 180); load().catch(fail);
}, { auth: true, admin: true, title: 'Провайдеры' });

async function providerWizard(done) {
  const pr = await presets(); let step = 0, sel = 'openai', created = null;
  const m = modal('Новый провайдер', '<div id="wz"></div>', { size: 'lg', foot: '<button class="btn" id="wb">Назад</button><button class="btn pri" id="wn">Далее</button>' });
  const draw = () => { const P = pr[sel]; $('#wb', m).style.visibility = step && step < 2 ? 'visible' : 'hidden';
    const steps = `<div class="steps">${[0, 1, 2, 3].map(i => `<div class="${i <= step ? 'on' : ''}"></div>`).join('')}</div>`;
    if (step === 0) { $('#wz', m).innerHTML = steps + `<h3>1. Выберите провайдера</h3><div class="grid g4 mt">${Object.entries(pr).map(([k, v]) => `<div class="preset ${k === sel ? 'on' : ''}" data-p="${k}">${plogo(k, v.name)}${esc(v.name)}</div>`).join('')}</div>`;
      $$('[data-p]', m).forEach(b => b.onclick = () => { sel = b.dataset.p; draw(); }); $('#wn', m).textContent = 'Далее'; }
    if (step === 1) { $('#wz', m).innerHTML = steps + `<h3>2. Подключение</h3><form class="col mt" id="wf"><div class="grid g2"><div class="field"><label>Название</label><input class="inp" name="name" value="${esc(P.name)}" required></div>
      <div class="field"><label>Тип API</label><select class="inp" name="type">${Object.entries(TYPE_L).map(([k, v]) => `<option value="${k}" ${k === P.type ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
      <div class="field"><label>Base URL</label><input class="inp mono" name="base_url" value="${esc(P.base_url)}" placeholder="https://api.example.com/v1" required><div class="hint">Адрес, к которому добавляется /chat/completions (обычно заканчивается на /v1)</div></div>
      <div class="field"><label>API-ключи</label><textarea class="inp" name="keys" placeholder="sk-...  (по одному на строку — будут ротироваться)" required></textarea><div class="hint">Ключи шифруются и никогда не показываются клиентам</div></div>
      <div class="grid g2"><div class="field"><label>Приоритет</label><input class="inp" type="number" name="priority" value="100"><div class="hint">Меньше — выше приоритет</div></div><div class="field"><label>Таймаут, сек</label><input class="inp" type="number" name="timeout" value="300"></div></div></form>`;
      $('#wn', m).textContent = 'Создать и проверить'; }
    if (step === 2) { $('#wz', m).innerHTML = steps + `<h3>3. Проверка подключения</h3><div style="text-align:center;padding:30px"><div class="spin" style="width:36px;height:36px;margin:0 auto;border:3px solid var(--accent);border-right-color:transparent;border-radius:50%;animation:sp .8s linear infinite"></div><p class="muted">Отправляем тестовый запрос…</p></div>`; $('#wn', m).disabled = true; }
  };
  $('#wb', m).onclick = () => { if (step > 0) { step--; draw(); } };
  $('#wn', m).onclick = async () => {
    if (step === 0) { step = 1; return draw(); }
    if (step === 1) { const f = $('#wf', m); if (!f.reportValidity()) return; const d = Object.fromEntries(new FormData(f));
      try { created = await api('/api/admin/providers', { body: { name: d.name, preset: sel, type: d.type, base_url: d.base_url, priority: +d.priority, timeout: +d.timeout, api_keys: d.keys.split('\n').map(s => s.trim()).filter(Boolean) } }); } catch (e) { return fail(e); }
      step = 2; draw(); const r = await api(`/api/admin/providers/${created.id}/test`, { method: 'POST' }).catch(e => ({ ok: false, error: e.message })); step = 3;
      $('#wz', m).innerHTML = `<div class="steps">${'<div class="on"></div>'.repeat(4)}</div>` + (r.ok ? `<div style="text-align:center;padding:24px"><div class="ic" style="width:52px;height:52px;margin:0 auto;border-radius:50%;background:rgba(34,197,94,.15);color:var(--ok);display:grid;place-items:center">${ic('check')}</div><h3 class="mt">Подключение работает</h3><p class="muted">Найдено моделей: ${r.models}. Импортируйте нужные в каталог.</p></div>`
        : `<div class="alert" style="border-color:rgba(239,68,68,.4)"><b class="err">Не удалось подключиться</b><div class="small mono mt" style="white-space:pre-wrap">${esc(r.error)}</div></div><p class="muted small">Провайдер сохранён — исправьте URL или ключ в настройках провайдера.</p>`);
      $('#wn', m).disabled = false; $('#wn', m).textContent = r.ok ? 'Импортировать модели' : 'Готово'; $('#wn', m).dataset.ok = r.ok ? '1' : ''; done(); return; }
    if (step === 3) { m.close(); if ($('#wn', m).dataset.ok) importModels(created.id, done); }
  };
  draw();
}

async function importModels(pid, done) {
  const m = modal('Импорт моделей', skel(1, 200), { size: 'lg', foot: '<span class="small muted grow" id="isel"></span><button class="btn" data-c>Отмена</button><button class="btn pri" id="ido">Импортировать</button>' });
  m.querySelector('[data-c]').onclick = m.close;
  let items; try { items = await api(`/api/admin/providers/${pid}/remote-models`); } catch (e) { $('.modal-b', m).innerHTML = `<div class="alert" style="border-color:rgba(239,68,68,.4)">${esc(e.message)}</div>`; return; }
  let q = '';
  const draw = () => { const list = items.filter(i => !q || i.id.toLowerCase().includes(q));
    $('.modal-b', m).innerHTML = `<div class="row mb"><input class="inp" id="iq" placeholder="Фильтр…" value="${esc(q)}"><button class="btn sm" id="iall">Выбрать с ценами</button></div><div class="alert info small mb">Модели с известной ценой включаются сразу (наценка по умолчанию). Остальные создаются выключенными — укажите себестоимость в разделе «Модели и цены». <b>Проверьте актуальность цен!</b></div>
      <div class="tbl-wrap" style="max-height:50vh"><table class="compact"><thead><tr><th></th><th>Модель</th><th class="r">Себест. вход / 1M</th><th class="r">Себест. выход / 1M</th><th></th></tr></thead><tbody>${list.map(i => `<tr><td><input type="checkbox" class="ick" value="${esc(i.id)}" ${i.imported ? 'disabled checked' : ''} ${i._s ? 'checked' : ''}></td><td class="mono">${esc(i.id)}</td><td class="r num">${i.cost_in != null ? money(i.cost_in, 4) : '<span class="dim">—</span>'}</td><td class="r num">${i.cost_out != null ? money(i.cost_out, 4) : '<span class="dim">—</span>'}</td><td>${i.imported ? '<span class="badge ok">в каталоге</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`;
    const cnt = () => $('#isel', m).textContent = 'Выбрано: ' + items.filter(i => i._s).length; cnt();
    $$('.ick', m).forEach(c => c.onchange = () => { items.find(i => i.id === c.value)._s = c.checked; cnt(); });
    $('#iq', m).oninput = e => { q = e.target.value.toLowerCase(); draw(); $('#iq', m).focus(); };
    $('#iall', m).onclick = () => { items.forEach(i => { if (!i.imported && i.cost_in != null) i._s = true; }); draw(); }; };
  draw();
  $('#ido', m).onclick = e => busy(e.currentTarget, async () => { const sel = items.filter(i => i._s).map(i => i.id); if (!sel.length) return toast('Ничего не выбрано', 'err');
    const r = await api(`/api/admin/providers/${pid}/import`, { body: { models: sel } }); toast(`Создано моделей: ${r.created}, привязано: ${r.linked}`); m.close(); done && done(); });
}

function providerDrawer(p, done) {
  const m = modal(esc(p.name), '', { drawer: true });
  const draw = (p) => { $('.modal-b', m).innerHTML = `<form class="col" id="pf"><div class="grid g2"><div class="field"><label>Название</label><input class="inp" name="name" value="${esc(p.name)}"></div><div class="field"><label>Тип API</label><select class="inp" name="type">${Object.entries(TYPE_L).map(([k, v]) => `<option value="${k}" ${k === p.type ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
      <div class="field"><label>Base URL</label><input class="inp mono" name="base_url" value="${esc(p.base_url)}"></div>
      <div class="grid g2"><div class="field"><label>Приоритет</label><input class="inp" type="number" name="priority" value="${p.priority}"></div><div class="field"><label>Таймаут, сек</label><input class="inp" type="number" name="timeout" value="${p.timeout}"></div></div>
      <div class="field"><label>Доп. заголовки (JSON)</label><textarea class="inp" name="extra_headers" style="min-height:60px">${esc(JSON.stringify(p.extra_headers || {}, null, 1))}</textarea></div>
      <div class="row"><button class="btn pri">Сохранить</button><button type="button" class="btn danger" id="pdel">${ic('trash')}Удалить провайдера</button></div></form>
      <div class="row between mt2"><h3>API-ключи</h3><button class="btn sm pri" id="kadd">${ic('plus')}Добавить ключ</button></div>
      <div class="col mt">${p.keys.length ? p.keys.map(k => `<div class="card" style="padding:12px"><div class="row between"><div><span class="mono">${esc(k.display)}</span> ${k.label ? `<span class="small muted">· ${esc(k.label)}</span>` : ''}</div><div class="row">${!k.is_enabled ? '<span class="badge">Выкл</span>' : `<span class="badge ${KEY_ST[k.status][0]}">${KEY_ST[k.status][1]}</span>`}${sw(`data-ken="${k.id}"`, k.is_enabled)}</div></div>
        <div class="small muted mt" style="margin-top:6px">Запросов: ${nf(k.uses)} · расход ${money(k.spent)} · ${ago(k.last_used_at)}</div>${k.last_error && k.status !== 'active' ? `<div class="small err mono" style="margin-top:6px;white-space:pre-wrap;max-height:60px;overflow:hidden">${esc(k.last_error.slice(0, 200))}</div>` : ''}
        <div class="row mt" style="margin-top:8px"><button class="btn sm" data-kt="${k.id}">Проверить</button>${k.status !== 'active' ? `<button class="btn sm" data-kr="${k.id}">Сбросить статус</button>` : ''}<button class="btn sm ghost" data-kd="${k.id}">${ic('trash')}</button></div></div>`).join('') : empty('key', 'Нет ключей')}</div>`;
    $('#pf', m).onsubmit = e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); let eh; try { eh = JSON.parse(d.extra_headers || '{}'); } catch { return toast('Некорректный JSON заголовков', 'err'); }
      busy(e.target.querySelector('.pri'), async () => { await api('/api/admin/providers/' + p.id, { method: 'PATCH', body: { ...d, priority: +d.priority, timeout: +d.timeout, extra_headers: eh } }); toast('Сохранено'); done(); }); };
    $('#pdel', m).onclick = async () => { if (await confirmBox(`Удалить провайдера «${esc(p.name)}»? Маршруты моделей через него будут удалены.`, { ok: 'Удалить' })) { await api('/api/admin/providers/' + p.id, { method: 'DELETE' }); toast('Удалён'); m.close(); done(); } };
    $('#kadd', m).onclick = async () => { const d = await promptBox('Новый ключ', [{ name: 'key', label: 'API-ключ', type: 'password' }, { name: 'label', label: 'Метка', placeholder: 'Например: аккаунт №2' }], 'Добавить'); if (d?.key) { await api(`/api/admin/providers/${p.id}/keys`, { body: d }).catch(fail); reload(); } };
    $$('[data-ken]', m).forEach(i => i.onchange = () => api('/api/admin/provider-keys/' + i.dataset.ken, { method: 'PATCH', body: { is_enabled: i.checked } }).then(reload).catch(fail));
    $$('[data-kr]', m).forEach(b => b.onclick = () => api('/api/admin/provider-keys/' + b.dataset.kr, { method: 'PATCH', body: { reset_status: true } }).then(reload).catch(fail));
    $$('[data-kd]', m).forEach(b => b.onclick = async () => { if (await confirmBox('Удалить ключ?', { ok: 'Удалить' })) api('/api/admin/provider-keys/' + b.dataset.kd, { method: 'DELETE' }).then(reload).catch(fail); });
    $$('[data-kt]', m).forEach(b => b.onclick = () => busy(b, async () => { const r = await api(`/api/admin/providers/${p.id}/test?key_id=${b.dataset.kt}`, { method: 'POST' }); r.ok ? toast('Ключ работает') : toast(r.error, 'err'); reload(); }));
  };
  const reload = async () => { const ps = await api('/api/admin/providers'); p = ps.find(x => x.id === p.id); if (p) draw(p); done(); };
  draw(p);
}

// ---------- models
route('/admin/models', async (el) => {
  let q = '', sel = new Set();
  const load = async () => { const [ms, ps, cfg] = await Promise.all([api('/api/admin/models'), api('/api/admin/providers'), api('/api/admin/settings')]);
    const mk = cfg.general.default_markup;
    const draw = () => { const list = ms.filter(m => !q || m.public_id.toLowerCase().includes(q));
      $('#mt').innerHTML = list.length ? `<div class="tbl-wrap"><table><thead><tr><th><input type="checkbox" id="mall"></th><th>Модель</th><th>Провайдеры</th><th class="r">Контекст</th><th class="r">Себест. in / out</th><th class="r">Продажа in / out</th><th class="r">Маржа</th><th>Возможности</th><th>Вкл</th><th></th></tr></thead><tbody>${list.map(m => { const mg = m.eff_price_in + m.eff_price_out ? ((m.eff_price_in + m.eff_price_out - m.cost_in - m.cost_out) / (m.eff_price_in + m.eff_price_out) * 100) : 0;
        return `<tr><td><input type="checkbox" class="msel" value="${m.id}" ${sel.has(m.id) ? 'checked' : ''}></td><td><b class="mono">${esc(m.public_id)}</b><div class="small dim">${esc(m.family)}${m.kind === 'embedding' ? ' · embedding' : ''}</div></td>
        <td>${m.routes.length ? `<div class="stack">${m.routes.map(r => plogo((ps.find(p => p.id === r.provider_id) || {}).preset, r.provider, 1)).join('')}</div>` : '<span class="badge err">нет маршрутов</span>'}</td><td class="r num">${tok(m.context_length)}</td>
        <td class="r num muted">${money(m.cost_in, 4)} / ${money(m.cost_out, 4)}</td><td class="r num">${money(m.eff_price_in, 4)} / ${money(m.eff_price_out, 4)}${m.price_in == null ? `<div class="small dim">наценка ${mk}%</div>` : ''}</td>
        <td class="r num ${mg < 10 ? 'err' : mg < 20 ? 'warn' : 'ok'}">${m.cost_in + m.cost_out ? mg.toFixed(0) + '%' : '<span class="warn">цена 0!</span>'}</td><td>${m.supports_vision ? '<span class="badge info">Vision</span> ' : ''}${m.supports_tools ? '<span class="badge">Tools</span>' : ''}</td>
        <td>${sw(`data-men="${m.id}"`, m.is_enabled)}</td><td><button class="btn sm ghost" data-med="${m.id}">${ic('edit')}</button></td></tr>`; }).join('')}</tbody></table></div>`
        : `<div class="card">${empty('layers', 'Моделей пока нет', 'Импортируйте модели из провайдера или создайте вручную', '<a class="btn pri" href="#/admin/providers">К провайдерам</a>')}</div>`;
      $('#bulk').style.display = sel.size ? 'flex' : 'none'; $('#bsel').textContent = `Выбрано: ${sel.size}`;
      $$('.msel').forEach(c => c.onchange = () => { c.checked ? sel.add(+c.value) : sel.delete(+c.value); draw(); });
      const ma = $('#mall'); if (ma) ma.onchange = () => { list.forEach(m => ma.checked ? sel.add(m.id) : sel.delete(m.id)); draw(); };
      $$('[data-men]').forEach(i => i.onchange = () => api('/api/admin/models/' + i.dataset.men, { method: 'PATCH', body: { is_enabled: i.checked } }).then(() => { ms.find(m => m.id == i.dataset.men).is_enabled = i.checked; toast('Сохранено'); }).catch(fail));
      $$('[data-med]').forEach(b => b.onclick = () => modelEditor(ms.find(m => m.id == b.dataset.med), ps, load)); };
    el.innerHTML = pageHead('Модели и цены', `Цены в USD за 1M токенов. Если цена продажи пустая — применяется наценка по умолчанию (${mk}%)`, `<button class="btn pri" id="nm">${ic('plus')}Создать модель</button>`) +
      `<div class="row wrap mb"><input class="inp" id="mq" placeholder="Поиск…" style="max-width:300px" value="${esc(q)}"><div class="row grow" id="bulk" style="display:none;justify-content:flex-end"><span class="small muted" id="bsel"></span><button class="btn sm" id="bm">Применить наценку %</button><button class="btn sm" id="br">Сбросить на наценку по умолчанию</button></div></div><div id="mt"></div>`;
    $('#mq').oninput = e => { q = e.target.value.toLowerCase(); draw(); }; $('#nm').onclick = () => modelEditor(null, ps, load);
    $('#bm').onclick = async () => { const d = await promptBox('Наценка для выбранных', [{ name: 'm', label: 'Наценка, %', type: 'number', value: mk }], 'Применить'); if (d) { await api('/api/admin/models/bulk-markup', { body: { ids: [...sel], markup: +d.m } }); toast('Цены обновлены'); sel.clear(); load(); } };
    $('#br').onclick = async () => { await api('/api/admin/models/bulk-markup', { body: { ids: [...sel], markup: null } }); toast('Сброшено'); sel.clear(); load(); };
    draw(); };
  el.innerHTML = skel(1, 300); load().catch(fail);
}, { auth: true, admin: true, title: 'Модели и цены' });

function modelEditor(m, ps, done) {
  const isNew = !m; m = m || { public_id: '', display_name: '', description: '', family: '', kind: 'chat', context_length: 128000, max_output: 4096, supports_vision: false, supports_tools: true, is_enabled: true, cost_in: 0, cost_out: 0, price_in: null, price_out: null, routes: [] };
  let routes = m.routes.map(r => ({ provider_id: r.provider_id, upstream_model: r.upstream_model }));
  const md = modal(isNew ? 'Новая модель' : esc(m.public_id), `<form class="col" id="mf"><div class="grid g2"><div class="field"><label>ID модели (видят клиенты)</label><input class="inp mono" name="public_id" value="${esc(m.public_id)}" required></div><div class="field"><label>Отображаемое имя</label><input class="inp" name="display_name" value="${esc(m.display_name)}"></div></div>
    <div class="grid g3"><div class="field"><label>Семейство / вендор</label><input class="inp" name="family" value="${esc(m.family)}" placeholder="OpenAI"></div><div class="field"><label>Тип</label><select class="inp" name="kind"><option value="chat" ${m.kind === 'chat' ? 'selected' : ''}>Чат</option><option value="embedding" ${m.kind === 'embedding' ? 'selected' : ''}>Эмбеддинги</option></select></div><div class="field"><label>Контекст / Max output</label><div class="row"><input class="inp" type="number" name="context_length" value="${m.context_length}"><input class="inp" type="number" name="max_output" value="${m.max_output}"></div></div></div>
    <div class="field"><label>Описание</label><input class="inp" name="description" value="${esc(m.description)}"></div>
    <div class="grid g4"><div class="field"><label>Себестоимость вход $/1M</label><input class="inp" type="number" step="any" name="cost_in" value="${m.cost_in}"></div><div class="field"><label>Себестоимость выход $/1M</label><input class="inp" type="number" step="any" name="cost_out" value="${m.cost_out}"></div>
      <div class="field"><label>Продажа вход $/1M</label><input class="inp" type="number" step="any" name="price_in" value="${m.price_in ?? ''}" placeholder="авто"></div><div class="field"><label>Продажа выход $/1M</label><input class="inp" type="number" step="any" name="price_out" value="${m.price_out ?? ''}" placeholder="авто"></div></div>
    <div class="grid g2"><div class="field"><label>Кеш: чтение, доля цены входа</label><input class="inp" type="number" step="any" min="0" name="cache_read_mult" value="${m.cache_read_mult ?? ''}" placeholder="авто: 0.1 Anthropic, 0.5 остальные"></div><div class="field"><label>Кеш: запись, доля цены входа</label><input class="inp" type="number" step="any" min="0" name="cache_write_mult" value="${m.cache_write_mult ?? ''}" placeholder="авто: 1.25 Anthropic, 1 остальные"></div></div>
    <div class="row wrap"><label class="chk"><input type="checkbox" name="supports_vision" ${m.supports_vision ? 'checked' : ''}>Vision</label><label class="chk"><input type="checkbox" name="supports_tools" ${m.supports_tools ? 'checked' : ''}>Tools</label><label class="chk"><input type="checkbox" name="is_enabled" ${m.is_enabled ? 'checked' : ''}>Включена</label></div>
    <div><div class="row between"><h3>Маршрутизация</h3><button type="button" class="btn sm" id="radd">${ic('plus')}Маршрут</button></div><p class="small muted" style="margin:4px 0 10px">Порядок = приоритет. При ошибке запрос уходит на следующий маршрут.</p><div class="col" id="rl"></div></div></form>`,
    { size: 'lg', foot: `${isNew ? '' : `<button class="btn danger" id="mdel" style="margin-right:auto">${ic('trash')}Удалить</button>`}<button class="btn" data-c>Отмена</button><button class="btn pri" id="msave">Сохранить</button>` });
  const drawR = () => { $('#rl', md).innerHTML = routes.length ? routes.map((r, i) => `<div class="row"><span class="badge">${i + 1}</span><select class="inp" data-rp="${i}">${ps.map(p => `<option value="${p.id}" ${p.id === r.provider_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><input class="inp mono" data-ru="${i}" value="${esc(r.upstream_model)}" placeholder="имя модели у провайдера"><button type="button" class="btn sm icon" data-up="${i}">${ic('up')}</button><button type="button" class="btn sm icon" data-rd="${i}">${ic('x')}</button></div>`).join('') : '<div class="alert warn small">Без маршрутов модель недоступна клиентам</div>';
    $$('[data-rp]', md).forEach(s => s.onchange = () => routes[s.dataset.rp].provider_id = +s.value); $$('[data-ru]', md).forEach(s => s.oninput = () => routes[s.dataset.ru].upstream_model = s.value);
    $$('[data-rd]', md).forEach(b => b.onclick = () => { routes.splice(+b.dataset.rd, 1); drawR(); }); $$('[data-up]', md).forEach(b => b.onclick = () => { const i = +b.dataset.up; if (i) { [routes[i - 1], routes[i]] = [routes[i], routes[i - 1]]; drawR(); } }); };
  drawR(); $('#radd', md).onclick = () => { if (!ps.length) return toast('Сначала добавьте провайдера', 'err'); routes.push({ provider_id: ps[0].id, upstream_model: $('[name=public_id]', md).value }); drawR(); };
  md.querySelector('[data-c]').onclick = md.close;
  if (!isNew) $('#mdel', md).onclick = async () => { if (await confirmBox('Удалить модель?', { ok: 'Удалить' })) { await api('/api/admin/models/' + m.id, { method: 'DELETE' }); md.close(); toast('Удалено'); done(); } };
  $('#msave', md).onclick = e => { const f = $('#mf', md); if (!f.reportValidity()) return; const d = Object.fromEntries(new FormData(f));
    const body = { ...d, context_length: +d.context_length, max_output: +d.max_output, cost_in: +d.cost_in || 0, cost_out: +d.cost_out || 0, price_in: d.price_in === '' ? null : +d.price_in, price_out: d.price_out === '' ? null : +d.price_out, cache_read_mult: d.cache_read_mult === '' ? null : +d.cache_read_mult, cache_write_mult: d.cache_write_mult === '' ? null : +d.cache_write_mult, supports_vision: !!d.supports_vision, supports_tools: !!d.supports_tools, is_enabled: !!d.is_enabled, routes: routes.filter(r => r.upstream_model.trim()) };
    busy(e.currentTarget, async () => { await api(isNew ? '/api/admin/models' : '/api/admin/models/' + m.id, { method: isNew ? 'POST' : 'PUT', body }); toast('Сохранено'); md.close(); done(); }); };
}

// ---------- users
route('/admin/users', async (el, p, qq) => {
  let q = qq.q || '', off = 0;
  const load = async () => { const r = await api(`/api/admin/users?q=${encodeURIComponent(q)}&offset=${off}`);
    $('#ut').innerHTML = r.items.length ? `<div class="tbl-wrap"><table><thead><tr><th>Пользователь</th><th>Роль</th><th class="r">Баланс</th><th class="r">Потрачено</th><th>Регистрация</th><th>Статус</th></tr></thead><tbody>${r.items.map(u => `<tr class="click" data-u="${u.id}"><td><b>${esc(u.email)}</b>${u.name ? `<div class="small dim">${esc(u.name)}</div>` : ''}</td><td>${u.role === 'admin' ? '<span class="badge info">admin</span>' : '<span class="badge">user</span>'}</td><td class="r num">${money(u.balance)}</td><td class="r num muted">${money(u.spent)}</td><td class="muted">${dt(u.created_at)}</td><td>${u.is_blocked ? '<span class="badge err">Заблокирован</span>' : '<span class="badge ok">Активен</span>'}</td></tr>`).join('')}</tbody></table></div>
      <div class="row mt"><span class="small muted grow">Всего: ${r.total}</span><button class="btn sm" id="pv" ${off ? '' : 'disabled'}>←</button><button class="btn sm" id="nx" ${off + 50 >= r.total ? 'disabled' : ''}>→</button></div>` : `<div class="card">${empty('users', 'Пользователи не найдены')}</div>`;
    $$('[data-u]').forEach(t => t.onclick = () => location.hash = '#/admin/users/' + t.dataset.u);
    const pv = $('#pv'); if (pv) { pv.onclick = () => { off -= 50; load(); }; $('#nx').onclick = () => { off += 50; load(); }; } };
  el.innerHTML = pageHead('Пользователи', 'Клиенты, балансы и доступ') + `<input class="inp mb" id="uq" placeholder="Поиск по email или имени…" style="max-width:360px" value="${esc(q)}"><div id="ut">${skel(1, 300)}</div>`;
  let tm; $('#uq').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { q = e.target.value; off = 0; load(); }, 300); }; load().catch(fail);
}, { auth: true, admin: true, title: 'Пользователи' });

route('/admin/users/:id', async (el, { id }) => {
  el.innerHTML = skel(2, 140);
  const d = await api('/api/admin/users/' + id), u = d.user;
  el.innerHTML = `<a href="#/admin/users" class="small muted">← Все пользователи</a><div class="card mt"><div class="row between wrap"><div class="row"><div class="logo" style="width:48px;height:48px;border-radius:50%;font-size:18px">${esc(u.email[0].toUpperCase())}</div><div><h2>${esc(u.email)}</h2><div class="row small muted">${u.role === 'admin' ? '<span class="badge info">admin</span>' : '<span class="badge">user</span>'}${u.is_blocked ? '<span class="badge err">Заблокирован</span>' : ''}<span>с ${dt(u.created_at)}</span>${u.markup != null ? `<span class="badge warn">наценка ${u.markup}%</span>` : ''}</div></div></div>
    <div class="row wrap"><div style="text-align:right;margin-right:12px"><div class="small dim">Баланс</div><div style="font-size:24px;font-weight:600" class="num">${money(u.balance)}</div></div>
      <button class="btn pri" data-bal="1">${ic('plus')}Пополнить</button><button class="btn" data-bal="-1">Списать</button><button class="btn" id="umk">Наценка</button><button class="btn" id="urole">${u.role === 'admin' ? 'Снять админа' : 'Сделать админом'}</button><button class="btn ${u.is_blocked ? '' : 'danger'}" id="ublk">${u.is_blocked ? 'Разблокировать' : 'Заблокировать'}</button></div></div></div>
    <div class="grid g4 mt"><div class="card kpi"><div class="l">Расход 30д</div><div class="v">${money(d.usage.totals.revenue)}</div></div><div class="card kpi"><div class="l">Прибыль 30д</div><div class="v ok">${money(d.usage.totals.profit)}</div></div><div class="card kpi"><div class="l">Запросы 30д</div><div class="v">${nf(d.usage.totals.requests)}</div></div><div class="card kpi"><div class="l">Токены 30д</div><div class="v">${tok(d.usage.totals.prompt_tokens + d.usage.totals.completion_tokens)}</div></div></div>
    <div class="tabs mt2"><button class="on" data-t="k">API-ключи</button><button data-t="t">Транзакции</button><button data-t="p">Платежи</button><button data-t="m">Модели</button></div><div id="ud"></div>`;
  const tab = t => { $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    $('#ud').innerHTML = t === 'k' ? `<div class="tbl-wrap"><table><thead><tr><th>Название</th><th>Ключ</th><th class="r">Потрачено</th><th>Использован</th><th>Статус</th></tr></thead><tbody>${d.keys.map(k => `<tr><td>${esc(k.name)}</td><td class="mono">${esc(k.display)}</td><td class="r num">${money(k.spent)}</td><td class="muted">${ago(k.last_used_at)}</td><td>${k.is_active ? '<span class="badge ok">Активен</span>' : '<span class="badge">Выкл</span>'}</td></tr>`).join('')}</tbody></table></div>`
      : t === 't' ? (d.transactions.length ? `<div class="tbl-wrap"><table><tbody>${d.transactions.map(x => `<tr><td class="muted">${dt(x.created_at)}</td><td><span class="badge">${x.type}</span></td><td>${esc(x.description)}</td><td class="r num ${x.amount > 0 ? 'ok' : 'err'}">${money(x.amount)}</td></tr>`).join('')}</tbody></table></div>` : empty('receipt', 'Нет транзакций'))
      : t === 'p' ? (d.payments.length ? `<div class="tbl-wrap"><table><tbody>${d.payments.map(x => `<tr><td class="muted">${dt(x.created_at)}</td><td>${x.method}</td><td class="num">${x.amount} ${x.currency}</td><td class="num">${money(x.amount_usd)}</td><td>${payBadge(x.status)}</td></tr>`).join('')}</tbody></table></div>` : empty('card', 'Нет платежей'))
      : `<div class="card">${barList(d.usage.by_model, r => r.revenue, r => r.model, r => money(r.revenue))}</div>`; };
  $$('.tabs button').forEach(b => b.onclick = () => tab(b.dataset.t)); tab('k');
  const patch = body => api('/api/admin/users/' + id, { method: 'PATCH', body }).then(() => { toast('Сохранено'); render(); }).catch(fail);
  $$('[data-bal]').forEach(b => b.onclick = async () => { const s = +b.dataset.bal; const r = await promptBox(s > 0 ? 'Пополнить баланс' : 'Списать с баланса', [{ name: 'a', label: 'Сумма, $', type: 'number' }, { name: 'd', label: 'Комментарий', placeholder: s > 0 ? 'Бонус / ручное пополнение' : 'Причина списания' }]);
    if (r && +r.a) api(`/api/admin/users/${id}/balance`, { body: { amount: s * Math.abs(+r.a), description: r.d } }).then(() => { toast('Баланс изменён'); render(); }).catch(fail); });
  $('#umk').onclick = async () => { const r = await promptBox('Персональная наценка', [{ name: 'm', label: 'Наценка, %', type: 'number', value: u.markup ?? '', hint: 'Пусто — наценка по умолчанию. Действует для моделей без фиксированной цены продажи' }]); if (r) patch(r.m === '' ? { clear_markup: true } : { markup: +r.m }); };
  $('#urole').onclick = async () => { if (await confirmBox(u.role === 'admin' ? 'Снять права администратора?' : 'Выдать права администратора? Пользователь получит полный доступ к админ-панели.', { ok: 'Да' })) patch({ role: u.role === 'admin' ? 'user' : 'admin' }); };
  $('#ublk').onclick = async () => { if (u.is_blocked || await confirmBox('Заблокировать пользователя? Все его API-ключи перестанут работать.', { ok: 'Заблокировать' })) patch({ is_blocked: !u.is_blocked }); };
}, { auth: true, admin: true, title: 'Пользователь' });

route('/admin/payments', async (el, p, q) => {
  const st = q.status || '';
  el.innerHTML = skel(1, 300); const rows = await api('/api/admin/payments?status=' + st);
  el.innerHTML = pageHead('Платежи', 'Пополнения через Platega и CryptoBot', `<div class="pills">${[['', 'Все'], ['paid', 'Оплачены'], ['pending', 'Ожидают'], ['canceled', 'Отменены']].map(([k, v]) => `<button class="${k === st ? 'on' : ''}" onclick="location.hash='#/admin/payments?status=${k}'">${v}</button>`).join('')}</div>`) +
    (rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Дата</th><th>Пользователь</th><th>Способ</th><th class="r">Сумма</th><th class="r">Зачислено</th><th>Статус</th><th>ID у провайдера</th><th></th></tr></thead><tbody>${rows.map(x => `<tr><td class="muted">${dt(x.created_at)}</td><td><a href="#/admin/users/${x.user_id}">${esc(x.email)}</a></td><td>${x.method === 'cryptobot' ? 'CryptoBot' : 'Platega'}</td><td class="r num">${x.amount} ${x.currency}</td><td class="r num">${money(x.amount_usd)}</td><td>${payBadge(x.status)}</td><td class="mono small muted">${esc(x.external_id)}</td>
      <td class="r">${x.status === 'pending' ? `<button class="btn sm" data-chk="${x.id}">Проверить</button> <button class="btn sm" data-mp="${x.id}">Зачислить</button>` : x.status === 'paid' ? `<button class="btn sm" data-rc="${x.id}" title="Квитанция PDF">${ic('receipt')}PDF</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${empty('card', 'Платежей нет')}</div>`);
  $$('[data-chk]').forEach(b => b.onclick = () => busy(b, async () => { const r = await api(`/api/admin/payments/${b.dataset.chk}/check`, { method: 'POST' }); toast('Статус: ' + (PAY_ST[r.status]?.[1] || r.status)); render(); }));
  $$('[data-rc]').forEach(b => b.onclick = () => busy(b, () => download(`/api/admin/payments/${b.dataset.rc}/receipt.pdf`, 'receipt.pdf')));
  $$('[data-mp]').forEach(b => b.onclick = async () => { if (await confirmBox('Зачислить платёж вручную? Делайте это только если уверены, что деньги поступили.', { ok: 'Зачислить', danger: false })) { await api(`/api/admin/payments/${b.dataset.mp}/mark-paid`, { method: 'POST' }); toast('Зачислено'); render(); } });
}, { auth: true, admin: true, title: 'Платежи' });

route('/admin/transactions', async (el) => {
  el.innerHTML = skel(1, 300); const rows = await api('/api/admin/transactions');
  el.innerHTML = pageHead('Транзакции', 'Пополнения, бонусы, ручные корректировки и возвраты') + (rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Дата</th><th>Пользователь</th><th>Тип</th><th>Описание</th><th class="r">Сумма</th></tr></thead><tbody>${rows.map(x => `<tr><td class="muted">${dt(x.created_at)}</td><td><a href="#/admin/users/${x.user_id}">${esc(x.email)}</a></td><td><span class="badge">${x.type}</span></td><td class="muted">${esc(x.description)}</td><td class="r num ${x.amount > 0 ? 'ok' : 'err'}">${x.amount > 0 ? '+' : ''}${money(x.amount)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${empty('receipt', 'Транзакций нет')}</div>`);
}, { auth: true, admin: true, title: 'Транзакции' });

route('/admin/logs', async (el, p, q) => {
  const f = { q: q.q || '', model: q.model || '', status: q.status || '' }; let off = 0, rows = [];
  const load = async () => { rows = await api(`/api/admin/logs?q=${encodeURIComponent(f.q)}&model=${encodeURIComponent(f.model)}&status=${f.status}&offset=${off}`);
    $('#lt').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="compact"><thead><tr><th>Время</th><th>Пользователь</th><th>Модель</th><th>Провайдер</th><th class="r">Вход</th><th class="r">Выход</th><th class="r">Цена</th><th class="r">Прибыль</th><th class="r">Задержка</th><th>Статус</th></tr></thead><tbody>${rows.map((l, i) => `<tr class="click" data-i="${i}"><td class="muted">${dt(l.created_at)}</td><td>${esc(l.email || '—')}</td><td class="mono">${esc(l.model)}</td><td>${esc(l.provider)}${l.attempts > 1 ? ` <span class="badge warn" title="fallback">×${l.attempts}</span>` : ''}</td><td class="r num">${nf(l.prompt_tokens)}${l.cached_tokens ? `<div class="small dim">из кеша ${nf(l.cached_tokens)}</div>` : ''}</td><td class="r num">${nf(l.completion_tokens)}</td><td class="r num">${money(l.price)}</td><td class="r num ok">${money(l.profit)}</td><td class="r num muted">${(l.latency_ms / 1000).toFixed(2)}s</td><td>${statusBadge(l.status_code)}</td></tr>`).join('')}</tbody></table></div>
      <div class="row mt"><button class="btn sm" id="pv" ${off ? '' : 'disabled'}>←</button><button class="btn sm" id="nx" ${rows.length < 100 ? 'disabled' : ''}>→</button></div>` : `<div class="card">${empty('list', 'Логов нет')}</div>`;
    $$('[data-i]').forEach(t => t.onclick = () => { const l = rows[t.dataset.i];
      modal('Запрос ' + esc(l.request_id), `<div class="col">${[['Время', dt(l.created_at)], ['Пользователь', esc(l.email || '—')], ['IP', esc(l.ip)], ['Модель', `<span class="mono">${esc(l.model)}</span>`], ['Endpoint', esc(l.endpoint) + (l.stream ? ' (stream)' : '')], ['Провайдер', esc(l.provider) + ` · ключ #${l.provider_key_id ?? '—'}`], ['Попыток (fallback)', l.attempts], ['Токены', `${nf(l.prompt_tokens)} → ${nf(l.completion_tokens)}`], ['Себестоимость', money(l.cost)], ['Цена', money(l.price)], ['Прибыль', `<span class="ok">${money(l.profit)}</span>`], ['Задержка', l.latency_ms + ' мс'], ['Статус', statusBadge(l.status_code)]]
        .map(([k, v]) => `<div class="row between" style="border-bottom:1px solid var(--bd);padding-bottom:8px"><span class="muted">${k}</span><span>${v}</span></div>`).join('')}${l.error ? `<div><div class="small muted mb">Ошибка</div><div class="code" style="white-space:pre-wrap">${esc(l.error)}</div></div>` : ''}</div>`, { drawer: true }); });
    const pv = $('#pv'); if (pv) { pv.onclick = () => { off -= 100; load(); }; $('#nx').onclick = () => { off += 100; load(); }; } };
  el.innerHTML = pageHead('Логи запросов', 'Все обращения к API с себестоимостью и прибылью') + `<div class="row wrap mb"><input class="inp" id="fq" placeholder="Email или request ID" style="max-width:260px" value="${esc(f.q)}"><input class="inp" id="fm" placeholder="Модель" style="max-width:200px" value="${esc(f.model)}"><select class="inp" id="fs" style="max-width:160px"><option value="">Все статусы</option><option value="ok" ${f.status === 'ok' ? 'selected' : ''}>Успешные</option><option value="error" ${f.status === 'error' ? 'selected' : ''}>Ошибки</option></select><button class="btn" id="fa">Применить</button></div><div id="lt">${skel(1, 300)}</div>`;
  $('#fa').onclick = () => { f.q = $('#fq').value.trim(); f.model = $('#fm').value.trim(); f.status = $('#fs').value; off = 0; history.replaceState(null, '', '#/admin/logs?' + new URLSearchParams(f)); load(); };
  load().catch(fail);
}, { auth: true, admin: true, title: 'Логи запросов' });

// ---------- support
const SUP_CAT = { payment: 'Оплата и баланс', api: 'API и ошибки', models: 'Модели', account: 'Аккаунт', other: 'Другое' };
const SUP_ST = { open: ['Ждёт ответа', 'warn'], answered: ['Есть ответ', 'ok'], closed: ['Закрыт', ''], canceled: ['Отменён', ''] };
const supBadge = s => `<span class="badge ${SUP_ST[s]?.[1] || ''}">${SUP_ST[s]?.[0] || s}</span>`;
const fsize = n => n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' КБ' : (n / 1024 / 1024).toFixed(1) + ' МБ';
const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,video/mp4,video/quicktime,video/webm,.pdf,.txt,.log,.json,.csv';

function uploadFile(file, onProgress) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest(); x.open('POST', '/api/support/upload');
    x.setRequestHeader('Authorization', 'Bearer ' + S.token); x.setRequestHeader('X-Filename', encodeURIComponent(file.name || 'file'));
    x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    x.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => { let d = null; try { d = JSON.parse(x.responseText); } catch {} x.status < 300 ? res(d) : rej(new Error(d?.detail || 'Не удалось загрузить файл')); };
    x.onerror = () => rej(new Error('Нет связи с сервером')); x.send(file);
  });
}

// Attachments composer: file picker, drag & drop, paste from clipboard, screenshot and screen recording.
function attacher(box, textarea) {
  const items = []; let rec = null;
  const canCapture = !!navigator.mediaDevices?.getDisplayMedia && window.MediaRecorder;
  box.innerHTML = `<div class="att-bar row wrap"><label class="btn sm">${ic('img')}Файл<input type="file" multiple accept="${ACCEPT}" hidden></label>
    ${canCapture ? `<button class="btn sm" type="button" data-shot>${ic('img')}Скриншот экрана</button><button class="btn sm" type="button" data-rec>${ic('play')}Записать видео экрана</button>` : ''}
    <span class="small dim">или перетащите сюда / вставьте Ctrl+V · картинки до 10 МБ, видео до 100 МБ</span></div><div class="att-list"></div>`;
  const list = box.querySelector('.att-list');
  const draw = () => { list.innerHTML = items.map((it, i) => `<div class="att-item ${it.err ? 'bad' : ''}">${it.preview ? (it.kind === 'video' ? `<video src="${it.preview}" muted></video>` : `<img src="${it.preview}">`) : `<div class="att-ic">${ic('receipt')}</div>`}
      <div class="att-meta"><div class="att-n" title="${esc(it.name)}">${esc(it.name)}</div><div class="small dim">${it.err ? esc(it.err) : it.id ? fsize(it.size) : `Загрузка ${Math.round(it.p * 100)}%`}</div>${!it.id && !it.err ? `<div class="att-p"><i style="width:${it.p * 100}%"></i></div>` : ''}</div>
      <button class="btn sm icon ghost" type="button" data-rm="${i}" title="Убрать">${ic('x')}</button></div>`).join('');
    list.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const [it] = items.splice(+b.dataset.rm, 1); if (it.id) api('/api/support/upload/' + it.id, { method: 'DELETE' }).catch(() => {}); draw(); }); };
  const add = files => { for (const f of files) { if (items.length >= 6) { toast('Не больше 6 файлов в сообщении', 'err'); break; }
    const kind = f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'image' : 'file';
    const it = { name: f.name || 'file', size: f.size, kind, p: 0, preview: kind !== 'file' ? URL.createObjectURL(f) : '' }; items.push(it);
    uploadFile(f, p => { it.p = p; draw(); }).then(r => { it.id = r.id; it.size = r.size; draw(); }).catch(e => { it.err = e.message; draw(); }); }
    draw(); };
  box.querySelector('input[type=file]').onchange = e => { add([...e.target.files]); e.target.value = ''; };
  const zone = box.closest('.card') || box;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drop'); });
  zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drop'); });
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drop'); add([...e.dataTransfer.files]); });
  textarea?.addEventListener('paste', e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); add(fs.map((f, i) => new File([f], f.name && f.name !== 'image.png' ? f.name : `screenshot-${Date.now()}${i ? '-' + i : ''}.png`, { type: f.type }))); } });
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  box.querySelector('[data-shot]')?.addEventListener('click', async () => {
    try { const st = await navigator.mediaDevices.getDisplayMedia({ video: true }); const v = document.createElement('video'); v.srcObject = st; v.muted = true; await v.play();
      await new Promise(r => setTimeout(r, 350)); const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
      st.getTracks().forEach(t => t.stop()); c.toBlob(b => add([new File([b], `screenshot-${stamp()}.png`, { type: 'image/png' })]), 'image/png');
    } catch (e) { if (e.name !== 'NotAllowedError') toast('Не удалось сделать скриншот: ' + e.message, 'err'); } });
  const recBtn = box.querySelector('[data-rec]');
  recBtn?.addEventListener('click', async () => {
    if (rec) { rec.stop(); return; }
    try { const st = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || '';
      const chunks = [], t0 = Date.now(); rec = new MediaRecorder(st, mime ? { mimeType: mime, videoBitsPerSecond: 1_500_000 } : {});
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      const tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); recBtn.innerHTML = `<span class="rec-dot"></span>Остановить запись ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s >= 180) rec?.stop(); }, 500);
      rec.onstop = () => { clearInterval(tick); st.getTracks().forEach(t => t.stop()); rec = null; recBtn.innerHTML = `${ic('play')}Записать видео экрана`; recBtn.classList.remove('danger');
        const type = (mime || 'video/webm').split(';')[0]; add([new File([new Blob(chunks, { type })], `screen-${stamp()}.${type.includes('mp4') ? 'mp4' : 'webm'}`, { type })]); };
      st.getVideoTracks()[0].onended = () => rec?.state === 'recording' && rec.stop();
      rec.start(1000); recBtn.classList.add('danger'); toast('Запись началась. Максимум 3 минуты');
    } catch (e) { rec = null; if (e.name !== 'NotAllowedError') toast('Не удалось начать запись: ' + e.message, 'err'); } });
  return { ids: () => items.filter(i => i.id).map(i => i.id), busy: () => items.some(i => !i.id && !i.err) || !!rec,
    reset: () => { items.length = 0; draw(); }, stop: () => rec?.stop() };
}

function lightbox(url, name) { const m = modal(esc(name), `<div style="text-align:center"><img src="${url}" style="max-width:100%;max-height:75vh;border-radius:8px"></div>`, { size: 'lg', foot: `<a class="btn" href="${url}" target="_blank">${ic('ext')}Открыть оригинал</a>` }); return m; }

function threadHtml(thread, me) {
  return thread.map(m => m.author === 'system' ? `<div class="tk-sys">${esc(m.body)} · ${dt(m.created_at)}</div>` : `<div class="tk-msg ${m.author === me ? 'mine' : ''}">
    <div class="tk-h"><b>${m.author === 'admin' ? 'Поддержка' : me === 'admin' ? 'Пользователь' : 'Вы'}</b><span class="dim">${dt(m.created_at)}</span></div>
    ${m.body ? `<div class="tk-b">${linkify(m.body)}</div>` : ''}
    ${m.attachments.length ? `<div class="tk-att">${m.attachments.map(a => a.kind === 'image' ? `<a href="${a.url}" data-lb="${esc(a.filename)}" class="tk-img"><img src="${a.url}" loading="lazy" alt="${esc(a.filename)}"></a>`
      : a.kind === 'video' ? `<video src="${a.url}" controls preload="metadata" class="tk-vid"></video>`
      : `<a class="att-chip" href="${a.url}" target="_blank">${ic('down')}${esc(a.filename)} <span class="dim">${fsize(a.size)}</span></a>`).join('')}</div>` : ''}</div>`).join('');
}
const bindThread = root => root.querySelectorAll('[data-lb]').forEach(a => a.onclick = e => { e.preventDefault(); lightbox(a.href, a.dataset.lb); });

function ticketRows(list, base, admin) {
  return `<div class="card" style="padding:0">${list.map(t => `<a class="tk-row" href="${base}/${t.id}">
    <div class="grow" style="min-width:0"><div class="row" style="gap:8px">${t.unread ? '<span class="st-dot st-err" title="Новое сообщение"></span>' : ''}<b class="tk-subj">${esc(t.subject)}</b></div>
    <div class="small muted tk-last">${admin ? `<span class="mono">${esc(t.user_email)}</span> · ` : ''}#${t.id} · ${esc(t.category_name)}${t.last ? ' · ' + esc(t.last) : ''}</div></div>
    <div class="col" style="align-items:flex-end;gap:4px;flex:none">${supBadge(t.status)}<span class="small dim">${dt(t.updated_at)}</span></div></a>`).join('')}</div>`;
}

route('/support', async (el) => {
  el.innerHTML = skel(2, 80); const list = await api('/api/support/tickets'); if (!el.isConnected) return;
  el.innerHTML = pageHead('Поддержка', 'Опишите проблему — ответим здесь же. Можно приложить скриншоты и видео', `<a class="btn pri" href="#/support/new">${ic('plus')}Новое обращение</a>`) +
    (list.length ? ticketRows(list, '#/support', false) : `<div class="card">${empty('chat', 'Обращений пока нет', 'Если что-то не работает или есть вопрос — напишите нам', `<a class="btn pri mt" href="#/support/new">${ic('plus')}Написать в поддержку</a>`)}</div>`);
}, { auth: true, title: 'Поддержка' });

route('/support/new', async (el) => {
  el.innerHTML = pageHead('Новое обращение', 'Чем подробнее опишете, тем быстрее поможем') + `<div class="card col" style="max-width:820px">
    <div class="field"><label>Заголовок</label><input class="inp" id="ts" maxlength="150" placeholder="Коротко о проблеме, например: «Ошибка 502 на gpt-4o»"></div>
    <div class="field"><label>Тема</label><div class="row wrap" id="tcat">${Object.entries(SUP_CAT).map(([k, v]) => `<button type="button" class="btn sm ${k === 'other' ? 'on' : ''}" data-c="${k}">${v}</button>`).join('')}</div></div>
    <div class="field"><label>Подробнее</label><textarea class="inp tk-ta" id="tb" rows="8" placeholder="Что делали, что ожидали и что получили. Если есть — укажите ID запроса (X-Request-ID), модель и время."></textarea></div>
    <div id="tatt"></div>
    <div class="row between wrap mt"><a class="btn" href="#/support">Отмена</a><button class="btn pri" id="tsend">${ic('check')}Отправить</button></div></div>`;
  let cat = 'other'; $$('#tcat [data-c]').forEach(b => b.onclick = () => { cat = b.dataset.c; $$('#tcat [data-c]').forEach(x => x.classList.toggle('on', x === b)); });
  const att = attacher($('#tatt'), $('#tb')); $('#ts').focus();
  $('#tsend').onclick = e => busy(e.currentTarget, async () => {
    if (att.busy()) throw new Error('Дождитесь окончания загрузки файлов');
    const t = await api('/api/support/tickets', { body: { subject: $('#ts').value, body: $('#tb').value, category: cat, attachments: att.ids() } });
    toast('Обращение отправлено'); location.hash = '#/support/' + t.id; });
}, { auth: true, title: 'Поддержка' });

async function ticketPage(el, id, admin) {
  el.innerHTML = skel(2, 120);
  const url = admin ? `/api/admin/support/tickets/${id}` : `/api/support/tickets/${id}`, back = admin ? '#/admin/support' : '#/support';
  let t = await api(url); if (!el.isConnected) return;
  const me = admin ? 'admin' : 'user', closed = () => ['closed', 'canceled'].includes(t.status);
  const head = () => pageHead(esc(t.subject), `#${t.id} · ${esc(t.category_name)} · создано ${dt(t.created_at)}`, `<a class="btn" href="${back}">← Все обращения</a>`);
  const actions = () => admin
    ? (closed() ? `<button class="btn" data-st="open">${ic('refresh')}Открыть снова</button>` : `<button class="btn" data-st="closed">${ic('check')}Закрыть тикет</button>`)
    : (t.status === 'open' ? `<button class="btn danger" data-cancel>${ic('x')}Отменить обращение</button>` : t.status === 'answered' ? `<button class="btn" data-cancel>${ic('check')}Вопрос решён — закрыть</button>` : '');
  const side = () => admin && t.user ? `<div class="card col tk-side"><h3>Пользователь</h3><div class="mono small">${esc(t.user.email)}</div>
      <div class="row between small"><span class="muted">Баланс</span><b class="num">${money(t.user.balance)}</b></div>
      <div class="row between small"><span class="muted">С нами с</span><span>${dt(t.user.created_at)}</span></div>
      <div class="row between small"><span class="muted">Обращений</span><span>${t.user.tickets}</span></div>
      ${t.user.is_blocked ? '<span class="badge err">Заблокирован</span>' : ''}<a class="btn sm" href="#/admin/users/${t.user.id}">Открыть профиль</a></div>` : '';
  el.innerHTML = head() + `<div class="${admin ? 'tk-grid' : ''}"><div class="col" style="gap:14px;min-width:0">
    <div class="card col"><div class="row between wrap"><div class="row" style="gap:10px">${supBadge(t.status)}<span class="small muted" id="tkhint"></span></div><div class="row" id="tkact">${actions()}</div></div>
      <div class="tk-thread" id="tkth">${threadHtml(t.thread, me)}</div></div>
    <div class="card col" id="tkc"><textarea class="inp tk-ta" id="tkb" rows="4" placeholder="${admin ? 'Ответ пользователю…' : closed() ? 'Напишите, если вопрос остался — обращение откроется снова' : 'Ваше сообщение…'}"></textarea>
      <div id="tkatt"></div><div class="row between wrap"><span class="small dim">Ctrl+Enter — отправить</span><div class="row">${admin ? `<button class="btn" data-send="close">${ic('check')}Ответить и закрыть</button>` : ''}<button class="btn pri" data-send="1">Отправить</button></div></div></div></div>${side()}</div>`;
  const hint = () => { $('#tkhint').textContent = admin ? (t.status === 'open' ? 'Пользователь ждёт ответа' : '') : t.status === 'open' ? 'Мы ответим здесь — загляните позже' : t.status === 'answered' ? 'Поддержка ответила' : ''; };
  const redraw = () => { $('#tkth').innerHTML = threadHtml(t.thread, me); bindThread($('#tkth')); $('#tkact').innerHTML = actions(); bindAct(); hint(); };
  const reload = async () => { t = await api(url); if (el.isConnected) { const n = $('#tkth').children.length; redraw(); if ($('#tkth').children.length !== n) $('#tkth').scrollTop = 1e9; el.querySelector('.card .badge').outerHTML = supBadge(t.status); } };
  const bindAct = () => {
    el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => busy(b, async () => { await api(`/api/admin/support/tickets/${id}/status`, { body: { status: b.dataset.st } }); await reload(); }));
    el.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => { if (!(await confirmBox(t.status === 'open' ? 'Отменить обращение? Его можно будет открыть снова, написав сообщение.' : 'Закрыть обращение как решённое?', { ok: t.status === 'open' ? 'Отменить обращение' : 'Закрыть' }))) return;
      await api(`/api/support/tickets/${id}/cancel`, { method: 'POST' }); toast(t.status === 'open' ? 'Обращение отменено' : 'Обращение закрыто'); await reload(); }); };
  bindThread($('#tkth')); bindAct(); hint(); $('#tkth').scrollTop = 1e9;
  const att = attacher($('#tkatt'), $('#tkb'));
  const send = async (btn, close) => busy(btn, async () => {
    if (att.busy()) throw new Error('Дождитесь окончания загрузки файлов');
    await api(admin ? `/api/admin/support/tickets/${id}/messages` : `/api/support/tickets/${id}/messages`, { body: { body: $('#tkb').value, attachments: att.ids(), close: !!close } });
    $('#tkb').value = ''; att.reset(); await reload(); $('#tkth').scrollTop = 1e9; toast(close ? 'Ответ отправлен, тикет закрыт' : 'Отправлено'); });
  el.querySelectorAll('[data-send]').forEach(b => b.onclick = () => send(b, b.dataset.send === 'close'));
  $('#tkb').onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(el.querySelector('[data-send="1"]')); } };
  const timer = setInterval(() => { if (!el.isConnected || !$('#tkth')) { clearInterval(timer); att.stop(); return; } if (!$('#tkb').value && !att.ids().length) reload().catch(() => {}); }, 30000);
}
route('/support/:id', (el, { id }) => ticketPage(el, id, false), { auth: true, title: 'Поддержка' });

route('/admin/support', async (el, p, q) => {
  let st = q.status || 'open', s = q.q || '';
  const draw = async () => {
    const d = await api(`/api/admin/support/tickets?status=${st}&q=${encodeURIComponent(s)}`); if (!el.isConnected) return;
    const c = d.counts, n = k => k.reduce((a, x) => a + (c[x] || 0), 0);
    el.innerHTML = pageHead('Поддержка', 'Обращения пользователей') + `<div class="row between wrap" style="margin-bottom:14px">
      <div class="tabs" style="margin:0">${[['open', 'Ждут ответа', n(['open'])], ['active', 'Все открытые', n(['open', 'answered'])], ['closed', 'Закрытые', n(['closed', 'canceled'])], ['all', 'Все', n(Object.keys(c))]].map(([k, t, x]) => `<button class="${k === st ? 'on' : ''}" data-f="${k}">${t} <span class="dim">${x}</span></button>`).join('')}</div>
      <input class="inp" id="sq" style="max-width:280px" placeholder="Поиск: тема, email или #номер" value="${esc(s)}"></div>` +
      (d.tickets.length ? ticketRows(d.tickets, '#/admin/support', true) : `<div class="card">${empty('chat', st === 'open' ? 'Все ответы даны' : 'Ничего не найдено')}</div>`);
    $$('[data-f]').forEach(b => b.onclick = () => { st = b.dataset.f; draw(); });
    let tm; $('#sq').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { s = e.target.value; draw().then(() => { const i = $('#sq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 350); };
  };
  el.innerHTML = skel(3, 70); await draw();
}, { auth: true, admin: true, title: 'Поддержка' });
route('/admin/support/:id', (el, { id }) => ticketPage(el, id, true), { auth: true, admin: true, title: 'Поддержка' });

async function supBadges() {
  try { const d = await api('/api/support/unread');
    const put = (href, n, title) => { const a = document.querySelector(`#side a[href="${href}"]`); if (a && n) a.insertAdjacentHTML('beforeend', `<span class="nav-badge" title="${title}">${n}</span>`); };
    put('#/support', d.count, 'Новые ответы'); put('#/admin/support', d.admin_waiting, 'Ждут ответа');
  } catch {}
}

// ---------- status
const ST = { ok: ['Работает', 'ok'], degraded: ['Нестабильно', 'warn'], down: ['Сбой', 'err'], none: ['Нет запросов', 'none'] };
const fmtLat = v => v == null ? '—' : v < 1000 ? v + ' мс' : (v / 1000).toFixed(1) + (I18N.lang === 'en' ? ' s' : ' с');
route('/status', async (el) => {
  let host = el;
  if (S.user) { renderShell('/status', { title: 'Статус сервиса' }); host = $('#content'); }
  else { el.innerHTML = `<div class="st-pub"><div class="row between" style="margin-bottom:24px"><a class="brand" href="#/" style="padding:0"><div class="logo">${LOGO}</div><span>${esc(S.cfg.site_name)}</span></a><div class="row">${langSw()}<a class="btn sm" href="#/login">Войти</a></div></div><div id="stc"></div></div>`; host = $('#stc'); }
  host.innerHTML = skel(3, 90);
  const draw = async () => {
    let d; try { d = await api('/api/public/status'); } catch (e) { if (host.isConnected) host.innerHTML = `<div class="card">${empty('pulse', 'Страница статуса недоступна', esc(e.message || ''))}</div>`; return false; }
    if (!host.isConnected) return false;
    const ban = { ok: ['Все модели работают', 'Сбоев за последние 30 минут нет'], degraded: ['Некоторые модели работают нестабильно', 'Запросы могут проходить медленнее или с повторами'], down: ['Есть сбои', 'Часть моделей сейчас недоступна — выберите другую или повторите позже'] }[d.overall];
    const hh = iso => new Date(iso).toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit' });
    host.innerHTML = pageHead('Статус сервиса', `Данные за 24 часа · обновлено ${hh(d.updated_at)} · обновляется каждую минуту`) +
      `<div class="card st-ban st-${ST[d.overall][1]}"><span class="st-dot big"></span><div><div style="font-weight:600;font-size:16px">${ban[0]}</div><div class="small muted">${ban[1]}</div></div></div>
      <div class="card mt2" style="padding:0">${d.models.length ? d.models.map(m => `<div class="st-row">
        <div class="row between wrap" style="gap:8px"><div class="row" style="gap:10px"><span class="st-dot st-${ST[m.status][1]}"></span><b class="mono">${esc(m.id)}</b><span class="small st-t st-${ST[m.status][1]}">${ST[m.status][0]}</span></div>
          <div class="row small muted" style="gap:18px"><span title="Доля запросов без сбоев за 24 часа">Доступность <b class="num" style="color:var(--tx)">${m.uptime == null ? '—' : m.uptime + '%'}</b></span><span title="Ошибки сервиса (5xx) за 24 часа">Ошибки <b class="num" style="color:var(--tx)">${m.error_rate == null ? '—' : m.error_rate + '%'}</b></span><span title="Среднее время ответа успешных запросов">Задержка <b class="num" style="color:var(--tx)">${fmtLat(m.latency_ms)}</b></span></div></div>
        <div class="st-bars">${m.hours.map(b => `<i class="st-${ST[b.level][1]}" title="${hh(b.hour)} · ${b.requests ? `${b.requests} запр. · ошибок: ${b.errors}` : 'нет запросов'}"></i>`).join('')}</div>
        <div class="row between small dim"><span>24 ч назад</span><span>сейчас</span></div></div>`).join('') : empty('pulse', 'Моделей пока нет')}</div>
      <div class="row wrap small muted mt" style="gap:16px">${['ok', 'degraded', 'down', 'none'].map(k => `<span class="row" style="gap:6px"><span class="st-dot st-${ST[k][1]}"></span>${k === 'ok' ? 'без сбоев' : k === 'degraded' ? 'ошибок 10–50%' : k === 'down' ? 'ошибок больше 50%' : 'нет запросов'}</span>`).join('')}</div>
      <p class="small dim mt">Учитываются только сбои на стороне сервиса и провайдеров. Ошибки клиента (неверный ключ, нет средств, превышен лимит) в статистику не входят.</p>`;
    return true; };
  if (await draw()) { const t = setInterval(async () => { if (!host.isConnected || !(await draw())) clearInterval(t); }, 60000); }
}, { title: 'Статус сервиса' });

// ---------- referral
route('/referral', async (el) => {
  el.innerHTML = skel(2, 140); const r = await api('/api/me/referral'); if (!el.isConnected) return;
  const link = `${location.origin}/?ref=${r.code}`;
  const tg = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(I18N.t(`Доступ к GPT, Claude, Gemini и другим нейросетям через один API. По моей ссылке — ${rub(r.friend_bonus, 2)} на баланс`))}`;
  el.innerHTML = pageHead('Пригласить друга', 'Делитесь ссылкой — бонусы получите вы оба') + (!r.enabled ? `<div class="card">${empty('gift', 'Программа приглашений сейчас выключена')}</div>` : `
    <div class="grid g3">
      <div class="card kpi"><div class="l">Вы получите</div><div class="v">${rub(r.inviter_bonus, 2)}</div><div class="small dim mt">за каждого друга${r.require_topup ? ' после его первого пополнения' : ''}</div></div>
      <div class="card kpi"><div class="l">Друг получит</div><div class="v">${rub(r.friend_bonus, 2)}</div><div class="small dim mt">сразу после регистрации</div></div>
      <div class="card kpi"><div class="l">Заработано</div><div class="v ok">${rub(r.earned, 2)}</div><div class="small dim mt">приглашено: ${r.invited} · с бонусом: ${r.rewarded}</div></div></div>
    <div class="card mt2"><h3>Ваша ссылка</h3><div class="keybox mt" style="border-style:solid;border-color:var(--bd)"><span class="grow mono">${esc(link)}</span>${copyBtn(link)}</div>
      <div class="row wrap mt"><a class="btn" href="${tg}" target="_blank">${ic('ext')}Отправить в Telegram</a></div>
      <ol class="steps-ol small muted mt"><li>Друг открывает ссылку и входит через GitHub или Google.</li><li>Ему сразу приходит ${rub(r.friend_bonus, 2)} на баланс.</li><li>${r.require_topup ? 'Когда друг впервые пополнит баланс, вам' : 'Вам сразу'} приходит ${rub(r.inviter_bonus, 2)}.</li></ol>
      <div class="small dim mt">Бонусы можно тратить только на запросы к API. Начисляются один раз за каждого нового пользователя.</div></div>
    <h3 class="mt2" style="margin-bottom:10px">Приглашённые</h3>${r.friends.length ? `<div class="tbl-wrap"><table><thead><tr><th>Друг</th><th>Дата</th><th>Статус</th><th class="r">Ваш бонус</th></tr></thead><tbody>${r.friends.map(f => `<tr><td class="mono">${esc(f.email)}</td><td>${dt(f.created_at)}</td><td>${f.rewarded ? '<span class="badge ok">Начислено</span>' : '<span class="badge">Ждём первое пополнение</span>'}</td><td class="r num">${f.rewarded ? '+' + rub(f.bonus, 2) : '—'}</td></tr>`).join('')}</tbody></table></div>` : `<div class="card">${empty('users', 'Пока никого', 'Отправьте ссылку другу — он появится здесь после регистрации')}</div>`}`);
}, { auth: true, title: 'Пригласить друга' });

// ---------- settings
route('/admin/settings', async (el) => {
  el.innerHTML = skel(2, 200); const s = await api('/api/admin/settings');
  const F = (sec, key, label, type = 'text', hint = '', extra = '') => { const v = s[sec][key];
    if (type === 'bool') return `<label class="row between" style="padding:6px 0"><span><span>${label}</span>${hint ? `<div class="small dim">${hint}</div>` : ''}</span>${sw(`data-s="${sec}.${key}" data-type="bool"`, v)}</label>`;
    if (type === 'secret') return `<div class="field"><label>${label}</label><input class="inp mono" type="password" data-s="${sec}.${key}" placeholder="${s[sec][key + '_set'] ? 'Сохранён: ' + esc(s[sec][key + '_mask']) + ' (оставьте пустым, чтобы не менять)' : 'Не задан'}" autocomplete="new-password">${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
    return `<div class="field"><label>${label}</label>${extra || `<input class="inp" type="${type}" step="any" data-s="${sec}.${key}" value="${esc(v)}">`}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`; };
  const wh = (u) => `<div class="field"><label>Webhook / Callback URL</label><div class="keybox" style="border-style:solid;border-color:var(--bd);font-size:12px"><span class="grow">${esc(u)}</span>${copyBtn(u)}</div></div>`;
  const plMethods = [[2, 'СБП (QR-код)'], [11, 'Банковские карты'], [12, 'Международная оплата'], [13, 'Криптовалюта'], [14, 'SberPay'], [3, 'ЕРИП']];
  el.innerHTML = pageHead('Настройки', 'Общие параметры, биллинг и платёжные системы', `<button class="btn pri" id="ss">${ic('check')}Сохранить всё</button>`) + `<div class="grid g2">
    <div class="card col"><h3>Общие</h3>${F('general', 'site_name', 'Название сайта')}${F('general', 'support_contact', 'Контакт поддержки', 'text', 'Например @support_bot или email — показывается в футере')}
      <div class="grid g2">${F('general', 'default_markup', 'Наценка по умолчанию, %', 'number', 'Применяется к моделям без фиксированной цены')}${F('general', 'rate_limit_rpm', 'Лимит запросов в минуту на ключ', 'number', '0 — без лимита')}</div>
      ${F('general', 'signup_bonus_usd', 'Бонус при регистрации, $', 'number', '0 — без бонуса')}${F('general', 'registration_enabled', 'Регистрация открыта', 'bool')}
      ${F('general', 'status_page', 'Публичная страница статуса', 'bool', 'Работают ли модели, задержка и процент ошибок за сутки — без входа, по адресу /#/status')}
      ${F('general', 'legal_info', 'Реквизиты для квитанций', '', 'Печатаются в PDF-квитанциях клиентов. Например: ИП Иванов И. И., ИНН 000000000000, email', `<textarea class="inp" data-s="general.legal_info" style="font-family:var(--font)">${esc(s.general.legal_info || '')}</textarea>`)}</div>
    <div class="card col"><h3>Биллинг</h3>${F('billing', 'usd_rub_rate', 'Курс: рублей за $1', 'number', 'По этому курсу рублёвые платежи зачисляются на USD-баланс. Заложите сюда свою наценку на курс')}
      <div class="grid g2">${F('billing', 'min_topup_rub', 'Мин. пополнение, ₽', 'number')}${F('billing', 'min_topup_usd', 'Мин. пополнение, $', 'number')}</div>
      ${F('billing', 'topup_bonus', 'Бонус к пополнению', 'text', 'Формат «от $:процент» через запятую. Например: 50:5, 200:10 — от $50 +5%, от $200 +10%. Пусто — без бонуса')}
      <div class="alert info small">Баланс клиентов хранится в USD. Цена запроса = токены × цена модели за 1M. Сумма с точностью до 10⁻⁹ $.</div></div>
    <div class="card col"><div class="row between"><h3>Пригласи друга</h3>${sw('data-s="referral.enabled" data-type="bool"', s.referral.enabled)}</div>
      <div class="grid g2">${F('referral', 'inviter_bonus_usd', 'Бонус пригласившему, $', 'number')}${F('referral', 'friend_bonus_usd', 'Бонус другу, $', 'number', 'Начисляется при регистрации по ссылке')}</div>
      ${F('referral', 'require_topup', 'Бонус пригласившему — после первого пополнения друга', 'bool', 'Защита от накруток: фейковые аккаунты ничего не принесут')}</div>
    <div class="card col"><div class="row between"><div class="row">${plogo('custom', 'Platega')}<div><h3>Platega</h3><div class="small muted">СБП, карты, SberPay · <a href="https://platega.io" target="_blank" style="color:var(--link)">platega.io</a></div></div></div>${sw('data-s="platega.enabled" data-type="bool"', s.platega.enabled)}</div>
      ${F('platega', 'merchant_id', 'Merchant ID', 'text', 'ЛК Platega → Настройки → API')}${F('platega', 'secret', 'API Secret (X-Secret)', 'secret')}
      <div class="grid g2">${F('platega', 'payment_method', 'Способ оплаты', '', '', `<select class="inp" data-s="platega.payment_method">${plMethods.map(([v, n]) => `<option value="${v}" ${s.platega.payment_method == v ? 'selected' : ''}>${n}</option>`).join('')}</select>`)}${F('platega', 'title', 'Название для клиентов')}</div>
      ${F('platega', 'base_url', 'API URL', 'text', 'Обычно не нужно менять')}${wh(s.webhooks.platega)}<div class="alert small">Скопируйте Callback URL и вставьте его в ЛК Platega → Настройки → Callback URLs. Сайт должен быть доступен по HTTPS-домену.</div></div>
    <div class="card col"><div class="row between"><div class="row">${plogo('custom', 'CB')}<div><h3>Crypto Pay (CryptoBot)</h3><div class="small muted">USDT, TON, BTC и др. · <a href="https://t.me/send" target="_blank" style="color:var(--link)">@send</a></div></div></div>${sw('data-s="cryptobot.enabled" data-type="bool"', s.cryptobot.enabled)}</div>
      ${F('cryptobot', 'token', 'API Token', 'secret', '@send → Crypto Pay → Создать приложение → API-токен')}${F('cryptobot', 'assets', 'Принимаемые валюты', 'text', 'Через запятую')}
      <div class="grid g2">${F('cryptobot', 'title', 'Название для клиентов')}<div>${F('cryptobot', 'testnet', 'Тестовая сеть (testnet)', 'bool', '@CryptoTestnetBot')}</div></div>
      ${wh(s.webhooks.cryptobot)}<div class="alert small">В @send → Crypto Pay → Мои приложения → ваше приложение → Webhooks → включите и вставьте этот URL.</div><button class="btn" id="tcb" style="align-self:flex-start">${ic('refresh')}Проверить токен</button></div>
    <div class="card col"><div class="row"><div class="logo" style="background:#24292f">${GH_SVG}</div><div><h3>Вход через GitHub</h3><div class="small muted"><a href="https://github.com/settings/developers" target="_blank" style="color:var(--link)">github.com/settings/developers</a> → OAuth Apps → New OAuth App</div></div></div>
      ${F('oauth', 'github_client_id', 'Client ID')}${F('oauth', 'github_client_secret', 'Client Secret', 'secret')}
      <div class="field"><label>Homepage URL</label><div class="keybox" style="border-style:solid;border-color:var(--bd);font-size:12px"><span class="grow">${esc(s.webhooks.site)}</span>${copyBtn(s.webhooks.site)}</div></div>
      <div class="field"><label>Authorization callback URL</label><div class="keybox" style="border-style:solid;border-color:var(--bd);font-size:12px"><span class="grow">${esc(s.webhooks.github)}</span>${copyBtn(s.webhooks.github)}</div></div></div>
    <div class="card col"><div class="row"><div class="logo" style="background:#fff">${G_SVG}</div><div><h3>Вход через Google</h3><div class="small muted"><a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color:var(--link)">Google Cloud Console</a> → Credentials → OAuth client ID → Web application</div></div></div>
      ${F('oauth', 'google_client_id', 'Client ID')}${F('oauth', 'google_client_secret', 'Client Secret', 'secret')}
      <div class="field"><label>Authorized redirect URI</label><div class="keybox" style="border-style:solid;border-color:var(--bd);font-size:12px"><span class="grow">${esc(s.webhooks.google)}</span>${copyBtn(s.webhooks.google)}</div></div>
      <div class="alert small">Способ входа появится на главной, как только заполнены Client ID и Secret. Если поля пустые — берутся из .env.</div></div></div>`;
  const collect = () => { const out = {}; $$('[data-s]').forEach(i => { const [sec, k] = i.dataset.s.split('.'); out[sec] ||= {}; const v = i.dataset.type === 'bool' ? i.checked : i.value; if (i.type === 'password' && !v) return; out[sec][k] = i.type === 'number' ? +v : v; }); return out; };
  $('#ss').onclick = e => busy(e.currentTarget, async () => { await api('/api/admin/settings', { method: 'PUT', body: collect() }); toast('Настройки сохранены'); const c = await api('/api/public/config'); S.cfg = c; render(); });
  $('#tcb').onclick = e => busy(e.currentTarget, async () => { await api('/api/admin/settings', { method: 'PUT', body: collect() }); const r = await api('/api/admin/settings/test/cryptobot', { method: 'POST' }); toast('Токен работает: ' + (r.info.name || r.info.app_id)); });
}, { auth: true, admin: true, title: 'Настройки' });

// ---------- boot
(() => { const m = (location.search + '&' + location.hash).match(/[?&]ref=([0-9a-z]{7,16})/i); if (!m) return;
  const c = m[1].toLowerCase(); localStorage.setItem('ref', c); document.cookie = `ref=${c}; max-age=${30 * 86400}; path=/; SameSite=Lax`;
  if (location.search) history.replaceState(null, '', location.pathname + location.hash); })();
(async () => { try { S.cfg = await api('/api/public/config'); } catch {} render(); })();
