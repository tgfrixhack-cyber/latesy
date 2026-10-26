/* Public landing (#/, #/login, #/register).
   Order: hero with a real request · prices (live from /api/public/models) · connect · billing · status · FAQ. */
'use strict';
const LP = {};
const LP_EX = { pin: 1200, pout: 400 }; // tokens used in the worked example
// Volume calculator: the slider is continuous but logarithmic, otherwise 500K–5M would fit into the first 5% of the track.
const LP_VOL = { min: 5e5, max: 1e8, steps: 1000, ticks: [5e5, 1e6, 5e6, 1e7, 5e7, 1e8] };
const LP_MIX = [['Чат-бот', 3, 1], ['Документы', 10, 1], ['Генерация', 1, 3]]; // label, input : output
// brands.js key → company shown in the provider strip; keys without a label are left out
const LP_BRANDS = { openai: 'OpenAI', claude: 'Anthropic', gemini: 'Google', gemma: 'Google', google: 'Google', deepseek: 'DeepSeek', grok: 'xAI',
  mistral: 'Mistral', qwen: 'Qwen', meta: 'Meta', kimi: 'Moonshot', zhipu: 'Zhipu', minimax: 'MiniMax', cohere: 'Cohere', perplexity: 'Perplexity',
  microsoft: 'Microsoft', nvidia: 'NVIDIA' };

