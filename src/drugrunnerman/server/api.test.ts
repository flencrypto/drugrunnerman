import request from 'supertest';
import { createApp } from './api';
import type { Express } from 'express';

let app: Express;

beforeEach(async () => {
	app = await createApp();
});

describe('GET /', () => {
	it('returns HTML landing page for browser requests', async () => {
		const res = await request(app).get('/').set('Accept', 'text/html,application/xhtml+xml,*/*');
		expect(res.status).toBe(200);
		expect(res.headers['content-type']).toMatch(/text\/html/);
		expect(res.text).toContain('DrugRunnerMan');
		expect(res.text).toContain('/v1/state');
		expect(res.text).toContain('Market');
		expect(res.text).toContain('Travel');
	});

	it('returns JSON index for API clients', async () => {
		const res = await request(app).get('/').set('Accept', 'application/json');
		expect(res.status).toBe(200);
		expect(res.body).toHaveProperty('name', 'drugrunnerman-api');
		expect(res.body).toHaveProperty('endpoints');
		expect(Array.isArray(res.body.endpoints)).toBe(true);
	});
});

describe('GET /healthz', () => {
	it('returns status ok', async () => {
		const res = await request(app).get('/healthz');
		expect(res.status).toBe(200);
		expect(res.body).toEqual({ status: 'ok' });
	});
});

describe('GET /v1/state', () => {
	it('returns current game state and prices', async () => {
		const res = await request(app).get('/v1/state');
		expect(res.status).toBe(200);
		expect(res.body).toHaveProperty('state');
		expect(res.body).toHaveProperty('prices');
		expect(res.body.state).toHaveProperty('day');
		expect(res.body.state).toHaveProperty('cash');
		expect(res.body.state).toHaveProperty('location');
	});
});

describe('POST /v1/game/setup', () => {
	it('applies requested setup and returns configured state', async () => {
		const sid = 'setup-session';
		const res = await request(app).post('/v1/game/setup').set('X-Session-ID', sid).send({
			gameLength: '7d',
			difficulty: 'hard',
			worldEventCadence: 'chaos',
			personalLifeMode: 'light',
		});
		expect(res.status).toBe(200);
		expect(res.body.state.maxDays).toBe(7);
		expect(res.body.state.cash).toBe(2500);
		expect(res.body.state.capacity).toBe(70);
	});

	it('returns 400 for invalid setup payload', async () => {
		const res = await request(app).post('/v1/game/setup').send({ gameLength: 'bad' });
		expect(res.status).toBe(400);
		expect(res.body).toHaveProperty('error');
	});
});

describe('GET /v1/prices', () => {
	it('returns prices for current location when no loc param given', async () => {
		const res = await request(app).get('/v1/prices');
		expect(res.status).toBe(200);
		expect(res.body).toHaveProperty('day');
		expect(res.body).toHaveProperty('location');
		expect(res.body).toHaveProperty('prices');
	});

	it('returns prices for a specific location', async () => {
		const res = await request(app).get('/v1/prices?loc=Denver');
		expect(res.status).toBe(200);
		expect(res.body.location).toBe('Denver');
		expect(res.body.prices).toHaveProperty('CAN');
	});

	it('returns 422 for an unknown location', async () => {
		const res = await request(app).get('/v1/prices?loc=Narnia');
		expect(res.status).toBe(422);
		expect(res.body).toHaveProperty('error');
	});
});

describe('POST /v1/buy', () => {
	it('successfully buys a drug and returns updated state', async () => {
		const stateBefore = await request(app).get('/v1/state');
		const cashBefore: number = stateBefore.body.state.cash;

		const res = await request(app).post('/v1/buy').send({ code: 'CAN', quantity: 1 });
		expect(res.status).toBe(200);
		expect(res.body).toHaveProperty('state');
		expect(res.body).toHaveProperty('totalCost');
		expect(res.body.totalCost).toBeGreaterThan(0);
		expect(res.body.state.cash).toBeLessThan(cashBefore);
		expect(res.body.state.inventory.CAN).toBeGreaterThanOrEqual(1);
	});

	it('returns 422 when buying with insufficient cash', async () => {
		const res = await request(app).post('/v1/buy').send({ code: 'COC', quantity: 100000 });
		expect(res.status).toBe(422);
		expect(res.body).toHaveProperty('error');
	});

	it('returns 400 for invalid request body', async () => {
		const res = await request(app).post('/v1/buy').send({ code: 'INVALID', quantity: 1 });
		expect(res.status).toBe(400);
		expect(res.body).toHaveProperty('error');
	});

	it('returns 400 for non-positive quantity', async () => {
		const res = await request(app).post('/v1/buy').send({ code: 'CAN', quantity: 0 });
		expect(res.status).toBe(400);
	});
});

