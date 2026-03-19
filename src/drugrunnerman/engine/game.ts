import seedrandom from 'seedrandom';
import type { Drug } from '../models/drug';
import type { Location } from '../models/location';
import { nextPrice } from './priceGenerator';
import { EventBus } from './eventBus';
import { PoliceAI, CopState } from './policeAI';

export class GameRuleError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GameRuleError';
	}
}

export interface GameConfig {
	startingCash?: number;
	maxDays?: number;
	capacity?: number;
	startingLocation?: string;
}

export interface PortfolioSnapshot {
	day: number;
	location: string;
	cash: number;
	capacity: number;
	usedCapacity: number;
	maxDays: number;
	inventory: Record<Drug['code'], number>;
}

export interface PoliceEncounter {
	outcome: 'arrest' | 'shootout';
	fine?: number;
	inventorySeized?: Partial<Record<Drug['code'], number>>;
	inventoryLost?: Partial<Record<Drug['code'], number>>;
}

export class Game {
	day = 1;
	cash: number;
	location: string;
	readonly maxDays: number;
	readonly capacity: number;
	readonly bus = new EventBus();
	private readonly gameSeed: number;
	private readonly priceBook = new Map<string, Record<Drug['code'], number>>();
	private readonly inventoryState: Record<Drug['code'], number> = { CAN: 0, COC: 0, HER: 0, METH: 0, MDM: 0, FEN: 0 };
	private readonly police = new PoliceAI();

	constructor(
		private readonly drugs: Record<string, Drug>,
		private readonly locations: Record<string, Location>,
		rng: () => number = seedrandom(),
		config: GameConfig = {},
	) {
		const startingCash = config.startingCash ?? 1000;
		const maxDays = config.maxDays ?? 30;
		const capacity = config.capacity ?? 100;

		if (!Number.isFinite(startingCash) || startingCash < 0) {
			throw new GameRuleError('startingCash must be a non-negative finite number');
		}
		if (!Number.isInteger(maxDays) || maxDays <= 0) {
			throw new GameRuleError('maxDays must be a positive integer');
		}
		if (!Number.isInteger(capacity) || capacity <= 0) {
			throw new GameRuleError('capacity must be a positive integer');
		}

		this.cash = startingCash;
		this.maxDays = maxDays;
		this.capacity = capacity;
		this.location = config.startingLocation ?? 'Denver';
		this.gameSeed = rng();

		this.assertGameData();
		if (!this.locations[this.location]) {
			throw new GameRuleError(`Unknown starting location: ${this.location}`);
		}
	}

	get inventory() {
		return { ...this.inventoryState };
	}

	get usedCapacity() {
		return Object.values(this.inventoryState).reduce((total, qty) => total + qty, 0);
	}

	get isGameOver() {
		return this.day > this.maxDays;
	}

	get threat(): number {
		return this.usedCapacity / this.capacity;
	}

	prices(loc: string): Record<Drug['code'], number> {
		if (!this.locations[loc]) {
			throw new GameRuleError(`Unknown location: ${loc}`);
		}
		const cacheKey = `${this.day}:${loc}`;
		const cached = this.priceBook.get(cacheKey);
		if (cached) {
			return { ...cached };
		}

		const subRng = this.makeSubRng(`${this.day}:${loc}`);
		const locAdjust = this.locations[loc].adjust;
		const prices = Object.entries(this.drugs).reduce((acc, [code, drug]) => {
			const typedCode = code as Drug['code'];
			const locationMultiplier = locAdjust[typedCode] ?? 1;
			const expectedPrice = drug.mu * locationMultiplier;
			acc[typedCode] = nextPrice(expectedPrice, drug.sigma, subRng);
			return acc;
		}, {} as Record<Drug['code'], number>);
		this.priceBook.set(cacheKey, prices);
		return { ...prices };
	}

