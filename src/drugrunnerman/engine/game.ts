import seedrandom from 'seedrandom';
import type { Drug } from '../models/drug';
import type { Location } from '../models/location';
import type { ShopItem, ShopItemCode } from '../models/shopItem';
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
	ownedItems: ShopItemCode[];
}

export interface PoliceEncounter {
	outcome: 'arrest' | 'shootout';
	fine?: number;
	inventorySeized?: Partial<Record<Drug['code'], number>>;
	inventoryLost?: Partial<Record<Drug['code'], number>>;
}

export type MarketEventType = 'PRICE_SPIKE' | 'PRICE_CRASH' | 'FREE_STASH' | 'HOT_TIP' | 'HEAT_WAVE' | 'BIG_SHIPMENT';

export interface MarketEvent {
	type: MarketEventType;
	drugCode?: Drug['code'];
	/** Price multiplier applied to the drug (for PRICE_SPIKE / PRICE_CRASH / BIG_SHIPMENT) */
	multiplier?: number;
	/**
	 * For FREE_STASH: the number of units found.
	 * NOTE: this field is mutated by the engine to reflect the amount actually added
	 * to inventory (may be capped by available bag space).
	 */
	quantity?: number;
	message: string;
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
	private readonly ownedItemsSet = new Set<ShopItemCode>();
	/** Extra capacity added by shop items (e.g. Stash House) */
	private bonusCapacity = 0;
	/** Probability that a random market event fires on each travel. Range: 0–1. */
	private readonly EVENT_PROBABILITY = 0.25;

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

	get effectiveCapacity() {
		return this.capacity + this.bonusCapacity;
	}

	get isGameOver() {
		return this.day > this.maxDays;
	}

	get threat(): number {
		// A Fast Car reduces effective threat by 25%, making police less likely to pursue.
		const carReduction = this.ownedItemsSet.has('CAR') ? 0.75 : 1;
		return (this.usedCapacity / this.effectiveCapacity) * carReduction;
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
		if (this.usedCapacity + quantity > this.effectiveCapacity) {
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

	travel(to: string): { encounter: PoliceEncounter | null; marketEvent: MarketEvent | null } {
		this.ensureGameInProgress();
		if (!this.locations[to]) {
			throw new GameRuleError(`Unknown location: ${to}`);
		}
		const from = this.location;
		this.location = to;
		this.advanceDay();

		const policeRng = this.makeSubRng(`police:${this.day}`);

		// Speedboat: skip police encounter once
		let encounter: PoliceEncounter | null = null;
		if (this.ownedItemsSet.has('BOAT')) {
			this.ownedItemsSet.delete('BOAT');
			this.bus.emit({ type: 'itemUsed', item: 'BOAT' });
		} else {
			const newState = this.police.step(this.threat, policeRng);

			if (newState === CopState.Arrest) {
				// Fine rate starts at 20%. Lawyer (−60%) and Armor (−40%) stack multiplicatively.
				let fineRate = 0.2;
				if (this.ownedItemsSet.has('LAWYER')) fineRate *= 0.4;
				if (this.ownedItemsSet.has('ARMOR')) fineRate *= 0.6;
				const fine = Math.floor(this.cash * fineRate);
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
				// Med Kit prevents inventory loss
				if (this.ownedItemsSet.has('MEDKIT')) {
					this.ownedItemsSet.delete('MEDKIT');
					this.bus.emit({ type: 'itemUsed', item: 'MEDKIT' });
				} else {
					// Pistol reduces inventory lost from 50% to 25%
					const lossRate = this.ownedItemsSet.has('PISTOL') ? 0.25 : 0.5;
					for (const code of Object.keys(this.inventoryState) as Drug['code'][]) {
						const lost = Math.floor(this.inventoryState[code] * lossRate);
						if (lost > 0) {
							this.inventoryState[code] -= lost;
							inventoryLost[code] = lost;
						}
					}
				}
				encounter = { outcome: 'shootout', inventoryLost };
				this.bus.emit({ type: 'police', ...encounter });
			}
		}

		// Generate a random market event for the new location
		const eventRng = this.makeSubRng(`event:${this.day}`);
		const marketEvent = this.generateMarketEvent(eventRng);
		if (marketEvent) {
			// FREE_STASH: immediately add drugs to inventory.
			// marketEvent.quantity is mutated to reflect the actual amount added
			// (capped by available bag space), so callers always see the real number.
			if (marketEvent.type === 'FREE_STASH' && marketEvent.drugCode && marketEvent.quantity) {
				const space = this.effectiveCapacity - this.usedCapacity;
				const qty = Math.min(marketEvent.quantity, space);
				if (qty > 0) {
					this.inventoryState[marketEvent.drugCode] += qty;
					marketEvent.quantity = qty;
				} else {
					marketEvent.quantity = 0;
				}
			}
			this.bus.emit({ type: 'marketEvent', event: marketEvent });
		}

		this.bus.emit({ type: 'travel', from, to, day: this.day });
		return { encounter, marketEvent };
	}

	/** Buy a shop item. Returns the item code. */
	buyItem(item: ShopItem): void {
		this.ensureGameInProgress();
		if (this.ownedItemsSet.has(item.code)) {
			throw new GameRuleError(`Already own: ${item.name}`);
		}
		if (item.price > this.cash) {
			throw new GameRuleError('Insufficient cash');
		}
		this.cash -= item.price;
		this.ownedItemsSet.add(item.code);
		// Stash House: immediate capacity boost
		if (item.code === 'STASH') {
			this.bonusCapacity += 50;
		}
		this.bus.emit({ type: 'shopBuy', item: item.code, price: item.price });
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
			capacity: this.effectiveCapacity,
			usedCapacity: this.usedCapacity,
			maxDays: this.maxDays,
			inventory: this.inventory,
			ownedItems: Array.from(this.ownedItemsSet),
		};
	}

	private generateMarketEvent(rng: () => number): MarketEvent | null {
		if (rng() > this.EVENT_PROBABILITY) return null;
		const drugCodes = Object.keys(this.drugs) as Drug['code'][];
		const roll = rng();
		const drugCode = drugCodes[Math.floor(rng() * drugCodes.length)];
		const drugName = this.drugs[drugCode]?.name ?? drugCode;

		if (roll < 0.2) {
			return {
				type: 'PRICE_SPIKE',
				drugCode,
				multiplier: 2.0,
				message: `🚀 Price surge! ${drugName} is selling for double the usual rate.`,
			};
		} else if (roll < 0.4) {
			return {
				type: 'PRICE_CRASH',
				drugCode,
				multiplier: 0.45,
				message: `📉 Market crash! ${drugName} prices have collapsed — bargain time.`,
			};
		} else if (roll < 0.55) {
			const qty = 5 + Math.floor(rng() * 10);
			return {
				type: 'FREE_STASH',
				drugCode,
				quantity: qty,
				message: `📦 Found a stash! You found ${qty} units of ${drugName} on the street.`,
			};
		} else if (roll < 0.7) {
			return {
				type: 'HOT_TIP',
				drugCode,
				message: `🕵️ Street tip: ${drugName} is the hot product here — sell for a premium.`,
			};
		} else if (roll < 0.85) {
			return { type: 'HEAT_WAVE', message: `🚨 Police heat wave! Law enforcement is cracking down in this area.` };
		} else {
			return {
				type: 'BIG_SHIPMENT',
				drugCode,
				multiplier: 0.65,
				message: `🚢 Big shipment arrived! ${drugName} flooded the market — prices are low.`,
			};
		}
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
