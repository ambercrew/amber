import { describe, expect, it } from "vitest";
import { describeAnkiSync } from "../../../features/AnkiSync/ankiSyncSummary";

const nothing = {
	cards: 10,
	importedCards: 0,
	sentCards: 0,
	pulledReviews: 0,
	pushedReviews: 0,
	trashedCards: 0,
	deletedNotes: 0,
	editedCards: [],
	sentEdits: 0,
	dueDatesToAnki: 0,
	dueDatesToAmber: 0,
};

describe("describeAnkiSync", () => {
	it("Should say it is up to date when nothing changed", () => {
		// Act

		const actual = describeAnkiSync(nothing);

		// Assert

		expect(actual).toBe("Already up to date with Anki.");
	});

	it("Should list due dates moved each way when only due dates changed", () => {
		// Arrange

		const summary = { ...nothing, dueDatesToAnki: 1, dueDatesToAmber: 2 };

		// Act

		const actual = describeAnkiSync(summary);

		// Assert

		expect(actual).toBe(
			"Anki sync finished: 2 due dates from Anki, 1 due date sent to Anki.",
		);
	});

	it("Should list new cards sent to Anki when only new cards went", () => {
		// Arrange

		const summary = { ...nothing, sentCards: 2 };

		// Act

		const actual = describeAnkiSync(summary);

		// Assert

		expect(actual).toBe("Anki sync finished: 2 new cards sent to Anki.");
	});

	it("Should list only what changed when some things did", () => {
		// Arrange

		const summary = { ...nothing, pulledReviews: 3, trashedCards: 1 };

		// Act

		const actual = describeAnkiSync(summary);

		// Assert

		expect(actual).toBe(
			"Anki sync finished: 3 reviews from Anki, 1 card moved to the trash.",
		);
	});

	it("Should count the cards updated from Anki when Anki edits came over", () => {
		// Arrange

		const summary = { ...nothing, editedCards: ["card-1", "card-2"] };

		// Act

		const actual = describeAnkiSync(summary);

		// Assert

		expect(actual).toBe("Anki sync finished: 2 cards updated from Anki.");
	});

	it("Should count the cards updated in Anki when Amber edits went over", () => {
		// Arrange

		const summary = { ...nothing, sentEdits: 1 };

		// Act

		const actual = describeAnkiSync(summary);

		// Assert

		expect(actual).toBe("Anki sync finished: 1 card updated in Anki.");
	});
});
