import seedrandom from 'seedrandom';
import type { Drug } from '../models/drug';
import type { Location } from '../models/location';
import { nextPrice } from './priceGenerator';

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

export class Game {
	day = 1;
	cash: number;
	location: string;
	readonly maxDays: number;
	readonly capacity: number;
	private readonly gameSeed: number;
	private readonly priceBook = new Map<string, Record<Drug['code'], number>>();
	private readonly inventoryState: Record<Drug['code'], number> = { CAN: 0, COC: 0, HER: 0, METH: 0, MDM: 0, FEN: 0 };

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

	prices(loc: string): Record<Drug['code'], number> {
		if (!this.locations[loc]) {
			throw new GameRuleError(`Unknown location: ${loc}`);
		}
		const cacheKey = `${this.day}:${loc}`;
		const cached = this.priceBook.get(cacheKey);
		if (cached) {
			return { ...cached };
		}

		const subRng = seedrandom(`${this.gameSeed}:${this.day}:${loc}`);
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
		return revenue;
	}

	travel(to: string) {
		this.ensureGameInProgress();
		if (!this.locations[to]) {
			throw new GameRuleError(`Unknown location: ${to}`);
		}
		this.location = to;
		this.advanceDay();
	}

	advanceDay() {
		this.ensureGameInProgress();
		this.day += 1;
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
