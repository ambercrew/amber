import { setupStore } from "../../../stores/store";
import {
	addCreatedElementsAction,
	loadCurrentElementAction,
	loadElementTree,
	moveElementAction,
	renameElementAction,
	setDerivedFromAction,
} from "../../../stores/elements/elementsActions";
import { setElementName } from "../../../stores/elements/elementsReducer";
import {
	elementExists,
	getElementById,
	getElementDetails,
	getElementTree,
	moveElement,
	renameElement,
	setDerivedFrom,
} from "../../../api/elements/api/elementsApi";
import { NodeDto } from "../../../api/elements/dto/nodeDto";
import { ElementId } from "../../../types/elements/elementId";
import { notifications } from "@mantine/notifications";
import studyReducer from "../../../stores/study/studyReducer";
import { elementStudyScope } from "../../../utils/studyScope";
import { AnyElementDto } from "../../../api/elements/dto/anyElementDto";
import { ElementDetailsResponseDto } from "../../../api/elements/dto/elementDetailsDto";
import { StudyProfileDto } from "../../../api/study/dto/studyProfileDto";

vi.mock(import("../../../api/elements/api/elementsApi"));

const ELEMENT_ID = { type: "card" as const, id: "card-1" };

const PROFILE: StudyProfileDto = {
	id: "profile-1",
	createdAt: "2024-01-01T00:00:00Z",
	modifiedAt: "2024-01-01T00:00:00Z",
	name: "Default",
	isDefault: true,
	desiredRetention: 0.9,
	fsrsParams: [],
	learningSteps: [],
	relearningSteps: [],
	initialIntervalMultiplier: 1.2,
	initialIntervalDays: 1,
	minIntervalDays: 1,
	priorityInheritancePolicy: {
		placement: { type: "aboveParent" },
		ceilingPercentile: null,
	},
};

const CARD_ELEMENT: AnyElementDto = {
	type: "card",
	data: {
		meta: {
			elementId: ELEMENT_ID,
			name: "Card 1",
			parent: null,
			position: "0",
			tags: [],
			createdAt: "2024-01-01T00:00:00Z",
			modifiedAt: "2024-01-01T00:00:00Z",
			nameSource: "manual",
			bibliographicalSourceId: null,
			derivedFrom: null,
		},
		front: "Front",
		back: "Back",
	},
};

const DETAILS: ElementDetailsResponseDto = {
	bibliographicalSource: null,
	derivedFromName: null,
	cardReview: null,
	learningAssetReview: null,
	effectiveProfile: {
		profile: PROFILE,
		source: "default",
		inheritedFrom: null,
	},
	profiles: [PROFILE],
	inheritedProfileName: null,
	status: "active",
	priority: { position: 1, total: 1, percentile: 0 },
};

describe("loadCurrentElementAction", () => {
	it("Should resolve to false and leave currentElement untouched when the element does not exist", async () => {
		// Arrange

		vi.mocked(elementExists).mockResolvedValue(false);
		const store = setupStore();

		// Act

		const loaded = await store.dispatch(
			loadCurrentElementAction(ELEMENT_ID),
		);

		// Assert

		expect(loaded).toBe(false);
		expect(store.getState().elements.currentElement).toBeNull();
		expect(getElementById).not.toHaveBeenCalled();
	});

	it("Should set currentElement and elementDetails and resolve to true when the element exists", async () => {
		// Arrange

		vi.mocked(elementExists).mockResolvedValue(true);
		vi.mocked(getElementById).mockResolvedValue(CARD_ELEMENT);
		vi.mocked(getElementDetails).mockResolvedValue(DETAILS);
		const store = setupStore();

		// Act

		const loaded = await store.dispatch(
			loadCurrentElementAction(ELEMENT_ID),
		);

		// Assert

		expect(loaded).toBe(true);
		expect(store.getState().elements.currentElement).toEqual(CARD_ELEMENT);
		expect(store.getState().elementDetails.details).toEqual(DETAILS);
	});
});

