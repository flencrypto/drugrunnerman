import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import { Game, GameRuleError } from '../engine/game';
import type { Drug } from '../models/drug';
import type { Location } from '../models/location';

const querySchema = z.object({
	loc: z.string().trim().min(1).optional(),
});

const bodySchema = z.object({ to: z.string().trim().min(1) });

async function loadData() {
	const dataDir = path.resolve(__dirname, '..', 'data');
	const [drugsRaw, locationsRaw] = await Promise.all([
		fs.readFile(path.join(dataDir, 'drugs.json'), 'utf-8'),
		fs.readFile(path.join(dataDir, 'locations.json'), 'utf-8'),
	]);

	return {
		drugs: JSON.parse(drugsRaw) as Record<string, Drug>,
		locations: JSON.parse(locationsRaw) as Record<string, Location>,
	};
}

export async function startServer(port = 3000) {
	const { drugs, locations } = await loadData();
	const game = new Game(drugs, locations);

	const app = express();
	app.use(express.json());

	app.get('/healthz', (_req, res) => {
		res.status(200).json({ status: 'ok' });
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

	app.post('/v1/travel', (req, res) => {
		const parsed = bodySchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}
		try {
			game.travel(parsed.data.to);
			res.status(200).json({ state: game.snapshot(), prices: game.prices(game.location) });
		} catch (error: unknown) {
			if (error instanceof GameRuleError) {
				res.status(422).json({ error: error.message });
				return;
			}
			res.status(500).json({ error: 'Internal server error' });
		}
	});

	app.listen(port, () => console.log(`API up on :${port}`));
}

if (require.main === module) {
	void startServer();
}
