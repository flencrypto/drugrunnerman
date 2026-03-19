import express from 'express';
import { z } from 'zod';
import { Game, GameRuleError } from '../engine/game';
import type { Drug } from '../models/drug';
import type { Location } from '../models/location';
import drugsData from '../data/drugs.json';
import locationsData from '../data/locations.json';

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
	const game = new Game(
		drugsData as unknown as Record<string, Drug>,
		locationsData as unknown as Record<string, Location>,
	);

	const app = express();
	app.use(express.json());

	app.get('/healthz', (_req, res) => {
		res.status(200).json({ status: 'ok' });
	});

	app.get('/v1/state', (_req, res) => {
		res.json({ state: game.snapshot(), prices: game.prices(game.location) });
	});

	app.get('/v1/prices', (req, res) => {
		const parsed = querySchema.safeParse(req.query);
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid query params', details: parsed.error.flatten() });
			return;
		}

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

	app.post('/v1/skip', (_req, res) => {
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