// The server renders a static copy of this page (landing_ssr in app/seo.py, including the FAQ): keep texts in sync.
function landingPage(el, p, q, { login = false } = {}) {
  LP.vol = LP.vol || 1e7; LP.mix = LP.mix || 0; // kept across language re-renders
  const cfg = S.cfg, stOn = cfg.status_page !== false, host = location.origin, perks = lpPerks(cfg);
  let sn = 0; const num = () => String(++sn).padStart(2, '0'); // section numbers follow the order on the page
  const nav = [['prices', 'Цены'], ['connect', 'Подключение'], ['pay', 'Оплата']].concat(stOn ? [['status', 'Статус']] : [], [['faq', 'Вопросы']]);
  const brand = `<a class="brand lp-brand" href="#/" data-go="top"><div class="logo">${LOGO}</div><span>${esc(cfg.site_name)}</span></a>`;
  el.innerHTML = `<div class="lp" id="lp">
  <header class="lp-top" id="lpTop"><div class="lp-w lp-top-in">
    ${brand}
    <nav class="lp-nav">${nav.map(([id, t]) => `<a href="#/" data-go="${id}">${t}</a>`).join('')}</nav>
    <div class="lp-act">${langSw()}<button class="btn sm icon ghost" id="lpTh" title="Тема">${ic(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button><button class="lp-in" data-login>Войти</button><button class="btn pri sm lp-key" data-login>Получить ключ</button></div>
  </div></header>

  <section class="lp-hero" data-sec="top"><div class="lp-w"><div class="lp-hero-in">
    <div class="lp-hero-l">
      <h1 class="lp-h1 lp-brandh" data-noi18n>${esc(cfg.site_name)} API</h1>
      <p class="lp-sig" aria-label="true ApiKey"><span class="lp-sig-k">true</span> ApiKey<i class="lp-caret" aria-hidden="true"></i></p>
      <p class="lp-lead">GPT, Claude, Gemini, DeepSeek и другие модели по одному OpenAI-совместимому ключу, с оплатой в рублях. Чтобы подключиться, замените адрес API в своём коде, Claude Code, Codex или Cursor. Баланс пополняется через СБП, картой или криптовалютой.</p>
      <div class="lp-cta"><button class="btn pri lg" data-login>Получить ключ</button><a class="lp-more" href="#/" data-go="prices">Посмотреть цены</a></div>
      <dl class="lp-facts" id="lpFacts">${lpFacts(null)}</dl>
    </div>
    <div class="lp-hero-r">
      <div class="lp-obj" id="lpObj" aria-hidden="true"><canvas></canvas><div class="logo lp-obj-fb">${LOGO}</div><span class="lp-obj-hint">Потяните, чтобы повернуть</span></div>
      <div class="lp-hero-v">${lpReq(host, null)}</div>
    </div>
  </div></div></section>
  <div class="lp-brands" id="lpBrands"></div>

  <section class="lp-sec" data-sec="prices"><div class="lp-w">
    <div class="lp-sh"><span class="lp-n">${num()}</span><div><h2>Цены</h2><p>Цена указана за 1 млн токенов, отдельно для входа и выхода. Списываем по полю <code>usage</code> из ответа модели, без округлений до тысяч.</p></div></div>
    <div class="lp-vol" id="lpVol">${lpVolBox()}</div>
    <div class="lp-pr-bar"><input class="inp" id="lpQ" type="search" placeholder="Поиск по названию модели" autocomplete="off"><span class="small dim" id="lpCnt"></span><a class="lp-more lp-pr-all" href="/models">Все модели и цены</a></div>
    <div class="tbl-wrap lp-pr" id="lpPr">${lpPriceSkel()}</div>
  </div></section>

  <section class="lp-sec lp-ink" data-sec="connect"><div class="lp-w">
    <div class="lp-sh"><span class="lp-n">${num()}</span><div><h2>Подключение</h2><p>Шлюз повторяет OpenAI API, поэтому официальные SDK, LangChain и IDE-ассистенты работают без доработок. Нужно поменять адрес и ключ.</p></div></div>
    <div class="lp-split">
      <ul class="lp-list">
        <li>Стриминг, вызов инструментов и JSON-режим работают так же, как у OpenAI.</li>
        <li>Для клиентов Anthropic есть отдельный совместимый эндпоинт.</li>
        <li>Если у модели несколько провайдеров, при сбое запрос уходит на другой.</li>
      </ul>
      <div class="lp-code" data-noi18n>${lpCode(host)}</div>
    </div>
  </div></section>

  <section class="lp-sec" data-sec="pay"><div class="lp-w">
    <div class="lp-sh"><span class="lp-n">${num()}</span><div><h2>Оплата</h2></div></div>
    <div class="${perks ? 'lp-split' : ''}">
      <dl class="lp-rows">
        <div><dt>Способы</dt><dd>СБП, банковские карты, криптовалюта.</dd></div>
        <div><dt>Списание</dt><dd>За фактические токены каждого запроса по тарифу модели. Подписки и абонентской платы нет.</dd></div>
        <div><dt>Контроль</dt><dd>Лимит трат на каждый ключ, история запросов и расходы по дням в кабинете.</dd></div>
      </dl>
      ${perks}
    </div>
  </div></section>

  ${stOn ? `<section class="lp-sec" data-sec="status"><div class="lp-w">
    <div class="lp-sh"><span class="lp-n">${num()}</span><div><h2>Статус</h2><p>Данные за последние 24 часа, обновляются раз в минуту.</p><a class="lp-more lp-sh-a" href="#/status">Подробная страница</a></div></div>
    <div id="lpSt">${lpStatusSkel()}</div></div></section>` : ''}

  <section class="lp-sec" data-sec="faq"><div class="lp-w">
    <div class="lp-sh"><span class="lp-n">${num()}</span><div><h2>Вопросы</h2></div></div>
    <dl class="lp-faq">${[
      ['Нужно ли менять код?', 'Нет. Достаточно заменить адрес API и ключ. Подходят официальные SDK OpenAI и любые инструменты, где можно указать свой адрес.'],
      ['Как считается стоимость запроса?', 'Число входных и выходных токенов умножается на тариф модели. Стоимость каждого запроса видна в истории в кабинете.'],
      ['Можно ли ограничить расходы?', 'Да, для каждого ключа задаётся лимит. Когда он исчерпан, этот ключ перестаёт принимать запросы, остальные работают дальше.'],
      ['Что будет, если модель недоступна?', 'Если у модели несколько провайдеров, запрос автоматически уйдёт на работающий. Текущее состояние видно в разделе «Статус».'],
      ['Какие модели принимают изображения?', 'Те, у которых в таблице цен указано «изображения». Вызов инструментов отмечен там же.'],
      ['Нужен ли отдельный баланс для каждого ключа?', 'Нет, баланс один на все ключи и модели.'],
    ].map(([qq, a]) => `<div><dt>${qq}</dt><dd>${a}</dd></div>`).join('')}</dl>
  </div></section>

  <section class="lp-end"><div class="lp-w lp-end-in">
    <h2>Попробуйте на своём коде</h2>
    <div><p>Нужно заменить только адрес API и ключ.</p><div class="lp-cta"><button class="btn lg" data-login>Получить ключ</button><a class="lp-more" href="#/" data-go="prices">Посмотреть цены</a></div></div>
  </div></section>

  <footer class="lp-foot"><div class="lp-w lp-foot-in">
    <div class="lp-foot-b">${brand}<p class="small muted">OpenAI-совместимый доступ к языковым моделям с оплатой по токенам.</p></div>
    <div><div class="lp-foot-h">Сервис</div><a href="#/" data-go="prices">Цены</a><a href="#/" data-go="connect">Подключение</a>${stOn ? '<a href="#/status">Статус</a>' : ''}<a href="#/" data-login>Войти</a></div>
    <div><div class="lp-foot-h">Документы</div><a href="/privacy">Политика конфиденциальности</a><a href="/terms">Пользовательское соглашение</a></div>
    <div><div class="lp-foot-h">Поддержка</div>${cfg.support_contact ? `<span data-noi18n>${esc(cfg.support_contact)}</span>` : ''}<a href="#/" data-login>Чат в личном кабинете</a><a href="#/" data-go="faq">Вопросы и ответы</a></div>
  </div><div class="lp-w"><div class="lp-foot-c small dim">© ${new Date().getFullYear()} ${esc(cfg.site_name)}</div></div></footer></div>`;

  const root = $('#lp');
  root.addEventListener('click', e => {
    const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); lpGo(g.dataset.go); return; }
    const l = e.target.closest('[data-login]'); if (l) { e.preventDefault(); lpLogin({}); return; }
    const m = e.target.closest('[data-more]'); if (m) { LP.all = true; lpPrices(); return; }
    const v = e.target.closest('[data-vol]'); if (v) { LP.vol = +v.dataset.vol; $('#lpRng').value = lpPosOf(LP.vol); lpVolUpd(); return; }
    const x = e.target.closest('[data-mix]'); if (x) { LP.mix = +x.dataset.mix; $$('[data-mix]', root).forEach(b => b.classList.toggle('on', b === x)); lpPrices(); lpVolUpd(); }
  });
  $('#lpRng').oninput = e => { LP.vol = lpVolAt(+e.target.value); lpVolUpd(); };
  $('#lpTh').onclick = e => themeSwitch(e.currentTarget);
  const top = $('#lpTop'), links = $$('.lp-nav a', root), secs = $$('[data-sec]', root);
  const onScroll = () => { if (!top.isConnected) return removeEventListener('scroll', onScroll);
    top.classList.toggle('scrolled', scrollY > 8);
    let cur = ''; for (const s of secs) if (s.getBoundingClientRect().top < innerHeight * .35) cur = s.dataset.sec;
    links.forEach(a => a.classList.toggle('on', a.dataset.go === cur)); };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  LP.key3d?.destroy(); LP.key3d = window.Key3D ? Key3D.mount($('#lpObj')) : null; // the old one is gone after a language re-render
  lpTabs($('.lp-code', root));
  $('#lpQ').oninput = e => { LP.q = e.target.value.trim().toLowerCase(); lpPrices(); };
  LP.q = ''; LP.all = false; LP.models = null; LP.st = null;
  // /#/?go=faq from the server-rendered pages: scroll once the prices have loaded and the layout has settled
  LP.go = q.go || null; if (q.go) history.replaceState(null, '', location.pathname + '#/');
  lpLoadModels(host);
  lpVolUpd();
  if (stOn) lpStatus();
  if (login) lpLogin(q);
}

