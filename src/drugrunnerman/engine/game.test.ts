import seedrandom from 'seedrandom';
import { Game, GameRuleError } from './game';
import { EventBus } from './eventBus';
import { PoliceAI, CopState } from './policeAI';
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

	describe('EventBus integration', () => {
		it('emits buy event when buying a drug', () => {
			const game = new Game(drugs, locations, rng, { startingCash: 1000 });
			const events: string[] = [];
			game.bus.on((e) => events.push(e.type));
			game.buy('CAN', 2);
			expect(events).toContain('buy');
		});

		it('emits sell event when selling a drug', () => {
			const game = new Game(drugs, locations, rng, { startingCash: 1000 });
			const events: string[] = [];
			game.bus.on((e) => events.push(e.type));
			game.buy('CAN', 1);
			game.sell('CAN', 1);
			expect(events).toContain('sell');
		});

		it('emits advanceDay event when advancing a day', () => {
			const game = new Game(drugs, locations, rng);
			const events: string[] = [];
			game.bus.on((e) => events.push(e.type));
			game.advanceDay();
			expect(events).toContain('advanceDay');
		});

		it('emits travel event when travelling', () => {
			const game = new Game(drugs, locations, rng);
			const events: string[] = [];
			game.bus.on((e) => events.push(e.type));
			game.travel('Seattle');
			expect(events).toContain('travel');
		});

		it('emits gameOver event when the last day is passed', () => {
			const game = new Game(drugs, locations, rng, { maxDays: 1 });
			const events: string[] = [];
			game.bus.on((e) => events.push(e.type));
			game.advanceDay();
			expect(events).toContain('gameOver');
		});

		it('off() stops receiving events', () => {
			const game = new Game(drugs, locations, rng);
			const events: string[] = [];
			const listener = (e: { type: string }) => events.push(e.type);
			game.bus.on(listener);
			game.advanceDay();
			expect(events.length).toBe(1);
			game.bus.off(listener);
			game.advanceDay();
			expect(events.length).toBe(1);
		});
	});

	describe('threat getter', () => {
		it('returns 0 when inventory is empty', () => {
			const game = new Game(drugs, locations, rng);
			expect(game.threat).toBe(0);
		});

		it('returns a positive value proportional to used capacity', () => {
			const game = new Game(drugs, locations, rng, { startingCash: 1000, capacity: 10 });
			game.buy('CAN', 5);
			expect(game.threat).toBeCloseTo(0.5);
		});
	});
});

describe('EventBus', () => {
	it('delivers events to all listeners', () => {
		const bus = new EventBus();
		const received: string[] = [];
		bus.on((e) => received.push(e.type));
		bus.on((e) => received.push(e.type + '2'));
		bus.emit({ type: 'test' });
		expect(received).toEqual(['test', 'test2']);
	});

	it('off() removes only the specified listener', () => {
		const bus = new EventBus();
		const a: string[] = [];
		const b: string[] = [];
		const listenerA = (e: { type: string }) => a.push(e.type);
		const listenerB = (e: { type: string }) => b.push(e.type);
		bus.on(listenerA);
		bus.on(listenerB);
		bus.off(listenerA);
		bus.emit({ type: 'ping' });
		expect(a).toHaveLength(0);
		expect(b).toEqual(['ping']);
	});
});

describe('PoliceAI', () => {
	it('stays in Patrol when threat is 0', () => {
		const ai = new PoliceAI();
		const result = ai.step(0, () => 0);
		expect(result).toBe(CopState.Patrol);
	});

	it('moves to Pursuit when rng < threat', () => {
		const ai = new PoliceAI();
		const result = ai.step(1, () => 0);
		expect(result).toBe(CopState.Pursuit);
	});

	it('transitions Pursuit → Shootout when rng < 0.5', () => {
		const ai = new PoliceAI();
		ai.step(1, () => 0);
		const result = ai.step(1, () => 0.3);
		expect(result).toBe(CopState.Shootout);
	});

	it('transitions Pursuit → Arrest when rng >= 0.5', () => {
		const ai = new PoliceAI();
		ai.step(1, () => 0);
		const result = ai.step(1, () => 0.7);
		expect(result).toBe(CopState.Arrest);
	});

	it('resets to Patrol after Arrest', () => {
		const ai = new PoliceAI();
		ai.step(1, () => 0);
		ai.step(1, () => 0.7);
		const result = ai.step(1, () => 0);
		expect(result).toBe(CopState.Patrol);
	});
});
