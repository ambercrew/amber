import AiPromptDto from "../../../../api/aiIntegration/dto/aiPromptDto";
import {
	insertPrompt,
	matchPrompts,
	slashQueryAt,
} from "../../../../features/Ai/utils/promptSlashQuery";

function prompt(name: string): AiPromptDto {
	return { id: name, createdAt: "", modifiedAt: "", name, content: name };
}

describe("slashQueryAt", () => {
	it("Should return the query when the caret ends a word starting with /", () => {
		// Arrange

		const text = "Hi /qui";

		// Act

		const actual = slashQueryAt(text, text.length);

		// Assert

		expect(actual).toEqual({ start: 3, query: "qui" });
	});

	it("Should return null when the / is inside a word", () => {
		// Arrange

		const text = "and/or";

		// Act

		const actual = slashQueryAt(text, text.length);

		// Assert

		expect(actual).toBeNull();
	});

	it("Should return null when a space follows the slash query", () => {
		// Arrange

		const text = "/quiz ";

		// Act

		const actual = slashQueryAt(text, text.length);

		// Assert

		expect(actual).toBeNull();
	});
});

describe("matchPrompts", () => {
	it("Should list names starting with the query first when several contain it", () => {
		// Arrange

		const prompts = [
			prompt("Deep quiz"),
			prompt("Quiz me"),
			prompt("Other"),
		];

		// Act

		const actual = matchPrompts(prompts, "quiz");

		// Assert

		expect(actual.map(p => p.name)).toEqual(["Quiz me", "Deep quiz"]);
	});

	it("Should ignore case, spaces and punctuation when matching the query", () => {
		// Arrange

		const prompts = [prompt("Quiz me!")];

		// Act

		const actual = matchPrompts(prompts, "QUIZ-ME");

		// Assert

		expect(actual.map(p => p.name)).toEqual(["Quiz me!"]);
	});
});

describe("insertPrompt", () => {
	it("Should replace the slash query and put the caret after the prompt when text follows the caret", () => {
		// Arrange

		const text = "Hi /qu there";

		// Act

		const actual = insertPrompt(
			text,
			6,
			{ start: 3, query: "qu" },
			"Quiz me.",
		);

		// Assert

		expect(actual).toEqual({
			text: "Hi Quiz me. there",
			selection: { start: 11, end: 11 },
		});
	});

	it("Should select the prompt's first placeholder when it has some", () => {
		// Arrange

		const text = "Hi /qu";

		// Act

		const actual = insertPrompt(
			text,
			6,
			{ start: 3, query: "qu" },
			"Quiz me on {topic} at {level}.",
		);

		// Assert

		expect(actual.selection).toEqual({ start: 14, end: 21 });
	});
});
