export type GameEvent = { type: string; [k: string]: any };

export class EventBus {
	private listeners: ((e: GameEvent) => void)[] = [];

	on(fn: (e: GameEvent) => void) {
		this.listeners.push(fn);
	}

	emit(e: GameEvent) {
		this.listeners.forEach((l) => l(e));
	}
}
