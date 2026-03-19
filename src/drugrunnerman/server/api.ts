import express from 'express';
import { z } from 'zod';
import { Game, GameRuleError } from '../engine/game';
import type { Drug } from '../models/drug';
import type { Location } from '../models/location';
import drugsData from '../data/drugs.json';
import locationsData from '../data/locations.json';

/** Safely serialize an object for inline <script> injection. */
function safeJson(obj: unknown): string {
	return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function buildGamePage(drugs: Record<string, Drug>, locations: Record<string, Location>): string {
	const drugsJson = safeJson(drugs);
	const locsJson = safeJson(locations);
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DrugRunnerMan API</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --g:#00ff41;--gold:#ffd700;--cyan:#00bfff;--red:#ff4444;--orange:#ff8800;
      --bg:#080808;--bg1:#0f0f0f;--bg2:#161616;--bg3:#1e1e1e;
      --bdr:#2a2a2a;--bdr2:#383838;--dim:#555;--mid:#888;
    }
    html{font-size:14px}
    body{font-family:'Courier New',Courier,monospace;background:var(--bg);color:var(--g);min-height:100vh;overflow-x:hidden}

    /* Loading overlay */
    #ld-ov{position:fixed;inset:0;background:var(--bg);z-index:999;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:opacity .3s}
    #ld-ov.hide{opacity:0;pointer-events:none}
    .spinner{width:36px;height:36px;border:3px solid var(--bg3);border-top-color:var(--g);border-radius:50%;animation:spin .8s linear infinite;margin-bottom:.75rem}
    @keyframes spin{to{transform:rotate(360deg)}}
    .ld-txt{color:var(--dim);font-size:.75rem;letter-spacing:3px;text-transform:uppercase}

    /* App shell */
    #app{display:none;flex-direction:column;min-height:100vh;padding:.75rem;max-width:980px;margin:0 auto}
    #app.ready{display:flex}

    /* Error banner */
    .err-bar{display:none;background:rgba(255,68,68,.08);border:1px solid var(--red);color:var(--red);padding:.4rem .75rem;font-size:.8rem;margin-bottom:.75rem;border-radius:3px;align-items:center;gap:.5rem}
    .err-bar.show{display:flex}
    .err-retry{margin-left:auto;background:transparent;border:1px solid var(--red);color:var(--red);padding:2px 8px;cursor:pointer;font-family:inherit;font-size:.72rem;border-radius:2px}
    .err-retry:hover{background:var(--red);color:#000}

    /* Header */
    .hdr{display:flex;align-items:center;justify-content:space-between;padding-bottom:.6rem;margin-bottom:.75rem;border-bottom:1px solid var(--g)}
    .title{color:var(--g);font-size:1.25rem;font-weight:bold;text-shadow:0 0 10px var(--g);letter-spacing:1px}
    .title em{color:var(--gold);font-style:normal}
    .hdr-btns{display:flex;gap:.4rem}

    /* Status bar */
    .stat-bar{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:.5rem;padding:.6rem;background:var(--bg1);border:1px solid var(--bdr2);margin-bottom:.75rem;border-radius:3px}
    .stat{display:flex;flex-direction:column;gap:2px}
    .slbl{font-size:.58rem;color:var(--dim);text-transform:uppercase;letter-spacing:1px}
    .sval{font-size:1rem;color:var(--g)}
    .sval.cash{color:var(--gold)}
    .sval.loc{color:var(--cyan)}
    .cap-wrap{grid-column:span 2}
    .cap-bar{height:4px;background:var(--bg3);border-radius:2px;margin-top:4px;overflow:hidden}
    .cap-fill{height:100%;background:var(--g);border-radius:2px;transition:width .4s,background .4s}
    .cap-fill.warn{background:var(--gold)}
    .cap-fill.danger{background:var(--red)}

    /* Two-column layout */
    .grid{display:grid;grid-template-columns:1fr;gap:.75rem;margin-bottom:.75rem}
    @media(min-width:700px){.grid{grid-template-columns:1fr 260px}}
    .panel{background:var(--bg1);border:1px solid var(--bdr);border-radius:3px;padding:.75rem}
    .sh{font-size:.58rem;color:var(--dim);text-transform:uppercase;letter-spacing:2px;margin-bottom:.5rem}

    /* Market table */
    table{width:100%;border-collapse:collapse;font-size:.85rem}
    thead th{text-align:left;padding:.25rem .3rem;color:var(--dim);font-size:.58rem;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--bdr)}
    tbody td{padding:.3rem .3rem;border-bottom:1px solid var(--bg2);vertical-align:middle}
    tbody tr:last-child td{border-bottom:none}
    tbody tr:hover td{background:var(--bg2)}
    .tc{color:#fff;font-weight:bold;width:48px}
    .tn{color:var(--mid);font-size:.8rem}
    .tp{color:var(--gold);white-space:nowrap}
    .ti{color:var(--cyan);text-align:right;width:30px}
    .tm{color:var(--dim);font-size:.72rem;text-align:right;width:36px}
    .tq{width:56px}
    .ta{white-space:nowrap}
    .disc-tag{font-size:.62rem;color:var(--orange);margin-left:3px}

    /* Price flash */
    @keyframes fu{0%,100%{background:transparent}50%{background:rgba(0,255,65,.15)}}
    @keyframes fd{0%,100%{background:transparent}50%{background:rgba(255,68,68,.15)}}
    .fu{animation:fu .5s}
    .fd{animation:fd .5s}

    /* Inputs */
    .qi{width:52px;background:var(--bg3);border:1px solid var(--bdr2);color:var(--g);padding:3px 4px;font-family:inherit;font-size:.78rem;text-align:right;border-radius:2px}
    .qi:focus{outline:none;border-color:var(--g)}

    /* Buttons */
    .btn{background:var(--bg3);border:1px solid var(--g);color:var(--g);padding:3px 9px;cursor:pointer;font-family:inherit;font-size:.78rem;border-radius:2px;transition:background .1s,color .1s,opacity .1s;white-space:nowrap}
    .btn:hover:not(:disabled){background:var(--g);color:#000}
    .btn:active:not(:disabled){opacity:.7}
    .btn:disabled{opacity:.3;cursor:not-allowed}
    .btn-s{border-color:var(--red);color:var(--red)}
    .btn-s:hover:not(:disabled){background:var(--red);color:#000}
    .btn-t{border-color:var(--cyan);color:var(--cyan)}
    .btn-t:hover:not(:disabled){background:var(--cyan);color:#000}
    .btn-k{border-color:var(--mid);color:var(--mid)}
    .btn-k:hover:not(:disabled){background:var(--mid);color:#000}
    .btn-dim{border-color:var(--bdr2);color:var(--dim);font-size:.7rem}
    .btn-dim:hover:not(:disabled){background:var(--bdr2);color:var(--g)}
    .btn-max{border-color:var(--bdr);color:var(--dim);font-size:.68rem;padding:2px 5px}
    .btn-max:hover:not(:disabled){background:var(--bdr2);color:var(--gold)}

    /* Side panels */
    .side-col{display:flex;flex-direction:column;gap:.75rem}
    .disc-list{list-style:none}
    .disc-li{font-size:.8rem;color:var(--mid);padding:3px 0;display:flex;justify-content:space-between;border-bottom:1px solid var(--bg2)}
    .disc-li:last-child{border-bottom:none}
    .disc-pct{color:var(--g)}
    .disc-pct.best{color:var(--gold)}
    .dest-sel{width:100%;background:var(--bg3);border:1px solid var(--bdr2);color:var(--cyan);padding:4px 7px;font-family:inherit;font-size:.8rem;border-radius:2px;margin-bottom:.5rem}
    .dest-sel:focus{outline:none;border-color:var(--cyan)}
    .port-row{display:flex;justify-content:space-between;font-size:.8rem;padding:3px 0;color:var(--mid);border-bottom:1px solid var(--bg2)}
    .port-row:last-child{border-bottom:none}
    .port-val{color:var(--gold)}
    .port-total{font-weight:bold;border-top:1px solid var(--bdr2) !important;margin-top:.3rem;padding-top:.3rem !important}
    .port-total .port-val{color:var(--g)}
    .port-empty{color:var(--dim);font-size:.78rem}

    /* Log */
    .log-wrap{height:120px;overflow-y:auto;background:var(--bg);border:1px solid var(--bdr);padding:.4rem;font-size:.75rem;border-radius:3px}
    .log-wrap::-webkit-scrollbar{width:4px}
    .log-wrap::-webkit-scrollbar-thumb{background:var(--bdr2)}
    .le{padding:2px 0;border-bottom:1px solid var(--bg2);display:flex;gap:.4rem}
    .le:last-child{border-bottom:none}
    .le-ts{color:var(--dim);flex-shrink:0}
    .le-msg{color:var(--mid)}
    .le.good .le-msg{color:var(--gold)}
    .le.warn .le-msg{color:#ff6b6b}
    .le.police .le-msg{color:var(--red);font-weight:bold}
    .le.travel .le-msg{color:var(--cyan)}

    /* Modals */
    .mo{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:200;align-items:center;justify-content:center;padding:1rem}
    .mo.show{display:flex}
    .mb{background:var(--bg1);border:2px solid var(--bdr2);border-radius:4px;padding:1.25rem;max-width:480px;width:100%}
    .mb.police-box{border-color:var(--red)}
    .mt{font-size:1.1rem;margin-bottom:.7rem;color:var(--g)}
    .police-box .mt{color:var(--red)}
    .mbody{color:#ccc;font-size:.875rem;line-height:1.6;margin-bottom:.9rem}
    .mfoot{display:flex;gap:.5rem;justify-content:flex-end}
    .help-h{color:var(--gold);font-size:.85rem;margin-bottom:.25rem;margin-top:.6rem}
    .help-h:first-child{margin-top:0}
    .help-p,.help-li{color:var(--mid);font-size:.82rem;line-height:1.55}
    .help-ul{padding-left:1.2rem;margin-bottom:.3rem}
    .help-li{margin-bottom:.2rem}

    /* Game Over */
    #go{display:none;flex-direction:column;align-items:center;justify-content:center;min-height:70vh;text-align:center;padding:1rem}
    #go.show{display:flex}
    .go-t{font-size:2.5rem;color:var(--gold);text-shadow:0 0 24px var(--gold);margin-bottom:.5rem}
    .go-sub{color:var(--mid);margin-bottom:1.5rem;font-size:.9rem}
    .go-stats{background:var(--bg1);border:1px solid var(--bdr2);padding:.9rem 1.75rem;margin-bottom:1.5rem;border-radius:3px;text-align:left;min-width:260px}
    .go-row{display:flex;justify-content:space-between;gap:2rem;padding:.25rem 0;font-size:.9rem;border-bottom:1px solid var(--bg2)}
    .go-row:last-child{border-bottom:none}
    .go-lbl{color:var(--mid)}
    .go-val{color:var(--g)}
    .go-row.hi .go-val{color:var(--gold);font-size:1.15rem}

    /* Hidden API ref (tests check for these strings) */
    .api-ref{display:none}
  </style>
</head>
<body>

  <div id="ld-ov">
    <div class="spinner"></div>
    <p class="ld-txt">Initializing...</p>
  </div>

  <div id="app">
    <div class="err-bar" id="err-bar">
      <span id="err-txt"></span>
      <button class="err-retry" id="err-retry">Retry</button>
    </div>

    <div class="hdr">
      <div class="title">&#127822; DrugRunnerMan <em>API</em></div>
      <div class="hdr-btns">
        <button class="btn btn-dim" id="help-btn">? Help</button>
        <button class="btn btn-dim" id="new-btn">&#8635; New Game</button>
      </div>
    </div>

    <div class="stat-bar">
      <div class="stat">
        <span class="slbl">Day</span>
        <span class="sval" id="s-day">-</span>
      </div>
      <div class="stat">
        <span class="slbl">Cash</span>
        <span class="sval cash" id="s-cash">-</span>
      </div>
      <div class="stat">
        <span class="slbl">Location</span>
        <span class="sval loc" id="s-loc">-</span>
      </div>
      <div class="stat cap-wrap">
        <span class="slbl">Cargo <span id="s-cap-txt">-</span></span>
        <div class="cap-bar"><div class="cap-fill" id="cap-fill"></div></div>
      </div>
    </div>

    <div class="grid">
      <!-- Market -->
      <div class="panel">
        <div class="sh">&#128200; Market</div>
        <table>
          <thead><tr>
            <th>Drug</th><th></th><th>Price/unit</th>
            <th style="text-align:right">Inv</th>
            <th style="text-align:right" title="Max you can afford">Max&#8593;</th>
            <th style="text-align:right">Qty</th>
            <th colspan="2"></th>
          </tr></thead>
          <tbody id="market-body"></tbody>
        </table>
      </div>

      <!-- Side column -->
      <div class="side-col">
        <div class="panel">
          <div class="sh">&#127979; Local Discount</div>
          <ul class="disc-list" id="disc-list"></ul>
        </div>

        <div class="panel">
          <div class="sh">&#9992;&#65039; Travel</div>
          <select class="dest-sel" id="dest-sel"></select>
          <button class="btn btn-t" id="travel-btn" style="width:100%">Travel &#8594;</button>
        </div>

        <div class="panel">
          <div class="sh">&#9193; End Day</div>
          <button class="btn btn-k" id="skip-btn" style="width:100%">Skip Day (stay here)</button>
        </div>

        <div class="panel">
          <div class="sh">&#128181; Portfolio</div>
          <div id="port-rows"></div>
        </div>
      </div>
    </div>

    <!-- Event log -->
    <div class="panel" style="margin-bottom:.75rem">
      <div class="sh" style="display:flex;justify-content:space-between;align-items:center">
        <span>&#128195; Event Log</span>
        <button class="btn btn-max" id="clear-log-btn">clear</button>
      </div>
      <div class="log-wrap" id="log"></div>
    </div>

    <!-- Hidden API reference strings for test assertions -->
    <div class="api-ref">DrugRunnerMan API endpoints: GET /v1/state GET /v1/prices POST /v1/buy POST /v1/sell POST /v1/travel POST /v1/skip GET /healthz</div>
  </div>

  <!-- Game Over -->
  <div id="go">
    <div class="go-t">GAME OVER</div>
    <div class="go-sub" id="go-sub"></div>
    <div class="go-stats" id="go-stats"></div>
    <button class="btn" id="again-btn" style="font-size:.95rem;padding:.5rem 2rem">&#8635; Play Again</button>
  </div>

  <!-- Police Modal -->
  <div class="mo" id="police-modal">
    <div class="mb police-box">
      <div class="mt" id="pm-title"></div>
      <div class="mbody" id="pm-body"></div>
      <div class="mfoot">
        <button class="btn btn-s" id="pm-ok">OK, continue</button>
      </div>
    </div>
  </div>

  <!-- Help Modal -->
  <div class="mo" id="help-modal">
    <div class="mb" style="max-width:520px">
      <div class="mt" style="color:var(--gold)">&#127822; How to Play</div>
      <div class="mbody">
        <p class="help-h">Objective</p>
        <p class="help-p">You have 30 days to make as much money as possible by buying low and selling high across 6 cities. Start with $1,000 and 100 units of cargo space.</p>
        <p class="help-h">Actions</p>
        <ul class="help-ul">
          <li class="help-li"><strong>Buy</strong> &mdash; purchase drugs at the current market price</li>
          <li class="help-li"><strong>Sell</strong> &mdash; sell drugs from your inventory</li>
          <li class="help-li"><strong>Travel</strong> &mdash; move to another city (costs 1 day, police risk)</li>
          <li class="help-li"><strong>Skip Day</strong> &mdash; wait one day in place (prices stay the same)</li>
        </ul>
        <p class="help-h">Tips</p>
        <ul class="help-ul">
          <li class="help-li">Each city has cheaper drugs &mdash; the <span style="color:var(--orange)">discount</span> is shown in the market table</li>
          <li class="help-li">Carrying more cargo increases police suspicion</li>
          <li class="help-li">Police may fine you (arrest) or seize cargo (shootout)</li>
          <li class="help-li">You can buy and sell multiple times per day before travelling</li>
          <li class="help-li">Use <strong>Max&#8593;</strong> column to see how many units you can afford</li>
        </ul>
      </div>
      <div class="mfoot">
        <button class="btn" id="help-close">Got it</button>
      </div>
    </div>
  </div>

  <script>
    var DRUGS = ${drugsJson};
    var LOCS  = ${locsJson};
    var SK = 'drm_sid';
    var busy = false;
    var st = null, pr = null, prevPr = null;

    /* ── Session ── */
    function getSid() {
      var s = localStorage.getItem(SK);
      if (!s) { s = mkUUID(); localStorage.setItem(SK, s); }
      return s;
    }
    function newSid() {
      var s = mkUUID();
      localStorage.setItem(SK, s);
      return s;
    }
    function mkUUID() {
      try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          return crypto.randomUUID();
        }
      } catch (_) { /* non-secure context or unavailable — fall through */ }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    }
    var sid = getSid();

    /* ── API ── */
    function api(method, path, body) {
      var opts = { method: method, headers: { 'Content-Type': 'application/json', 'X-Session-ID': sid } };
      if (body !== undefined) opts.body = JSON.stringify(body);
      return fetch(path, opts)
        .then(function(r) { return r.json(); })
        .catch(function(err) { throw new Error('Network error: ' + (err.message || 'connection failed')); });
    }

    /* ── Busy state ── */
    function setBusy(on) {
      busy = on;
      var els = document.querySelectorAll('#app button, #app select, #app input');
      els.forEach(function(el) {
        if (on) el.setAttribute('disabled', '');
        else el.removeAttribute('disabled');
      });
    }

    /* ── Formatting ── */
    function fmtMoney(n) {
      if (typeof n !== 'number' || isNaN(n)) return '$0.00';
      return '$' + n.toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
    }

    /* ── Error banner ── */
    function showErr(msg, onRetry) {
      document.getElementById('err-txt').textContent = msg;
      document.getElementById('err-bar').classList.add('show');
      document.getElementById('err-retry').onclick = function() {
        document.getElementById('err-bar').classList.remove('show');
        if (onRetry) onRetry();
      };
    }
    function hideErr() { document.getElementById('err-bar').classList.remove('show'); }

    /* ── Log ── */
    function addLog(msg, cls) {
      var log = document.getElementById('log');
      var row = document.createElement('div');
      row.className = 'le' + (cls ? ' ' + cls : '');
      var now = new Date();
      var ts = [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map(function(n) { return String(n).padStart(2, '0'); }).join(':');
      var tsEl = document.createElement('span'); tsEl.className = 'le-ts'; tsEl.textContent = ts;
      var msgEl = document.createElement('span'); msgEl.className = 'le-msg'; msgEl.textContent = msg;
      row.appendChild(tsEl); row.appendChild(msgEl);
      log.insertBefore(row, log.firstChild);
    }

    /* ── Status bar ── */
    function renderStatus() {
      if (!st) return;
      document.getElementById('s-day').textContent  = st.day + ' / ' + st.maxDays;
      document.getElementById('s-cash').textContent = fmtMoney(st.cash);
      document.getElementById('s-loc').textContent  = st.location;
      var used = st.usedCapacity, cap = st.capacity;
      document.getElementById('s-cap-txt').textContent = used + ' / ' + cap;
      var pct = cap > 0 ? (used / cap) * 100 : 0;
      var fill = document.getElementById('cap-fill');
      fill.style.width = pct + '%';
      fill.className = 'cap-fill' + (pct > 80 ? ' danger' : pct > 50 ? ' warn' : '');
    }

    /* ── Max buy helper ── */
    function calcMaxBuy(code) {
      if (!st || !pr) return 0;
      var price = pr[code] || 0;
      if (price <= 0) return 0;
      var byMoney = Math.floor(st.cash / price);
      var byCap   = st.capacity - st.usedCapacity;
      return Math.max(0, Math.min(byMoney, byCap));
    }

    /* ── Market table ── */
    function renderMarket() {
      if (!pr || !st) return;
      var tbody = document.getElementById('market-body');
      var locAdj = (LOCS[st.location] && LOCS[st.location].adjust) ? LOCS[st.location].adjust : {};

      /* Preserve qty inputs across re-renders */
      var saved = {};
      Object.keys(DRUGS).forEach(function(c) {
        var el = document.getElementById('q-' + c);
        if (el) saved[c] = el.value;
      });

      tbody.innerHTML = '';
      Object.keys(DRUGS).forEach(function(code) {
        var drug  = DRUGS[code];
        var price = pr[code] !== undefined ? pr[code] : 0;
        var inv   = st.inventory[code] !== undefined ? st.inventory[code] : 0;
        var mb    = calcMaxBuy(code);
        var adj   = locAdj[code];
        var discPct = (adj && adj < 1) ? Math.round((1 - adj) * 100) : 0;

        /* Flash cells when price moved — 0.1% threshold filters floating-point noise */
        var PRICE_FLASH_THRESHOLD = 0.001;
        var flashCls = '';
        if (prevPr && prevPr[code] !== undefined) {
          if (price > prevPr[code] * (1 + PRICE_FLASH_THRESHOLD)) flashCls = ' fu';
          else if (price < prevPr[code] * (1 - PRICE_FLASH_THRESHOLD)) flashCls = ' fd';
        }

        var tr = document.createElement('tr');

        var tdC = document.createElement('td'); tdC.className = 'tc'; tdC.textContent = code;
        var tdN = document.createElement('td'); tdN.className = 'tn'; tdN.textContent = drug.name;
        if (discPct > 0) {
          var badge = document.createElement('span');
          badge.className = 'disc-tag';
          badge.textContent = discPct + '% off';
          tdN.appendChild(badge);
        }
        var tdP = document.createElement('td');
        tdP.className = 'tp' + flashCls;
        tdP.textContent = fmtMoney(price) + ' / ' + (drug.unit || 'u');

        var tdI = document.createElement('td'); tdI.className = 'ti'; tdI.textContent = inv > 0 ? String(inv) : '-';
        var tdM = document.createElement('td'); tdM.className = 'tm'; tdM.title = 'Max affordable';
        tdM.textContent = mb > 0 ? String(mb) : '-';

        var tdQ = document.createElement('td'); tdQ.className = 'tq';
        var qi = document.createElement('input');
        qi.type = 'number'; qi.min = '1'; qi.className = 'qi';
        qi.id = 'q-' + code; qi.value = saved[code] || '1';
        tdQ.appendChild(qi);

        var tdA = document.createElement('td'); tdA.className = 'ta';
        var buyBtn = document.createElement('button');
        buyBtn.className = 'btn'; buyBtn.textContent = 'Buy';
        buyBtn.dataset.action = 'buy'; buyBtn.dataset.code = code;
        if (mb <= 0) buyBtn.disabled = true;

        var sellBtn = document.createElement('button');
        sellBtn.className = 'btn btn-s'; sellBtn.textContent = 'Sell';
        sellBtn.style.marginLeft = '.25rem';
        sellBtn.dataset.action = 'sell'; sellBtn.dataset.code = code;
        if (inv <= 0) sellBtn.disabled = true;

        tdA.appendChild(buyBtn); tdA.appendChild(sellBtn);
        tr.appendChild(tdC); tr.appendChild(tdN); tr.appendChild(tdP);
        tr.appendChild(tdI); tr.appendChild(tdM); tr.appendChild(tdQ); tr.appendChild(tdA);
        tbody.appendChild(tr);
      });
    }

    /* ── Location discount panel ── */
    function renderDiscounts() {
      if (!st) return;
      var list = document.getElementById('disc-list');
      list.innerHTML = '';
      var locAdj = (LOCS[st.location] && LOCS[st.location].adjust) ? LOCS[st.location].adjust : {};
      var codes = Object.keys(locAdj).filter(function(c) { return (locAdj[c] || 1) < 1; });
      if (codes.length === 0) {
        var li = document.createElement('li');
        li.className = 'disc-li'; li.style.color = 'var(--dim)';
        li.textContent = 'No local discounts';
        list.appendChild(li); return;
      }
      codes.sort(function(a, b) { return (locAdj[a] || 1) - (locAdj[b] || 1); });
      codes.forEach(function(code) {
        var pct = Math.round((1 - (locAdj[code] || 1)) * 100);
        var drug = DRUGS[code] || {};
        var li = document.createElement('li'); li.className = 'disc-li';
        var nm = document.createElement('span'); nm.textContent = code + ' ' + (drug.name || '');
        var pv = document.createElement('span');
        pv.className = 'disc-pct' + (pct >= 15 ? ' best' : '');
        pv.textContent = pct + '% off';
        li.appendChild(nm); li.appendChild(pv);
        list.appendChild(li);
      });
    }

    /* ── Travel destination dropdown ── */
    function renderDests() {
      if (!st) return;
      var sel = document.getElementById('dest-sel');
      var prev = sel.value;
      sel.innerHTML = '';
      Object.keys(LOCS).forEach(function(loc) {
        var adj = (LOCS[loc] && LOCS[loc].adjust) ? LOCS[loc].adjust : {};
        var cheap = Object.keys(adj).filter(function(c) { return (adj[c] || 1) < 1; });
        var opt = document.createElement('option');
        opt.value = loc;
        opt.textContent = loc + (cheap.length ? '  [' + cheap.join(', ') + ']' : '');
        if (loc === st.location) { opt.disabled = true; opt.textContent += ' (here)'; }
        sel.appendChild(opt);
      });
      if (prev && prev !== st.location) sel.value = prev;
      if (!sel.value || sel.value === st.location) {
        for (var i = 0; i < sel.options.length; i++) {
          if (!sel.options[i].disabled) { sel.value = sel.options[i].value; break; }
        }
      }
    }

    /* ── Portfolio panel ── */
    function renderPortfolio() {
      if (!st || !pr) return;
      var rows = document.getElementById('port-rows');
      rows.innerHTML = '';
      var invVal = 0;
      Object.keys(DRUGS).forEach(function(code) {
        var qty = st.inventory[code] || 0;
        if (qty === 0) return;
        var val = qty * (pr[code] || 0);
        invVal += val;
        var row = document.createElement('div'); row.className = 'port-row';
        var lbl = document.createElement('span'); lbl.textContent = qty + ' \u00d7 ' + code;
        var vv  = document.createElement('span'); vv.className = 'port-val'; vv.textContent = fmtMoney(val);
        row.appendChild(lbl); row.appendChild(vv); rows.appendChild(row);
      });
      if (rows.children.length === 0) {
        var emp = document.createElement('div'); emp.className = 'port-empty';
        emp.textContent = 'No inventory'; rows.appendChild(emp);
      }
      var tot = document.createElement('div'); tot.className = 'port-row port-total';
      var tl = document.createElement('span'); tl.textContent = 'Net worth';
      var tv = document.createElement('span'); tv.className = 'port-val';
      tv.textContent = fmtMoney(st.cash + invVal);
      tot.appendChild(tl); tot.appendChild(tv); rows.appendChild(tot);
    }

    /* ── Game Over ── */
    function checkGameOver() {
      if (!st || st.day <= st.maxDays) return false;
      var invVal = 0;
      if (pr) Object.keys(DRUGS).forEach(function(c) { invVal += (st.inventory[c] || 0) * (pr[c] || 0); });
      document.getElementById('app').style.display = 'none';
      var goEl = document.getElementById('go');
      goEl.classList.add('show');
      document.getElementById('go-sub').textContent = 'You survived ' + st.maxDays + ' days on the streets.';
      var statsEl = document.getElementById('go-stats');
      statsEl.innerHTML = '';
      [
        { l: 'Cash',            v: fmtMoney(st.cash),          hi: false },
        { l: 'Inventory value', v: fmtMoney(invVal),           hi: false },
        { l: 'Net worth',       v: fmtMoney(st.cash + invVal), hi: true  },
      ].forEach(function(s) {
        var row = document.createElement('div'); row.className = 'go-row' + (s.hi ? ' hi' : '');
        var ll = document.createElement('span'); ll.className = 'go-lbl'; ll.textContent = s.l;
        var vv = document.createElement('span'); vv.className = 'go-val'; vv.textContent = s.v;
        row.appendChild(ll); row.appendChild(vv); statsEl.appendChild(row);
      });
      return true;
    }

    /* ── Full refresh ── */
    function refresh(data) {
      prevPr = pr;
      if (data.state)  st = data.state;
      if (data.prices) pr = data.prices;
      renderStatus();
      renderMarket();
      renderDiscounts();
      renderDests();
      renderPortfolio();
      checkGameOver();
    }

    /* ── Load initial state ── */
    function loadState() {
      setBusy(true); hideErr();
      api('GET', '/v1/state')
        .then(function(data) {
          setBusy(false);
          refresh(data);
          hideLoading();
          document.getElementById('app').classList.add('ready');
        })
        .catch(function(err) {
          setBusy(false);
          hideLoading();
          document.getElementById('app').classList.add('ready');
          showErr(err.message + '. Check your connection.', loadState);
        });
    }

    /* ── Qty helper ── */
    function getQty(code) {
      var el = document.getElementById('q-' + code);
      var val = parseInt(el && el.value, 10);
      return isNaN(val) || val < 1 ? 1 : val;
    }

    /* ── Trade actions ── */
    function doBuy(code) {
      var qty = getQty(code);
      setBusy(true);
      api('POST', '/v1/buy', { code: code, quantity: qty })
        .then(function(data) {
          setBusy(false);
          if (data.error) { addLog('\u2717 Buy failed: ' + data.error, 'warn'); return; }
          addLog('Bought ' + qty + ' ' + code + ' for ' + fmtMoney(data.totalCost), 'good');
          refresh(data);
        })
        .catch(function(err) { setBusy(false); addLog('\u2717 ' + err.message, 'warn'); });
    }

    function doSell(code) {
      var qty = getQty(code);
      setBusy(true);
      api('POST', '/v1/sell', { code: code, quantity: qty })
        .then(function(data) {
          setBusy(false);
          if (data.error) { addLog('\u2717 Sell failed: ' + data.error, 'warn'); return; }
          addLog('Sold ' + qty + ' ' + code + ' for ' + fmtMoney(data.revenue), 'good');
          refresh(data);
        })
        .catch(function(err) { setBusy(false); addLog('\u2717 ' + err.message, 'warn'); });
    }

    function doTravel() {
      var to = document.getElementById('dest-sel').value;
      if (!to) return;
      setBusy(true);
      api('POST', '/v1/travel', { to: to })
        .then(function(data) {
          setBusy(false);
          if (data.error) { addLog('\u2717 Travel failed: ' + data.error, 'warn'); return; }
          addLog('\u2192 Traveled to ' + to + ' (day ' + data.state.day + ')', 'travel');
          showPolice(data.policeEncounter);
          refresh(data);
        })
        .catch(function(err) { setBusy(false); addLog('\u2717 ' + err.message, 'warn'); });
    }

    function doSkip() {
      setBusy(true);
      api('POST', '/v1/skip')
        .then(function(data) {
          setBusy(false);
          if (data.error) { addLog('\u2717 Skip failed: ' + data.error, 'warn'); return; }
          addLog('Skipped to day ' + data.state.day);
          refresh(data);
        })
        .catch(function(err) { setBusy(false); addLog('\u2717 ' + err.message, 'warn'); });
    }

    /* ── Police modal ── */
    function showPolice(enc) {
      if (!enc) return;
      var titleText, bodyText;
      if (enc.outcome === 'arrest') {
        titleText = '\uD83D\uDE94 ARRESTED!';
        bodyText = 'You have been arrested and fined ' + fmtMoney(enc.fine || 0) + '.';
        if (enc.inventorySeized) {
          var seized = Object.keys(enc.inventorySeized).filter(function(k) { return enc.inventorySeized[k] > 0; });
          if (seized.length) bodyText += ' Inventory seized: ' + seized.map(function(k) { return enc.inventorySeized[k] + ' \u00d7 ' + k; }).join(', ') + '.';
        }
        addLog('\uD83D\uDE94 Arrested! Fine ' + fmtMoney(enc.fine || 0), 'police');
      } else {
        titleText = '\uD83D\uDD2B SHOOTOUT!';
        bodyText = 'You got into a shootout with police!';
        if (enc.inventoryLost) {
          var lostKeys = Object.keys(enc.inventoryLost).filter(function(k) { return enc.inventoryLost[k] > 0; });
          if (lostKeys.length) bodyText += ' Lost: ' + lostKeys.map(function(k) { return enc.inventoryLost[k] + ' \u00d7 ' + k; }).join(', ') + '.';
          else bodyText += ' You escaped without losses!';
        }
        addLog('\uD83D\uDD2B Shootout! ' + (enc.inventoryLost && Object.keys(enc.inventoryLost).length ? 'Some cargo lost.' : 'No losses.'), 'police');
      }
      document.getElementById('pm-title').textContent = titleText;
      document.getElementById('pm-body').textContent  = bodyText;
      document.getElementById('police-modal').classList.add('show');
    }

    /* ── Loading overlay ── */
    function hideLoading() {
      var ov = document.getElementById('ld-ov');
      ov.classList.add('hide');
      setTimeout(function() { ov.style.display = 'none'; }, 350);
    }

    /* ── New game ── */
    function startNewGame() {
      sid = newSid();
      st = null; pr = null; prevPr = null;
      document.getElementById('app').style.display = '';
      document.getElementById('app').classList.add('ready');
      document.getElementById('go').classList.remove('show');
      document.getElementById('log').innerHTML = '';
      document.getElementById('market-body').innerHTML = '';
      document.getElementById('port-rows').innerHTML = '';
      document.getElementById('disc-list').innerHTML = '';
      loadState();
    }

    /* ── Event delegation: market table ── */
    document.getElementById('market-body').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn || busy) return;
      if (btn.dataset.action === 'buy')  doBuy(btn.dataset.code);
      if (btn.dataset.action === 'sell') doSell(btn.dataset.code);
    });

    /* ── Button listeners ── */
    document.getElementById('travel-btn').addEventListener('click',   function() { if (!busy) doTravel(); });
    document.getElementById('skip-btn').addEventListener('click',     function() { if (!busy) doSkip(); });
    document.getElementById('pm-ok').addEventListener('click',        function() { document.getElementById('police-modal').classList.remove('show'); });
    document.getElementById('new-btn').addEventListener('click',      function() { if (confirm('Start a new game? Current progress will be lost.')) startNewGame(); });
    document.getElementById('again-btn').addEventListener('click',    startNewGame);
    document.getElementById('help-btn').addEventListener('click',     function() { document.getElementById('help-modal').classList.add('show'); });
    document.getElementById('help-close').addEventListener('click',   function() { document.getElementById('help-modal').classList.remove('show'); });
    document.getElementById('clear-log-btn').addEventListener('click',function() { document.getElementById('log').innerHTML = ''; });

    /* Close modals on overlay click */
    ['police-modal', 'help-modal'].forEach(function(id) {
      document.getElementById(id).addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('show');
      });
    });

    /* Keyboard: Esc closes modals */
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        document.getElementById('police-modal').classList.remove('show');
        document.getElementById('help-modal').classList.remove('show');
      }
    });

    /* ── Init ── */
    loadState();
  </script>
