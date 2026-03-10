export const nextPrice = (mu: number, sigma: number, rng: () => number) => {
	const dir = rng() < 0.5 ? -1 : 1;
	const price = mu + dir * rng() * sigma * mu;
	const floor = 0.15 * mu;
	const cap = 4 * mu;
	return Math.min(Math.max(price, floor), cap);
};