// ---------- data
const lpPick = ms => ms.find(m => m.popular && m.kind !== 'image') || ms.find(m => m.kind !== 'image' && m.price_in > 0) || ms[0];
const lpRate = () => (typeof S !== 'undefined' && S.cfg && +S.cfg.usd_rub_rate) || 95;
const lpUsd = (v, d = 2) => { const x = Number(v || 0) * lpRate();
  return (Math.abs(x - Math.round(x)) < 0.005 ? Math.round(x) : x).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: d }) + ' ₽'; };
async function lpLoadModels(host) {
  let ms; try { ms = await api('/api/public/models'); } catch { ms = []; }
  if (!$('#lpPr')) return;
  LP.models = ms.filter(m => m.kind !== 'embedding' || m.price_in > 0);
  const ex = LP.models.length ? lpPick(LP.models) : null;
  $('#lpFacts').innerHTML = lpFacts(LP.models);
  $('.lp-hero-v').innerHTML = lpReq(host, ex);
  const br = lpBrands(LP.models), bx = $('#lpBrands'); bx.innerHTML = br; bx.hidden = !br;
  lpPrices(); lpVolUpd();
  if (LP.go) { const g = LP.go; LP.go = null; requestAnimationFrame(() => lpGo(g)); }
}
function lpFacts(ms) {
  const items = [];
  if (ms && ms.length) {
    const priced = ms.filter(m => m.price_in > 0 && m.kind !== 'embedding' && m.kind !== 'image'); // the cheapest embedding is not a fair «from»
    items.push(['Моделей в каталоге', nf(ms.length)]);
    if (priced.length) items.push(['Вход, от', `${lpUsd(Math.min(...priced.map(m => m.price_in)))} / 1M`]);
  } else items.push(['Моделей в каталоге', '—']);
  items.push(['Абонентская плата', '0 ₽']);
  return items.map(([k, v]) => `<div><dt>${k}</dt><dd class="num">${v}</dd></div>`).join('');
}

