import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StudyScopeSettings from "../../../../features/Study/components/StudyScopeSettings";
import { StudyScopeDto } from "../../../../api/study/dto/studyScopeDto";
import { SavedSearchResponseDto } from "../../../../api/savedSearches/dto/savedSearchResponseDto";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

const RUST: SavedSearchResponseDto = {
	id: "a5d1f0c4-6a8e-4c1e-9d55-0b7c1f5a2e10",
	createdAt: "2026-01-01T00:00:00Z",
	modifiedAt: "2026-01-01T00:00:00Z",
	name: "Rust cards",
	sort: null,
};

function render(value: StudyScopeDto | null, disabled = false) {
	const onChange = vi.fn();

	renderWithProviders(
		<StudyScopeSettings
			value={value}
			onChange={onChange}
			savedSearches={[RUST]}
			onSavedSearchCreated={vi.fn()}
			disabled={disabled}
		/>,
	);

	return { onChange };
}

describe("StudyScopeSettings", () => {
	beforeEach(() => window.localStorage.clear());

	it("Should show everything when there is no scope", () => {
		// Arrange, Act

		render(null);

		// Assert

		expect(screen.getByDisplayValue("Everything")).toBeInTheDocument();
	});

	it("Should select the saved search when it is chosen", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render(null);

		// Act

		await user.click(
			screen.getByLabelText("Study scope", { selector: "input" }),
		);
		await user.click(
			await screen.findByRole("option", { name: "Rust cards" }),
		);

		// Assert

		expect(onChange).toHaveBeenCalledWith({
			type: "savedSearch",
			savedSearchId: RUST.id,
		});
	});

	it("Should clear the scope when everything is chosen", async () => {
		// Arrange

		const user = userEvent.setup();
		const { onChange } = render({
			type: "savedSearch",
			savedSearchId: RUST.id,
		});

		// Act

		await user.click(
			screen.getByLabelText("Study scope", { selector: "input" }),
		);
		await user.click(
			await screen.findByRole("option", { name: "Everything" }),
		);

		// Assert

		expect(onChange).toHaveBeenCalledWith(null);
	});

	it("Should offer to edit the query when the scope is a custom query", () => {
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
			],
		});

		// Assert

		expect(
			screen.getByRole("button", { name: "Edit query" }),
		).toBeInTheDocument();
		expect(
			screen.getByDisplayValue("Custom query: Name contains Rust"),
		).toBeInTheDocument();
	});

	it("Should lock the scope when a study session is running", () => {
		// Arrange, Act

		render(null, true);

		// Assert

		expect(
			screen.getByLabelText("Study scope", { selector: "input" }),
		).toBeDisabled();
		expect(
			screen.getByRole("button", { name: "New query…" }),
		).toBeDisabled();
	});

	it("Should apply a recent query when it is chosen from the dropdown", async () => {
		// Arrange

		const user = userEvent.setup();
		const recent = [
			{
				id: "f1",
				field: "name" as const,
				operator: "contains" as const,
				value: "Rust",
			},
		];
		window.localStorage.setItem(
			"study.recent-custom-queries",
			JSON.stringify([recent]),
		);
		const { onChange } = render(null);

		// Act

		await user.click(
			screen.getByLabelText("Study scope", { selector: "input" }),
		);
		await user.click(
			await screen.findByRole("option", {
				name: "Custom query: Name contains Rust",
			}),
		);

		// Assert

		expect(onChange).toHaveBeenCalledWith({
			type: "custom",
			filters: recent,
		});
	});
});
