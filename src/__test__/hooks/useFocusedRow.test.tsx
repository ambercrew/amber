import { act, fireEvent, render, screen } from "@testing-library/react";
import { useFocusedRow } from "../../hooks/useFocusedRow";

const ROWS = ["a", "b", "c"];
const UNKNOWN_INDEX = 99;
const VISIBLE_RANGE = { startIndex: 0, endIndex: 0, overscan: 0, count: 3 };

function rowId(row: string) {
	return row;
}

function List() {
	const { focusProps, rangeExtractor } = useFocusedRow(ROWS, rowId);

	return (
		<>
			<output>{rangeExtractor(VISIBLE_RANGE).join(",")}</output>
			<div {...focusProps}>
				{ROWS.map((row, index) => (
					<button key={row} type="button" data-index={index}>
						{row}
					</button>
				))}
				<button type="button" data-index={UNKNOWN_INDEX}>
					unknown
				</button>
			</div>
			<button type="button">outside</button>
		</>
	);
}

function focusButton(name: string) {
	act(() => screen.getByRole("button", { name }).focus());
}

describe("useFocusedRow", () => {
	it("Should keep the row mounted when it has focus", () => {
		// Arrange

		render(<List />);

		// Act

		focusButton("c");

		// Assert

		expect(screen.getByRole("status")).toHaveTextContent("0,2");
	});

	it("Should release the row when focus moves outside the list", () => {
		// Arrange

		render(<List />);
		focusButton("c");

		// Act

		focusButton("outside");

		// Assert

		expect(screen.getByRole("status")).toHaveTextContent(/^0$/);
	});

	it("Should keep the row mounted when the window loses focus", () => {
		// Arrange

		render(<List />);
		focusButton("c");

		// Act

		fireEvent.focusOut(screen.getByRole("button", { name: "c" }), {
			relatedTarget: null,
		});

		// Assert

		expect(screen.getByRole("status")).toHaveTextContent("0,2");
	});

	it("Should release the row when the focused index matches no row", () => {
		// Arrange

		render(<List />);
		focusButton("c");

		// Act

		focusButton("unknown");

		// Assert

		expect(screen.getByRole("status")).toHaveTextContent(/^0$/);
	});
});