// ---------- hero: a real request and the receipt for it
function lpReq(host, m) {
  const id = m ? m.id : 'gpt-4o-mini', a = m ? LP_EX.pin * m.price_in / 1e6 : 0, b = m ? LP_EX.pout * m.price_out / 1e6 : 0;
  const s = t => `<span class="tk-s">${esc(t)}</span>`, k = t => `<span class="tk-k">${esc(t)}</span>`, c = t => `<span class="tk-c">${esc(t)}</span>`;
  const r = v => !m ? '—' : lpUsd(v, v * lpRate() < 1 ? 4 : 2); // billing is exact, so the receipt shows fractions of a kopeck
  return `<div class="lp-viz" data-noi18n>
    <div class="lp-req">
      <div class="lp-req-h"><span>POST /v1/chat/completions</span><span class="lp-req-st">200 OK</span></div>
      <pre class="lp-req-b">{
  ${k('"model"')}: ${s(`"${id}"`)},
  ${k('"messages"')}: [
    { ${k('"role"')}: ${s('"user"')}, ${k('"content"')}: ${s(`"${I18N.t('Сократи текст договора до 5 пунктов')}"`)} }
  ]
}</pre>
      <div class="lp-req-sep">${c(I18N.t('ответ, фрагмент'))}</div>
      <pre class="lp-req-b">${k('"usage"')}: {
  ${k('"prompt_tokens"')}: ${nf(LP_EX.pin).replace(/\s/g, '')},
  ${k('"completion_tokens"')}: ${LP_EX.pout}
}</pre>
    </div>
    <div class="lp-rcpt"><div class="lp-rcpt-in">
      <div class="lp-rcpt-t">${I18N.t('Списано с баланса')}</div>
      <div class="lp-rcpt-id">${esc(id)}</div>
      <div class="lp-rcpt-r"><span>${I18N.t('Входные токены')}</span><b>${r(a)}</b></div>
      <div class="lp-rcpt-s">${nf(LP_EX.pin)} × ${m ? lpUsd(m.price_in) : '—'} / 1M</div>
      <div class="lp-rcpt-r"><span>${I18N.t('Выходные токены')}</span><b>${r(b)}</b></div>
      <div class="lp-rcpt-s">${nf(LP_EX.pout)} × ${m ? lpUsd(m.price_out) : '—'} / 1M</div>
      <div class="lp-rcpt-r lp-rcpt-tot"><span>${I18N.t('Итого')}</span><b>${r(a + b)}</b></div>
      <div class="lp-rcpt-bc"></div>
    </div></div>
  </div>`;
}

// ---------- provider strip: companies behind the models in the catalog, most models first
function lpBrands(ms) {
  const by = new Map();
  for (const m of ms) {
    const k = brandOf(m.id, m.name, m.family), label = LP_BRANDS[k]; if (!label) continue;
    const b = by.get(label) || { k, n: 0 }; b.n++; if (k === 'gemini') b.k = k; by.set(label, b); // Google: the Gemini mark
  }
  const list = [...by].filter(([, b]) => BRAND_SVG[b.k]).sort((x, y) => y[1].n - x[1].n);
  if (!list.length) return '';
  return `<div class="lp-w lp-brands-in"><span class="lp-n">В каталоге</span><ul>${list.map(([label, b]) => `<li>${BRAND_SVG[b.k]}<span data-noi18n>${label}</span></li>`).join('')}</ul></div>`;
}

