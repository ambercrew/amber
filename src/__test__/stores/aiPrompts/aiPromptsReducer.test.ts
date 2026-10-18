import aiPromptsReducer, {
	setAiPrompts,
	upsertAiPrompt,
} from "../../../stores/aiPrompts/aiPromptsReducer";
import AiPromptDto from "../../../api/aiIntegration/dto/aiPromptDto";

function prompt(id: string, name: string): AiPromptDto {
	return { id, createdAt: id, modifiedAt: "", name, content: "" };
}

describe("aiPromptsReducer", () => {
	it("Should keep the prompts sorted by name ignoring case when one is added", () => {
		// Arrange

		const state = aiPromptsReducer(
			undefined,
			setAiPrompts([prompt("1", "alpha"), prompt("2", "Gamma")]),
		);

		// Act

		const actual = aiPromptsReducer(
			state,
			upsertAiPrompt(prompt("3", "Beta")),
		);

		// Assert

		expect(actual.prompts.map(p => p.name)).toEqual([
			"alpha",
			"Beta",
			"Gamma",
		]);
	});

	it("Should replace the prompt and re-sort it when it is renamed", () => {
		// Arrange

		const state = aiPromptsReducer(
			undefined,
			setAiPrompts([prompt("1", "alpha"), prompt("2", "beta")]),
		);

		// Act

		const actual = aiPromptsReducer(
			state,
			upsertAiPrompt(prompt("1", "zeta")),
		);

		// Assert

		expect(actual.prompts.map(p => p.id)).toEqual(["2", "1"]);
	});
});
