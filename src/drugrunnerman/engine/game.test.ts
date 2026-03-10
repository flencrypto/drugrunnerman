import seedrandom from 'seedrandom';
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
		const game = new Game(drugs, locations, rng);
		const dayOne = game.prices('Denver');
		game.advanceDay();
		const dayTwo = game.prices('Denver');
		expect(dayOne).not.toEqual(dayTwo);
	});

	it('prices are independent of query order (RNG isolation)', () => {
		const gameDenverFirst = new Game(drugs, locations, seedrandom('fixed'));
		const denverFirst = gameDenverFirst.prices('Denver');
		const seattleFirst = gameDenverFirst.prices('Seattle');

		const gameSeattleFirst = new Game(drugs, locations, seedrandom('fixed'));
		const seattleSecond = gameSeattleFirst.prices('Seattle');
		const denverSecond = gameSeattleFirst.prices('Denver');

		expect(denverFirst).toEqual(denverSecond);
		expect(seattleFirst).toEqual(seattleSecond);
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

	describe('GameConfig validation', () => {
		it('throws for negative startingCash', () => {
			expect(() => new Game(drugs, locations, rng, { startingCash: -1 })).toThrow(GameRuleError);
		});

		it('throws for NaN startingCash', () => {
			expect(() => new Game(drugs, locations, rng, { startingCash: NaN })).toThrow(GameRuleError);
		});

		it('throws for Infinity startingCash', () => {
			expect(() => new Game(drugs, locations, rng, { startingCash: Infinity })).toThrow(GameRuleError);
		});

		it('throws for zero maxDays', () => {
			expect(() => new Game(drugs, locations, rng, { maxDays: 0 })).toThrow(GameRuleError);
		});

		it('throws for negative maxDays', () => {
			expect(() => new Game(drugs, locations, rng, { maxDays: -5 })).toThrow(GameRuleError);
		});

		it('throws for non-integer maxDays', () => {
			expect(() => new Game(drugs, locations, rng, { maxDays: 1.5 })).toThrow(GameRuleError);
		});

		it('throws for zero capacity', () => {
			expect(() => new Game(drugs, locations, rng, { capacity: 0 })).toThrow(GameRuleError);
		});

		it('throws for negative capacity', () => {
			expect(() => new Game(drugs, locations, rng, { capacity: -10 })).toThrow(GameRuleError);
		});

		it('throws for non-integer capacity', () => {
			expect(() => new Game(drugs, locations, rng, { capacity: 2.7 })).toThrow(GameRuleError);
		});
	});
});
