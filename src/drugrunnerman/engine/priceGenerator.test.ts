import { nextPrice } from './priceGenerator';

test('nextPrice clamps within range', () => {
	const mu = 100;
	const sigma = 0.25;
	const rng = () => 0.9;
	const p = nextPrice(mu, sigma, rng);
	expect(p).toBeLessThanOrEqual(400);
	expect(p).toBeGreaterThanOrEqual(15);
});