// ---------- prices table
const lpPriceSkel = () => `<table><tbody>${'<tr><td colspan="6"><div class="skel" style="height:16px"></div></td></tr>'.repeat(6)}</tbody></table>`;
function lpCaps(m) {
  const c = [];
  if (m.vision) c.push('изображения'); if (m.tools) c.push('инструменты');
  if (m.kind === 'image') c.push('генерация изображений'); if (m.kind === 'embedding') c.push('эмбеддинги');
  return c.join(', ') || '—';
}
const lpCtx = n => !n ? '—' : n >= 1e6 ? String(Math.round(n / 1e5) / 10).replace('.', I18N.lang === 'ru' ? ',' : '.') + 'M' : Math.round(n / 1e3) + 'K';
function lpPrices() {
  const box = $('#lpPr'); if (!box || !LP.models) return;
  const all = LP.models.slice().sort((a, b) => (b.popular - a.popular) || String(a.family || '').localeCompare(String(b.family || '')) || a.id.localeCompare(b.id));
  const f = LP.q ? all.filter(m => (m.id + ' ' + (m.name || '') + ' ' + (m.family || '')).toLowerCase().includes(LP.q)) : all;
  const LIM = 12, rows = LP.rows = LP.all || LP.q ? f : f.slice(0, LIM), best = lpBest();
  $('#lpCnt').textContent = LP.models.length ? `${f.length} / ${LP.models.length}` : '';
  if (!LP.models.length) { box.innerHTML = `<div class="lp-empty">Каталог пока пуст. Модели появятся здесь, когда администратор их включит.</div>`; return; }
  if (!f.length) { box.innerHTML = `<div class="lp-empty">Ничего не найдено по запросу «${esc(LP.q)}».</div>`; return; }
  box.innerHTML = `<table><thead><tr><th>Модель</th><th class="r">Контекст</th><th class="r">Вход, ₽/1M</th><th class="r">Выход, ₽/1M</th><th class="r lp-vc" id="lpVolH" data-noi18n>${lpVolHead()}</th><th>Возможности</th></tr></thead><tbody>
    ${rows.map((m, i) => `<tr><td><div class="lp-mrow">${modelLogo(m, 1)}<div class="lp-mn"><a href="/models/${encodeURIComponent(m.id).replace(/%2F/g, '/')}"><b data-noi18n>${esc(m.name || m.id)}</b></a>${m.name && m.name !== m.id ? `<span class="mono dim" data-noi18n>${esc(m.id)}</span>` : ''}</div></div></td>
      <td class="r num">${lpCtx(m.context_length)}</td><td class="r num">${m.price_in ? lpUsd(m.price_in) : '—'}</td><td class="r num">${m.price_out ? lpUsd(m.price_out) : '—'}</td>
      <td class="r num lp-vc" data-ci="${i}">${best && best.m === m ? '<span class="badge ok">дешевле всех</span>' : ''}<span>${lpSum(lpCost(m))}</span></td><td class="muted">${lpCaps(m)}</td></tr>`).join('')}
  </tbody></table>${rows.length < f.length ? `<button class="lp-all" data-more>Показать все модели (${f.length})</button>` : ''}`;
}

// ---------- volume calculator: tokens per month × input/output mix → cost of every model
const lpVolAt = p => { const v = LP_VOL.min * (LP_VOL.max / LP_VOL.min) ** (p / LP_VOL.steps), e = 10 ** (Math.floor(Math.log10(v)) - 2);
  return Math.round(v / e) * e; }; // 3 significant digits: smooth to drag, still readable
