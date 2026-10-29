import { notifications } from "@mantine/notifications";
import { setupStore } from "../../../stores/store";
import studyReducer from "../../../stores/study/studyReducer";
import elementsReducer from "../../../stores/elements/elementsReducer";
import {
	changeStudyScopeAction,
	resetStaleStudyScopeAction,
} from "../../../stores/study/studyScopeActions";
import { StudyScopeDto } from "../../../api/study/dto/studyScopeDto";
import { NodeDto } from "../../../api/elements/dto/nodeDto";
import { elementStudyScope } from "../../../utils/studyScope";

const FOLDER: NodeDto = {
	meta: {
		elementId: { type: "folder", id: "folder-1" },
		name: "Physics",
		position: "a0",
	},
	children: { folders: [], learningAssets: [], extracts: [], cards: [] },
};

function storeWith(
	studyScope: StudyScopeDto | null,
	tree: NodeDto[],
	status: "editing" | "studying" = "editing",
) {
	return setupStore({
		study: { ...studyReducer(undefined, { type: "" }), studyScope, status },
		elements: { ...elementsReducer(undefined, { type: "" }), tree },
	});
}

describe("studyScopeActions", () => {
	beforeEach(() => {
		window.localStorage.clear();
		vi.spyOn(notifications, "show").mockImplementation(() => "");
	});

	afterEach(() => vi.restoreAllMocks());

	it("Should set and remember the scope when it is changed", () => {
		// Arrange

		const store = storeWith(null, []);
		const scope: StudyScopeDto = {
			type: "savedSearch",
			savedSearchId: "saved-search-1",
		};

		// Act

		store.dispatch(changeStudyScopeAction(scope));

		// Assert

		expect(store.getState().study.studyScope).toEqual(scope);
		expect(
			JSON.parse(window.localStorage.getItem("study.scope") ?? "null"),
		).toEqual(scope);
	});

	it("Should reset the scope and say why when its element is no longer in the tree", () => {
		// Arrange

		const store = storeWith(elementStudyScope(FOLDER.meta.elementId), []);
		window.localStorage.setItem("study.scope", "{}");

		// Act

		store.dispatch(resetStaleStudyScopeAction());

		// Assert

		expect(store.getState().study.studyScope).toBeNull();
		expect(window.localStorage.getItem("study.scope")).toBeNull();
		expect(notifications.show).toHaveBeenCalledTimes(1);
	});

	it("Should keep the scope when its element is still in the tree", () => {
		// Arrange

		const scope = elementStudyScope(FOLDER.meta.elementId);
		const store = storeWith(scope, [FOLDER]);

		// Act

		store.dispatch(resetStaleStudyScopeAction());

		// Assert

		expect(store.getState().study.studyScope).toEqual(scope);
		expect(notifications.show).not.toHaveBeenCalled();
	});

	it("Should keep the scope when a study session is running", () => {
		// Arrange

		const scope = elementStudyScope(FOLDER.meta.elementId);
		const store = storeWith(scope, [], "studying");

		// Act

		store.dispatch(resetStaleStudyScopeAction());

		// Assert

		expect(store.getState().study.studyScope).toEqual(scope);
	});

	it("Should keep the scope when the missing element is only excluded", () => {
		// Arrange

		const scope: StudyScopeDto = {
			type: "custom",
			filters: [
				{
					id: "f1",
					field: "descendantOf",
					operator: "isNot",
					ancestor: FOLDER.meta.elementId,
				},
			],
		};
		const store = storeWith(scope, []);

		// Act

		store.dispatch(resetStaleStudyScopeAction());

		// Assert

		expect(store.getState().study.studyScope).toEqual(scope);
	});
});
