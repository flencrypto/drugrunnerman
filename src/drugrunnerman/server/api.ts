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
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Courier New',monospace;background:#0a0a0a;color:#00ff41;min-height:100vh;padding:1rem}
    h1{color:#00ff41;font-size:1.4rem;text-shadow:0 0 8px #00ff41}
    .hdr{border-bottom:1px solid #00ff41;padding-bottom:.5rem;margin-bottom:.8rem;display:flex;justify-content:space-between;align-items:center}
    .stat-row{display:flex;gap:1.5rem;margin-bottom:.8rem;padding:.5rem;background:#111;border:1px solid #333;flex-wrap:wrap}
    .stat{display:flex;flex-direction:column}
    .slabel{font-size:.65rem;color:#666;text-transform:uppercase;letter-spacing:1px}
    .sval{font-size:1.05rem;color:#00ff41}
    .sval.cash{color:#ffd700}
    .capbar{height:5px;background:#1a1a1a;border:1px solid #333;margin-top:3px;min-width:120px}
    .capfill{height:100%;background:#00ff41;transition:width .3s}
    .capfill.warn{background:#ffd700}
    .capfill.danger{background:#ff4444}
    .sect{font-size:.65rem;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:.3rem}
    table{width:100%;border-collapse:collapse;margin-bottom:.8rem;font-size:.9rem}
    th{text-align:left;padding:.35rem .4rem;color:#555;font-size:.7rem;border-bottom:1px solid #222}
    td{padding:.35rem .4rem;border-bottom:1px solid #151515}
    tr:hover td{background:#0e0e0e}
    .dcode{color:#fff;font-weight:bold}
    .dname{color:#888}
    .dprice{color:#ffd700}
    .dinv{color:#00bfff}
    .qinput{width:58px;background:#1a1a1a;border:1px solid #333;color:#00ff41;padding:3px 5px;font-family:monospace;text-align:right;font-size:.85rem}
    .btn{background:#1a1a1a;border:1px solid #00ff41;color:#00ff41;padding:3px 10px;cursor:pointer;font-family:monospace;font-size:.8rem;transition:background .1s,color .1s}
    .btn:hover{background:#00ff41;color:#000}
    .btn:active{opacity:.8}
    .btn-s{border-color:#ff4444;color:#ff4444}
    .btn-s:hover{background:#ff4444;color:#000}
    .btn-t{border-color:#00bfff;color:#00bfff}
    .btn-t:hover{background:#00bfff;color:#000}
    .btn-k{border-color:#777;color:#777}
    .btn-k:hover{background:#777;color:#000}
    .btn-new{border-color:#555;color:#555;font-size:.72rem}
    .btn-new:hover{background:#555;color:#fff}
    .acts{display:flex;gap:.8rem;align-items:center;margin-bottom:.8rem;padding:.5rem;background:#111;border:1px solid #333;flex-wrap:wrap}
    select{background:#1a1a1a;border:1px solid #333;color:#00bfff;padding:3px 7px;font-family:monospace;font-size:.85rem}
    .log{height:110px;overflow-y:auto;background:#050505;border:1px solid #333;padding:.4rem;font-size:.75rem}
    .lentry{padding:1px 0;border-bottom:1px solid #0c0c0c;color:#888}
    .lentry.warn{color:#ff6b6b}
    .lentry.good{color:#ffd700}
    .lentry.police{color:#ff4444;font-weight:bold}
    .modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:100;justify-content:center;align-items:center}
    .modal.show{display:flex}
    .mbox{background:#111;border:2px solid #ff4444;padding:1.2rem;max-width:400px;width:90%}
    .mbox h2{color:#ff4444;margin-bottom:.8rem;font-size:1.1rem}
    .mbox p{color:#ccc;font-size:.9rem;margin-bottom:.5rem}
    .govr{display:none;text-align:center;padding:3rem 1rem}
    .govr.show{display:block}
    .govr h2{font-size:2rem;color:#ffd700;margin-bottom:.8rem}
    .govr p{color:#aaa;margin-bottom:1.5rem}
    .api-ref{display:none}
  </style>
</head>
<body>
  <div class="hdr">
    <h1>&#128138; DrugRunnerMan API</h1>
    <button class="btn btn-new" id="new-btn">New Game</button>
  </div>

  <div id="game-area">
    <div class="stat-row">
      <div class="stat">
        <span class="slabel">Day</span>
        <span class="sval" id="s-day">-</span>
      </div>
      <div class="stat">
        <span class="slabel">Cash</span>
        <span class="sval cash" id="s-cash">-</span>
      </div>
      <div class="stat">
        <span class="slabel">Location</span>
        <span class="sval" id="s-loc">-</span>
      </div>
      <div class="stat" style="flex:1;min-width:140px">
        <span class="slabel">Capacity</span>
        <span class="sval" id="s-cap">-</span>
        <div class="capbar"><div class="capfill" id="cap-fill" style="width:0%"></div></div>
      </div>
    </div>

    <div class="sect">Market Prices</div>
    <table>
      <thead><tr>
        <th>Code</th><th>Name</th><th>Price</th><th>Inv</th><th>Qty</th><th></th><th></th>
      </tr></thead>
      <tbody id="prices-body"></tbody>
    </table>

    <div class="acts">
      <span class="sect" style="width:100%;margin:0">Travel &amp; Actions</span>
      <select id="dest-sel"></select>
      <button class="btn btn-t" id="travel-btn">Travel &#9992;</button>
      <button class="btn btn-k" id="skip-btn">Skip Day &#9193;</button>
    </div>

    <div class="sect">Event Log</div>
    <div class="log" id="log"></div>

    <div class="api-ref" id="api-ref">
      <!-- API reference: GET /healthz GET /v1/state GET /v1/prices[?loc=] POST /v1/buy POST /v1/sell POST /v1/travel POST /v1/skip -->
    </div>
  </div>

  <div class="govr" id="govr">
    <h2>GAME OVER</h2>
    <p id="govr-score"></p>
    <button class="btn" id="again-btn">Play Again</button>
  </div>

  <div class="modal" id="police-modal">
    <div class="mbox">
      <h2 id="pm-title"></h2>
      <p id="pm-body"></p>
      <br>
      <button class="btn" id="pm-ok">OK</button>
    </div>
  </div>

  <script>
    var DRUGS = ${drugsJson};
    var LOCS  = ${locsJson};
    var SK = 'drm_sid';

    function getSid() {
      var s = localStorage.getItem(SK);
      if (!s) { s = genUUID(); localStorage.setItem(SK, s); }
      return s;
    }
    function newSid() {
      var s = genUUID();
      localStorage.setItem(SK, s);
      return s;
    }
    function genUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }

    var sid = getSid();
    var st = null, pr = null;

    function api(method, path, body) {
      var opts = { method: method, headers: { 'Content-Type': 'application/json', 'X-Session-ID': sid } };
      if (body) opts.body = JSON.stringify(body);
      return fetch(path, opts).then(function(r) { return r.json(); });
    }

    function fmtMoney(n) {
      return '$' + n.toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
    }

    function addLog(msg, cls) {
      var log = document.getElementById('log');
      var d = document.createElement('div');
      d.className = 'lentry' + (cls ? ' ' + cls : '');
      var now = new Date();
      var hh = String(now.getHours()).padStart(2,'0');
      var mm = String(now.getMinutes()).padStart(2,'0');
      var ss = String(now.getSeconds()).padStart(2,'0');
      d.textContent = hh + ':' + mm + ':' + ss + '  ' + msg;
      log.insertBefore(d, log.firstChild);
    }

    function renderStatus() {
      if (!st) return;
      document.getElementById('s-day').textContent  = st.day + '/' + st.maxDays;
      document.getElementById('s-cash').textContent = fmtMoney(st.cash);
      document.getElementById('s-loc').textContent  = st.location;
      document.getElementById('s-cap').textContent  = st.usedCapacity + '/' + st.capacity;
      var pct = st.capacity > 0 ? (st.usedCapacity / st.capacity) * 100 : 0;
      var fill = document.getElementById('cap-fill');
      fill.style.width = pct + '%';
      fill.className = 'capfill' + (pct > 80 ? ' danger' : pct > 50 ? ' warn' : '');
    }

    function renderPrices() {
      if (!pr || !st) return;
      var tbody = document.getElementById('prices-body');
      tbody.innerHTML = '';
      var codes = Object.keys(DRUGS);
      for (var i = 0; i < codes.length; i++) {
        var code = codes[i];
        var drug = DRUGS[code];
        var price = pr[code] !== undefined ? pr[code] : 0;
        var inv = st.inventory[code] !== undefined ? st.inventory[code] : 0;
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td class="dcode">' + code + '</td>' +
          '<td class="dname">' + drug.name + '</td>' +
          '<td class="dprice">' + fmtMoney(price) + '</td>' +
          '<td class="dinv">' + inv + '</td>' +
          '<td><input class="qinput" type="number" min="1" value="1" id="q-' + code + '"></td>' +
          '<td><button class="btn" onclick="doBuy(\'' + code + '\')">Buy</button></td>' +
          '<td><button class="btn btn-s" onclick="doSell(\'' + code + '\')">Sell</button></td>';
        tbody.appendChild(tr);
      }
    }

    function renderDests() {
      var sel = document.getElementById('dest-sel');
      sel.innerHTML = '';
      var locs = Object.keys(LOCS);
      for (var i = 0; i < locs.length; i++) {
        var loc = locs[i];
        var opt = document.createElement('option');
        opt.value = loc;
        opt.textContent = loc;
        if (st && loc === st.location) opt.disabled = true;
        sel.appendChild(opt);
      }
      for (var j = 0; j < sel.options.length; j++) {
        if (!sel.options[j].disabled) { sel.value = sel.options[j].value; break; }
      }
    }

    function showPolice(enc) {
      if (!enc) return;
      var modal = document.getElementById('police-modal');
      var title = document.getElementById('pm-title');
      var body  = document.getElementById('pm-body');
      if (enc.outcome === 'arrest') {
        title.textContent = '🚔 ARRESTED!';
        var msg = 'Fined ' + fmtMoney(enc.fine || 0);
        if (enc.inventorySeized) {
          var seized = Object.keys(enc.inventorySeized);
          if (seized.length > 0) {
            msg += '. Inventory seized: ' + seized.map(function(k) { return k + ': ' + enc.inventorySeized[k]; }).join(', ');
          }
        }
        body.textContent = msg;
        addLog('POLICE: Arrested! Fine ' + fmtMoney(enc.fine || 0), 'police');
      } else {
        title.textContent = '🔫 SHOOTOUT!';
        var lostMsg = 'You survived!';
        if (enc.inventoryLost) {
          var lost = Object.keys(enc.inventoryLost);
          if (lost.length > 0) {
            lostMsg += ' Lost: ' + lost.map(function(k) { return k + ': ' + enc.inventoryLost[k]; }).join(', ');
          }
        }
        body.textContent = lostMsg;
        addLog('POLICE: Shootout! Some inventory lost', 'police');
      }
      modal.classList.add('show');
    }

    function checkGameOver() {
      if (!st) return false;
      if (st.day > st.maxDays) {
        document.getElementById('game-area').style.display = 'none';
        document.getElementById('govr').classList.add('show');
        document.getElementById('govr-score').textContent = 'Final cash: ' + fmtMoney(st.cash) + ' after ' + st.maxDays + ' days';
        return true;
      }
      return false;
    }

    function refresh(data) {
      if (data.state) st = data.state;
      if (data.prices) pr = data.prices;
      renderStatus();
      renderPrices();
      renderDests();
      checkGameOver();
    }

    function loadState() {
      api('GET', '/v1/state').then(function(data) { refresh(data); });
    }

    function getQty(code) {
      var input = document.getElementById('q-' + code);
      return parseInt(input ? input.value : '1', 10);
    }

    function doBuy(code) {
      var qty = getQty(code);
      if (!qty || qty < 1) { addLog('Enter a valid quantity', 'warn'); return; }
      api('POST', '/v1/buy', { code: code, quantity: qty }).then(function(data) {
        if (data.error) { addLog('Buy failed: ' + data.error, 'warn'); return; }
        addLog('Bought ' + qty + ' ' + code + ' for ' + fmtMoney(data.totalCost), 'good');
        refresh(data);
      });
    }

    function doSell(code) {
      var qty = getQty(code);
      if (!qty || qty < 1) { addLog('Enter a valid quantity', 'warn'); return; }
      api('POST', '/v1/sell', { code: code, quantity: qty }).then(function(data) {
        if (data.error) { addLog('Sell failed: ' + data.error, 'warn'); return; }
        addLog('Sold ' + qty + ' ' + code + ' for ' + fmtMoney(data.revenue), 'good');
        refresh(data);
      });
    }

    function doTravel() {
      var to = document.getElementById('dest-sel').value;
      api('POST', '/v1/travel', { to: to }).then(function(data) {
        if (data.error) { addLog('Travel failed: ' + data.error, 'warn'); return; }
        addLog('Traveled to ' + to + ' (Day ' + data.state.day + ')');
        showPolice(data.policeEncounter);
        refresh(data);
      });
    }

    function doSkip() {
      api('POST', '/v1/skip').then(function(data) {
        if (data.error) { addLog('Skip failed: ' + data.error, 'warn'); return; }
        addLog('Skipped to Day ' + data.state.day);
        refresh(data);
      });
    }

    function startNewGame() {
      sid = newSid();
      document.getElementById('game-area').style.display = '';
      document.getElementById('govr').classList.remove('show');
      document.getElementById('log').innerHTML = '';
      loadState();
    }

    document.getElementById('travel-btn').addEventListener('click', doTravel);
    document.getElementById('skip-btn').addEventListener('click', doSkip);
    document.getElementById('pm-ok').addEventListener('click', function() {
      document.getElementById('police-modal').classList.remove('show');
    });
    document.getElementById('new-btn').addEventListener('click', function() {
      if (confirm('Start a new game?')) startNewGame();
    });
    document.getElementById('again-btn').addEventListener('click', startNewGame);

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