const lpPosOf = v => Math.round(Math.log(v / LP_VOL.min) / Math.log(LP_VOL.max / LP_VOL.min) * LP_VOL.steps);
function lpTok(n, short) { // 12 300 000 → «12,3 млн» / «12.3M»
  n = +Number(n).toPrecision(3);
  const M = n >= 1e6, v = (n / (M ? 1e6 : 1e3)).toLocaleString(I18N.locale(), { maximumFractionDigits: 2 });
  return short || I18N.lang === 'en' ? v + (M ? 'M' : 'K') : v + (M ? ' млн' : ' тыс.');
}
const lpVolHead = () => (I18N.lang === 'en' ? 'For ' : 'За ') + lpTok(LP.vol);
function lpCost(m, n = LP.vol) {
  if (m.kind === 'image' || !(m.price_in > 0)) return null;
  if (m.kind === 'embedding') return n * m.price_in / 1e6; // embeddings have no output tokens
  const [, a, b] = LP_MIX[LP.mix];
  return n * (a * m.price_in + b * m.price_out) / (a + b) / 1e6;
}
const lpSum = c => c == null ? '—' : lpUsd(c, c * lpRate() >= 100 ? 0 : 2);
function lpBest() { // the ranking depends only on the mix, not on the volume
  let best = null;
  for (const m of LP.models || []) { if (m.kind === 'embedding') continue;
    const c = lpCost(m); if (c != null && (!best || c < best.c)) best = { m, c }; }
  return best;
}
function lpVolBox() {
  const p = lpPosOf(LP.vol), ruler = [];
  for (let e = 5; e <= 8; e++) for (let d = 1; d <= 9; d++) { const v = d * 10 ** e; if (v >= LP_VOL.min && v <= LP_VOL.max) ruler.push(v); } // 1…9 × 10^e, like a log scale
  return `<div class="lp-vol-top">
      <div><div class="lp-vol-l">Токенов в месяц</div><div class="lp-vol-v num" id="lpVolV" data-noi18n>${lpTok(LP.vol)}</div></div>
      <div class="lp-vol-mix"><span class="small dim">Тип нагрузки</span><div class="pills" role="group" aria-label="Тип нагрузки">
        ${LP_MIX.map(([t, a, b], i) => `<button type="button" data-mix="${i}" class="${i === LP.mix ? 'on' : ''}">${t} <span class="num" data-noi18n>${a}:${b}</span></button>`).join('')}
      </div></div>
    </div>
    <input type="range" class="lp-rng" id="lpRng" min="0" max="${LP_VOL.steps}" step="1" value="${p}" style="--p:${p / LP_VOL.steps * 100}%" aria-label="Токенов в месяц">
    <div class="lp-ruler" aria-hidden="true">${ruler.map(v => `<i class="${LP_VOL.ticks.includes(v) ? 'maj' : ''}" style="--t:${lpPosOf(v) / LP_VOL.steps}"></i>`).join('')}</div>
    <div class="lp-ticks" data-noi18n>${LP_VOL.ticks.map(v => `<button type="button" data-vol="${v}" class="${v === 5e7 ? 'opt' : ''}" style="--t:${lpPosOf(v) / LP_VOL.steps}">${lpTok(v, true)}</button>`).join('')}</div>
    <div class="lp-vol-f">
      <span class="muted num" id="lpVolS" data-noi18n></span>
      <div class="lp-vol-best" id="lpVolBest" hidden><span class="dim">Дешевле всех:</span><b id="lpBestN" data-noi18n></b><b class="num" id="lpBestV"></b><button class="btn pri sm" data-login>Получить ключ</button></div>
    </div>`;
}
function lpVolUpd() {
  const rng = $('#lpRng'); if (!rng) return;
  const n = LP.vol, [, a, b] = LP_MIX[LP.mix], en = I18N.lang === 'en', vin = lpTok(n * a / (a + b)), vout = lpTok(n * b / (a + b));
  rng.style.setProperty('--p', rng.value / LP_VOL.steps * 100 + '%');
  rng.setAttribute('aria-valuetext', `${lpTok(n)} ${en ? 'tokens' : 'токенов'}`);
  $('#lpVolV').textContent = lpTok(n);
  $('#lpVolS').textContent = en ? `${vin} input + ${vout} output` : `${vin} входных + ${vout} выходных`;
  const best = lpBest(), bx = $('#lpVolBest');
  bx.hidden = !best;
  if (best) { $('#lpBestN').textContent = best.m.name || best.m.id; $('#lpBestV').textContent = lpSum(best.c); }
  const h = $('#lpVolH'); if (h) h.textContent = lpVolHead();
  $$('#lpPr [data-ci]').forEach(td => { td.lastElementChild.textContent = lpSum(lpCost(LP.rows[+td.dataset.ci])); });
}

// ---------- payment perks: top-up bonus tiers, referral reward and minimum top-up, all from the public config
function lpPerks(cfg) {
  const en = I18N.lang === 'en', tiers = cfg.topup_bonus || [], rf = cfg.referral || {}, pm = cfg.pay_methods || [];
  const fb = rf.enabled ? +rf.friend_bonus || 0 : 0, ib = rf.enabled ? +rf.inviter_bonus || 0 : 0, out = [];
  if (tiers.length) out.push(`<div class="lp-perk"><div class="lp-card-h">Бонусы к пополнению</div>
    <table class="lp-card-t"><tbody>${tiers.map(([a, p]) => `<tr><td>Пополнение от <b class="num" data-noi18n>${lpUsd(a)}</b></td><td class="r"><span class="badge ok num" data-noi18n>+${p.toLocaleString(I18N.locale())}%</span></td></tr>`).join('')}</tbody></table>
    <p class="small muted">Процент считается от суммы одного платежа и зачисляется на баланс вместе с ним.</p></div>`);
  if (fb || ib) {
    const F = lpUsd(fb), I = lpUsd(ib), when = rf.require_topup ? (en ? 'after their first top-up' : 'после его первого пополнения') : (en ? 'right after they sign up' : 'сразу после его регистрации');
    const t = fb && ib ? (en ? `Your friend gets ${F} on sign-up via your link, and you get ${I} ${when}.` : `Друг получит ${F} при регистрации по вашей ссылке, а вы — ${I} ${when}.`)
      : fb ? (en ? `Your friend gets ${F} on sign-up via your link.` : `Друг получит ${F} при регистрации по вашей ссылке.`)
      : en ? `You get ${I} for every friend who signs up via your link${rf.require_topup ? ' and tops up' : ''}.` : `Вы получите ${I} за каждого друга, который зарегистрируется по вашей ссылке${rf.require_topup ? ' и пополнит баланс' : ''}.`;
    out.push(`<div class="lp-perk lp-ref">${ic('gift')}<div><b>Пригласите друга</b><p class="muted" data-noi18n>${t} ${en ? 'The link is in your dashboard.' : 'Ссылка — в личном кабинете.'}</p></div></div>`);
  }
  const rub = pm.find(m => m.currency === 'RUB'), usd = pm.find(m => m.currency === 'USD');
  const min = [rub && `${nf(rub.min)} ₽`, usd && `$${nf(usd.min)} ${en ? 'in crypto' : 'в криптовалюте'}`].filter(Boolean).join(', ');
  if (!out.length && !min) return '';
  return `<div class="lp-card">${out.join('')}<div class="lp-card-f"><span class="muted small" data-noi18n>${min ? (en ? 'Minimum top-up: ' : 'Минимальное пополнение — ') + min : ''}</span><button class="btn pri" data-login>Получить ключ</button></div></div>`;
}

