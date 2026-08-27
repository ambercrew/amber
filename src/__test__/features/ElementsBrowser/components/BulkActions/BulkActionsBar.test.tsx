import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BulkActionsBar from "../../../../../features/ElementsBrowser/components/BulkActions/BulkActionsBar";
import {
	finishLearningAssetsBulk,
	unfinishLearningAssetsBulk,
} from "../../../../../api/study/api/studyApi";
import { StudyProfileDto } from "../../../../../api/study/dto/studyProfileDto";
import { BibliographicalSourceResponseDto } from "../../../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { SearchElementResultDto } from "../../../../../api/search/dto/searchElementResultDto";
import { ElementId } from "../../../../../types/elements/elementId";
import { renderWithProviders } from "../../../../test-utils/renderWithProviders";

vi.mock(import("../../../../../api/study/api/studyApi"));

const ELEMENT_ID: ElementId = { type: "learningAsset", id: "asset-1" };

const SELECTED_RESULT: SearchElementResultDto = {
	...ELEMENT_ID,
	name: "Asset one",
	priority: { rank: 1, total: 1, percentage: 100 },
	due: null,
	tags: [],
};

const PROFILE: StudyProfileDto = {
	id: "profile-1",
	createdAt: "2026-01-01T00:00:00.000Z",
	modifiedAt: "2026-01-01T00:00:00.000Z",
	name: "Default profile",
	isDefault: true,
	desiredRetention: 0.9,
	fsrsParams: [],
	initialIntervalMultiplier: 1,
	initialIntervalDays: 1,
	minIntervalDays: 1,
};

const SOURCE: BibliographicalSourceResponseDto = {
	id: "source-1",
	createdAt: "2026-01-01T00:00:00.000Z",
	modifiedAt: "2026-01-01T00:00:00.000Z",
	title: "Some book",
	authors: null,
	publicationDate: null,
	sourceType: "File",
	location: null,
	elementCount: 1,
};

interface RenderProps {
	selectedIds?: ElementId[];
	selectedResults?: SearchElementResultDto[];
}

function render({
	selectedIds = [ELEMENT_ID],
	selectedResults = [SELECTED_RESULT],
}: RenderProps = {}) {
	const onClearSelection = vi.fn();
	const onActionComplete = vi.fn();

	renderWithProviders(
		<BulkActionsBar
			selectedIds={selectedIds}
			selectedResults={selectedResults}
			profiles={[PROFILE]}
			sources={[SOURCE]}
			onClearSelection={onClearSelection}
			onActionComplete={onActionComplete}
		/>,
	);

	return { onClearSelection, onActionComplete };
}

async function openActionsMenu(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("button", { name: "Actions" }));
}

async function openSubmenu(name: string) {
	await userEvent.click(await screen.findByText(name));
}

describe("BulkActionsBar", () => {
	beforeEach(() => {
		vi.mocked(finishLearningAssetsBulk).mockResolvedValue(undefined);
		vi.mocked(unfinishLearningAssetsBulk).mockResolvedValue(undefined);
	});

	it("Should disable the Actions button when no elements are selected", () => {
		// Arrange, Act

		render({ selectedIds: [], selectedResults: [] });

		// Assert

		expect(screen.getByRole("button", { name: "Actions" })).toBeDisabled();
		expect(screen.getByText("No elements selected")).toBeInTheDocument();
	});

	it("Should enable the Actions button and show the selection count when elements are selected", () => {
		// Arrange, Act

		render();

		// Assert

		expect(
			screen.getByRole("button", { name: "Actions" }),
		).not.toBeDisabled();
		expect(screen.getByText("1 selected")).toBeInTheDocument();
	});

	it("Should open the reset repetitions modal when Reset repetitions is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		render();

		// Act

		await openActionsMenu(user);
		await openSubmenu("Reschedule");
		await openSubmenu("Cards");
		fireEvent.click(await screen.findByText("Reset repetitions"));

		// Assert

		expect(
			await screen.findByRole("heading", {
				name: "Reset repetitions",
			}),
		).toBeInTheDocument();
	});

	it("Should open the set due date modal when Set due date is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		render();

		// Act

		await openActionsMenu(user);
		await openSubmenu("Reschedule");
		fireEvent.click(await screen.findByText("Set due date"));

		// Assert

		expect(
			await screen.findByRole("heading", { name: "Set due date" }),
		).toBeInTheDocument();
	});

	it("Should open the set study profile modal when Set study profile is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		render();

		// Act

		await openActionsMenu(user);
		await openSubmenu("Reschedule");
		fireEvent.click(await screen.findByText("Set study profile"));

		// Assert

		expect(
			await screen.findByRole("heading", { name: "Set study profile" }),
		).toBeInTheDocument();
	});

	it("Should open the add tag modal when Add tag is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		render();

		// Act

		await openActionsMenu(user);
		await openSubmenu("Tags");
		fireEvent.click(await screen.findByText("Add tag"));

		// Assert

		expect(
			await screen.findByRole("heading", { name: "Add tag" }),
		).toBeInTheDocument();
	});

	it("Should open the remove tag modal when Remove tag is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		render();

		// Act

		await openActionsMenu(user);
		await openSubmenu("Tags");
		fireEvent.click(await screen.findByText("Remove tag"));

		// Assert

		expect(
			await screen.findByRole("heading", { name: "Remove tag" }),
		).toBeInTheDocument();
	});

	it("Should open the set source modal when Set source is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		render();

		// Act

		await openActionsMenu(user);
		await user.click(await screen.findByText("Set source"));

		// Assert

		expect(
			await screen.findByRole("heading", { name: "Set source" }),
		).toBeInTheDocument();
	});

	it("Should open the delete elements modal when Delete elements is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		render();

		// Act

		await openActionsMenu(user);
		await user.click(await screen.findByText("Delete elements"));

		// Assert

		expect(
			await screen.findByRole("heading", { name: "Delete elements" }),
		).toBeInTheDocument();
	});

	it("Should mark elements as finished and clear the selection when Mark as finished is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onClearSelection, onActionComplete } = render();

		// Act

		await openActionsMenu(user);
		await openSubmenu("Reschedule");
		await openSubmenu("Learning assets/extracts");
		fireEvent.click(await screen.findByText("Mark as finished"));

		// Assert

		await waitFor(() =>
			expect(finishLearningAssetsBulk).toHaveBeenCalledWith([ELEMENT_ID]),
		);
		await waitFor(() => expect(onClearSelection).toHaveBeenCalled());
		expect(onActionComplete).toHaveBeenCalled();
	});

	it("Should unfinish elements and clear the selection when Unfinish is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onClearSelection, onActionComplete } = render();

		// Act

		await openActionsMenu(user);
		await openSubmenu("Reschedule");
		await openSubmenu("Learning assets/extracts");
		fireEvent.click(await screen.findByText("Unfinish"));

		// Assert

		await waitFor(() =>
			expect(unfinishLearningAssetsBulk).toHaveBeenCalledWith([
				ELEMENT_ID,
			]),
		);
		await waitFor(() => expect(onClearSelection).toHaveBeenCalled());
		expect(onActionComplete).toHaveBeenCalled();
	});
});
