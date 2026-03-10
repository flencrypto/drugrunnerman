<div align="center">

<h1>Drugrunnerman</h1>

A text-based drug trading game engine with a CLI player and REST API server.

</div>

## Requirements

- NodeJS v14.5.0 or higher.
- yarn or npm

## Getting started

### Install dependencies

```bash
yarn install
```

### Play in the terminal (CLI)

```bash
yarn play
```

### Start the REST API server

```bash
yarn api
```

### Run tests

```bash
yarn test
```

### Format code

```bash
yarn format
```

## Game Overview

Drugrunnerman is a turn-based trading simulation. Each day you can:

- **Buy** drugs at the current location's market price
- **Sell** drugs from your inventory
- **Travel** to a new location (advances the day)
- **Skip** a day

The goal is to maximise your cash within the configured number of days.

## REST API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/healthz` | Health check |
| `GET` | `/v1/prices?loc=<name>` | Get current drug prices for a location |
| `POST` | `/v1/travel` | Travel to a new location `{ "to": "<name>" }` |

## License

[GNU AFFERO GENERAL PUBLIC LICENSE 3](./LICENSE)