	buy(code: Drug['code'], quantity: number): number {
		this.ensureGameInProgress();
		this.ensureDrugExists(code);
		this.ensurePositiveInteger(quantity, 'quantity');
		if (this.usedCapacity + quantity > this.capacity) {
			throw new GameRuleError('Not enough inventory capacity');
		}
		const unitPrice = this.prices(this.location)[code];
		const totalCost = unitPrice * quantity;
		if (totalCost > this.cash) {
			throw new GameRuleError('Insufficient cash');
		}
		this.cash -= totalCost;
		this.inventoryState[code] += quantity;
		this.bus.emit({ type: 'buy', code, quantity, totalCost });
		return totalCost;
	}

	sell(code: Drug['code'], quantity: number): number {
		this.ensureGameInProgress();
		this.ensureDrugExists(code);
		this.ensurePositiveInteger(quantity, 'quantity');
		if (this.inventoryState[code] < quantity) {
			throw new GameRuleError('Insufficient inventory');
		}
		const revenue = this.prices(this.location)[code] * quantity;
		this.inventoryState[code] -= quantity;
		this.cash += revenue;
		this.bus.emit({ type: 'sell', code, quantity, revenue });
		return revenue;
	}

	travel(to: string): PoliceEncounter | null {
		this.ensureGameInProgress();
		if (!this.locations[to]) {
			throw new GameRuleError(`Unknown location: ${to}`);
		}
		const from = this.location;
		this.location = to;
		this.advanceDay();

		const policeRng = this.makeSubRng(`police:${this.day}`);
		const newState = this.police.step(this.threat, policeRng);

		let encounter: PoliceEncounter | null = null;
		if (newState === CopState.Arrest) {
			const fine = Math.floor(this.cash * 0.2);
			const inventorySeized: Partial<Record<Drug['code'], number>> = {};
			for (const code of Object.keys(this.inventoryState) as Drug['code'][]) {
				if (this.inventoryState[code] > 0) {
					inventorySeized[code] = this.inventoryState[code];
					this.inventoryState[code] = 0;
				}
			}
			this.cash -= fine;
			encounter = { outcome: 'arrest', fine, inventorySeized };
			this.bus.emit({ type: 'police', ...encounter });
		} else if (newState === CopState.Shootout) {
			const inventoryLost: Partial<Record<Drug['code'], number>> = {};
			for (const code of Object.keys(this.inventoryState) as Drug['code'][]) {
				const lost = Math.floor(this.inventoryState[code] * 0.5);
				if (lost > 0) {
					this.inventoryState[code] -= lost;
					inventoryLost[code] = lost;
				}
			}
			encounter = { outcome: 'shootout', inventoryLost };
			this.bus.emit({ type: 'police', ...encounter });
		}

		this.bus.emit({ type: 'travel', from, to, day: this.day });
		return encounter;
	}

	advanceDay() {
		this.ensureGameInProgress();
		this.day += 1;
		this.bus.emit({ type: 'advanceDay', day: this.day });
		if (this.isGameOver) {
			this.bus.emit({ type: 'gameOver', snapshot: this.snapshot() });
		}
	}

	snapshot(): PortfolioSnapshot {
		return {
			day: this.day,
			location: this.location,
			cash: this.cash,
			capacity: this.capacity,
			usedCapacity: this.usedCapacity,
			maxDays: this.maxDays,
			inventory: this.inventory,
		};
	}

	private makeSubRng(namespace: string): () => number {
		return seedrandom(`${this.gameSeed}:${namespace}`);
	}

	private assertGameData() {
		if (Object.keys(this.drugs).length === 0) throw new GameRuleError('No drugs configured');
		if (Object.keys(this.locations).length === 0) throw new GameRuleError('No locations configured');
	}

	private ensureGameInProgress() {
		if (this.isGameOver) {
			throw new GameRuleError('Game is over');
		}
	}

	private ensurePositiveInteger(value: number, field: string) {
		if (!Number.isInteger(value) || value <= 0) {
			throw new GameRuleError(`${field} must be a positive integer`);
		}
	}

	private ensureDrugExists(code: Drug['code']) {
		if (!this.drugs[code]) {
			throw new GameRuleError(`Unknown drug code: ${code}`);
		}
	}
}
