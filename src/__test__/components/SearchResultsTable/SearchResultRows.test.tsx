import { useVirtualizer } from "@tanstack/react-virtual";
import { Table } from "@mantine/core";
import { fireEvent, screen } from "@testing-library/react";
import { SearchElementResultDto } from "../../../api/search/dto/searchElementResultDto";
import SearchResultRows from "../../../components/SearchResultsTable/SearchResultRows";
import { renderWithProviders } from "../../test-utils/renderWithProviders";

vi.mock("@tanstack/react-virtual", async importOriginal => ({
	...(await importOriginal<typeof import("@tanstack/react-virtual")>()),
	useVirtualizer: vi.fn(),
}));

const ROW_HEIGHT = 40;

const RESULTS: SearchElementResultDto[] = Array.from(
	{ length: 10 },
	(_, index) => ({
		type: "card",
		id: `card-${index}`,
		name: `Card ${index}`,
		priority: { position: index + 1, total: 10, percentile: index * 10 },
		due: null,
		tags: [],
	}),
);

function mockWindow(firstIndex: number, lastIndex: number) {
	mockRows(
		Array.from(
			{ length: lastIndex - firstIndex + 1 },
			(_, offset) => firstIndex + offset,
		),
	);
}

function mockRows(indexes: number[]) {
	vi.mocked(useVirtualizer).mockReturnValue({
		getVirtualItems: () =>
			indexes.map(index => ({
				index,
				key: `card-${index}`,
				start: index * ROW_HEIGHT,
				end: (index + 1) * ROW_HEIGHT,
			})),
		getTotalSize: () => RESULTS.length * ROW_HEIGHT,
		measureElement: () => undefined,
	} as never);
}

function renderRows(selectable = true) {
	const { container } = renderWithProviders(
		<Table>
			<SearchResultRows
				results={RESULTS}
				selectedKeys={new Set()}
				selectable={selectable}
				onToggle={vi.fn()}
			/>
		</Table>,
	);
	return [...container.querySelectorAll("tbody > tr")] as HTMLElement[];
}

function isSpacer(row: HTMLElement) {
	return row.getAttribute("aria-hidden") === "true";
}

function extractRange() {
	const options = vi.mocked(useVirtualizer).mock.lastCall?.[0];
	return options?.rangeExtractor?.({
		startIndex: 5,
		endIndex: 6,
		overscan: 0,
		count: RESULTS.length,
	});
}

describe("SearchResultRows", () => {
	it("Should stand in for the rows above and below the window when scrolled", () => {
		// Arrange

		mockWindow(3, 5);

		// Act

		const rows = renderRows();

		// Assert

		expect(screen.getAllByRole("link")).toHaveLength(3);
		expect(rows[0].style.height).toBe(`${3 * ROW_HEIGHT}px`);
		expect(rows[rows.length - 1].style.height).toBe(`${4 * ROW_HEIGHT}px`);
	});

	it.each([
		[3, 1],
		[4, 2],
	])(
		"Should keep the stripes of a window starting at index %i when it moves",
		(firstIndex, spacerCount) => {
			// Arrange

			mockWindow(firstIndex, firstIndex + 1);

			// Act

			const rows = renderRows();

			// Assert

			const firstRow = rows.findIndex(row => !isSpacer(row));
			expect(firstRow).toBe(spacerCount);
			expect((firstRow + 1) % 2).toBe((firstIndex + 1) % 2);
		},
	);

	it("Should leave no spacer below the last row when at the end", () => {
		// Arrange

		mockWindow(8, 9);

		// Act

		const rows = renderRows();

		// Assert

		expect(isSpacer(rows[rows.length - 1])).toBe(false);
	});

	it("Should span the spacer across five columns when rows have no checkbox", () => {
		// Arrange

		mockWindow(3, 5);

		// Act

		const rows = renderRows(false);

		// Assert

		expect(rows[0].querySelector("td")?.colSpan).toBe(5);
	});

	it("Should keep a row mounted when it has focus", () => {
		// Arrange

		mockWindow(1, 2);
		renderRows();

		// Act

		fireEvent.focus(screen.getByRole("link", { name: "Card 1" }));

		// Assert

		expect(extractRange()).toEqual([1, 5, 6]);
	});

	it("Should release a row when focus leaves the table", () => {
		// Arrange

		mockWindow(1, 2);
		renderRows();
		const link = screen.getByRole("link", { name: "Card 1" });
		fireEvent.focus(link);

		// Act

		fireEvent.blur(link);

		// Assert

		expect(extractRange()).toEqual([5, 6]);
	});

	it("Should keep a row mounted when focus moves within it", () => {
		// Arrange

		mockWindow(1, 2);
		renderRows();
		const link = screen.getByRole("link", { name: "Card 1" });
		fireEvent.focus(link);

		// Act

		fireEvent.blur(link, {
			relatedTarget: screen.getByRole("checkbox", {
				name: "Select Card 1",
			}),
		});

		// Assert

		expect(extractRange()).toEqual([1, 5, 6]);
	});

	it("Should fill the gap and keep stripes when a kept row is far from the window", () => {
		// Arrange

		mockRows([1, 6, 7]);

		// Act

		const rows = renderRows();

		// Assert

		const gap = rows.find(
			row => row.style.height === `${4 * ROW_HEIGHT}px`,
		);
		expect(gap).toBeDefined();
		rows.forEach((row, position) => {
			if (isSpacer(row)) return;
			expect(position % 2).toBe(Number(row.dataset.index) % 2);
		});
	});

	it("Should number rows after the header when rendered", () => {
		// Arrange

		mockWindow(3, 3);

		// Act

		const rows = renderRows();

		// Assert

		expect(
			rows.find(row => !isSpacer(row))?.getAttribute("aria-rowindex"),
		).toBe("5");
	});
});
