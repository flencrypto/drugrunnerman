import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';
import { Game, GameRuleError } from '../engine/game';
import type { Drug } from '../models/drug';
import type { Location } from '../models/location';

async function loadData() {
	const dataDir = path.resolve(__dirname, '..', 'data');
	const [drugsRaw, locationsRaw] = await Promise.all([
		fs.readFile(path.join(dataDir, 'drugs.json'), 'utf-8'),
		fs.readFile(path.join(dataDir, 'locations.json'), 'utf-8'),
	]);

	return {
		drugs: JSON.parse(drugsRaw) as Record<string, Drug>,
		locations: JSON.parse(locationsRaw) as Record<string, Location>,
	};
}

async function main() {
	const { drugs, locations } = await loadData();
	const game = new Game(drugs, locations);

	while (!game.isGameOver) {
		const prices = game.prices(game.location);
		console.log(`\nDay ${game.day}/${game.maxDays} - ${game.location}`);
		console.log(`Cash: $${game.cash.toFixed(2)} | Capacity: ${game.usedCapacity}/${game.capacity}`);
		for (const [code, price] of Object.entries(prices)) {
			console.log(`  ${code}: $${price.toFixed(2)} (${game.inventory[code as Drug['code']]} in inventory)`);
		}

		const { action } = await inquirer.prompt<{ action: string }>({
			name: 'action',
			message: 'Action?',
			type: 'list',
			choices: ['buy', 'sell', 'travel', 'skip', 'quit'],
		});

		try {
			if (action === 'quit') {
				break;
			}
			if (action === 'skip') {
				game.advanceDay();
				continue;
			}
			if (action === 'travel') {
				const { to } = await inquirer.prompt<{ to: string }>({
					name: 'to',
					message: 'Destination',
					type: 'list',
					choices: Object.keys(locations),
				});
				game.travel(to);
				continue;
			}

			const { code, quantity } = await inquirer.prompt<{ code: Drug['code']; quantity: number }>([
				{ name: 'code', message: 'Drug', type: 'list', choices: Object.keys(drugs) },
				{ name: 'quantity', message: 'Quantity', type: 'number', default: 1 },
			]);

			if (action === 'buy') {
				const totalCost = game.buy(code, quantity);
				console.log(`Bought ${quantity} ${code} for $${totalCost.toFixed(2)}`);
			} else {
				const revenue = game.sell(code, quantity);
				console.log(`Sold ${quantity} ${code} for $${revenue.toFixed(2)}`);
			}
		} catch (error: unknown) {
			if (error instanceof GameRuleError) {
				console.log(`Rule error: ${error.message}`);
				continue;
			}
			throw error;
		}
	}

	console.log('\nGame over');
	console.log(game.snapshot());
}

void main();
