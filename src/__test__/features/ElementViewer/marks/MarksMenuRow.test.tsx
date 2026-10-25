import { fireEvent, screen, within } from "@testing-library/react";
import { Menu } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MarksMenuRow from "../../../../features/ElementViewer/marks/MarksMenuRow";
import { MarksContext } from "../../../../features/ElementViewer/marks/marksContext";
import { LearningAssetMark } from "../../../../types/elements/learningAssetMark";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

const { runCommandMock } = vi.hoisted(() => ({ runCommandMock: vi.fn() }));

vi.mock("../../../../commands/useRunCommand", () => ({
	useRunCommand: () => runCommandMock,
}));

function renderRow(marks: LearningAssetMark[]) {
	renderWithProviders(
		<MarksContext value={{ marks, progressOf: () => 0.5 }}>
			<Menu opened>
				<Menu.Target>
					<button type="button">open</button>
				</Menu.Target>
				<Menu.Dropdown>
					<MarksMenuRow />
				</Menu.Dropdown>
			</Menu>
		</MarksContext>,
	);
}

describe("MarksMenuRow", () => {
	beforeEach(() => {
		runCommandMock.mockClear();
	});

	it("Should label each slot's group when rendered", () => {
		// Arrange

		const marks: LearningAssetMark[] = [];

		// Act

		renderRow(marks);

		// Assert

		expect(screen.getByRole("group", { name: "Mark 1" })).toBeTruthy();
		expect(screen.getByRole("group", { name: "Mark 2" })).toBeTruthy();
		expect(screen.getByRole("group", { name: "Mark 3" })).toBeTruthy();
	});

	it("Should offer only setting a mark when it's unset", () => {
		// Arrange

		const marks: LearningAssetMark[] = [];

		// Act

		renderRow(marks);

		// Assert

		const group = screen.getByRole("group", { name: "Mark 2" });
		const buttons = within(group).getAllByRole("button");
		expect(
			buttons.map(button => button.getAttribute("aria-label")),
		).toEqual(["Set mark 2 here"]);
	});

	it("Should offer to go to a set mark with its position when it's set", () => {
		// Arrange

		const marks: LearningAssetMark[] = [
			{ slot: 2, anchor: { split: 1, block: 0 } },
		];

		// Act

		renderRow(marks);

		// Assert

		const goTo = screen.getByRole("button", {
			name: "Go to mark 2 (50% through)",
		});
		expect(goTo).toBeTruthy();
	});

	it("Should run the set command when an unset mark's button is clicked", () => {
		// Arrange

		renderRow([]);

		// Act

		fireEvent.click(
			screen.getByRole("button", { name: "Set mark 3 here" }),
		);

		// Assert

		expect(runCommandMock).toHaveBeenCalledWith("set-mark-3");
	});

	it("Should run the go-to command when a set mark's number is clicked", () => {
		// Arrange

		renderRow([{ slot: 1, anchor: { split: 0, block: 0 } }]);

		// Act

		fireEvent.click(
			screen.getByRole("button", {
				name: "Go to mark 1 (50% through)",
			}),
		);

		// Assert

		expect(runCommandMock).toHaveBeenCalledWith("go-to-mark-1");
	});

	it("Should show where a set mark is in both halves' tooltips when they're hovered", async () => {
		// Arrange

		renderRow([{ slot: 1, anchor: { split: 0, block: 0 } }]);

		// Act

		fireEvent.mouseEnter(
			screen.getByRole("button", { name: "Go to mark 1 (50% through)" }),
		);
		fireEvent.mouseEnter(
			screen.getByRole("button", {
				name: "Move mark 1 here (now 50% through)",
			}),
		);

		// Assert

		expect(
			await screen.findByRole("tooltip", {
				name: /Go to mark 1 \(50% through\)/,
			}),
		).toBeTruthy();
		expect(
			await screen.findByRole("tooltip", {
				name: /Move mark 1 here \(now 50% through\)/,
			}),
		).toBeTruthy();
	});
});
