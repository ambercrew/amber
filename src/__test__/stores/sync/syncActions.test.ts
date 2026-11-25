import {
	defaultGlobalSyncEventManager,
	ListenerType,
} from "../../../managers/syncEventManager";
import {
	sync,
	syncBeforeClose,
	withoutSync,
} from "../../../stores/sync/syncActions";
import {
	closeWithoutWaitingRequested,
	keepWorkingRequested,
	setIsSyncing,
	syncEnded,
} from "../../../stores/sync/syncReducer";
import { setLoggedOf, setOnline } from "../../../stores/user/userReducer";
import { sync as syncApi } from "../../../api/sync/api/syncApi";
import { RootState, setupStore } from "../../../stores/store";
import { UserInformationDto } from "../../../api/backend/dto/userInformationDto";
import { cleanNotifications, notificationsStore } from "@mantine/notifications";
import { SyncResponseDto } from "../../../api/sync/dto/syncResponseDto";

const SYNCED: SyncResponseDto = { changedKeys: [] };

vi.mock("../../../managers/syncEventManager");
vi.mock("../../../api/sync/api/syncApi.ts");

const createGetState = ({
	isSignedIn,
	isEmailVerified,
	isOffline = false,
}: {
	isSignedIn: boolean;
	isEmailVerified: boolean;
	isOffline?: boolean;
}) => {
	const state = {
		user: {
			isSignedIn,
			isOffline,
			userInformation: {
				isEmailVerified,
			},
		},
		sync: { isSyncing: false },
	} as RootState;

	return () => state;
};

beforeEach(() => {
	vi.mocked(syncApi).mockResolvedValue(SYNCED);
});

