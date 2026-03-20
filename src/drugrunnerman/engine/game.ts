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
	difficulty?: 'easy-peasy' | 'easy' | 'normal' | 'hard' | 'nightmare';
	gameLength?: '7d' | '30d' | '12m' | 'forever';
	worldEventCadence?: 'off' | 'light' | 'standard' | 'chaos';
	personalLifeMode?: 'off' | 'light' | 'full';
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
	policeHeatDelta?: number;
	travelRiskDelta?: number;
	challengeFrequencyBoost?: number;
	priceMultipliers?: Partial<Record<Drug['code'], number>>;
	cityPriceMultipliers?: Partial<Record<string, Partial<Record<Drug['code'], number>>>>;
	durationDays?: number;
	category?: 'politics' | 'shipping' | 'culture' | 'finance' | 'crime' | 'seasonal' | 'city';
	globalMood?: 'calm' | 'shaky' | 'tense' | 'chaotic';
}

type GlobalMood = 'calm' | 'shaky' | 'tense' | 'chaotic';
type DifficultyLevel = NonNullable<GameConfig['difficulty']>;
type GameLengthMode = NonNullable<GameConfig['gameLength']>;
type ActiveWorldEvent = {
	expiresDay: number;
	event: MarketEvent;
};

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
	private readonly EVENT_PROBABILITY: number;
	private readonly personalLifeMode: 'off' | 'light' | 'full';
	private readonly difficulty: DifficultyLevel;
	private readonly gameLengthMode: GameLengthMode;
	private globalMood: GlobalMood = 'calm';
	private activeWorldEvents: ActiveWorldEvent[] = [];

	constructor(
		private readonly drugs: Record<string, Drug>,
		private readonly locations: Record<string, Location>,
		rng: () => number = seedrandom(),
		config: GameConfig = {},
	) {
		const startingCash = config.startingCash ?? 1000;
		const maxDays = config.maxDays ?? 30;
		const capacity = config.capacity ?? 100;
		const worldEventCadence = config.worldEventCadence ?? 'standard';
		this.personalLifeMode = config.personalLifeMode ?? 'off';
		this.difficulty = config.difficulty ?? 'normal';
		if (config.gameLength) {
			this.gameLengthMode = config.gameLength;
		} else if (maxDays > 1000) {
			this.gameLengthMode = 'forever';
		} else if (maxDays >= 360) {
			this.gameLengthMode = '12m';
		} else if (maxDays <= 7) {
			this.gameLengthMode = '7d';
		} else {
			this.gameLengthMode = '30d';
		}

		if (!Number.isFinite(startingCash) || startingCash < 0) {
			throw new GameRuleError('startingCash must be a non-negative finite number');
		}
		if (!Number.isInteger(maxDays) || maxDays <= 0) {
			throw new GameRuleError('maxDays must be a positive integer');
		}
		if (!Number.isInteger(capacity) || capacity <= 0) {
			throw new GameRuleError('capacity must be a positive integer');
		}
		if (!['off', 'light', 'standard', 'chaos'].includes(worldEventCadence)) {
			throw new GameRuleError('worldEventCadence must be one of: off, light, standard, chaos');
		}
		if (!['off', 'light', 'full'].includes(this.personalLifeMode)) {
			throw new GameRuleError('personalLifeMode must be one of: off, light, full');
		}
		if (!['easy-peasy', 'easy', 'normal', 'hard', 'nightmare'].includes(this.difficulty)) {
			throw new GameRuleError('difficulty must be one of: easy-peasy, easy, normal, hard, nightmare');
		}
		if (!['7d', '30d', '12m', 'forever'].includes(this.gameLengthMode)) {
			throw new GameRuleError('gameLength must be one of: 7d, 30d, 12m, forever');
		}

		this.cash = startingCash;
		this.maxDays = maxDays;
		this.capacity = capacity;
		this.location = config.startingLocation ?? 'Denver';
		this.gameSeed = rng();
		const cadenceProbability: Record<'off' | 'light' | 'standard' | 'chaos', number> = {
			off: 0,
			light: 0.12,
			standard: 0.25,
			chaos: 0.55,
		};
		this.EVENT_PROBABILITY = cadenceProbability[worldEventCadence];

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
		const cacheKey = `${this.day}:${loc}:${this.globalMood}:${this.activeWorldEvents
			.map((e) => `${e.event.type}:${e.event.category ?? 'none'}:${e.expiresDay}`)
			.join('|')}`;
		const cached = this.priceBook.get(cacheKey);
		if (cached) {
			return { ...cached };
		}

		const subRng = this.makeSubRng(`${this.day}:${loc}`);
		const locAdjust = this.locations[loc].adjust;
		const seasonalLayer = this.seasonalMultipliers();
		const cityLayer = this.cityMultipliers(loc);
		const moodLayer = this.globalMoodMultipliers();
		const activeEventLayer = this.activeEventPriceMultipliers(loc);
		const volatility = this.difficultyVolatilityMultiplier();
		const prices = Object.entries(this.drugs).reduce((acc, [code, drug]) => {
			const typedCode = code as Drug['code'];
			const locationMultiplier = locAdjust[typedCode] ?? 1;
			const expectedPrice = drug.mu * locationMultiplier;
			const base = nextPrice(expectedPrice, drug.sigma * volatility, subRng);
			const layered =
				base *
				(seasonalLayer[typedCode] ?? 1) *
				(cityLayer[typedCode] ?? 1) *
				(moodLayer[typedCode] ?? 1) *
				(activeEventLayer[typedCode] ?? 1);
			acc[typedCode] = Math.max(0.01, Number(layered.toFixed(2)));
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
		this.activeWorldEvents = this.activeWorldEvents.filter((item) => item.expiresDay >= this.day);
		const eventRng = this.makeSubRng(`event:${this.day}:${this.location}:${this.globalMood}`);
		const marketEvent = this.generateMarketEvent(eventRng);
		if (marketEvent) {
			const durationDays = marketEvent.durationDays ?? 1;
			this.activeWorldEvents.push({ event: marketEvent, expiresDay: this.day + durationDays - 1 });
			this.globalMood = this.nextMood(marketEvent);
		} else {
			this.globalMood = this.coolMood();
		}
		const policeBoost = (marketEvent?.policeHeatDelta ?? 0) / 100;
		const travelRiskBoost = marketEvent?.travelRiskDelta ?? 0;
		const moodBoost =
			this.globalMood === 'chaotic' ? 0.16 : this.globalMood === 'tense' ? 0.1 : this.globalMood === 'shaky' ? 0.05 : 0;
		const threatWithEvent = Math.min(1, Math.max(0, this.threat + policeBoost + travelRiskBoost + moodBoost));

		const policeRng = this.makeSubRng(`police:${this.day}`);

		// Speedboat: skip police encounter once
		let encounter: PoliceEncounter | null = null;
		if (this.ownedItemsSet.has('BOAT')) {
			this.ownedItemsSet.delete('BOAT');
			this.bus.emit({ type: 'itemUsed', item: 'BOAT' });
		} else {
			const newState = this.police.step(threatWithEvent, policeRng);

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

		if (marketEvent) {
			this.applyMarketEventPricing(marketEvent);
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
		const selectedPartyDrug: Drug['code'] = rng() > 0.5 ? 'MDM' : 'COC';
		const month = this.currentMonthName();
		const isSummer = ['June', 'July', 'August'].includes(month);
		const isWinter = ['December', 'January', 'February'].includes(month);
		const isElectionMonth = ['November'].includes(month);
		const city = this.location;
		const difficultyPressure =
			this.difficulty === 'nightmare'
				? 1.25
				: this.difficulty === 'hard'
				? 1.15
				: this.difficulty === 'easy-peasy'
				? 0.8
				: this.difficulty === 'easy'
				? 0.9
				: 1;
		const moodPressure =
			this.globalMood === 'chaotic'
				? 1.25
				: this.globalMood === 'tense'
				? 1.12
				: this.globalMood === 'shaky'
				? 1.05
				: 1;
		const lengthPressure =
			this.gameLengthMode === '7d'
				? 0.9
				: this.gameLengthMode === '12m'
				? 1.12
				: this.gameLengthMode === 'forever'
				? 1.2
				: 1;
		const pressure = Math.min(1.5, difficultyPressure * moodPressure * lengthPressure);
		const weightedRoll = Math.min(0.999, roll * pressure);

		if (weightedRoll < 0.1) {
			return {
				type: 'PRICE_SPIKE',
				drugCode: 'METH',
				multiplier: 1.8,
				priceMultipliers: { METH: 1.8, MDM: 0.82 },
				policeHeatDelta: 10,
				travelRiskDelta: 0.08,
				challengeFrequencyBoost: 0.12,
				durationDays: 2,
				category: 'politics',
				globalMood: this.globalMood,
				message: `📺 President livestreamed a "war on vibes." Meth climbs, MDMA cools, and police heat is up.`,
			};
		} else if (weightedRoll < 0.22) {
			const cityDrug: Drug['code'] = selectedPartyDrug;
			return {
				type: 'PRICE_CRASH',
				drugCode: cityDrug,
				multiplier: 1.9,
				priceMultipliers: cityDrug === 'COC' ? { COC: 1.7 } : { MDM: 1.7 },
				cityPriceMultipliers:
					cityDrug === 'COC'
						? { Amsterdam: { COC: 2 }, Seattle: { COC: 1.75 } }
						: { Amsterdam: { MDM: 1.9 }, Seattle: { MDM: 1.6 } },
				challengeFrequencyBoost: 0.08,
				durationDays: 2,
				category: 'culture',
				globalMood: this.globalMood,
				message: `🥂 Prime Minister got caught at a secret afterparty. ${this.drugs[cityDrug].name} demand surges in party circuits.`,
			};
		} else if (weightedRoll < 0.34) {
			const crisisDrug: Drug['code'] = rng() > 0.5 ? 'HER' : 'FEN';
			return {
				type: 'HEAT_WAVE',
				drugCode: crisisDrug,
				policeHeatDelta: 14,
				travelRiskDelta: 0.12,
				priceMultipliers: crisisDrug === 'HER' ? { HER: 0.8 } : { FEN: 0.8 },
				durationDays: 2,
				category: 'shipping',
				globalMood: this.globalMood,
				message: `🛂 Border crackdown announced at 3am. ${this.drugs[crisisDrug].name} is harder to move and police pressure rises.`,
			};
		} else if (weightedRoll < 0.46) {
			return {
				type: 'PRICE_SPIKE',
				drugCode: 'METH',
				multiplier: 1.55,
				priceMultipliers: { METH: 1.55, CAN: 0.9 },
				durationDays: 2,
				category: 'finance',
				globalMood: this.globalMood,
				message: `📈 Finance minister launched "productivity month." Meth spikes while cannabis softens.`,
			};
		} else if (weightedRoll < 0.58) {
			return {
				type: 'PRICE_SPIKE',
				drugCode: selectedPartyDrug,
				multiplier: 1.65,
				priceMultipliers: selectedPartyDrug === 'COC' ? { COC: 1.65 } : { MDM: 1.65 },
				travelRiskDelta: 0.05,
				durationDays: 2,
				category: 'shipping',
				globalMood: this.globalMood,
				message: `🚢 Global shipping delays hit ports. ${this.drugs[selectedPartyDrug].name} scarcity pushes prices up.`,
			};
		} else if (weightedRoll < 0.68) {
			return {
				type: 'HOT_TIP',
				drugCode: 'CAN',
				priceMultipliers: { CAN: 1.35 },
				policeHeatDelta: -6,
				durationDays: 1,
				category: 'culture',
				globalMood: this.globalMood,
				message: `🧘 Celebrity wellness cult trend went viral. Cannabis climbs while heat cools a little.`,
			};
		} else if (weightedRoll < 0.79) {
			return {
				type: 'HEAT_WAVE',
				policeHeatDelta: 8,
				travelRiskDelta: 0.1,
				challengeFrequencyBoost: 0.1,
				durationDays: 2,
				category: 'politics',
				globalMood: this.globalMood,
				message: `🗳️ Election panic week. Volatility and route risk both increase.`,
			};
		} else if (weightedRoll < 0.89) {
			const qty = 5 + Math.floor(rng() * 10);
			return {
				type: 'FREE_STASH',
				drugCode,
				quantity: qty,
				challengeFrequencyBoost: 0.18,
				durationDays: 1,
				category: 'finance',
				globalMood: this.globalMood,
				message: `💳 Banking scare hit the streets. Buyers vanish, but stash drops get frequent. Found ${qty} ${drugName}.`,
			};
		} else if (weightedRoll < 0.95 || isSummer) {
			return {
				type: 'PRICE_SPIKE',
				drugCode: 'MDM',
				multiplier: 1.75,
				priceMultipliers: { MDM: 1.75, CAN: 1.4 },
				cityPriceMultipliers: { Amsterdam: { MDM: 2.1 }, Seattle: { MDM: 1.5 }, Denver: { CAN: 1.2 } },
				durationDays: isSummer ? 3 : 2,
				category: 'seasonal',
				globalMood: this.globalMood,
				message: `🎪 Summer festival season. MDMA and cannabis spike in party cities.`,
			};
		} else if (city === 'Amsterdam' || city === 'Seattle') {
			return {
				type: 'PRICE_SPIKE',
				drugCode: selectedPartyDrug,
				multiplier: 1.45,
				cityPriceMultipliers: { [city]: selectedPartyDrug === 'COC' ? { COC: 1.7 } : { MDM: 1.7 } },
				challengeFrequencyBoost: 0.12,
				durationDays: 2,
				category: 'city',
				globalMood: this.globalMood,
				message: `🌃 ${city} nightlife boom. Street demand spikes overnight.`,
			};
		} else if (city === 'Kabul' || isWinter) {
			return {
				type: 'HEAT_WAVE',
				policeHeatDelta: 12,
				travelRiskDelta: 0.14,
				priceMultipliers: { HER: 1.2, METH: 1.18 },
				durationDays: 2,
				category: 'seasonal',
				globalMood: this.globalMood,
				message: `❄️ Winter route instability. Heroin and meth lanes tighten up.`,
			};
		} else if (city === 'Medellin') {
			return {
				type: 'BIG_SHIPMENT',
				drugCode: 'COC',
				multiplier: 0.72,
				priceMultipliers: { COC: 0.72 },
				cityPriceMultipliers: { Medellin: { COC: 0.6 } },
				durationDays: 2,
				category: 'city',
				globalMood: this.globalMood,
				message: `📦 Medellín supply flood. Coke is everywhere and margins crash.`,
			};
		} else if (isElectionMonth) {
			return {
				type: 'HEAT_WAVE',
				policeHeatDelta: 10,
				travelRiskDelta: 0.1,
				challengeFrequencyBoost: 0.08,
				durationDays: 2,
				category: 'politics',
				globalMood: this.globalMood,
				message: `🗳️ Election month tension. Markets shake and enforcement tightens.`,
			};
		} else {
			return {
				type: 'HEAT_WAVE',
				policeHeatDelta: 12,
				travelRiskDelta: 0.14,
				priceMultipliers: isWinter ? { HER: 1.22, METH: 1.15 } : { HER: 0.88, MDM: 0.88 },
				durationDays: 2,
				category: 'seasonal',
				globalMood: this.globalMood,
				message: isWinter
					? `❄️ Cold winter crackdown. Heroin and meth corridors run hotter and riskier.`
					: `🚨 Police heat wave! Law enforcement is cracking down in this area.`,
			};
		}
	}

	private applyMarketEventPricing(event: MarketEvent): void {
		const cacheKey = `${this.day}:${this.location}`;
		const current = this.priceBook.get(cacheKey) ?? this.prices(this.location);
		const next = { ...current };
		const multipliers =
			event.priceMultipliers ?? (event.drugCode && event.multiplier ? { [event.drugCode]: event.multiplier } : {});
		for (const [code, multiplier] of Object.entries(multipliers)) {
			const typedCode = code as Drug['code'];
			if (!next[typedCode] || !multiplier || multiplier <= 0) continue;
			next[typedCode] = Math.max(0.01, Number((next[typedCode] * multiplier).toFixed(2)));
		}
		for (const active of this.activeWorldEvents) {
			const cityMultipliers = active.event.cityPriceMultipliers?.[this.location];
			if (!cityMultipliers) continue;
			for (const [code, multiplier] of Object.entries(cityMultipliers)) {
				const typedCode = code as Drug['code'];
				if (!next[typedCode] || !multiplier || multiplier <= 0) continue;
				next[typedCode] = Math.max(0.01, Number((next[typedCode] * multiplier).toFixed(2)));
			}
		}
		this.priceBook.set(cacheKey, next);
	}

	private currentMonthIndex(): number {
		// Simplified 30-day months for deterministic turn-based pacing across all game lengths.
		return Math.floor((this.day - 1) / 30) % 12;
	}

	private currentMonthName():
		| 'January'
		| 'February'
		| 'March'
		| 'April'
		| 'May'
		| 'June'
		| 'July'
		| 'August'
		| 'September'
		| 'October'
		| 'November'
		| 'December' {
		const months = [
			'January',
			'February',
			'March',
			'April',
			'May',
			'June',
			'July',
			'August',
			'September',
			'October',
			'November',
			'December',
		] as const;
		return months[this.currentMonthIndex()];
	}

	private seasonalMultipliers(): Partial<Record<Drug['code'], number>> {
		const month = this.currentMonthName();
		if (['June', 'July', 'August'].includes(month)) {
			return { MDM: 1.2, CAN: 1.12 };
		}
		if (['December', 'January', 'February'].includes(month)) {
			return { HER: 1.15, METH: 1.1 };
		}
		if (month === 'November') {
			return { CAN: 1.05, COC: 1.06, HER: 1.06, METH: 1.06, MDM: 1.07, FEN: 1.05 };
		}
		return {};
	}

	private cityMultipliers(loc: string): Partial<Record<Drug['code'], number>> {
		if (loc === 'Amsterdam') return { MDM: 1.15, COC: 1.1 };
		if (loc === 'Seattle') return { FEN: 1.15, COC: 1.08 };
		if (loc === 'Kabul') return { HER: 1.18 };
		if (loc === 'Medellin') return { COC: 0.92 };
		return {};
	}

	private globalMoodMultipliers(): Partial<Record<Drug['code'], number>> {
		if (this.globalMood === 'chaotic') return { CAN: 1.08, COC: 1.16, HER: 1.15, METH: 1.18, MDM: 1.14, FEN: 1.14 };
		if (this.globalMood === 'tense') return { COC: 1.08, HER: 1.08, METH: 1.1, FEN: 1.08 };
		if (this.globalMood === 'shaky') return { CAN: 1.02, COC: 1.03, HER: 1.03, METH: 1.03, MDM: 1.03, FEN: 1.03 };
		return {};
	}

	private activeEventPriceMultipliers(loc: string): Partial<Record<Drug['code'], number>> {
		const merged: Partial<Record<Drug['code'], number>> = {};
		for (const active of this.activeWorldEvents) {
			if (active.expiresDay < this.day) continue;
			if (active.event.priceMultipliers) {
				for (const [code, multiplier] of Object.entries(active.event.priceMultipliers)) {
					const typedCode = code as Drug['code'];
					merged[typedCode] = (merged[typedCode] ?? 1) * (multiplier ?? 1);
				}
			}
			const city = active.event.cityPriceMultipliers?.[loc];
			if (city) {
				for (const [code, multiplier] of Object.entries(city)) {
					const typedCode = code as Drug['code'];
					merged[typedCode] = (merged[typedCode] ?? 1) * (multiplier ?? 1);
				}
			}
		}
		return merged;
	}

	private difficultyVolatilityMultiplier(): number {
		if (this.difficulty === 'easy-peasy') return 0.85;
		if (this.difficulty === 'easy') return 0.92;
		if (this.difficulty === 'hard') return 1.15;
		if (this.difficulty === 'nightmare') return 1.28;
		return 1;
	}

	private nextMood(event: MarketEvent): GlobalMood {
		const moodOrder: GlobalMood[] = ['calm', 'shaky', 'tense', 'chaotic'];
		const current = moodOrder.indexOf(this.globalMood);
		const pressure =
			(event.policeHeatDelta ?? 0) + (event.travelRiskDelta ?? 0) * 60 + (event.challengeFrequencyBoost ?? 0) * 40;
		const lift = pressure > 18 ? 2 : pressure > 8 ? 1 : 0;
		return moodOrder[Math.min(moodOrder.length - 1, current + lift)];
	}

	private coolMood(): GlobalMood {
		const moodOrder: GlobalMood[] = ['calm', 'shaky', 'tense', 'chaotic'];
		const current = moodOrder.indexOf(this.globalMood);
		return moodOrder[Math.max(0, current - 1)];
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