// ---------- code diff with tabs
function lpCode(host) {
  const s = t => `<span class="tk-s">${esc(t)}</span>`, k = t => `<span class="tk-k">${t}</span>`;
  const tabs = {
    'Python': [[' ', `${k('from')} openai ${k('import')} OpenAI`], [' ', ''], [' ', 'client = OpenAI('], ['-', `    base_url=${s('"https://api.openai.com/v1"')},`], ['+', `    base_url=${s(`"${host}/v1"`)},`], [' ', `    api_key=os.environ[${s('"API_KEY"')}],`], [' ', ')']],
    'Node.js': [[' ', `${k('import')} OpenAI ${k('from')} ${s('"openai"')};`], [' ', ''], [' ', `${k('const')} client = ${k('new')} OpenAI({`], ['-', `  baseURL: ${s('"https://api.openai.com/v1"')},`], ['+', `  baseURL: ${s(`"${host}/v1"`)},`], [' ', '  apiKey: process.env.API_KEY,'], [' ', '});']],
    'curl': [['-', `curl ${s('https://api.openai.com/v1/chat/completions')} \\`], ['+', `curl ${s(`${host}/v1/chat/completions`)} \\`], [' ', `  -H ${s('"Authorization: Bearer $API_KEY"')} \\`], [' ', `  -H ${s('"Content-Type: application/json"')} \\`], [' ', `  -d ${s(`'{"model": "…", "messages": [...]}'`)}`]],
  };
  const plain = { 'Python': `from openai import OpenAI\n\nclient = OpenAI(\n    base_url="${host}/v1",\n    api_key=os.environ["API_KEY"],\n)`, 'Node.js': `import OpenAI from "openai";\n\nconst client = new OpenAI({\n  baseURL: "${host}/v1",\n  apiKey: process.env.API_KEY,\n});`, 'curl': `curl ${host}/v1/chat/completions \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model": "…", "messages": [...]}'` };
  LP.code = Object.fromEntries(Object.entries(tabs).map(([n, ls]) => [n, ls.map(([m, t], i) => `<div class="lp-ln ${m === '-' ? 'del' : m === '+' ? 'add' : ''}"><span class="lp-g">${i + 1}</span><span class="lp-m">${m === ' ' ? '' : m}</span><span class="lp-t">${t || ' '}</span></div>`).join('')]));
  LP.plain = plain;
  return `<div class="lp-code-h"><div class="lp-tabs" role="tablist">${Object.keys(tabs).map((n, i) => `<button role="tab" class="${i ? '' : 'on'}" data-tab="${n}">${n}</button>`).join('')}</div>${copyBtn(plain.Python, 'btn sm icon ghost lp-cp')}</div>
    <div class="lp-code-b" id="lpCodeB">${LP.code.Python}</div>`;
}
function lpTabs(box) {
  if (!box) return;
  const b = $('#lpCodeB'), cp = $('.lp-cp', box);
  $$('[data-tab]', box).forEach(btn => btn.onclick = () => {
    $$('[data-tab]', box).forEach(x => x.classList.toggle('on', x === btn));
    b.innerHTML = LP.code[btn.dataset.tab]; cp.dataset.copy = LP.plain[btn.dataset.tab]; });
}