describe('POST /v1/sell', () => {
	it('successfully sells a drug and returns updated state', async () => {
		await request(app).post('/v1/buy').send({ code: 'CAN', quantity: 1 });

		const stateBefore = await request(app).get('/v1/state');
		const cashBefore: number = stateBefore.body.state.cash;

		const res = await request(app).post('/v1/sell').send({ code: 'CAN', quantity: 1 });
		expect(res.status).toBe(200);
		expect(res.body).toHaveProperty('state');
		expect(res.body).toHaveProperty('revenue');
		expect(res.body.revenue).toBeGreaterThan(0);
		expect(res.body.state.cash).toBeGreaterThan(cashBefore);
	});

	it('returns 422 when selling more than in inventory', async () => {
		const res = await request(app).post('/v1/sell').send({ code: 'HER', quantity: 99999 });
		expect(res.status).toBe(422);
		expect(res.body).toHaveProperty('error');
	});

	it('returns 400 for invalid drug code', async () => {
		const res = await request(app).post('/v1/sell').send({ code: 'FAKE', quantity: 1 });
		expect(res.status).toBe(400);
	});
});

describe('POST /v1/travel', () => {
	it('travels to a location and returns updated state', async () => {
		const res = await request(app).post('/v1/travel').send({ to: 'Medellin' });
		expect(res.status).toBe(200);
		expect(res.body).toHaveProperty('state');
		expect(res.body).toHaveProperty('prices');
		expect(res.body.state.location).toBe('Medellin');
		expect(res.body.state.day).toBeGreaterThan(1);
		expect(res.body).toHaveProperty('policeEncounter');
	});

	it('returns 422 for unknown destination', async () => {
		const res = await request(app).post('/v1/travel').send({ to: 'Atlantis' });
		expect(res.status).toBe(422);
		expect(res.body).toHaveProperty('error');
	});

	it('returns 400 for missing destination', async () => {
		const res = await request(app).post('/v1/travel').send({});
		expect(res.status).toBe(400);
	});
});

describe('POST /v1/skip', () => {
	it('advances the day and returns updated state', async () => {
		const stateBefore = await request(app).get('/v1/state');
		const dayBefore: number = stateBefore.body.state.day;

		const res = await request(app).post('/v1/skip');
		expect(res.status).toBe(200);
		expect(res.body).toHaveProperty('state');
		expect(res.body).toHaveProperty('prices');
		expect(res.body.state.day).toBe(dayBefore + 1);
	});
});

describe('404 handler', () => {
	it('returns JSON 404 for unknown routes', async () => {
		const res = await request(app).get('/nonexistent');
		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: 'Not found' });
	});

	it('returns JSON 404 for unknown POST routes', async () => {
		const res = await request(app).post('/v1/unknown');
		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: 'Not found' });
	});
});

describe('GET /v1/shop', () => {
	it('returns list of shop items', async () => {
		const res = await request(app).get('/v1/shop');
		expect(res.status).toBe(200);
		expect(res.body).toHaveProperty('items');
		expect(Array.isArray(res.body.items)).toBe(true);
		expect(res.body.items.length).toBeGreaterThan(0);
	});

	it('each item has required fields', async () => {
		const res = await request(app).get('/v1/shop');
		for (const item of res.body.items) {
			expect(item).toHaveProperty('code');
			expect(item).toHaveProperty('name');
			expect(item).toHaveProperty('emoji');
			expect(item).toHaveProperty('price');
			expect(item).toHaveProperty('description');
			expect(item).toHaveProperty('type');
			expect(['permanent', 'consumable']).toContain(item.type);
		}
	});
});

describe('POST /v1/shop/buy', () => {
	it('successfully buys a shop item and returns updated state', async () => {
		const res = await request(app).post('/v1/shop/buy').send({ code: 'PISTOL' });
		expect(res.status).toBe(200);
		expect(res.body).toHaveProperty('state');
		expect(res.body.state.ownedItems).toContain('PISTOL');
	});

	it('returns 422 when buying an item already owned', async () => {
		await request(app).post('/v1/shop/buy').send({ code: 'PISTOL' });
		const res = await request(app).post('/v1/shop/buy').send({ code: 'PISTOL' });
		expect(res.status).toBe(422);
		expect(res.body).toHaveProperty('error');
	});

	it('returns 422 when player cannot afford the item', async () => {
		// BOAT costs $5000, but player starts with $1000
		const res = await request(app).post('/v1/shop/buy').send({ code: 'BOAT' });
		expect(res.status).toBe(422);
		expect(res.body).toHaveProperty('error');
	});

	it('returns 400 for invalid request body', async () => {
		const res = await request(app).post('/v1/shop/buy').send({});
		expect(res.status).toBe(400);
		expect(res.body).toHaveProperty('error');
	});

	it('returns 400 for unknown item code', async () => {
		const res = await request(app).post('/v1/shop/buy').send({ code: 'UNKNOWN' });
		expect(res.status).toBe(400);
		expect(res.body).toHaveProperty('error');
	});
});
