import {
	defaultGlobalSyncEventManager,
	ListenerType,
} from "../../../stores/sync/managers/syncEventManager";
import { sync } from "../../../stores/sync/syncActions";
import { setIsSyncing } from "../../../stores/sync/syncReducer";
import { setOnline } from "../../../stores/user/userReducer";
import { sync as syncApi } from "../../../api/sync/api/syncApi";
import { RootState } from "../../../stores/store";

vi.mock("../../../stores/sync/managers/syncEventManager");
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
	} as RootState;

	return () => state;
};

describe("sync", () => {
	it("Should dispatch and call listeners in correct order", async () => {
		// Arrange

		const dispatch = vi.fn();

		const manager = vi.mocked(defaultGlobalSyncEventManager);
		const notifyListenersMock = vi.fn();
		notifyListenersMock.mockImplementation((type: ListenerType) => {
			// Asserting the order
			if (type === ListenerType.PreSyncStart) {
				expect(dispatch).not.toHaveBeenCalledWith(setIsSyncing(true));
			} else if (type === ListenerType.PreSyncComplete) {
				expect(dispatch).not.toHaveBeenCalledWith(setIsSyncing(false));
			} else if (type === ListenerType.PostSyncComplete) {
				expect(dispatch).toHaveBeenCalledWith(setIsSyncing(false));
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
		expect(dispatch).toHaveBeenLastCalledWith(setIsSyncing(false));
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
});
