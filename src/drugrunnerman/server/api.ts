import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { Game, GameRuleError } from '../engine/game';
import type { Drug } from '../models/drug';
import type { Location } from '../models/location';
import drugsData from '../data/drugs.json';
import locationsData from '../data/locations.json';

const querySchema = z.object({
	loc: z.string().trim().min(1).optional(),
});

const bodySchema = z.object({ to: z.string().trim().min(1) });

export async function createApp() {
	const game = new Game(drugsData as unknown as Record<string, Drug>, locationsData as unknown as Record<string, Location>);

	const app = express();
	app.use(express.json());

	app.get('/healthz', (_req: Request, res: Response) => {
		res.status(200).json({ status: 'ok' });
	});

	app.get('/v1/prices', (req: Request, res: Response) => {
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

	app.post('/v1/travel', (req: Request, res: Response) => {
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

	return app;
}

export async function startServer(port = 3000) {
	const app = await createApp();
	app.listen(port, () => console.log(`API up on :${port}`));
}

if (require.main === module) {
	void startServer();
}
