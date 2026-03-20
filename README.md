<div align="center">

<h1>🧪 Drugrunnerman</h1>

<p><strong>A turn-based drug trading simulation game with a CLI player, web UI, and REST API.</strong></p>

<p>
  <img alt="Beta" src="https://img.shields.io/badge/release-beta-orange" />
  <img alt="License: AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-blue" />
  <img alt="Node >=14.5" src="https://img.shields.io/badge/node-%3E%3D14.5.0-brightgreen" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-4.8-blue?logo=typescript" />
</p>

</div>

> **⚠️ Beta Notice**
> Drugrunnerman is currently in **beta**. Core gameplay is functional, but you may encounter rough edges, missing features, or breaking API changes before v1.0. Bug reports and feedback are very welcome — please [open an issue](../../issues).

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Requirements](#requirements)
- [Getting Started](#getting-started)
- [Gameplay Guide](#gameplay-guide)
  - [Drugs Reference](#drugs-reference)
  - [Locations Reference](#locations-reference)
  - [Police AI](#police-ai)
- [REST API](#rest-api)
  - [Session Management](#session-management)
  - [Endpoints](#endpoints)
  - [Response Shapes](#response-shapes)
- [Configuration](#configuration)
- [Deploying to Netlify](#deploying-to-netlify)
- [Development](#development)
- [Known Limitations](#known-limitations)
- [License](#license)

---

## Overview

Drugrunnerman is a **text-based economic strategy game** inspired by the classic "Drug Wars" genre. You start with **$1,000 cash** and **100 units of cargo space** and have **30 days** to turn a profit by buying drugs cheap in production cities and selling them at a markup elsewhere — all while evading an increasingly aggressive police AI.

The game ships with three interfaces that share the same engine:

| Interface | Command | Description |
|-----------|---------|-------------|
| **CLI** | `yarn play` | Interactive terminal prompts via Inquirer |
| **Web UI** | `yarn api` then open `http://localhost:3000` | Neon retro single-page app |
| **REST API** | `yarn api` | Headless JSON API for custom clients |

---

## Features

- 🌍 **6 real-world cities** — Denver, Medellín, Kabul, Culiacán, Amsterdam, Seattle
- 💊 **6 drug types** — each with unique base prices and volatility
- 📈 **Dynamic market prices** — randomised each day with seeded RNG for reproducibility
- 🚔 **Police AI state machine** — threat escalates with cargo load; outcomes include patrol, pursuit, shootout, and arrest
- 🔁 **30-day trading loop** — buy, sell, travel, or skip each turn
- 🌐 **Multi-session REST API** — stateful per `X-Session-ID` header
- ☁️ **Netlify serverless deployment** — one-click deploy via AWS Lambda adapter
- ✅ **Typed & tested** — TypeScript strict mode, Jest unit + integration tests, Zod request validation

---

## Requirements

- **Node.js** v14.5.0 or higher
- **yarn** or **npm**

---

## Getting Started

### 1. Install dependencies

```bash
yarn install
```

### 2. Play in the terminal

```bash
yarn play
```

### 3. Start the REST API / Web UI server

```bash
yarn api
# Server starts at http://localhost:3000
# Open in a browser for the web UI, or use any HTTP client for the API
```

### 4. Run tests

```bash
yarn test
```

### 5. Build

```bash
yarn build
# Compiles TypeScript → dist/
```

### 6. Lint & format

```bash
yarn lint      # ESLint
yarn format    # Prettier
```

---

## Gameplay Guide

Each day you choose **one** of four actions:

| Action | Effect |
|--------|--------|
| **Buy** | Purchase units of a drug at the current location's price |
| **Sell** | Sell units from your inventory at the current location's price |
| **Travel** | Move to another city — advances the day and triggers a police check |
| **Skip** | Do nothing and advance the day |

The game ends when you reach **Day 30** (configurable). Your final score is your remaining cash.

**Tips:**
- Buy in production cities (low multiplier) and sell in consumer cities.
- Keep your cargo hold as empty as possible to reduce police threat.
- Fentanyl (`FEN`) has the highest price volatility — high risk, high reward.

### Drugs Reference

| Code | Name | Base Price | Volatility | Unit |
|------|------|-----------|-----------|------|
| `CAN` | Cannabis | $2.14 | Low (10%) | g |
| `COC` | Cocaine | $120.00 | Medium (25%) | g |
| `HER` | Heroin | $128.00 | Medium-High (30%) | g |
| `METH` | Meth | $15.00 | High (35%) | g |
| `MDM` | MDMA | $4.50 | Medium (20%) | tablet |
| `FEN` | Fentanyl | $0.75 | Very High (40%) | pill |

Actual prices fluctuate randomly each day within ±`sigma × mu` of the base price, floored at 15% and capped at 400% of `mu`.

### Locations Reference

| City | Cheapest Drug | Notes |
|------|--------------|-------|
| Denver | — | Default starting city |
| Medellín | `COC` | Best place to buy cocaine (0.8× multiplier) |
| Kabul | `HER` | Best place to buy heroin (0.7× multiplier) |
| Culiacán | `METH`, `FEN` | Production hub for meth and fentanyl |
| Amsterdam | `MDM` | Near-source MDMA pricing |
| Seattle | `FEN` | High consumer prices |

### Police AI

Travelling always triggers a police check. The threat level is proportional to how full your cargo hold is:

```
threat = usedCapacity / totalCapacity   (0.0 – 1.0)
```

The AI steps through four states:

1. **Patrol** — Low activity; may escalate to Pursuit based on threat.
2. **Pursuit** — Actively chasing; will escalate to an encounter.
3. **Shootout** — You lose **50% of all inventory**.
4. **Arrest** — All inventory seized + **20% cash fine**.

After any encounter the AI resets to **Patrol**. Keep your hold light to minimise risk.

---

## REST API

### Session Management

The API is stateful. Include an `X-Session-ID` header to maintain your game state across requests. If the header is omitted, the `"default"` session is used.

```http
X-Session-ID: my-unique-game-session
```

> **Note:** Game state is stored in memory and is lost when the server restarts.

### Endpoints

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/healthz` | — | Health check |
| `GET` | `/v1/state` | — | Current game state + prices at current location |
| `GET` | `/v1/prices?loc=<name>` | — | Drug prices for a specific location |
| `POST` | `/v1/buy` | `{ "code": "<CODE>", "quantity": <n> }` | Buy drugs |
| `POST` | `/v1/sell` | `{ "code": "<CODE>", "quantity": <n> }` | Sell drugs |
| `POST` | `/v1/travel` | `{ "to": "<city>" }` | Travel to a new city (advances day) |
| `POST` | `/v1/skip` | — | Skip a day without travelling |

**HTTP status codes:**

| Code | Meaning |
|------|---------|
| `200` | Success |
| `400` | Bad request (invalid body — see `details` field) |
| `422` | Game rule violation (e.g. not enough cash, over capacity) |
| `500` | Internal server error |

### Response Shapes

**Game state object** (returned by most endpoints):

```json
{
  "state": {
    "day": 3,
    "location": "Medellín",
    "cash": 840.00,
    "capacity": 100,
    "usedCapacity": 20,
    "maxDays": 30,
    "inventory": {
      "CAN": 0, "COC": 20, "HER": 0,
      "METH": 0, "MDM": 0, "FEN": 0
    }
  },
  "prices": {
    "CAN": 2.01, "COC": 98.40, "HER": 131.20,
    "METH": 14.60, "MDM": 4.72, "FEN": 0.68
  }
}
```

**Travel response** (may include an optional police encounter):

```json
{
  "state": { "..." : "..." },
  "prices": { "..." : "..." },
  "policeEncounter": {
    "outcome": "shootout",
    "inventoryLost": { "COC": 10 }
  }
}
```

Police encounter `outcome` values:

| Value | Effect |
|-------|--------|
| `"arrest"` | All inventory seized; `fine` (20% of cash) deducted |
| `"shootout"` | `inventoryLost` (50% of each drug) removed from inventory |

---

## Configuration

You can customise the game by passing a `GameConfig` object when starting a new session (CLI or embedding the engine directly):

```typescript
interface GameConfig {
  startingCash?: number;       // Default: 1000
  maxDays?: number;            // Default: 30
  capacity?: number;           // Default: 100
  startingLocation?: string;   // Default: "Denver"
}
```

---

## Deploying to Netlify

The repo includes a ready-to-use Netlify configuration.

1. Push to a GitHub repository.
2. Connect the repo in the [Netlify dashboard](https://app.netlify.com).
3. Netlify will automatically use the settings in `netlify.toml`:
   - **Build command:** `npx tsc --outDir dist`
   - **Publish directory:** `public/`
   - **Functions directory:** `dist/netlify/functions`
4. API routes (`/v1/*`, `/healthz`) are redirected to the serverless function automatically.

---

## Development

### Project structure

```
src/drugrunnerman/
├── cli/            # Interactive CLI player (Inquirer)
├── data/           # drugs.json, locations.json
├── engine/         # Game logic, police AI, price generator
├── models/         # TypeScript interfaces (Drug, Location)
└── server/         # Express REST API
netlify/functions/  # Serverless HTTP wrapper
public/             # Static web UI (index.html)
```

### Scripts

| Script | Command | Description |
|--------|---------|-------------|
| Build | `yarn build` | Compile TypeScript to `dist/` |
| Play | `yarn play` | Run CLI game |
| API server | `yarn api` | Run Express server on port 3000 |
| Test | `yarn test` | Run Jest test suite |
| Lint | `yarn lint` | ESLint |
| Format | `yarn format` | Prettier |

### Testing

Tests live alongside source files as `*.test.ts`:

- `engine/game.test.ts` — game logic unit tests
- `engine/priceGenerator.test.ts` — price algorithm tests
- `server/api.test.ts` — REST API integration tests (supertest)

---

## Known Limitations

> These are known beta-phase issues that will be addressed before v1.0.

- **In-memory sessions** — API game state is not persisted; a server restart resets all games.
- **No authentication** — The API has no access control; any client sharing a `Session-ID` can control a game.
- **Single-player only** — No multiplayer or leaderboard support yet.
- **No save/load** — Games cannot be saved and resumed across sessions.
- **Seeded RNG replay not exposed via API** — The seed is generated internally and not surfaced to clients.

---

## License

[GNU AFFERO GENERAL PUBLIC LICENSE 3](./LICENSE)
