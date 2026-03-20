<div align="center">

<h1>DrugRunnerMan 🏃</h1>

A fast-paced street-trading simulation. Buy low, sell high, dodge the cops, and retire rich — in 30 days.

[![PWA Ready](https://img.shields.io/badge/PWA-ready-brightgreen)](#pwa--offline-play)

</div>

---

## What is DrugRunnerMan?

DrugRunnerMan is a browser-based, turn-based trading simulation inspired by classic street-trading games (Dope Wars, Drug Wars).
You play as a street runner with **$1,000 cash** and **100 units of carry capacity**.  
Over **30 days** you travel between six cities, buy and sell drugs at fluctuating market prices, avoid police encounters, and try to maximise your final cash balance.

It ships as a **Progressive Web App (PWA)** that can be installed on any device and played fully offline once cached.

---

## Tech Stack

| Layer                 | Technology                                                                   |
| --------------------- | ---------------------------------------------------------------------------- |
| **Game engine**       | TypeScript class-based engine (`Game`, `PoliceAI`, `EventBus`)               |
| **Price model**       | Log-normal random price generator seeded by game-ID + day + city             |
| **API server**        | Node.js / Express REST API with Zod request validation                       |
| **Serverless deploy** | Netlify Functions via `serverless-http` wrapper                              |
| **Frontend**          | Vanilla JS single-page app served from `public/index.html`                   |
| **PWA**               | `manifest.json` + Service Worker with cache-first / network-first strategies |
| **Testing**           | Jest + Supertest + fast-check property tests                                 |
| **CI**                | GitHub Actions (lint → test → deploy)                                        |

---

## Features

- 🛒 **Drug Market** — Six drugs (Cannabis, Cocaine, Heroin, Meth, MDMA, Fentanyl) with city-specific price adjustments and random daily volatility
- ✈️ **Travel** — Move between Denver, Medellín, Kabul, Culiacán, Amsterdam, Seattle
- 🚔 **Police AI** — State-machine cop (Patrol → Pursuit → Arrest/Shootout) whose aggression scales with how loaded your bag is
- 🏪 **Black Market Shop** — Spend cash on assets that improve your odds (see [Shop Items](#shop-items) below)
- 🎲 **Random Market Events** — Triggered on every travel (price surges, market crashes, free stashes, heat waves…)
- 📱 **PWA / Installable** — Works offline; can be pinned to home screen on iOS & Android
- 🔔 **Push Notification hooks** — Service worker includes push + background-sync stubs for future notifications
- 🔒 **Session isolation** — Each browser session gets a unique `X-Session-ID`; unlimited concurrent games

---

## Shop Items

Purchasable from the **🏪 Shop** tab during a game.  
Items persist for the lifetime of the session.

| Item                  | Cost   | Effect                                                         |
| --------------------- | ------ | -------------------------------------------------------------- |
| 🔫 Pistol             | $800   | Cuts inventory loss in a shootout from 50% → 25%               |
| 🚗 Fast Car           | $2,000 | Reduces police threat by 25% when travelling                   |
| 🏠 Stash House        | $3,000 | +50 carry capacity (permanent)                                 |
| 🛡️ Body Armor         | $1,500 | Reduces arrest fine from 20% → 12% of cash                     |
| 🕵️ Informant          | $1,000 | Tips you off about the best deal at next destination _(1 use)_ |
| 💊 Med Kit            | $400   | Prevents all inventory loss in a shootout _(1 use)_            |
| ⚖️ Lawyer on Retainer | $2,500 | Permanently cuts fine to 8% of cash                            |
| 🛥️ Speedboat          | $5,000 | Skip one police encounter completely _(1 use)_                 |

---

## Random Market Events

Each time you travel there is a **~25% chance** a random street event fires:

| Event            | Effect                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| 🚀 Price Surge   | _Planned:_ a random drug will be at **2× the normal price** — great time to sell                                 |
| 📉 Market Crash  | _Planned:_ a random drug drops to **0.45× the normal price** — bargain opportunity                              |
| 📦 Found a Stash | You find **5–15 free units** of a random drug on the street _(implemented)_                                     |
| 🕵️ Hot Tip       | _Planned:_ informant reveals the best-selling drug in town                                                       |
| 🚨 Heat Wave     | _Planned:_ police are extra alert — higher chance of an encounter                                                |
| 🚢 Big Shipment  | _Planned:_ bulk supply arrived; a drug sells at **0.65× normal price**                                          |

> **Note:** Only **Found a Stash** has a concrete gameplay effect in the current build; all other events are cosmetic placeholders for future updates.

---

## Limitations

| Area              | Current limitation                                               |
| ----------------- | ---------------------------------------------------------------- |
| **Persistence**   | Game state lives only in server RAM — lost on server restart     |
| **Multiplayer**   | No leaderboard, no real-time competition                         |
| **Inventory cap** | Fixed 100 units (extendable via Stash House upgrade)             |
| **Cities**        | Only six hard-coded cities; no random city generation            |
| **Economy**       | Prices are stochastic but not reactive to supply/demand dynamics |
| **Time**          | No real-time component — purely turn-based                       |
| **Mobile input**  | No swipe gestures; tap-only UI                                   |

---

## Suggested High-Tech Upgrades

> Ideas for future development:

1. **Persistent leaderboard** — Store final scores in a database (Supabase / PlanetScale) with a public `/v1/leaderboard` endpoint
2. **Dynamic supply/demand model** — Track how much of each drug has been bought/sold globally and adjust μ accordingly (simulated commodity market)
3. **Real-time multiplayer** — Use WebSockets or Server-Sent Events to show other players' travel moves on the city map
4. **Procedural city generation** — Algorithmically generate city names, flavor text, and price biases using a seeded city profile
5. **AI rival runners** — NPC traders that compete for the same drug supplies, driving prices up when they buy
6. **Crypto / NFT stash receipts** — Mint an NFT for each final score snapshot as a fun provable collectible
7. **Machine learning price predictions** — Let the player buy an in-game AI trading advisor that predicts next-day prices based on historical volatility
8. **Augmented Reality mode** — Use the device camera + geolocation to anchor in-game locations to real-world city maps
9. **Voice interface** — Accept game commands via the Web Speech API ("Buy 10 cannabis")
10. **Push notifications** — Alert players when prices at their current location drop significantly (service worker already wired for this)

---

## PWA / Offline Play

DrugRunnerMan is a fully-spec PWA:

| Feature            | Status                                                      |
| ------------------ | ----------------------------------------------------------- |
| `manifest.json`    | ✅ Linked in `<head>`                                       |
| Service Worker     | ✅ Cache-first for static assets, network-first for API     |
| Installable        | ✅ `beforeinstallprompt` banner with one-tap install        |
| Offline mode       | ✅ Cached shell loads; queued actions show a friendly error |
| Push notifications | ✅ SW event handler wired (server-side not yet configured)  |
| Background sync    | ✅ SW sync hook wired (server-side not yet configured)      |
| iOS splash / icons | ✅ `apple-touch-icon` + `apple-mobile-web-app-capable` meta |

---

## REST API

| Method | Path                    | Body                 | Description                         |
| ------ | ----------------------- | -------------------- | ----------------------------------- |
| `GET`  | `/healthz`              | —                    | Health check                        |
| `GET`  | `/v1/state`             | —                    | Current game state + prices         |
| `GET`  | `/v1/prices?loc=<name>` | —                    | Prices for a specific location      |
| `GET`  | `/v1/shop`              | —                    | List all purchasable shop items     |
| `POST` | `/v1/buy`               | `{ code, quantity }` | Buy drugs                           |
| `POST` | `/v1/sell`              | `{ code, quantity }` | Sell drugs                          |
| `POST` | `/v1/travel`            | `{ to }`             | Travel to a new city (advances day) |
| `POST` | `/v1/skip`              | —                    | Skip a day without travelling       |
| `POST` | `/v1/shop/buy`          | `{ code }`           | Purchase a shop item                |

Gameplay endpoints (`/v1/buy`, `/v1/sell`, `/v1/travel`, `/v1/skip`, `/v1/shop/buy`) include the full `state` snapshot in their response. `/v1/state` returns `state` + `prices`. `/v1/shop` returns only `{ items }`. `/healthz` returns only `{ status }`.  
The `/v1/travel` response also includes `policeEncounter` and `marketEvent` fields.

---

## Getting Started

### Requirements

- Node.js v14.5.0 or higher
- yarn or npm

### 1. Install dependencies

```bash
yarn install
```

### 2. Play in the terminal

```bash
yarn play
```

### Start the REST API + web UI

```bash
yarn api
# Open http://localhost:3000
```

### 4. Run tests

```bash
yarn test
```

### Lint

```bash
yarn lint
```

### Build (TypeScript → dist/)

```bash
yarn build
```

---

## License

[GNU AFFERO GENERAL PUBLIC LICENSE 3](./LICENSE)