describe("sync", () => {
	it("Should dispatch and call listeners in correct order", async () => {
		// Arrange

		const dispatch = vi.fn();

		const manager = vi.mocked(defaultGlobalSyncEventManager);
		const notifyListenersMock = vi.fn();
		notifyListenersMock.mockImplementation((type: ListenerType) => {
			// Asserting the order
			if (type === ListenerType.PreSyncStart) {
				expect(dispatch).toHaveBeenCalledWith(setIsSyncing(true));
			} else if (type === ListenerType.PreSyncComplete) {
				expect(dispatch).not.toHaveBeenCalledWith(syncEnded(true));
			} else if (type === ListenerType.PostSyncComplete) {
				expect(dispatch).toHaveBeenCalledWith(syncEnded(true));
			}
		});
		manager.notifyListeners = notifyListenersMock;

		// Act

		const cb = sync();
		await cb(
			dispatch,
			createGetState({
				isEmailVerified: true,
				isSignedIn: true,
			}),
		);

		// Assert

		expect(syncApi).toHaveBeenCalled();
		expect(dispatch).toHaveBeenNthCalledWith(1, setIsSyncing(true));
		expect(dispatch).toHaveBeenCalledWith(setOnline());
		expect(dispatch).toHaveBeenLastCalledWith(syncEnded(true));
	});

	it("Should not sync when email is not verified", async () => {
		// Arrange

		const dispatch = vi.fn();

		// Act

		const cb = sync();
		await cb(
			dispatch,
			createGetState({
				isEmailVerified: false,
				isSignedIn: true,
			}),
		);

		// Assert

		expect(syncApi).not.toHaveBeenCalled();
	});

	it("Should not sync when user is not signed in", async () => {
		// Arrange

		const dispatch = vi.fn();

		// Act

		const cb = sync();
		await cb(
			dispatch,
			createGetState({
				isEmailVerified: true,
				isSignedIn: false,
			}),
		);

		// Assert

		expect(syncApi).not.toHaveBeenCalled();
	});

	it("Should skip attempting sync when already known offline and skipIfKnownOffline is set", async () => {
		// Arrange

		const dispatch = vi.fn();

		// Act

		const cb = sync({ skipIfKnownOffline: true });
		await cb(
			dispatch,
			createGetState({
				isEmailVerified: true,
				isSignedIn: true,
				isOffline: true,
			}),
		);

		// Assert

		expect(syncApi).not.toHaveBeenCalled();
	});

	it("Should still attempt sync when known offline but skipIfKnownOffline is not set", async () => {
		// Arrange

		const dispatch = vi.fn();
		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();

		// Act

		const cb = sync();
		await cb(
			dispatch,
			createGetState({
				isEmailVerified: true,
				isSignedIn: true,
				isOffline: true,
			}),
		);

		// Assert

		expect(syncApi).toHaveBeenCalled();
		expect(dispatch).toHaveBeenCalledWith(setOnline());
	});

	it("Should show the error in a notification when the sync fails", async () => {
		// Arrange

		cleanNotifications();
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		vi.mocked(syncApi).mockRejectedValueOnce(new Error("Server down"));
		const dispatch = vi.fn();

		// Act

		const synced = await sync()(
			dispatch,
			createGetState({ isEmailVerified: true, isSignedIn: true }),
		);

		// Assert

		expect(synced).toBe(false);
		const shown = notificationsStore.getState().notifications;
		expect(shown).toHaveLength(1);
		expect(shown[0]).toMatchObject({
			message: "Server down",
			color: "red",
		});
		expect(dispatch).not.toHaveBeenCalledWith(setOnline());
		expect(dispatch).toHaveBeenLastCalledWith(syncEnded(false));
	});

	it("Should resolve true when the sync finishes", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		vi.mocked(syncApi).mockResolvedValueOnce(SYNCED);

		// Act

		const synced = await sync()(
			vi.fn(),
			createGetState({ isEmailVerified: true, isSignedIn: true }),
		);

		// Assert

		expect(synced).toBe(true);
	});

	it("Should resolve false when the user is not signed in", async () => {
		// Act

		const synced = await sync()(
			vi.fn(),
			createGetState({ isEmailVerified: true, isSignedIn: false }),
		);

		// Assert

		expect(synced).toBe(false);
	});

	it("Should wait for the running sync without starting another when one is running", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		const store = signedInStore();
		const first = deferred<SyncResponseDto>();
		vi.mocked(syncApi).mockClear().mockReturnValueOnce(first.promise);

		// Act

		const running = store.dispatch(sync());
		const requested = store.dispatch(sync());
		await flushPromises();
		first.resolve(SYNCED);
		const results = await Promise.all([running, requested]);

		// Assert

		expect(syncApi).toHaveBeenCalledTimes(1);
		expect(results).toEqual([true, true]);
		expect(store.getState().sync.isSyncing).toBe(false);
	});

	it("Should run a new sync once the running one ends when asked to run after it", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		const store = signedInStore();
		const first = deferred<SyncResponseDto>();
		vi.mocked(syncApi)
			.mockClear()
			.mockReturnValueOnce(first.promise)
			.mockResolvedValueOnce(SYNCED);

		// Act

		const running = store.dispatch(sync());
		const after = store.dispatch(sync({ afterRunning: true }));
		await flushPromises();
		const callsWhileRunning = vi.mocked(syncApi).mock.calls.length;
		first.resolve(SYNCED);
		const results = await Promise.all([running, after]);

		// Assert

		expect(callsWhileRunning).toBe(1);
		expect(syncApi).toHaveBeenCalledTimes(2);
		expect(results).toEqual([true, true]);
	});

	it("Should run a single sync after the running one when several ask to run after it", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		const store = signedInStore();
		const first = deferred<SyncResponseDto>();
		vi.mocked(syncApi)
			.mockClear()
			.mockReturnValueOnce(first.promise)
			.mockResolvedValue(SYNCED);

		// Act

		const running = store.dispatch(sync());
		const afterA = store.dispatch(sync({ afterRunning: true }));
		const afterB = store.dispatch(sync({ afterRunning: true }));
		await flushPromises();
		first.resolve(SYNCED);
		await Promise.all([running, afterA, afterB]);

		// Assert

		expect(syncApi).toHaveBeenCalledTimes(2);
	});

	it("Should run at once when asked to run after a sync and none is running", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		const store = signedInStore();
		vi.mocked(syncApi).mockClear().mockResolvedValue(SYNCED);

		// Act

		const synced = await store.dispatch(sync({ afterRunning: true }));

		// Assert

		expect(synced).toBe(true);
		expect(syncApi).toHaveBeenCalledOnce();
	});

	it("Should resolve true when a listener fails after the sync ends", async () => {
		// Arrange

		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn(
			(type: ListenerType) =>
				type === ListenerType.PostSyncComplete
					? Promise.reject(new Error("listener failed"))
					: Promise.resolve([]),
		);
		vi.mocked(syncApi).mockClear().mockResolvedValue(SYNCED);
		const store = signedInStore();

		// Act

		const synced = await store.dispatch(sync());

		// Assert

		expect(synced).toBe(true);
		expect(store.getState().sync.isSyncing).toBe(false);
	});

	it("Should resolve false without starting another sync when the running one fails", async () => {
		// Arrange

		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		const store = signedInStore();
		const first = deferred<SyncResponseDto>();
		vi.mocked(syncApi).mockClear().mockReturnValueOnce(first.promise);

		// Act

		const running = store.dispatch(sync());
		const requested = store.dispatch(sync());
		await flushPromises();
		first.reject(new Error("Server down"));
		const results = await Promise.all([running, requested]);

		// Assert

		expect(syncApi).toHaveBeenCalledTimes(1);
		expect(results).toEqual([false, false]);
	});

	it("Should show the closing dialog until the running sync finishes when closing without auto sync", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		const store = signedInStore();
		const running = deferred<SyncResponseDto>();
		vi.mocked(syncApi).mockClear().mockReturnValueOnce(running.promise);
		const backgroundSync = store.dispatch(sync());
		await flushPromises();

		// Act

		const closing = store.dispatch(syncBeforeClose(false));
		const finishingWhileRunning =
			store.getState().sync.isFinishingBeforeClose;
		running.resolve(SYNCED);
		await Promise.all([backgroundSync, closing]);

		// Assert

		expect(finishingWhileRunning).toBe(true);
		expect(store.getState().sync.isFinishingBeforeClose).toBe(false);
		expect(syncApi).toHaveBeenCalledTimes(1);
	});

	it("Should not show the closing dialog when closing with auto sync while signed out", async () => {
		// Arrange

		const store = setupStore();

		// Act

		const closing = store.dispatch(syncBeforeClose(true));
		const finishing = store.getState().sync.isFinishingBeforeClose;
		await closing;

		// Assert

		expect(finishing).toBe(false);
	});

	it("Should release the sync when a listener fails after the sync", async () => {
		// Arrange

		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn(
			(type: ListenerType) =>
				type === ListenerType.PreSyncComplete
					? Promise.reject(new Error("listener failed"))
					: Promise.resolve([]),
		);
		vi.mocked(syncApi).mockClear().mockResolvedValue(SYNCED);
		const store = signedInStore();

		// Act

		const synced = await store.dispatch(sync());

		// Assert

		expect(synced).toBe(true);
		expect(store.getState().sync.isSyncing).toBe(false);
	});

	it("Should not show the closing dialog when closing without auto sync and no sync is running", async () => {
		// Arrange

		const store = signedInStore();

		// Act

		const closing = store.dispatch(syncBeforeClose(false));
		const finishing = store.getState().sync.isFinishingBeforeClose;
		await closing;

		// Assert

		expect(finishing).toBe(false);
	});

	it("Should run one more sync after the running one when closing with auto sync", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		const store = signedInStore();
		const running = deferred<SyncResponseDto>();
		vi.mocked(syncApi)
			.mockClear()
			.mockReturnValueOnce(running.promise)
			.mockResolvedValueOnce(SYNCED);
		const backgroundSync = store.dispatch(sync());
		await flushPromises();

		// Act

		const closing = store.dispatch(syncBeforeClose(true));
		await flushPromises();
		const callsBeforeRunningEnds = vi.mocked(syncApi).mock.calls.length;
		running.resolve(SYNCED);
		await Promise.all([backgroundSync, closing]);

		// Assert

		expect(callsBeforeRunningEnds).toBe(1);
		expect(syncApi).toHaveBeenCalledTimes(2);
		expect(store.getState().sync.isFinishingBeforeClose).toBe(false);
	});

	it("Should resolve false and leave the sync running when the user keeps working", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		const store = signedInStore();
		const running = deferred<SyncResponseDto>();
		vi.mocked(syncApi).mockClear().mockReturnValueOnce(running.promise);
		const backgroundSync = store.dispatch(sync());
		await flushPromises();
		const closing = store.dispatch(syncBeforeClose(false));

		// Act

		store.dispatch(keepWorkingRequested());
		const closes = await closing;

		// Assert

		expect(closes).toBe(false);
		expect(store.getState().sync.isFinishingBeforeClose).toBe(false);
		expect(store.getState().sync.isSyncing).toBe(true);
		running.resolve(SYNCED);
		await backgroundSync;
	});

	it("Should resolve true when the sync on close finishes", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		vi.mocked(syncApi).mockClear().mockResolvedValue(SYNCED);
		const store = signedInStore();

		// Act

		const closes = await store.dispatch(syncBeforeClose(true));

		// Assert

		expect(closes).toBe(true);
	});

	it("Should resolve true when the user closes without waiting", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		const store = signedInStore();
		const running = deferred<SyncResponseDto>();
		vi.mocked(syncApi).mockClear().mockReturnValueOnce(running.promise);
		const backgroundSync = store.dispatch(sync());
		await flushPromises();
		const closing = store.dispatch(syncBeforeClose(false));

		// Act

		store.dispatch(closeWithoutWaitingRequested());
		const closes = await closing;

		// Assert

		expect(closes).toBe(true);
		running.resolve(SYNCED);
		await backgroundSync;
	});

	it("Should hide the closing dialog when the sync on close fails", async () => {
		// Arrange

		vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		vi.mocked(syncApi).mockRejectedValueOnce(new Error("Server down"));
		const store = signedInStore();

		// Act

		await store.dispatch(syncBeforeClose(true));

		// Assert

		expect(store.getState().sync.isFinishingBeforeClose).toBe(false);
		expect(store.getState().sync.isSyncing).toBe(false);
	});

	it("Should run a single sync when several are requested at once", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		const store = signedInStore();
		let concurrent = 0;
		let maxConcurrent = 0;
		vi.mocked(syncApi)
			.mockClear()
			.mockImplementation(async () => {
				concurrent += 1;
				maxConcurrent = Math.max(maxConcurrent, concurrent);
				await flushPromises();
				concurrent -= 1;
				return SYNCED;
			});

		// Act

		await Promise.all([
			store.dispatch(sync()),
			store.dispatch(sync()),
			store.dispatch(sync()),
		]);

		// Assert

		expect(syncApi).toHaveBeenCalledTimes(1);
		expect(maxConcurrent).toBe(1);
		expect(store.getState().sync.isSyncing).toBe(false);
	});
});

