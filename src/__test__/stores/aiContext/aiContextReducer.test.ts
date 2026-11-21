import aiContextReducer, {
	clearPendingAiPrompt,
	requestAiPrompt,
} from "../../../stores/aiContext/aiContextReducer";

const EMPTY = {
	snippets: [],
	pendingPrompt: null,
	pendingPromptElementId: null,
};

describe("aiContextReducer", () => {
	it("Should keep the element a prompt is about when it is asked with one", () => {
		// Arrange

		const leech = { type: "card" as const, id: "leech-card" };

		// Act

		const state = aiContextReducer(
			EMPTY,
			requestAiPrompt("rewrite it", leech),
		);

		// Assert

		expect(state.pendingPrompt).toBe("rewrite it");
		expect(state.pendingPromptElementId).toEqual(leech);
	});

	it("Should leave the element unset when a prompt is asked without one", () => {
		// Arrange

		const asked = aiContextReducer(
			EMPTY,
			requestAiPrompt("old", { type: "card", id: "card-1" }),
		);

		// Act

		const state = aiContextReducer(asked, requestAiPrompt("new"));

		// Assert

		expect(state.pendingPromptElementId).toBeNull();
	});

	it("Should clear the prompt and its element when the pending prompt is cleared", () => {
		// Arrange

		const asked = aiContextReducer(
			EMPTY,
			requestAiPrompt("rewrite it", { type: "card", id: "card-1" }),
		);

		// Act

		const state = aiContextReducer(asked, clearPendingAiPrompt());

		// Assert

		expect(state.pendingPrompt).toBeNull();
		expect(state.pendingPromptElementId).toBeNull();
	});
});
