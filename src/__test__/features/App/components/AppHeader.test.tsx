import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppHeader from "../../../../features/App/components/AppHeader";
import CommandPalette from "../../../../commands/CommandPalette";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { AnyElementDto } from "../../../../api/elements/dto/anyElementDto";
import { getDueElements } from "../../../../api/study/api/studyApi";

vi.mock(import("../../../../api/study/api/studyApi.ts"));

vi.mocked(getDueElements).mockResolvedValue([]);

const folderElement: AnyElementDto = {
	type: "folder",
	data: {
		meta: {
			elementId: { type: "folder", id: "folder-science" },
			name: "Science",
			position: "0",
			parent: null,
			tags: [],
			createdAt: "2024-01-01T00:00:00Z",
			modifiedAt: "2024-01-01T00:00:00Z",
			bibliographicalSourceId: null,
			derivedFrom: null,
		},
	},
};

const BASE_STATE = {
	elements: {
		tree: [],
		isLoading: false,
		error: null,
		currentElement: null,
		zoomOwnedByCurrentView: false,
	},
};

describe("AppHeader", () => {
	it("Should show no element name when no element is selected", () => {
		// Arrange & Act

		renderWithProviders(
			<AppHeader onToggleSidebar={vi.fn()} onToggleAside={vi.fn()} />,
			{
				preloadedState: BASE_STATE,
			},
		);

		// Assert

		expect(screen.getAllByRole("button")).toHaveLength(3);
		expect(screen.getByRole("switch")).toBeInTheDocument();
	});

	it("Should show element name when an element is selected", () => {
		// Arrange & Act

		renderWithProviders(
			<AppHeader onToggleSidebar={vi.fn()} onToggleAside={vi.fn()} />,
			{
				preloadedState: {
					elements: {
						...BASE_STATE.elements,
						currentElement: folderElement,
					},
				},
			},
		);

		// Assert

		expect(screen.getByText("Science")).toBeInTheDocument();
	});

	it("Should call onToggleSidebar when sidebar button is clicked", async () => {
		// Arrange

		const onToggleSidebar = vi.fn();
		const user = userEvent.setup();

		// Act

		renderWithProviders(
			<AppHeader
				onToggleSidebar={onToggleSidebar}
				onToggleAside={vi.fn()}
			/>,
			{
				preloadedState: BASE_STATE,
			},
		);
		await user.click(
			screen.getByRole("button", { name: "Toggle left sidebar" }),
		);

		// Assert

		expect(onToggleSidebar).toHaveBeenCalledOnce();
	});

	it("Should call onToggleAside when info sidebar button is clicked", async () => {
		// Arrange

		const onToggleAside = vi.fn();
		const user = userEvent.setup();

		// Act

		renderWithProviders(
			<AppHeader
				onToggleSidebar={vi.fn()}
				onToggleAside={onToggleAside}
			/>,
			{
				preloadedState: BASE_STATE,
			},
		);
		await user.click(
			screen.getByRole("button", { name: "Toggle right sidebar" }),
		);

		// Assert

		expect(onToggleAside).toHaveBeenCalledOnce();
	});

	it("Should open the command palette when the command button is clicked", async () => {
		// Arrange

		const user = userEvent.setup();

		// Act

		renderWithProviders(
			<>
				<AppHeader onToggleSidebar={vi.fn()} onToggleAside={vi.fn()} />
				<CommandPalette />
			</>,
			{ preloadedState: BASE_STATE },
		);
		await user.click(
			screen.getByRole("button", { name: "Open command palette" }),
		);

		// Assert

		expect(
			await screen.findByPlaceholderText("Search commands..."),
		).toBeInTheDocument();
	});
});