describe("syncBeforeClose", () => {
	it("Should stop waiting and hide the closing dialog when the user closes without waiting for a running sync", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		const store = signedInStore();
		const running = deferred<SyncResponseDto>();
		vi.mocked(syncApi).mockClear().mockReturnValueOnce(running.promise);
		const backgroundSync = store.dispatch(sync());
		await flushPromises();
		let closed = false;
		const closing = store
			.dispatch(syncBeforeClose(false))
			.then(() => (closed = true));

		// Act

		store.dispatch(closeWithoutWaitingRequested());
		await closing;

		// Assert

		expect(closed).toBe(true);
		expect(store.getState().sync.isFinishingBeforeClose).toBe(false);
		expect(store.getState().sync.isSyncing).toBe(true);
		running.resolve(SYNCED);
		await backgroundSync;
	});

	it("Should stop waiting when the user closes without waiting for the sync on close", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		const store = signedInStore();
		const running = deferred<SyncResponseDto>();
		vi.mocked(syncApi).mockClear().mockReturnValueOnce(running.promise);
		const closing = store.dispatch(syncBeforeClose(true));
		await flushPromises();

		// Act

		store.dispatch(closeWithoutWaitingRequested());
		await closing;

		// Assert

		expect(store.getState().sync.isFinishingBeforeClose).toBe(false);
		running.resolve(SYNCED);
	});

	it("Should not let a later close skip its wait when an earlier close was skipped", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		const store = signedInStore();
		const first = deferred<SyncResponseDto>();
		vi.mocked(syncApi).mockClear().mockReturnValueOnce(first.promise);
		const firstClose = store.dispatch(syncBeforeClose(true));
		await flushPromises();
		store.dispatch(closeWithoutWaitingRequested());
		await firstClose;
		let secondClosed = false;

		// Act

		const secondClose = store
			.dispatch(syncBeforeClose(false))
			.then(() => (secondClosed = true));
		await flushPromises();
		const closedWhileSyncing = secondClosed;
		first.resolve(SYNCED);
		await secondClose;

		// Assert

		expect(closedWhileSyncing).toBe(false);
		expect(secondClosed).toBe(true);
	});
});

