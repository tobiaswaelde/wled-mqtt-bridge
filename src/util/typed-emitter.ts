/**
 * Helper class for typed event emission
 */
export class TypedEmitter<T extends Record<string, any>> {
	private listeners: {
		[K in keyof T]?: ((payload: T[K]) => void)[];
	} = {};

	on<K extends keyof T>(event: K, listener: (payload: T[K]) => void) {
		(this.listeners[event] ||= []).push(listener);
	}

	off<K extends keyof T>(event: K, listener: (payload: T[K]) => void) {
		this.listeners[event] = (this.listeners[event] || []).filter((l) => l !== listener);
	}

	protected emit<K extends keyof T>(event: K, payload: T[K]) {
		(this.listeners[event] || []).forEach((listener) => listener(payload));
	}
}
