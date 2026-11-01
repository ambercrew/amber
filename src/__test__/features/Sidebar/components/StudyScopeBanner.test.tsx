import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudyScopeBanner from "../../../../features/Sidebar/components/StudyScopeBanner";
import { listSavedSearches } from "../../../../api/savedSearches/api/savedSearchesApi";
import { getElementName } from "../../../../api/elements/api/elementsApi";
import studyReducer from "../../../../stores/study/studyReducer";
import elementsReducer, {
	setElementName,
} from "../../../../stores/elements/elementsReducer";
import { NodeDto } from "../../../../api/elements/dto/nodeDto";
import { StudyScopeDto } from "../../../../api/study/dto/studyScopeDto";
import { elementStudyScope } from "../../../../utils/studyScope";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { SAVED_SEARCHES_CHANGED } from "../../../../types/events/savedSearchesChangedEvent";

vi.mock(import("../../../../api/savedSearches/api/savedSearchesApi"));
vi.mock(import("../../../../api/elements/api/elementsApi"));

const RUST_ID = "a5d1f0c4-6a8e-4c1e-9d55-0b7c1f5a2e10";

function render(studyScope: StudyScopeDto | null) {
	return renderWithProviders(<StudyScopeBanner />, {
		preloadedState: {
			study: { ...studyReducer(undefined, { type: "" }), studyScope },
		},
	});
}

describe("StudyScopeBanner", () => {
	beforeEach(() => {
		vi.mocked(listSavedSearches).mockResolvedValue([
			{
				id: RUST_ID,
				createdAt: "2026-01-01T00:00:00Z",
				modifiedAt: "2026-01-01T00:00:00Z",
				name: "Rust cards",
				sort: null,
			},
		]);
		vi.mocked(getElementName).mockResolvedValue("Science");
	});

	it("Should render nothing when there is no scope", () => {
		// Arrange, Act

		render(null);

		// Assert

		expect(screen.queryByText("Scoped to")).not.toBeInTheDocument();
	});

	it("Should render nothing when the custom query has no filters", () => {
		// Arrange, Act

		render({ type: "custom", filters: [] });

		// Assert

		expect(screen.queryByText("Scoped to")).not.toBeInTheDocument();
	});

	it("Should hide the banner when the scoped saved search is deleted", async () => {
		// Arrange

		render({ type: "savedSearch", savedSearchId: RUST_ID });
		await screen.findByText("Rust cards");
		vi.mocked(listSavedSearches).mockResolvedValue([]);

		// Act

		act(() => {
			window.dispatchEvent(new Event(SAVED_SEARCHES_CHANGED));
		});

		// Assert

		await waitFor(() => {
			expect(screen.queryByText("Scoped to")).not.toBeInTheDocument();
		});
	});

	it("Should show the saved search's name when the scope is a saved search", async () => {
		// Arrange, Act

		render({ type: "savedSearch", savedSearchId: RUST_ID });

		// Assert

		expect(await screen.findByText("Rust cards")).toBeInTheDocument();
	});

	it("Should describe the filters after custom query when the scope is an element", async () => {
		// Arrange, Act

		render(elementStudyScope({ type: "folder", id: "folder-1" }));

		// Assert

		expect(
			await screen.findByText(
				"Custom query: Is or descendant of Science",
			),
		).toBeInTheDocument();
	});

	it("Should read the ancestor's name from the tree and follow renames without fetching when it is loaded", async () => {
		// Arrange

		const folder: NodeDto = {
			meta: {
				elementId: { type: "folder", id: "folder-1" },
				name: "Physics",
				position: "a0",
			},
			children: {
				folders: [],
				learningAssets: [],
				extracts: [],
				cards: [],
			},
		};
		const { store } = renderWithProviders(<StudyScopeBanner />, {
			preloadedState: {
				study: {
					...studyReducer(undefined, { type: "" }),
					studyScope: elementStudyScope(folder.meta.elementId),
				},
				elements: {
					...elementsReducer(undefined, { type: "" }),
					tree: [folder],
				},
			},
		});
		await screen.findByText("Custom query: Is or descendant of Physics");

		// Act

		act(() => {
			store.dispatch(
				setElementName({
					elementId: folder.meta.elementId,
					name: "Astronomy",
				}),
			);
		});

		// Assert

		expect(
			await screen.findByText(
				"Custom query: Is or descendant of Astronomy",
			),
		).toBeInTheDocument();
		expect(getElementName).not.toHaveBeenCalled();
	});

	it("Should join every filter's description when the custom query has several", async () => {
		// Arrange, Act

		render({
			type: "custom",
			filters: [
				{
					id: "f1",
					field: "name",
					operator: "contains",
					value: "Rust",
				},
				{
					id: "f2",
					field: "tags",
					operator: "isAnyOf",
					tags: ["lang"],
				},
			],
		});

		// Assert

		expect(
			await screen.findByText(
				"Custom query: Name contains Rust and Tags is any of lang",
			),
		).toBeInTheDocument();
	});

	it("Should open the study session settings when the change button is clicked", async () => {
		// Arrange

		const user = userEvent.setup();
		const { store } = render({
			type: "savedSearch",
			savedSearchId: RUST_ID,
		});
		await screen.findByText("Rust cards");

		// Act

		await user.click(
			screen.getByRole("button", { name: "Change study scope" }),
		);

		// Assert

		expect(store.getState().app.studySessionSettingsModalOpened).toBe(true);
	});

	it("Should show the full scope name in a tooltip when the name is hovered", async () => {
		// Arrange

		const user = userEvent.setup();
		render({ type: "savedSearch", savedSearchId: RUST_ID });
		const name = await screen.findByText("Rust cards");

		// Act

		await user.hover(name);

		// Assert

		expect(await screen.findByRole("tooltip")).toHaveTextContent(
			"Rust cards",
		);
	});
});
