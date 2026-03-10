import { Game, GameRuleError } from './game';
import type { Drug } from '../models/drug';
import type { Location } from '../models/location';

const drugs: Record<string, Drug> = {
	CAN: { code: 'CAN', name: 'Cannabis', mu: 10, sigma: 0.2, unit: 'g' },
	COC: { code: 'COC', name: 'Cocaine', mu: 100, sigma: 0.2, unit: 'g' },
	HER: { code: 'HER', name: 'Heroin', mu: 120, sigma: 0.2, unit: 'g' },
	METH: { code: 'METH', name: 'Meth', mu: 50, sigma: 0.2, unit: 'g' },
	MDM: { code: 'MDM', name: 'MDMA', mu: 20, sigma: 0.2, unit: 'tablet' },
	FEN: { code: 'FEN', name: 'Fentanyl', mu: 5, sigma: 0.2, unit: 'pill' },
};

const locations: Record<string, Location> = {
	Denver: { adjust: { CAN: 1 } },
	Seattle: { adjust: { CAN: 1.2 } },
};

const rng = () => 0.9;

describe('Game engine', () => {
	it('keeps prices stable for same day/location (regression)', () => {
		const game = new Game(drugs, locations, rng);
		const first = game.prices('Denver');
		const second = game.prices('Denver');

		expect(first).toEqual(second);
	});

	it('updates prices after day advance', () => {
		let idx = 0;
		const seqRng = () => {
			idx += 1;
			if (idx === 13) return 0.1;
			return 0.9;
		};
		const game = new Game(drugs, locations, seqRng);
		const dayOne = game.prices('Denver');
		game.advanceDay();
		const dayTwo = game.prices('Denver');
		expect(dayOne.CAN).not.toBe(dayTwo.CAN);
	});

	it('enforces cash and inventory rules', () => {
		const game = new Game(drugs, locations, rng, { startingCash: 30 });
		expect(() => game.buy('COC', 1)).toThrow(GameRuleError);

		const cost = game.buy('CAN', 1);
		expect(cost).toBeGreaterThan(0);
		expect(game.inventory.CAN).toBe(1);
		expect(() => game.sell('CAN', 2)).toThrow(GameRuleError);
	});

	it('travel validates location and advances the day', () => {
		const game = new Game(drugs, locations, rng);
		expect(() => game.travel('Nope')).toThrow('Unknown location');
		game.travel('Seattle');
		expect(game.location).toBe('Seattle');
		expect(game.day).toBe(2);
	});
});
