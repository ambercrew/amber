type SyncEventListenerCallback = () => Promise<unknown>;

export enum ListenerType {
	PreSyncStart,
	PreSyncComplete,
	PostSyncComplete,
}

/** Manages the set of listeners that listen to when the sync operation starts
 * and ends.
 */
export default class SyncEventManager {
	private listeners = new Map<ListenerType, Set<SyncEventListenerCallback>>();

	constructor() {
		for (const type of Object.values(ListenerType)) {
			this.listeners.set(type as ListenerType, new Set());
		}
	}

	addListener(type: ListenerType, callback: SyncEventListenerCallback) {
		this.listeners.get(type)!.add(callback);
	}

	removeListener(type: ListenerType, callback: SyncEventListenerCallback) {
		this.listeners.get(type)!.delete(callback);
	}

	async notifyListeners(type: ListenerType) {
		for (const listener of this.listeners.get(type)!) {
			await listener();
		}
	}
}

export const defaultGlobalSyncEventManager = new SyncEventManager();