describe("setDerivedFromAction", () => {
	it("Should save the new derived from and update the current element when an element is given", async () => {
		// Arrange

		vi.mocked(setDerivedFrom).mockResolvedValue();
		vi.mocked(elementExists).mockResolvedValue(true);
		vi.mocked(getElementById).mockResolvedValue(CARD_ELEMENT);
		vi.mocked(getElementDetails).mockResolvedValue(DETAILS);
		const store = setupStore();
		await store.dispatch(loadCurrentElementAction(ELEMENT_ID));
		const source = { type: "learningAsset" as const, id: "asset-1" };

		// Act

		await store.dispatch(setDerivedFromAction(ELEMENT_ID, source));

		// Assert

		expect(setDerivedFrom).toHaveBeenCalledWith(ELEMENT_ID, source);
		expect(
			store.getState().elements.currentElement?.data.meta.derivedFrom,
		).toEqual(source);
	});

	it("Should reset a study scope on an element that is gone when the tree loads", async () => {
		// Arrange

		vi.mocked(getElementTree).mockResolvedValue([]);
		const showNotification = vi
			.spyOn(notifications, "show")
			.mockImplementation(() => "");
		const store = setupStore({
			study: {
				...studyReducer(undefined, { type: "" }),
				studyScope: elementStudyScope({
					type: "folder",
					id: "folder-1",
				}),
			},
		});

		// Act

		await store.dispatch(loadElementTree());

		// Assert

		expect(store.getState().study.studyScope).toBeNull();
		showNotification.mockRestore();
	});

	describe("tree patches", () => {
		const FOLDER_ID = { type: "folder" as const, id: "folder-1" };
		const CARD_ID = { type: "card" as const, id: "card-in-tree" };
		const leaf = (elementId: ElementId, name: string): NodeDto => ({
			meta: { elementId, name, position: "a" },
			children: {
				folders: [],
				learningAssets: [],
				extracts: [],
				cards: [],
			},
		});
		const TREE = [leaf(FOLDER_ID, "Folder"), leaf(CARD_ID, "Card")];

		async function loadedStore() {
			vi.mocked(getElementTree).mockResolvedValue(TREE);
			const store = setupStore();
			await store.dispatch(loadElementTree());
			vi.mocked(getElementTree).mockClear();
			return store;
		}

		it("Should patch the name without reloading the tree when an element is renamed", async () => {
			// Arrange

			const store = await loadedStore();

			// Act

			await store.dispatch(renameElementAction(CARD_ID, "Renamed"));

			// Assert

			expect(store.getState().elements.tree[1].meta.name).toBe("Renamed");
			expect(getElementTree).not.toHaveBeenCalled();
		});

		it("Should report the error when renaming fails", async () => {
			// Arrange

			const store = await loadedStore();
			vi.mocked(renameElement).mockRejectedValue("Nope");

			// Act

			await store.dispatch(renameElementAction(CARD_ID, "Renamed"));

			// Assert

			expect(store.getState().elements.error).toBe("Nope");
			expect(store.getState().elements.tree[1].meta.name).toBe("Card");
		});

		it("Should patch the tree without reloading it when an element is moved", async () => {
			// Arrange

			const store = await loadedStore();
			vi.mocked(moveElement).mockResolvedValue({
				parent: FOLDER_ID,
				position: "b",
				rebalanced: false,
			});

			// Act

			await store.dispatch(
				moveElementAction({
					draggedId: CARD_ID,
					targetId: FOLDER_ID,
					position: "inside",
				}),
			);

			// Assert

			const { tree } = store.getState().elements;
			expect(tree).toHaveLength(1);
			expect(tree[0].children.cards[0].meta.position).toBe("b");
			expect(getElementTree).not.toHaveBeenCalled();
		});

		it("Should reload the tree when a move rebalanced the siblings", async () => {
			// Arrange

			const store = await loadedStore();
			vi.mocked(moveElement).mockResolvedValue({
				parent: null,
				position: "b",
				rebalanced: true,
			});

			// Act

			await store.dispatch(
				moveElementAction({
					draggedId: CARD_ID,
					targetId: FOLDER_ID,
					position: "before",
				}),
			);

			// Assert

			expect(getElementTree).toHaveBeenCalledOnce();
		});

		it("Should add created elements without reloading when their parents are known", async () => {
			// Arrange

			const store = await loadedStore();
			const element = leaf({ type: "card", id: "card-new" }, "New").meta;

			// Act

			await store.dispatch(
				addCreatedElementsAction([{ parentId: FOLDER_ID.id, element }]),
			);

			// Assert

			expect(
				store.getState().elements.tree[0].children.cards[0].meta.name,
			).toBe("New");
			expect(getElementTree).not.toHaveBeenCalled();
		});

		it("Should reload the tree when a created element's parent is unknown", async () => {
			// Arrange

			const store = await loadedStore();
			const element = leaf({ type: "card", id: "card-new" }, "New").meta;

			// Act

			await store.dispatch(
				addCreatedElementsAction([{ parentId: "missing", element }]),
			);

			// Assert

			expect(getElementTree).toHaveBeenCalledOnce();
		});

		it("Should reload the tree once when too many elements were created to patch", async () => {
			// Arrange

			const store = await loadedStore();
			const created = Array.from({ length: 201 }, (_, index) => ({
				parentId: FOLDER_ID.id,
				element: leaf({ type: "card", id: `card-${index}` }, "New")
					.meta,
			}));

			// Act

			await store.dispatch(addCreatedElementsAction(created));

			// Assert

			expect(getElementTree).toHaveBeenCalledOnce();
		});

		it("Should stop fetching when the tree keeps changing during a load", async () => {
			// Arrange

			const store = await loadedStore();
			let renames = 0;
			vi.mocked(getElementTree).mockImplementation(() => {
				store.dispatch(
					setElementName({
						elementId: FOLDER_ID,
						name: `Renamed ${++renames}`,
					}),
				);
				return Promise.resolve(TREE);
			});

			// Act

			await store.dispatch(loadElementTree());

			// Assert

			expect(getElementTree).toHaveBeenCalledTimes(3);
		});

		it("Should fetch again when the tree was patched during a load", async () => {
			// Arrange

			const store = await loadedStore();
			const patched = [leaf(FOLDER_ID, "Patched")];
			vi.mocked(getElementTree)
				.mockImplementationOnce(() => {
					store.dispatch(
						setElementName({
							elementId: FOLDER_ID,
							name: "Patched",
						}),
					);
					return Promise.resolve(TREE);
				})
				.mockResolvedValueOnce(patched);

			// Act

			await store.dispatch(loadElementTree());

			// Assert

			expect(getElementTree).toHaveBeenCalledTimes(2);
			expect(store.getState().elements.tree[0].meta.name).toBe("Patched");
		});
	});
});
