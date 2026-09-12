import { NodeDto } from "../../../api/elements/dto/nodeDto";
import { AnyElementDto } from "../../../api/elements/dto/anyElementDto";
import { selectCurrentElementIsTrashed } from "../../../stores/elements/elementsSelectors";
import { RootState, setupStore } from "../../../stores/store";

const FOLDER_NODE: NodeDto = {
	meta: {
		elementId: { type: "folder", id: "folder-1" },
		name: "Science",
		position: "a",
	},
	children: { folders: [], learningAssets: [], extracts: [], cards: [] },
};

const CURRENT_EXTRACT: AnyElementDto = {
	type: "extract",
	data: {
		meta: {
			elementId: { type: "extract", id: "extract-1" },
			name: "Extract",
			parent: null,
			position: "a",
			tags: [],
			createdAt: "",
			modifiedAt: "",
			bibliographicalSourceId: null,
			derivedFrom: null,
		},
		content: "",
		intervalMultiplier: 1,
	},
};

function stateWith(tree: NodeDto[], currentElement: AnyElementDto | null) {
	return setupStore({
		elements: {
			tree,
			isLoading: false,
			error: null,
			currentElement,
			zoomOwnedByCurrentView: false,
		},
	}).getState() as RootState;
}

describe("selectCurrentElementIsTrashed", () => {
	it("Should return false when there is no current element", () => {
		// Arrange

		const state = stateWith([FOLDER_NODE], null);

		// Act

		const actual = selectCurrentElementIsTrashed(state);

		// Assert

		expect(actual).toBe(false);
	});

	it("Should return false when the current element is present in the tree", () => {
		// Arrange

		const extractNode: NodeDto = {
			meta: CURRENT_EXTRACT.data.meta,
			children: {
				folders: [],
				learningAssets: [],
				extracts: [],
				cards: [],
			},
		};
		const state = stateWith(
			[
				{
					...FOLDER_NODE,
					children: {
						...FOLDER_NODE.children,
						extracts: [extractNode],
					},
				},
			],
			CURRENT_EXTRACT,
		);

		// Act

		const actual = selectCurrentElementIsTrashed(state);

		// Assert

		expect(actual).toBe(false);
	});

	it("Should return true when the current element is absent from the tree", () => {
		// Arrange

		const state = stateWith([FOLDER_NODE], CURRENT_EXTRACT);

		// Act

		const actual = selectCurrentElementIsTrashed(state);

		// Assert

		expect(actual).toBe(true);
	});
});
