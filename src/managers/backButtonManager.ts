import { onBackButtonPress } from "@tauri-apps/api/app";
import { PluginListener } from "@tauri-apps/api/core";
import { isAndroid } from "../utils/tauriUtils";

/**
 * How much of the screen a handler owns. A back press is consumed by the
 * highest priority handler only, so whatever is visually on top wins.
 */
export const BackButtonPriority = {
	/** Anything covered by everything else, e.g. the collapsible side panels. */
	Low: 0,
	/** The default, e.g. modals and the command palette. */
	Medium: 10,
	/** Whatever opens on top of a modal, e.g. the settings drawer. */
	High: 20,
} as const;

export type BackButtonPriority =
	(typeof BackButtonPriority)[keyof typeof BackButtonPriority];

interface Handler {
	cb: () => void;
	priority: BackButtonPriority;
	/** Registration order, so the newest of equal priorities wins. */
	order: number;
}

export class BackButtonManager {
	private handlers = new Map<symbol, Handler>();
	private nextOrder = 0;
	// Held while the listener is being registered, since that is async and
	// handlers may come and go before it resolves.
	private listener: Promise<PluginListener> | null = null;

	/**
	 * Registers an Android back button handler and returns its unregister function. Only the highest
	 * priority runs, the newest among equals, so nested overlays unwind one press at a time.
	 */
	public addHandler(
		cb: () => void,
		priority: BackButtonPriority = BackButtonPriority.Medium,
	): () => void {
		const key = Symbol();
		this.handlers.set(key, { cb, priority, order: this.nextOrder++ });
		void this.startListening();

		return () => {
			this.handlers.delete(key);
			if (this.handlers.size === 0) this.stopListening();
		};
	}

	/** The handler a back press would run, or null when back is left alone. */
	public get activeHandler(): (() => void) | null {
		let winner: Handler | null = null;
		for (const handler of this.handlers.values()) {
			if (
				!winner ||
				handler.priority > winner.priority ||
				(handler.priority === winner.priority &&
					handler.order > winner.order)
			) {
				winner = handler;
			}
		}
		return winner?.cb ?? null;
	}

	private async startListening() {
		// Nothing listens on desktop, where there is no back button.
		if (this.listener || !isAndroid()) return;

		const pending = onBackButtonPress(() => this.activeHandler?.());
		this.listener = pending;
		await pending;

		// Everything unregistered while the listener was being registered.
		if (this.listener === pending && this.handlers.size === 0) {
			this.stopListening();
		}
	}

	private stopListening() {
		const pending = this.listener;
		if (!pending) return;

		this.listener = null;
		void pending.then(listener => listener.unregister());
	}
}

export const defaultBackButtonManager = new BackButtonManager();