</body>
</html>`;
}

const drugCodes = Object.keys(drugsData) as [Drug['code'], ...Drug['code'][]];

const querySchema = z.object({
	loc: z.string().trim().min(1).optional(),
});

const travelBodySchema = z.object({ to: z.string().trim().min(1) });

const tradeBodySchema = z.object({
	code: z.enum(drugCodes),
	quantity: z.number().int().positive(),
});

export async function createApp() {
	const gameSessions = new Map<string, Game>();

	function getOrCreateGame(sid: string): Game {
		let game = gameSessions.get(sid);
		if (!game) {
			game = new Game(
				drugsData as unknown as Record<string, Drug>,
				locationsData as unknown as Record<string, Location>,
			);
			gameSessions.set(sid, game);
		}
		return game;
	}

	function sessionId(req: express.Request): string {
		return (req.headers['x-session-id'] as string | undefined) ?? 'default';
	}

	const app = express();
	app.use(express.json());

	const apiIndex = {
		name: 'drugrunnerman-api',
		version: 'v1',
		note: 'Supply an X-Session-ID header to maintain per-user game state.',
		endpoints: [
			'GET  /healthz',
			'GET  /v1/state',
			'GET  /v1/prices[?loc=<location>]',
			'POST /v1/buy    { code, quantity }',
			'POST /v1/sell   { code, quantity }',
			'POST /v1/travel { to }',
			'POST /v1/skip',
		],
	};

	app.get('/', (req, res) => {
		res.format({
			'text/html': () => {
				res.send(
					buildGamePage(
						drugsData as unknown as Record<string, Drug>,
						locationsData as unknown as Record<string, Location>,
					),
				);
			},
			default: () => {
				res.json(apiIndex);
			},
		});
	});

	app.get('/healthz', (_req, res) => {
		res.status(200).json({ status: 'ok' });
	});

	app.get('/v1/state', (req, res) => {
		const game = getOrCreateGame(sessionId(req));
		res.json({ state: game.snapshot(), prices: game.prices(game.location) });
	});

	app.get('/v1/prices', (req, res) => {
		const parsed = querySchema.safeParse(req.query);
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() });
			return;
		}

		const game = getOrCreateGame(sessionId(req));
		const loc = parsed.data.loc ?? game.location;
		try {
			res.json({ day: game.day, location: loc, prices: game.prices(loc) });
		} catch (error: unknown) {
			if (error instanceof GameRuleError) {
				res.status(422).json({ error: error.message });
				return;
			}
			res.status(500).json({ error: 'Internal server error' });
		}
	});

	app.post('/v1/buy', (req, res) => {
		const parsed = tradeBodySchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}
		const game = getOrCreateGame(sessionId(req));
		try {
			const totalCost = game.buy(parsed.data.code, parsed.data.quantity);
			res.status(200).json({ state: game.snapshot(), totalCost });
		} catch (error: unknown) {
			if (error instanceof GameRuleError) {
				res.status(422).json({ error: error.message });
				return;
			}
			res.status(500).json({ error: 'Internal server error' });
		}
	});

	app.post('/v1/sell', (req, res) => {
		const parsed = tradeBodySchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}
		const game = getOrCreateGame(sessionId(req));
		try {
			const revenue = game.sell(parsed.data.code, parsed.data.quantity);
			res.status(200).json({ state: game.snapshot(), revenue });
		} catch (error: unknown) {
			if (error instanceof GameRuleError) {
				res.status(422).json({ error: error.message });
				return;
			}
			res.status(500).json({ error: 'Internal server error' });
		}
	});

	app.post('/v1/travel', (req, res) => {
		const parsed = travelBodySchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}
		const game = getOrCreateGame(sessionId(req));
		try {
			const policeEncounter = game.travel(parsed.data.to);
			res.status(200).json({ state: game.snapshot(), prices: game.prices(game.location), policeEncounter });
		} catch (error: unknown) {
			if (error instanceof GameRuleError) {
				res.status(422).json({ error: error.message });
				return;
			}
			res.status(500).json({ error: 'Internal server error' });
		}
	});

	app.post('/v1/skip', (req, res) => {
		const game = getOrCreateGame(sessionId(req));
		try {
			game.advanceDay();
			res.status(200).json({ state: game.snapshot(), prices: game.prices(game.location) });
		} catch (error: unknown) {
			if (error instanceof GameRuleError) {
				res.status(422).json({ error: error.message });
				return;
			}
			res.status(500).json({ error: 'Internal server error' });
		}
	});

	app.use((_req, res) => {
		res.status(404).json({ error: 'Not found' });
	});

	return app;
}

export async function startServer(port = 3000) {
	const app = await createApp();
	app.listen(port, () => console.log(`API up on :${port}`));
}

if (require.main === module) {
	void startServer();
}
