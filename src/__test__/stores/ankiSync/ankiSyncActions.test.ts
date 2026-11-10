import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifications } from "@mantine/notifications";
import {
	elementExists,
	getElementById,
	getElementTree,
} from "../../../api/elements/api/elementsApi";
import { AnyElementDto } from "../../../api/elements/dto/anyElementDto";
import { setCurrentElement } from "../../../stores/elements/elementsReducer";
import { selectElementRefreshCount } from "../../../stores/sync/syncSelector";
import {
	previewAnkiSync,
	syncAnki,
} from "../../../api/ankiSync/api/ankiSyncApi";
import {
	runAnkiSync,
	startAnkiSync,
} from "../../../stores/ankiSync/ankiSyncActions";
import {
	setAnkiSyncReview,
	setIsAnkiSyncBusy,
} from "../../../stores/ankiSync/ankiSyncReducer";
import {
	selectAnkiSyncReview,
	selectIsAnkiSyncBusy,
} from "../../../stores/ankiSync/ankiSyncSelectors";
import { setupStore } from "../../../stores/store";
import { sync } from "../../../stores/sync/syncActions";
import { setIsSyncing } from "../../../stores/sync/syncReducer";
import {
	setOfflineUserInformation,
	setUserInformation,
} from "../../../stores/user/userReducer";
import { UserInformationDto } from "../../../api/backend/dto/userInformationDto";

vi.mock("../../../api/ankiSync/api/ankiSyncApi");
vi.mock("../../../api/elements/api/elementsApi");
vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(() => Promise.resolve(() => undefined)),
}));
vi.mock("../../../stores/sync/syncActions", () => ({
	sync: vi.fn(() => async () => true),
}));
vi.mock("@mantine/notifications", () => ({
	notifications: { show: vi.fn(() => "id"), update: vi.fn() },
}));

const settled = {
	profile: "User 1",
	isFirstSync: false,
	decks: [],
	sendingDecks: [],
	cardsToUpdate: 0,
	cardsEditedInAnki: 0,
	reviewsToAnki: 0,
	reviewsToAmber: 0,
	dueDatesToAnki: 0,
	dueDatesToAmber: 0,
	notesToDelete: 0,
	cardsToTrash: 0,
};

const user = { isEmailVerified: true } as UserInformationDto;

const summary = {
	cards: 1,
	importedCards: 0,
	sentCards: 0,
	pulledReviews: 0,
	pushedReviews: 0,
	trashedCards: 0,
	deletedNotes: 0,
	editedCards: [] as string[],
	sentEdits: 0,
	dueDatesToAnki: 0,
	dueDatesToAmber: 0,
};