// ---------- model status (one-line summary)
const lpStatusSkel = () => `<div class="lp-st-card"><div class="skel" style="height:44px;grid-column:1/-1"></div></div>`;
async function lpStatus() {
  const box = $('#lpSt'); if (!box) return;
  let d; try { d = await api('/api/public/status'); } catch { if (box.isConnected) { box.closest('[data-sec]').remove(); $('.lp-nav [data-go=status]')?.remove();
    $$('.lp-sh .lp-n').forEach((x, i) => { x.textContent = String(i + 1).padStart(2, '0'); }); } return; }
  if (!box.isConnected) return;
  if (!LP.stT) LP.stT = setInterval(() => { if (!$('#lpSt')) { clearInterval(LP.stT); LP.stT = 0; return; } lpStatus(); }, 60000);
  const ms = d.models, total = ms.length, up = ms.filter(m => m.status === 'ok').length, en = I18N.lang === 'en';
  if (!total) { box.innerHTML = '<div class="lp-empty">Моделей пока нет</div>'; return; }
  // A summary, not a per-model table: one broken route should not paint the landing red. Details live on #/status.
  const lvl = up === total ? 'ok' : up * 2 >= total ? 'degraded' : 'down';
  const head = { ok: 'Все модели работают', degraded: 'Часть моделей работает с перебоями', down: 'Большая часть моделей недоступна' }[lvl];
  const hh = iso => new Date(iso).toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit' });
  const pct = (n, e) => (Math.floor((1 - e / n) * 1e4) / 100).toLocaleString(I18N.locale(), { maximumFractionDigits: 2 }) + '%'; // floor: never round 99.996 up to 100
  const lv = (n, e) => !n ? 'none' : e / n >= .5 ? 'down' : e / n >= .1 ? 'degraded' : 'ok'; // same thresholds as status._level
  const hrs = ms[0].hours.map((h, i) => ms.reduce((a, m) => ({ t: h.hour, n: a.n + m.hours[i].requests, e: a.e + m.hours[i].errors }), { n: 0, e: 0 }));
  const n = ms.reduce((a, m) => a + m.requests_24h, 0), e = ms.reduce((a, m) => a + m.errors_24h, 0);
  const sub = [lvl !== 'ok' && (en ? `${up} of ${total} up` : `работают ${up} из ${total}`), n && (en ? `24 h availability ${pct(n, e)}` : `доступность за 24 часа ${pct(n, e)}`),
    (en ? 'updated ' : 'обновлено ') + hh(d.updated_at)].filter(Boolean).join(' · ');
  box.innerHTML = `<div class="lp-st-card"><span class="st-dot big st-${ST[lvl][1]}"></span>
    <div><b>${head}</b><div class="small muted" data-noi18n>${sub[0].toUpperCase() + sub.slice(1)}</div></div>
    <div class="st-bars lp-bars" data-noi18n>${hrs.map(h => `<i class="st-${ST[lv(h.n, h.e)][1]}" title="${hh(h.t)} · ${h.n ? pct(h.n, h.e) : en ? 'no requests' : 'нет запросов'}"></i>`).join('')}</div></div>`;
}

// ---------- helpers
function lpGo(id) {
  const t = id === 'top' ? 0 : ($(`[data-sec="${id}"]`)?.getBoundingClientRect().top ?? 0) + scrollY - 60;
  scrollTo({ top: Math.max(0, t), behavior: REDUCED() ? 'auto' : 'smooth' });
}
function lpLogin(q) {
  if ($('.ov .auth-m')) return;
  const o = S.cfg.oauth || {}, any = o.github || o.google;
  modal('Вход и регистрация', `<p class="muted" style="margin:-4px 0 20px">Аккаунт создаётся автоматически при первом входе</p>
    ${q.error ? `<div class="alert err small" style="margin-bottom:14px">${esc(q.error)}</div>` : ''}
    ${localStorage.getItem('ref') && S.cfg.referral?.enabled && S.cfg.referral.friend_bonus > 0 ? `<div class="alert info ico small" style="margin-bottom:14px">${ic('gift')}<span>Вас пригласил друг: после регистрации на баланс придёт <b>${rub(S.cfg.referral.friend_bonus)}</b> на использование API.</span></div>` : ''}
    ${any ? `<div class="col">${o.github ? `<a class="btn oauth" href="/api/auth/oauth/github/start">${GH_SVG}Продолжить с GitHub</a>` : ''}${o.google ? `<a class="btn oauth" href="/api/auth/oauth/google/start">${G_SVG}Продолжить с Google</a>` : ''}</div>`
      : `<div class="alert warn small">Вход временно недоступен, попробуйте позже.${S.cfg.support_contact ? ` Поддержка: <span data-noi18n>${esc(S.cfg.support_contact)}</span>` : ''}</div>`}
    <p class="small dim" style="margin:20px 0 0">Продолжая, вы принимаете условия использования сервиса.</p>`, { size: 'auth-m' });
  if (/^#\/(login|register)/.test(location.hash)) history.replaceState(null, '', location.pathname + '#/');
}
