import { useVirtualizer } from "@tanstack/react-virtual";
import { fireEvent, screen } from "@testing-library/react";
import { TrashedElementDto } from "../../../../api/trash/dto/trashedElementDto";
import TrashList from "../../../../features/Sidebar/components/TrashList";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

vi.mock("@tanstack/react-virtual", async importOriginal => ({
	...(await importOriginal<typeof import("@tanstack/react-virtual")>()),
	useVirtualizer: vi.fn(),
}));

const ROW_HEIGHT = 50;

const ITEMS: TrashedElementDto[] = Array.from({ length: 10 }, (_, index) => ({
	elementId: { type: "card", id: `card-${index}` },
	name: `Card ${index}`,
	trashedAt: new Date().toISOString(),
	descendantCount: 0,
}));

function mockRows(indexes: number[]) {
	vi.mocked(useVirtualizer).mockReturnValue({
		getVirtualItems: () =>
			indexes.map(index => ({
				index,
				key: `card-${index}`,
				start: index * ROW_HEIGHT,
				end: (index + 1) * ROW_HEIGHT,
			})),
		getTotalSize: () => ITEMS.length * ROW_HEIGHT,
		measureElement: () => undefined,
	} as never);
}

function renderList() {
	renderWithProviders(
		<TrashList items={ITEMS} retentionDays={30} onDelete={vi.fn()} />,
	);
}

function extractRange() {
	const options = vi.mocked(useVirtualizer).mock.lastCall?.[0];
	return options?.rangeExtractor?.({
		startIndex: 5,
		endIndex: 6,
		overscan: 0,
		count: ITEMS.length,
	});
}

describe("TrashList", () => {
	it("Should mount only the rows the virtualizer returns when the trash is long", () => {
		// Arrange

		mockRows([3, 4]);

		// Act

		renderList();

		// Assert

		expect(screen.getByText("Card 3")).toBeInTheDocument();
		expect(screen.getByText("Card 4")).toBeInTheDocument();
		expect(screen.queryByText("Card 0")).not.toBeInTheDocument();
	});

	it("Should keep a row mounted when one of its buttons has focus", () => {
		// Arrange

		mockRows([1]);
		renderList();

		// Act

		fireEvent.focus(screen.getByRole("button", { name: "Restore" }));

		// Assert

		expect(extractRange()).toEqual([1, 5, 6]);
	});
});