describe("ankiSyncActions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(syncAnki).mockResolvedValue(summary);
		vi.mocked(sync).mockImplementation(() => async () => true);
		vi.mocked(getElementTree).mockResolvedValue([]);
	});

	it("Should show the review instead of syncing when a sync is started", async () => {
		// Arrange

		const store = setupStore();
		vi.mocked(previewAnkiSync).mockResolvedValue(settled);

		// Act

		await store.dispatch(startAnkiSync());

		// Assert

		expect(selectAnkiSyncReview(store.getState())).toEqual({
			status: "ready",
			preview: settled,
			missedCloudSync: false,
		});
		expect(syncAnki).not.toHaveBeenCalled();
		expect(selectIsAnkiSyncBusy(store.getState())).toBe(false);
	});

	it("Should open the review while loading when a sync is started", () => {
		// Arrange

		const store = setupStore();
		vi.mocked(previewAnkiSync).mockReturnValue(new Promise(() => {}));

		// Act

		void store.dispatch(startAnkiSync());

		// Assert

		expect(selectAnkiSyncReview(store.getState())).toEqual({
			status: "loading",
		});
	});

	it("Should keep the review closed when its preview arrives after closing it", async () => {
		// Arrange

		const store = setupStore();
		vi.mocked(previewAnkiSync).mockResolvedValue(settled);

		// Act

		const started = store.dispatch(startAnkiSync());
		store.dispatch(setAnkiSyncReview(null));
		await started;

		// Assert

		expect(selectAnkiSyncReview(store.getState())).toBeNull();
	});

	it("Should show the error in the review when the preview fails", async () => {
		// Arrange

		const store = setupStore();
		vi.mocked(previewAnkiSync).mockRejectedValue("Anki isn't open");

		// Act

		await store.dispatch(startAnkiSync());

		// Assert

		expect(selectAnkiSyncReview(store.getState())).toEqual({
			status: "failed",
			error: "Anki isn't open",
		});
		expect(notifications.show).not.toHaveBeenCalled();
	});

	it("Should not start when a sync is already running", async () => {
		// Arrange

		const store = setupStore();
		store.dispatch(setIsAnkiSyncBusy(true));

		// Act

		await store.dispatch(startAnkiSync());

		// Assert

		expect(previewAnkiSync).not.toHaveBeenCalled();
	});

	it("Should not report a failure when the sync was cancelled", async () => {
		// Arrange

		const store = setupStore();
		vi.mocked(syncAnki).mockRejectedValue("anki-sync-cancelled");

		// Act

		await store.dispatch(runAnkiSync([]));

		// Assert

		expect(notifications.update).toHaveBeenLastCalledWith(
			expect.objectContaining({ color: undefined }),
		);
		expect(selectIsAnkiSyncBusy(store.getState())).toBe(false);
	});

	it("Should reload the element tree when a sync fails after trashing cards", async () => {
		// Arrange

		const store = setupStore();
		vi.mocked(syncAnki).mockRejectedValue("Anki went away");

		// Act

		await store.dispatch(runAnkiSync([]));

		// Assert

		expect(getElementTree).toHaveBeenCalled();
	});

	it("Should not reload the element tree when a sync trashed nothing", async () => {
		// Arrange

		const store = setupStore();

		// Act

		await store.dispatch(runAnkiSync([]));

		// Assert

		expect(getElementTree).not.toHaveBeenCalled();
	});

	it("Should cloud-sync before previewing when a sync is started", async () => {
		// Arrange

		const store = setupStore();
		store.dispatch(setUserInformation(user));
		const calls: string[] = [];
		vi.mocked(sync).mockImplementation(() => async () => {
			calls.push("cloud");
			return true;
		});
		vi.mocked(previewAnkiSync).mockImplementation(async () => {
			calls.push("preview");
			return settled;
		});

		// Act

		await store.dispatch(startAnkiSync());

		// Assert

		expect(calls).toEqual(["cloud", "preview"]);
	});

	it("Should cloud-sync after syncing with Anki when it finishes", async () => {
		// Arrange

		const store = setupStore();
		store.dispatch(setUserInformation(user));
		const calls: string[] = [];
		vi.mocked(sync).mockImplementation(() => async () => {
			calls.push("cloud");
			return true;
		});
		vi.mocked(syncAnki).mockImplementation(async () => {
			calls.push("anki");
			return summary;
		});

		// Act

		await store.dispatch(runAnkiSync([]));

		// Assert

		expect(calls).toEqual(["anki", "cloud"]);
	});

	it("Should cloud-sync after syncing with Anki when it fails", async () => {
		// Arrange

		const store = setupStore();
		store.dispatch(setUserInformation(user));
		vi.mocked(syncAnki).mockRejectedValue("Anki went away");

		// Act

		await store.dispatch(runAnkiSync([]));

		// Assert

		expect(sync).toHaveBeenCalledTimes(1);
	});

	it("Should not cloud-sync around an Anki sync when offline", async () => {
		// Arrange

		const store = setupStore();
		store.dispatch(setOfflineUserInformation(user));
		vi.mocked(previewAnkiSync).mockResolvedValue(settled);

		// Act

		await store.dispatch(startAnkiSync());
		await store.dispatch(runAnkiSync([]));

		// Assert

		expect(sync).not.toHaveBeenCalled();
	});

	it("Should not cloud-sync around an Anki sync when a cloud sync is running", async () => {
		// Arrange

		const store = setupStore();
		store.dispatch(setUserInformation(user));
		store.dispatch(setIsSyncing(true));

		// Act

		await store.dispatch(runAnkiSync([]));

		// Assert

		expect(sync).not.toHaveBeenCalled();
	});

	it("Should note the missed cloud sync in the review when the cloud sync fails", async () => {
		// Arrange

		const store = setupStore();
		store.dispatch(setUserInformation(user));
		vi.mocked(sync).mockImplementation(() => async () => false);
		vi.mocked(previewAnkiSync).mockResolvedValue(settled);

		// Act

		await store.dispatch(startAnkiSync());

		// Assert

		expect(selectAnkiSyncReview(store.getState())).toMatchObject({
			missedCloudSync: true,
		});
	});

	it("Should note the missed cloud sync in the review when offline", async () => {
		// Arrange

		const store = setupStore();
		store.dispatch(setOfflineUserInformation(user));
		vi.mocked(previewAnkiSync).mockResolvedValue(settled);

		// Act

		await store.dispatch(startAnkiSync());

		// Assert

		expect(selectAnkiSyncReview(store.getState())).toMatchObject({
			missedCloudSync: true,
		});
	});

	it("Should not note a missed cloud sync when the cloud sync finishes", async () => {
		// Arrange

		const store = setupStore();
		store.dispatch(setUserInformation(user));
		vi.mocked(previewAnkiSync).mockResolvedValue(settled);

		// Act

		await store.dispatch(startAnkiSync());

		// Assert

		expect(selectAnkiSyncReview(store.getState())).toMatchObject({
			missedCloudSync: false,
		});
	});

	it("Should reload the element tree when a sync took edits from Anki", async () => {
		// Arrange

		const store = setupStore();
		vi.mocked(syncAnki).mockResolvedValue({
			...summary,
			editedCards: ["card-1"],
		});

		// Act

		await store.dispatch(runAnkiSync([]));

		// Assert

		expect(getElementTree).toHaveBeenCalled();
	});

	it("Should reload the open card when the sync replaced it with an Anki edit", async () => {
		// Arrange

		const card = cardElement("card-1");
		const store = setupStore();
		store.dispatch(setCurrentElement(card));
		vi.mocked(syncAnki).mockResolvedValue({
			...summary,
			editedCards: ["card-1"],
		});
		vi.mocked(elementExists).mockResolvedValue(true);
		vi.mocked(getElementById).mockResolvedValue(card);

		// Act

		await store.dispatch(runAnkiSync([]));

		// Assert

		expect(getElementById).toHaveBeenCalledWith({
			type: "card",
			id: "card-1",
		});
		expect(selectElementRefreshCount(store.getState())).toBe(1);
	});

	it("Should leave the open card alone when the sync edited other cards", async () => {
		// Arrange

		const store = setupStore();
		store.dispatch(setCurrentElement(cardElement("card-1")));
		vi.mocked(syncAnki).mockResolvedValue({
			...summary,
			editedCards: ["card-2"],
		});

		// Act

		await store.dispatch(runAnkiSync([]));

		// Assert

		expect(getElementById).not.toHaveBeenCalled();
		expect(selectElementRefreshCount(store.getState())).toBe(0);
	});
});

function cardElement(id: string): AnyElementDto {
	return {
		type: "card",
		data: {
			meta: {
				elementId: { type: "card", id },
				name: "Card",
				nameSource: "manual",
				parent: null,
				position: "0",
				tags: [],
				createdAt: "2024-01-01T00:00:00Z",
				modifiedAt: "2024-01-01T00:00:00Z",
				bibliographicalSourceId: null,
				derivedFrom: null,
			},
			front: "",
			back: "",
		},
	} as AnyElementDto;
}
