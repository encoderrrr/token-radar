// Token Radar's dashboard. It reads the sealed snapshot's data from data.js (window.RADAR), the
// only data it ever shows; it fetches nothing. The page is a board, a filter and a detail view:
//
//   - The board ranks the snapshot's pre-token protocols by implied value, strongest first.
//   - The Live tokens tab sets those aside: the token-trading protocols, by market cap, so the
//     board's pre-token rows are never confused with the market's own values.
//   - A row's detail shows the value breakdown (TVL x category multiple x growth x maturity),
//     recomputed here from the row's own figures and compared with the board's value, plus the
//     farm plan the board carries for that protocol.
//   - The model panel prints the category multiples the snapshot itself produced.
//   - The URL hash carries the state: #p=<slug> opens a detail, #q= searches, #category= and
//     #chain= filter, #watchlist=1 keeps only the watchlist. The screenshots are plain URLs.

(function () {
  'use strict';

  var RADAR = window.RADAR;
  if (!RADAR || !Array.isArray(RADAR.rows)) {
    document.body.innerHTML = '<p style="padding:32px">Token Radar could not load its data.</p>';
    return;
  }

  var watchlistSet = new Set(RADAR.watchlist || []);
  var rows = RADAR.rows.slice();
  var live = RADAR.live.slice();
  var state = { q: '', category: '', chain: '', watchlist: false, tab: 'pre', sort: 'rank', dir: 1 };
  var maxImplied = rows.length ? rows[0].implied_value_usd : 1;
  var maxMcap = live.length ? live[0].mcap_usd || 1 : 1;

  var $ = function (id) { return document.getElementById(id); };
  var qEl = $('q'), catEl = $('category'), chainEl = $('chain'), watchEl = $('watchlist');
  var tabPre = $('tab-pre'), tabLive = $('tab-live'), tbody = $('rows'), emptyEl = $('empty');
  var hintEl = $('hint'), dialog = $('detail');

  /** A dollar amount, compact: $1.2B, $45.6M, $123K, $0. */
  function money(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var abs = Math.abs(v);
    if (abs >= 1e9) return '$' + (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
    if (abs >= 1e6) return '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (abs >= 1e3) return '$' + (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return '$' + Math.round(v);
  }

  /** A 7-day change with its sign, or a dash when the snapshot carries none. */
  function changeText(v) {
    if (v === null || v === undefined) return '—';
    return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
  }

  /** An age in days as a plain phrase, or a dash when the listing date is unknown. */
  function ageText(v) {
    if (v === null || v === undefined) return 'unknown';
    if (v === 0) return 'listed today';
    if (v < 30) return v + ' days';
    if (v < 365) return Math.round(v / 30) + ' months';
    return (v / 365).toFixed(1) + ' years';
  }

  /** The board's own figures, recomputed: TVL x category multiple x growth x maturity. */
  function impliedOf(r) {
    return Math.max(1, Math.round(r.tvl_usd * r.category_multiple * r.growth_multiplier * r.maturity_multiplier));
  }

  /** The four stat tiles and the lede, from the snapshot's own counts. */
  function renderHeader() {
    var stats = [
      { n: RADAR.watchlist_size, label: 'Watchlist covered' },
      { n: RADAR.board_size, label: 'Protocols ranked' },
      { n: RADAR.early_size, label: 'Early finds' },
      { n: RADAR.live_size, label: 'Live tokens shown' },
    ];
    $('stats').innerHTML = stats.map(function (s) {
      return '<div class="stat"><b>' + s.n + '</b><span>' + s.label + '</span></div>';
    }).join('');
    $('lede').innerHTML =
      '<p><b>' + RADAR.board_size + ' pre-token protocols</b> ranked by implied value — the whole ' +
      'watchlist of <b>' + RADAR.watchlist_size + '</b> plus <b>' + RADAR.early_size + '</b> early finds ' +
      'below the $50M floor, all scored by the same model from the snapshot of <b>' + RADAR.as_of + '</b>. ' +
      'Click a row for its value breakdown and farm plan.</p>';
    $('source').textContent = 'Source: ' + RADAR.source + ' · Snapshot as of ' + RADAR.as_of +
      ' · Floor $' + (RADAR.floor_usd / 1e6) + 'M · Model ' + RADAR.model_version +
      ' (category median mcap/TVL, shrunk halfway to the global median; growth halved; maturity 0.6–1.0)';
  }

  /** The filter selects, filled from the data, not from a hard-coded list. */
  function renderFilters() {
    var cats = [...new Set(rows.map(function (r) { return r.category || 'Other'; }))].sort();
    var chains = [...new Set(rows.flatMap(function (r) { return r.chains; }))].sort();
    catEl.innerHTML = '<option value="">All categories</option>' + cats.map(function (c) {
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');
    chainEl.innerHTML = '<option value="">All chains</option>' + chains.map(function (c) {
      return '<option value="' + c + '">' + c + '</option>';
    }).join('');
  }

  /** The model panel: the category table the snapshot produced. */
  function renderComps() {
    $('comp-rows').innerHTML = (RADAR.comps || []).map(function (c) {
      return '<tr><td>' + c.category + '</td><td class="num">' + c.comps + '</td><td class="num">' +
        (c.median === null ? '—' : c.median.toFixed(3)) + '</td><td class="num">' + c.multiple.toFixed(3) + '</td></tr>';
    }).join('');
  }

  /** The rows the current filters leave, in the current sort order. */
  function filteredRows() {
    var list = state.tab === 'pre' ? rows : live;
    var q = state.q.trim().toLowerCase();
    var out = list.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      if (state.category && (r.category || 'Other') !== state.category) return false;
      if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
      if (state.watchlist && state.tab === 'pre' && !watchlistSet.has(r.slug)) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    out.sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'category') { av = a.category || ''; bv = b.category || ''; }
      else if (key === 'chain') { av = a.chains[0] || ''; bv = b.chains[0] || ''; }
      else if (key === 'implied_value_usd') { av = state.tab === 'pre' ? a.implied_value_usd : (a.mcap_usd || 0); bv = state.tab === 'pre' ? b.implied_value_usd : (b.mcap_usd || 0); }
      else if (key === 'rank') { av = state.tab === 'pre' ? a.rank : live.indexOf(a) + 1; bv = state.tab === 'pre' ? b.rank : live.indexOf(b) + 1; }
      else { av = a[key] === null || a[key] === undefined ? -Infinity : a[key]; bv = b[key] === null || b[key] === undefined ? -Infinity : b[key]; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return state.tab === 'pre' ? a.rank - b.rank : (b.mcap_usd || 0) - (a.mcap_usd || 0);
    });
    return out;
  }

  /** The board table for the current state. */
  function renderTable() {
    var list = filteredRows();
    var pre = state.tab === 'pre';
    document.querySelector('#board thead tr th[data-sort="implied_value_usd"]').textContent = pre ? 'Implied value' : 'Market cap';
    tbody.innerHTML = list.map(function (r, i) {
      var rank = pre ? r.rank : live.indexOf(r) + 1;
      var value = pre ? r.implied_value_usd : (r.mcap_usd || 0);
      var max = pre ? maxImplied : maxMcap;
      var pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
      var chg = changeText(r.change_7d);
      var chgClass = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'up' : 'down');
      var badge = pre && watchlistSet.has(r.slug) ? '<span class="badge">Watchlist</span>' : '';
      return '<tr data-slug="' + r.slug + '"><td>' + rank + '</td>' +
        '<td class="name">' + r.name + badge + '<span class="slug">' + r.slug + '</span></td>' +
        '<td>' + (r.category || 'Other') + '</td>' +
        '<td>' + (r.chains.length ? r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') : '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + chgClass + '">' + chg + '</td>' +
        '<td class="num">' + money(value) + '</td>' +
        '<td class="bar-cell"><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div></td></tr>';
    }).join('');
    emptyEl.hidden = list.length > 0;
    hintEl.textContent = pre
      ? 'Showing ' + list.length + ' of ' + rows.length + ' pre-token protocols, ranked by implied value.'
      : 'Showing ' + list.length + ' of ' + live.length + ' live-token protocols, by market cap. These already trade — they are set aside, not ranked.';
    document.querySelectorAll('#board thead th[data-sort]').forEach(function (th) {
      th.setAttribute('aria-sort', th.getAttribute('data-sort') === state.sort ? (state.dir === 1 ? 'ascending' : 'descending') : 'none');
    });
  }

  /** The detail dialog for one pre-token protocol: breakdown, farm plan, and the check. */
  var detailSlug = null;
  function openDetail(slug) {
    var r = rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    if (dialog.open && detailSlug === slug) return;
    detailSlug = slug;
    var recomputed = impliedOf(r);
    var diff = Math.abs(recomputed - r.implied_value_usd) / r.implied_value_usd;
    var check = diff <= 0.02
      ? '<p>Recomputed from the row’s own figures: <b>' + money(recomputed) + '</b> — matches the board (within rounding).</p>'
      : '<p class="mismatch">Recomputed ' + money(recomputed) + ' but the board says ' + money(r.implied_value_usd) + ' — the data would be stale.</p>';
    var chainsText = r.chains.length > 4
      ? r.chains.slice(0, 4).join(', ') + ' +' + (r.chains.length - 4) + ' more'
      : (r.chains.join(', ') || 'no chain listed');
    $('detail-title').textContent = r.name;
    $('detail-body').innerHTML =
      '<p>' + (r.category || 'Other') + ' · ' + chainsText +
      (watchlistSet.has(r.slug) ? ' · <b>Watchlist</b>' : '') + '</p>' +
      '<h3>Value breakdown</h3>' +
      '<div class="kv">' +
      '<div><span>TVL</span><b>' + money(r.tvl_usd) + '</b></div>' +
      '<div><span>Category multiple</span><b>' + r.category_multiple.toFixed(3) + '×</b></div>' +
      '<div><span>7d growth</span><b>' + changeText(r.change_7d) + ' → ' + r.growth_multiplier.toFixed(2) + '×</b></div>' +
      '<div><span>Maturity (' + ageText(r.age_days) + ')</span><b>' + r.maturity_multiplier.toFixed(2) + '×</b></div>' +
      '<div><span>Implied value</span><b>' + money(r.implied_value_usd) + '</b></div>' +
      '<div><span>Listed</span><b>' + (r.listed_at || 'unknown') + '</b></div>' +
      '</div>' +
      '<p>' + money(r.tvl_usd) + ' × ' + r.category_multiple.toFixed(3) + ' × ' + r.growth_multiplier.toFixed(2) + ' × ' + r.maturity_multiplier.toFixed(2) + ' = <b>' + money(r.implied_value_usd) + '</b></p>' +
      check +
      '<h3>Farm plan</h3>' +
      '<ol>' + (r.steps || []).map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
      '<p class="note">Implied values are this entry’s own model, not make.fun’s; no token is promised. Farming costs gas and carries smart-contract risk — never farm with money you cannot lose.</p>';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    setHash({ p: slug });
  }

  /** The hash carries the state; the screenshots are plain URLs built on it. */
  function setHash(patch) {
    var params = new URLSearchParams(location.hash.slice(1));
    Object.keys(patch).forEach(function (k) {
      if (patch[k] === '' || patch[k] === false || patch[k] === null || patch[k] === undefined) params.delete(k);
      else params.set(k, String(patch[k]));
    });
    history.replaceState(null, '', '#' + params.toString());
  }

  function readHash() {
    var params = new URLSearchParams(location.hash.slice(1));
    state.q = params.get('q') || '';
    state.category = params.get('category') || '';
    state.chain = params.get('chain') || '';
    state.watchlist = params.get('watchlist') === '1';
    qEl.value = state.q;
    catEl.value = state.category;
    chainEl.value = state.chain;
    watchEl.checked = state.watchlist;
    var slug = params.get('p');
    if (slug) openDetail(slug);
  }

  /** Wire the controls, the tabs, the sort headers and the row clicks. */
  function wire() {
    qEl.addEventListener('input', function () { state.q = qEl.value; setHash({ q: qEl.value }); renderTable(); });
    catEl.addEventListener('change', function () { state.category = catEl.value; setHash({ category: catEl.value }); renderTable(); });
    chainEl.addEventListener('change', function () { state.chain = chainEl.value; setHash({ chain: chainEl.value }); renderTable(); });
    watchEl.addEventListener('change', function () { state.watchlist = watchEl.checked; setHash({ watchlist: watchEl.checked ? '1' : '' }); renderTable(); });
    tabPre.addEventListener('click', function () {
      state.tab = 'pre'; state.sort = 'rank'; state.dir = 1;
      tabPre.setAttribute('aria-selected', 'true'); tabLive.setAttribute('aria-selected', 'false');
      renderTable();
    });
    tabLive.addEventListener('click', function () {
      state.tab = 'live'; state.sort = 'implied_value_usd'; state.dir = -1;
      tabLive.setAttribute('aria-selected', 'true'); tabPre.setAttribute('aria-selected', 'false');
      renderTable();
    });
    document.querySelectorAll('#board thead th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' || key === 'category' || key === 'chain' ? 1 : -1; }
        renderTable();
      });
    });
    tbody.addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-slug]');
      if (!tr) return;
      if (state.tab === 'pre') openDetail(tr.getAttribute('data-slug'));
    });
    $('detail-close').addEventListener('click', function () { dialog.close(); detailSlug = null; setHash({ p: '' }); });
    dialog.addEventListener('close', function () { detailSlug = null; setHash({ p: '' }); });
    window.addEventListener('hashchange', function () { readHash(); renderTable(); });
  }

  renderHeader();
  renderFilters();
  renderComps();
  wire();
  readHash();
  renderTable();
})();
