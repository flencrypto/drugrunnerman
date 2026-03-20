import path from 'path';
import express from 'express';
import { z } from 'zod';
import { Game, GameRuleError, GameConfig } from '../engine/game';
import type { Drug } from '../models/drug';
import type { Location } from '../models/location';
import type { ShopItem } from '../models/shopItem';
import drugsData from '../data/drugs.json';
import locationsData from '../data/locations.json';
import shopItemsData from '../data/shopItems.json';

const drugCodes = Object.keys(drugsData) as [Drug['code'], ...Drug['code'][]];
// Guard: ensure shopItems is non-empty so z.enum() receives a valid tuple
const shopItemKeys = Object.keys(shopItemsData);
if (shopItemKeys.length === 0) throw new Error('shopItems.json must not be empty');
const shopItemCodes = shopItemKeys as [string, ...string[]];

const querySchema = z.object({
	loc: z.string().trim().min(1).optional(),
});

const travelBodySchema = z.object({ to: z.string().trim().min(1) });

const tradeBodySchema = z.object({
	code: z.enum(drugCodes),
	quantity: z.number().int().positive(),
});

const shopBuyBodySchema = z.object({
	code: z.enum(shopItemCodes as [string, ...string[]]),
});

const setupBodySchema = z.object({
	gameLength: z.enum(['7d', '30d', '12m', 'forever']),
	difficulty: z.enum(['easy-peasy', 'easy', 'normal', 'hard', 'nightmare']),
	worldEventCadence: z.enum(['off', 'light', 'standard', 'chaos']),
	personalLifeMode: z.enum(['off', 'light', 'full']),
});

export async function createApp() {
	const gameSessions = new Map<string, Game>();
	const gameConfigs = new Map<string, GameConfig>();

	const difficultyConfig: Record<string, Pick<GameConfig, 'startingCash' | 'capacity'>> = {
		'easy-peasy': { startingCash: 100000, capacity: 1500 },
		easy: { startingCash: 50000, capacity: 200 },
		normal: { startingCash: 5000, capacity: 100 },
		hard: { startingCash: 2500, capacity: 70 },
		nightmare: { startingCash: 1000, capacity: 40 },
	};

	const lengthConfig: Record<string, Pick<GameConfig, 'maxDays'>> = {
		'7d': { maxDays: 7 },
		'30d': { maxDays: 30 },
		'12m': { maxDays: 360 },
		forever: { maxDays: 36500 },
	};

	function getOrCreateGame(sid: string): Game {
		let game = gameSessions.get(sid);
		if (!game) {
			const config = gameConfigs.get(sid);
			game = new Game(
				drugsData as unknown as Record<string, Drug>,
				locationsData as unknown as Record<string, Location>,
				undefined,
				config,
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
	const publicDir = path.resolve(process.cwd(), 'public');
	app.use(express.static(publicDir, { index: false }));

	const apiIndex = {
		name: 'drugrunnerman-api',
		version: 'v1',
		note: 'Supply an X-Session-ID header to maintain per-user game state.',
		endpoints: [
			'GET  /healthz',
			'GET  /v1/state',
			'GET  /v1/prices[?loc=<location>]',
			'GET  /v1/shop',
			'POST /v1/game/setup { gameLength, difficulty, worldEventCadence, personalLifeMode }',
			'POST /v1/buy    { code, quantity }',
			'POST /v1/sell   { code, quantity }',
			'POST /v1/travel { to }',
			'POST /v1/skip',
			'POST /v1/shop/buy { code }',
		],
	};

	app.get('/', (req, res) => {
		res.format({
			'text/html': () => {
				res.sendFile(path.join(publicDir, 'index.html'));
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

	app.post('/v1/game/setup', (req, res) => {
		const parsed = setupBodySchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}
		const sid = sessionId(req);
		const config: GameConfig = {
			...difficultyConfig[parsed.data.difficulty],
			...lengthConfig[parsed.data.gameLength],
			worldEventCadence: parsed.data.worldEventCadence,
			personalLifeMode: parsed.data.personalLifeMode,
		};
		gameConfigs.set(sid, config);
		gameSessions.delete(sid);
		const game = getOrCreateGame(sid);
		res.status(200).json({ state: game.snapshot(), prices: game.prices(game.location) });
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

	app.get('/v1/shop', (_req, res) => {
		const items = Object.entries(shopItemsData).map(([code, item]) => ({ code, ...item }));
		res.json({ items });
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
			const { encounter: policeEncounter, marketEvent } = game.travel(parsed.data.to);
			res
				.status(200)
				.json({ state: game.snapshot(), prices: game.prices(game.location), policeEncounter, marketEvent });
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

	app.post('/v1/shop/buy', (req, res) => {
		const parsed = shopBuyBodySchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}
		const game = getOrCreateGame(sessionId(req));
		const itemData = (shopItemsData as Record<string, Omit<ShopItem, 'code'>>)[parsed.data.code];
		if (!itemData) {
			res.status(404).json({ error: 'Shop item not found' });
			return;
		}
		const item: ShopItem = { code: parsed.data.code as ShopItem['code'], ...itemData };
		try {
			game.buyItem(item);
			res.status(200).json({ state: game.snapshot() });
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
