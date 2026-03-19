export type GameEvent = { type: string; [k: string]: any };

export class EventBus {
	private listeners: ((e: GameEvent) => void)[] = [];

	on(fn: (e: GameEvent) => void) {
		this.listeners.push(fn);
	}

	off(fn: (e: GameEvent) => void) {
		this.listeners = this.listeners.filter((l) => l !== fn);
	}

	emit(e: GameEvent) {
		this.listeners.forEach((l) => l(e));
	}
}
