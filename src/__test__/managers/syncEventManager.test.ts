import SyncEventManager, {
	ListenerType,
} from "../../managers/syncEventManager";

describe("SyncEventManager", () => {
	it("Should call added listener correctly", async () => {
		// Arrange

		const manager = new SyncEventManager();

		const preSyncStartListener = vi.fn();
		manager.addListener(ListenerType.PreSyncStart, preSyncStartListener);

		const preSyncCompleteListener = vi.fn();
		manager.addListener(
			ListenerType.PreSyncComplete,
			preSyncCompleteListener,
		);

		const postSyncCompleteListener = vi.fn();
		manager.addListener(
			ListenerType.PostSyncComplete,
			postSyncCompleteListener,
		);

		// Act & Assert

		await manager.notifyListeners(ListenerType.PreSyncStart);
		expect(preSyncStartListener).toHaveBeenCalledOnce();
		expect(preSyncCompleteListener).not.toHaveBeenCalled();
		expect(postSyncCompleteListener).not.toHaveBeenCalled();

		await manager.notifyListeners(ListenerType.PreSyncComplete);
		expect(preSyncStartListener).toHaveBeenCalledOnce();
		expect(preSyncCompleteListener).toHaveBeenCalledOnce();
		expect(postSyncCompleteListener).not.toHaveBeenCalled();

		await manager.notifyListeners(ListenerType.PostSyncComplete);
		expect(preSyncStartListener).toHaveBeenCalledOnce();
		expect(preSyncCompleteListener).toHaveBeenCalledOnce();
		expect(postSyncCompleteListener).toHaveBeenCalledOnce();
	});

	it("Should remove caller", async () => {
		// Arrange

		const manager = new SyncEventManager();

		const preSyncStartListener1 = vi.fn();
		manager.addListener(ListenerType.PreSyncStart, preSyncStartListener1);

		const preSyncStartListener2 = vi.fn();
		manager.addListener(ListenerType.PreSyncStart, preSyncStartListener2);

		// Act

		manager.removeListener(
			ListenerType.PreSyncStart,
			preSyncStartListener2,
		);
		await manager.notifyListeners(ListenerType.PreSyncStart);

		// Assert

		expect(preSyncStartListener1).toHaveBeenCalledOnce();
		expect(preSyncStartListener2).not.toHaveBeenCalled();
	});
});
