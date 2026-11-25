/** What `PostSyncComplete` listeners learn: the changed rows' keys, or `null` when unknown (too many, or the sync failed). */
export interface SyncResult {
	changedKeys: string[] | null;
}

type SyncEventListenerCallback = (result?: SyncResult) => Promise<unknown>;

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

	/** Runs the listeners one after another, resolving with what each returned. */
	async notifyListeners(
		type: ListenerType,
		result?: SyncResult,
	): Promise<unknown[]> {
		const results: unknown[] = [];
		for (const listener of this.listeners.get(type)!) {
			results.push(await listener(result));
		}
		return results;
	}
}

export const defaultGlobalSyncEventManager = new SyncEventManager();