describe("withoutSync", () => {
	it("Should run the operation only after the running sync finishes when one is running", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		const store = signedInStore();
		const running = deferred<SyncResponseDto>();
		vi.mocked(syncApi).mockClear().mockReturnValueOnce(running.promise);
		const backgroundSync = store.dispatch(sync());
		await flushPromises();
		const operation = vi.fn().mockResolvedValue(undefined);

		// Act

		const exclusive = store.dispatch(withoutSync(operation));
		await flushPromises();
		const calledWhileSyncing = operation.mock.calls.length;
		running.resolve(SYNCED);
		await Promise.all([backgroundSync, exclusive]);

		// Assert

		expect(calledWhileSyncing).toBe(0);
		expect(operation).toHaveBeenCalledOnce();
	});

	it("Should start a sync requested during the operation only after it when one is requested", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		const store = signedInStore();
		vi.mocked(syncApi).mockClear().mockResolvedValue(SYNCED);
		const operationDone = deferred<void>();

		// Act

		const exclusive = store.dispatch(
			withoutSync(() => operationDone.promise),
		);
		const queued = store.dispatch(sync());
		await flushPromises();
		const callsDuringOperation = vi.mocked(syncApi).mock.calls.length;
		operationDone.resolve();
		await Promise.all([exclusive, queued]);

		// Assert

		expect(callsDuringOperation).toBe(0);
		expect(syncApi).toHaveBeenCalledOnce();
	});

	it("Should run a single sync when several are requested during the operation", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		const store = signedInStore();
		vi.mocked(syncApi).mockClear().mockResolvedValue(SYNCED);
		const operationDone = deferred<void>();

		// Act

		const exclusive = store.dispatch(
			withoutSync(() => operationDone.promise),
		);
		const first = store.dispatch(sync());
		const second = store.dispatch(sync());
		await flushPromises();
		operationDone.resolve();
		const [, ...results] = await Promise.all([exclusive, first, second]);

		// Assert

		expect(syncApi).toHaveBeenCalledOnce();
		expect(results).toEqual([true, true]);
	});

	it("Should not show a sync running when the operation runs", async () => {
		// Arrange

		const store = signedInStore();
		const operationDone = deferred<void>();

		// Act

		const exclusive = store.dispatch(
			withoutSync(() => operationDone.promise),
		);
		await flushPromises();
		const syncingDuringOperation = store.getState().sync.isSyncing;
		operationDone.resolve();
		await exclusive;

		// Assert

		expect(syncingDuringOperation).toBe(false);
	});

	it("Should skip a sync queued behind the operation when the operation signed out", async () => {
		// Arrange

		vi.mocked(defaultGlobalSyncEventManager).notifyListeners = vi.fn();
		const store = signedInStore();
		vi.mocked(syncApi).mockClear();

		// Act

		const exclusive = store.dispatch(
			withoutSync(async () => {
				await flushPromises();
				store.dispatch(setLoggedOf());
			}),
		);
		const queued = store.dispatch(sync());
		const [, synced] = await Promise.all([exclusive, queued]);

		// Assert

		expect(synced).toBe(false);
		expect(syncApi).not.toHaveBeenCalled();
	});
});

function signedInStore() {
	return setupStore({
		user: {
			isSignedIn: true,
			isOffline: false,
			userInformation: { isEmailVerified: true } as UserInformationDto,
		},
	});
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function flushPromises() {
	return new Promise(resolve => setTimeout(resolve, 0));
}
