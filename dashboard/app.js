// Token Radar — the page. Renders window.RADAR_DATA, written by main.ts.
//
// Filters: text search, category, chain, watchlist-only, and five sorts.
// Deep links: #p=<slug> opens a protocol's detail view,
// #f=<category> filters to one category, #q=<text> searches.
// No network: every byte the page needs ships beside it.

(function () {
  'use strict';
  var DATA = window.RADAR_DATA;
  var rows = DATA.rows;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function ageText(days) {
    if (days === null || days === undefined) return '—';
    if (days < 365) return Math.round(days / 30.4) + ' mo';
    var y = days / 365;
    return (y >= 10 ? Math.round(y) : y.toFixed(1)) + ' y';
  }
  function changeHtml(c) {
    if (c === null || c === undefined) return '<span class="flat">—</span>';
    var cls = c > 0.5 ? 'up' : (c < -0.5 ? 'down' : 'flat');
    return '<span class="' + cls + '">' + (c > 0 ? '+' : '') + c.toFixed(1) + '%</span>';
  }

  // ---- stats -------------------------------------------------------------
  var top = rows[0];
  $('stats').innerHTML =
    '<div class="stat"><b>' + DATA.total_protocols + '</b><span>protocols scanned</span></div>' +
    '<div class="stat"><b>' + DATA.pre_token_count + '</b><span>record no token</span></div>' +
    '<div class="stat"><b>' + rows.length + '</b><span>ranked on the board</span></div>' +
    '<div class="stat"><b>' + money(top.value) + '</b><span>top implied value</span></div>';

  // ---- filter controls ---------------------------------------------------
  var cats = [];
  var chains = [];
  rows.forEach(function (r) {
    if (cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort();
  chains.sort();
  $('cat').innerHTML = '<option value="">All categories</option>' +
    cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');
  $('chain').innerHTML = '<option value="">All chains</option>' +
    chains.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('');

  // ---- multiples ---------------------------------------------------------
  var multNames = Object.keys(DATA.multiples).sort(function (a, b) {
    return DATA.multiples[b] - DATA.multiples[a];
  });
  $('mults').innerHTML = multNames.map(function (name) {
    return '<span class="mult">' + esc(name) + ' <b>' + DATA.multiples[name].toFixed(2) + '&times;</b></span>';
  }).join('') +
    '<span class="mult">Overall median <b>' + DATA.overall_multiple.toFixed(2) + '&times;</b></span>';

  // ---- set-aside lists ---------------------------------------------------
  $('setaside').innerHTML = DATA.setAside.slice(0, 20).map(function (s) {
    return '<li><b>' + esc(s.name) + '</b> <small>' + money(s.tvl_usd) + ' TVL &middot; ' + esc(s.reason) + '</small></li>';
  }).join('') + '<li><small>…and ' + (DATA.setAside.length - 20) + ' more below the top 20.</small></li>';
  $('livetop').innerHTML = DATA.liveTop.map(function (s) {
    return '<li><b>' + esc(s.name) + '</b> <small>' + money(s.tvl_usd) + ' TVL &middot; token trades at ' +
      (s.multiple === null ? '—' : s.multiple.toFixed(2) + '&times; TVL') + '</small></li>';
  }).join('');

  // ---- table -------------------------------------------------------------
  function state() {
    return {
      q: $('q').value.trim().toLowerCase(),
      cat: $('cat').value,
      chain: $('chain').value,
      sort: $('sort').value,
      wl: $('wl').checked,
    };
  }
  function filtered() {
    var st = state();
    var out = rows.filter(function (r) {
      if (st.wl && !r.watchlist) return false;
      if (st.cat && r.category !== st.cat) return false;
      if (st.chain && r.chains.indexOf(st.chain) < 0) return false;
      if (st.q && (r.name + ' ' + r.slug + ' ' + r.category).toLowerCase().indexOf(st.q) < 0) return false;
      return true;
    });
    var by = {
      value: function (a, b) { return b.value - a.value; },
      tvl: function (a, b) { return b.tvl - a.tvl; },
      growth: function (a, b) { return (b.change7d || 0) - (a.change7d || 0); },
      age: function (a, b) { return (b.ageDays || 0) - (a.ageDays || 0); },
      name: function (a, b) { return a.name < b.name ? -1 : 1; },
    }[st.sort] || function (a, b) { return b.value - a.value; };
    out.sort(by);
    return out;
  }
  function render() {
    var list = filtered();
    $('count').textContent = list.length + ' of ' + rows.length + ' protocols shown' +
      (state().sort === 'value' ? ' · ranked by implied value' : ' · sorted by ' + state().sort);
    $('empty').hidden = list.length > 0;
    $('rows').innerHTML = list.map(function (r) {
      var badges = (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') +
        (r.versioned ? '<span class="badge ver">V-NAME</span>' : '');
      return '<tr data-slug="' + esc(r.slug) + '"' + (activeSlug === r.slug ? ' class="active"' : '') + '>' +
        '<td class="num rank">' + r.rank + '</td>' +
        '<td><div class="name">' + esc(r.name) + '</div><div class="slug">' + esc(r.slug) + badges + '</div></td>' +
        '<td>' + esc(r.category) + '</td>' +
        '<td>' + esc(r.chains[0]) + (r.chains.length > 1 ? ' +' + (r.chains.length - 1) : '') + '</td>' +
        '<td class="num">' + money(r.tvl) + '</td>' +
        '<td class="num">' + changeHtml(r.change7d) + '</td>' +
        '<td class="num">' + ageText(r.ageDays) + '</td>' +
        '<td class="num value">' + money(r.value) + '</td>' +
        '</tr>';
    }).join('');
  }

  // ---- detail view -------------------------------------------------------
  var activeSlug = null;
  function bySlug(slug) {
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) return rows[i];
    return null;
  }
  function openDetail(slug, push) {
    var r = bySlug(slug);
    var box = $('detail');
    if (!r) {
      activeSlug = null;
      box.innerHTML = '<div class="detail-empty"><h2>Pick a protocol</h2><p>Click any row to open its detail view: the value breakdown, the farm plan with costs and times, and what the snapshot actually says about it.</p></div>';
      render();
      return;
    }
    activeSlug = slug;
    if (push) {
      try { history.replaceState(null, '', '#p=' + slug); } catch (e) { /* hash only */ }
    }
    var badges = (r.watchlist ? '<span class="badge">WATCHLIST</span>' : '') +
      (r.versioned ? '<span class="badge ver">VERSIONED NAME</span>' : '');
    box.innerHTML =
      '<button class="close" id="closeDetail" type="button">Close</button>' +
      '<h2>' + esc(r.name) + '</h2>' +
      '<p class="sub">Rank #' + r.rank + ' &middot; ' + esc(r.category) + ' &middot; ' + r.chains.map(esc).join(', ') + ' ' + badges + '</p>' +
      '<dl class="kv">' +
      '<div><dt>Implied value</dt><dd>' + money(r.value) + '</dd></div>' +
      '<div><dt>TVL</dt><dd>' + money(r.tvl) + '</dd></div>' +
      '<div><dt>7-day change</dt><dd>' + (r.change7d === null ? 'not reported' : (r.change7d > 0 ? '+' : '') + r.change7d.toFixed(2) + '%') + '</dd></div>' +
      '<div><dt>Tracked for</dt><dd>' + (r.ageDays === null ? 'not reported' : ageText(r.ageDays) + ' (' + r.ageDays + ' days)') + '</dd></div>' +
      '</dl>' +
      '<h3>Value breakdown</h3>' +
      '<p class="formula">' + money(r.base) + ' base (TVL &times; ' + r.multiple.toFixed(2) + '&times;)' +
      ' &times; ' + r.growth.toFixed(2) + ' growth &times; ' + r.ageF.toFixed(2) + ' age &times; ' + r.chainF.toFixed(2) + ' chains' +
      ' = <b>' + money(r.value) + '</b></p>' +
      '<h3>Farm plan &mdash; 6 steps</h3>' +
      '<ol class="steps">' + r.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="fine">Costs are estimates of one transaction&rsquo;s gas on ' + esc(r.chains[0]) +
      '. The plan is the entry&rsquo;s own suggestion, never a promise of a token.</p>';
    $('closeDetail').addEventListener('click', function () { openDetail(null, true); });
    render();
  }
  $('rows').addEventListener('click', function (e) {
    var tr = e.target;
    while (tr && tr.tagName !== 'TR') tr = tr.parentNode;
    if (tr && tr.getAttribute('data-slug')) openDetail(tr.getAttribute('data-slug'), true);
  });

  // ---- events + deep links ----------------------------------------------
  ['q', 'cat', 'chain', 'sort', 'wl'].forEach(function (id) {
    $(id).addEventListener('input', render);
    $(id).addEventListener('change', render);
  });
  function readHash() {
    var h = window.location.hash || '';
    var m = h.match(/#p=([A-Za-z0-9._-]+)/);
    if (m) { openDetail(m[1], false); return; }
    var f = h.match(/#f=([^&]+)/);
    if (f) {
      var cat = decodeURIComponent(f[1]);
      var sel = $('cat');
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === cat) { sel.value = cat; break; }
      }
    }
    var q = h.match(/#q=([^&]+)/);
    if (q) $('q').value = decodeURIComponent(q[1]);
  }
  window.addEventListener('hashchange', readHash);
  readHash();
  render();
})();
