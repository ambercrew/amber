import { fireEvent, screen } from "@testing-library/react";
import AnkiSyncReviewModal from "../../../../features/AnkiSync/components/AnkiSyncReviewModal";
import { setAnkiSyncReview } from "../../../../stores/ankiSync/ankiSyncReducer";
import { setupStore } from "../../../../stores/store";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

vi.mock("../../../../api/ankiSync/api/ankiSyncApi");

const preview = {
	profile: "User 1",
	isFirstSync: false,
	decks: [
		{ name: "Spanish", newCards: 3, import: null },
		{ name: "French", newCards: 2, import: false },
	],
	sendingDecks: [{ name: "Biology::Cells", newCards: 4 }],
	cardsToUpdate: 0,
	cardsEditedInAnki: 0,
	reviewsToAnki: 0,
	reviewsToAmber: 0,
	dueDatesToAnki: 0,
	dueDatesToAmber: 0,
	notesToDelete: 0,
	cardsToTrash: 0,
};

function renderModal(review = preview, missedCloudSync = false) {
	const store = setupStore();
	store.dispatch(
		setAnkiSyncReview({
			status: "ready",
			preview: review,
			missedCloudSync,
		}),
	);
	return renderWithProviders(<AnkiSyncReviewModal />, { store });
}

describe("AnkiSyncReviewModal", () => {
	it("Should show both directions with their decks when cards go each way", () => {
		// Act

		renderModal();

		// Assert

		expect(screen.getByText("From Anki to Amber")).toBeInTheDocument();
		expect(screen.getByText("From Amber to Anki")).toBeInTheDocument();
		expect(screen.getByLabelText("Spanish")).toBeChecked();
		expect(screen.getByLabelText("French")).not.toBeChecked();
		expect(screen.getByText("Biology::Cells")).toBeInTheDocument();
		expect(screen.getByText("3 new cards")).toBeInTheDocument();
		expect(screen.getByText("(4 new cards)")).toBeInTheDocument();
	});

	it("Should warn that decks may be imported twice when Amber couldn't sync first", () => {
		// Act

		renderModal(preview, true);

		// Assert

		expect(
			screen.getByText("Amber couldn’t sync first"),
		).toBeInTheDocument();
	});

	it("Should not warn about importing twice when Amber synced first", () => {
		// Act

		renderModal(preview, false);

		// Assert

		expect(
			screen.queryByText("Amber couldn’t sync first"),
		).not.toBeInTheDocument();
	});

	it("Should drop the warning about importing twice when no deck is ticked", () => {
		// Arrange

		renderModal(preview, true);

		// Act

		fireEvent.click(screen.getByLabelText("Spanish"));

		// Assert

		expect(
			screen.queryByText("Amber couldn’t sync first"),
		).not.toBeInTheDocument();
	});

	it("Should tick a deck for import when it is clicked", () => {
		// Arrange

		renderModal();

		// Act

		fireEvent.click(screen.getByLabelText("French"));

		// Assert

		expect(screen.getByLabelText("French")).toBeChecked();
	});

	it("Should show how many cards go to Anki as updates when Amber changed some", () => {
		// Act

		renderModal({ ...preview, cardsToUpdate: 2 });

		// Assert

		expect(
			screen.getByText(
				"2 cards changed in Amber will be updated in Anki.",
			),
		).toBeInTheDocument();
	});

	it("Should show how many cards come back to Amber when they were edited in Anki", () => {
		// Act

		renderModal({ ...preview, cardsEditedInAnki: 1 });

		// Assert

		expect(
			screen.getByText("1 card edited in Anki will be updated in Amber."),
		).toBeInTheDocument();
	});

	it("Should say nothing is new when neither app has new cards", () => {
		// Act

		renderModal({ ...preview, decks: [], sendingDecks: [] });

		// Assert

		expect(screen.getByText("No new cards in Anki.")).toBeInTheDocument();
		expect(screen.getByText("No new cards in Amber.")).toBeInTheDocument();
	});

	it("Should leave out that nothing is new when only edits come from Anki", () => {
		// Act

		renderModal({
			...preview,
			decks: [],
			sendingDecks: [],
			cardsEditedInAnki: 3,
		});

		// Assert

		expect(
			screen.queryByText("No new cards in Anki."),
		).not.toBeInTheDocument();
		expect(
			screen.getByText(
				"3 cards edited in Anki will be updated in Amber.",
			),
		).toBeInTheDocument();
	});

	it("Should show how many reviews go each way when either app has reviews the other lacks", () => {
		// Act

		renderModal({ ...preview, reviewsToAnki: 1, reviewsToAmber: 12 });

		// Assert

		expect(
			screen.getByText("1 review done in Amber will be added to Anki."),
		).toBeInTheDocument();
		expect(
			screen.getByText("12 reviews done in Anki will be added to Amber."),
		).toBeInTheDocument();
	});

	it("Should show how many due dates move each way when only due dates changed", () => {
		// Act

		renderModal({
			...preview,
			decks: [],
			sendingDecks: [],
			dueDatesToAnki: 2,
			dueDatesToAmber: 1,
		});

		// Assert

		expect(
			screen.getByText(
				"2 due dates changed in Amber will be moved in Anki.",
			),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				"1 due date changed in Anki will be moved in Amber.",
			),
		).toBeInTheDocument();
		expect(
			screen.queryByText("No new cards in Anki."),
		).not.toBeInTheDocument();
	});

	it("Should show a loader when the preview is still loading", () => {
		// Arrange

		const store = setupStore();
		store.dispatch(setAnkiSyncReview({ status: "loading" }));

		// Act

		renderWithProviders(<AnkiSyncReviewModal />, { store });

		// Assert

		expect(
			screen.getByText("Comparing Amber with Anki…"),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Sync" }),
		).not.toBeInTheDocument();
	});

	it("Should show the error when the preview failed", () => {
		// Arrange

		const store = setupStore();
		store.dispatch(
			setAnkiSyncReview({ status: "failed", error: "Anki isn't open" }),
		);

		// Act

		renderWithProviders(<AnkiSyncReviewModal />, { store });

		// Assert

		expect(screen.getByText("Anki isn't open")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Try again" }),
		).toBeInTheDocument();
	});
});
