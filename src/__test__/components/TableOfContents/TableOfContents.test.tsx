import { act, fireEvent, screen } from "@testing-library/react";
import { vi } from "vitest";
import TableOfContents from "../../../components/TableOfContents/TableOfContents";
import { renderWithProviders } from "../../test-utils/renderWithProviders";

function readExpandedByTable() {
	return JSON.parse(
		localStorage.getItem("table-of-contents-expanded")!,
	) as Record<string, Record<string, boolean>>;
}

describe("TableOfContents", () => {
	it("Should hand the entry back when a selectable entry is clicked", () => {
		// Arrange

		const onSelect = vi.fn();
		const entry = { id: "0", title: "Chapter 1", selectable: true };
		renderWithProviders(
			<TableOfContents
				storageKey="asset-1"
				entries={[entry]}
				onSelect={onSelect}
			/>,
		);

		// Act

		fireEvent.click(screen.getByText("Chapter 1"));

		// Assert

		expect(onSelect).toHaveBeenCalledWith(entry);
	});

	it("Should not select the entry when it has nowhere to jump", () => {
		// Arrange

		const onSelect = vi.fn();
		renderWithProviders(
			<TableOfContents
				storageKey="asset-1"
				entries={[{ id: "0", title: "Part I", selectable: false }]}
				onSelect={onSelect}
			/>,
		);

		// Act

		fireEvent.click(screen.getByText("Part I"));

		// Assert

		expect(onSelect).not.toHaveBeenCalled();
	});

	it("Should expand the heading when an entry with nowhere to jump is clicked", () => {
		// Arrange

		renderWithProviders(
			<TableOfContents
				storageKey="asset-unselectable"
				entries={[
					{
						id: "0",
						title: "Part I",
						selectable: false,
						children: [
							{ id: "0.0", title: "Chapter 1", selectable: true },
						],
					},
				]}
				onSelect={vi.fn()}
			/>,
		);

		// Act

		fireEvent.click(screen.getByText("Part I"));

		// Assert

		expect(screen.getByText("Chapter 1")).toBeInTheDocument();
	});

	it("Should hand the focused entry back when Enter is pressed on it", () => {
		// Arrange

		const onSelect = vi.fn();
		const entry = { id: "0", title: "Chapter 1", selectable: true };
		renderWithProviders(
			<TableOfContents
				storageKey="asset-keyboard"
				entries={[entry]}
				onSelect={onSelect}
			/>,
		);

		// Act

		fireEvent.keyDown(screen.getByRole("treeitem"), { key: "Enter" });

		// Assert

		expect(onSelect).toHaveBeenCalledWith(entry);
	});

	it("Should highlight the current entry and every heading above it when an entry is active", () => {
		// Arrange

		localStorage.setItem(
			"table-of-contents-expanded",
			JSON.stringify({ "asset-highlight": { "0": true, "0.0": true } }),
		);

		// Act

		renderWithProviders(
			<TableOfContents
				storageKey="asset-highlight"
				entries={[
					{
						id: "0",
						title: "Part I",
						selectable: true,
						children: [
							{
								id: "0.0",
								title: "Chapter 1",
								selectable: true,
								children: [
									{
										id: "0.0.0",
										title: "Section 1.1",
										selectable: true,
									},
								],
							},
						],
					},
					{ id: "1", title: "Part II", selectable: true },
				]}
				activeEntryId="0.0.0"
				onSelect={vi.fn()}
			/>,
		);

		// Assert

		const row = (title: string) =>
			screen.getByText(title).closest("[data-value]")!;
		expect(row("Part I")).toHaveAttribute("data-active");
		expect(row("Chapter 1")).toHaveAttribute("data-active");
		expect(row("Section 1.1")).toHaveAttribute("data-active");
		expect(row("Section 1.1")).toHaveAttribute("aria-current", "location");
		expect(row("Chapter 1")).not.toHaveAttribute("aria-current");
		expect(row("Part II")).not.toHaveAttribute("data-active");
	});

	it("Should keep a heading expanded when the table is shown again", async () => {
		// Arrange

		const entries = [
			{
				id: "0",
				title: "Part I",
				selectable: true,
				children: [{ id: "0.0", title: "Chapter 1", selectable: true }],
			},
		];
		const { unmount } = renderWithProviders(
			<TableOfContents
				storageKey="asset-2"
				entries={entries}
				onSelect={vi.fn()}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Expand" }));
		await act(async () => {});
		unmount();

		// Act

		renderWithProviders(
			<TableOfContents
				storageKey="asset-2"
				entries={entries}
				onSelect={vi.fn()}
			/>,
		);

		// Assert

		expect(readExpandedByTable()["asset-2"]).toEqual({ "0": true });
		expect(screen.getByText("Chapter 1")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Collapse" }),
		).toBeInTheDocument();
	});

	it("Should forget the table changed longest ago when more tables are remembered than the limit", async () => {
		// Arrange

		const remembered = Object.fromEntries(
			Array.from({ length: 50 }, (_, index) => [
				`asset-old-${index}`,
				{ "0": true },
			]),
		);
		localStorage.setItem(
			"table-of-contents-expanded",
			JSON.stringify(remembered),
		);
		renderWithProviders(
			<TableOfContents
				storageKey="asset-new"
				entries={[
					{
						id: "0",
						title: "Part I",
						selectable: true,
						children: [
							{ id: "0.0", title: "Chapter 1", selectable: true },
						],
					},
				]}
				onSelect={vi.fn()}
			/>,
		);

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Expand" }));
		await act(async () => {});

		// Assert

		const stored = readExpandedByTable();
		expect(Object.keys(stored)).toHaveLength(50);
		expect(stored).not.toHaveProperty("asset-old-0");
		expect(stored["asset-new"]).toEqual({ "0": true });
	});

	it("Should not mount a heading's children when it has never been expanded", () => {
		// Arrange & Act

		renderWithProviders(
			<TableOfContents
				storageKey="asset-collapsed"
				entries={[
					{
						id: "0",
						title: "Part I",
						selectable: true,
						children: [
							{ id: "0.0", title: "Chapter 1", selectable: true },
						],
					},
				]}
				onSelect={vi.fn()}
			/>,
		);

		// Assert

		expect(screen.queryByText("Chapter 1")).not.toBeInTheDocument();
	});

	const nestedEntries = [
		{
			id: "0",
			title: "Part I",
			selectable: true,
			children: [
				{
					id: "0.0",
					title: "Chapter 1",
					selectable: true,
					children: [
						{ id: "0.0.0", title: "Section 1.1", selectable: true },
					],
				},
			],
		},
	];

	it("Should show every heading and remember it when expanding all", async () => {
		// Arrange

		renderWithProviders(
			<TableOfContents
				storageKey="asset-expand-all"
				entries={nestedEntries}
				onSelect={vi.fn()}
			/>,
		);

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
		await act(async () => {});

		// Assert

		expect(screen.getByText("Section 1.1")).toBeInTheDocument();
		expect(readExpandedByTable()["asset-expand-all"]).toEqual({
			"0": true,
			"0.0": true,
			"0.0.0": true,
		});
	});

	it("Should hide every nested heading when collapsing all", async () => {
		// Arrange

		renderWithProviders(
			<TableOfContents
				storageKey="asset-collapse-all"
				entries={nestedEntries}
				onSelect={vi.fn()}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
		await act(async () => {});

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
		await act(async () => {});

		// Assert

		expect(screen.queryByText("Chapter 1")).not.toBeInTheDocument();
		expect(
			Object.values(readExpandedByTable()["asset-collapse-all"]),
		).not.toContain(true);
	});

	it("Should not offer expanding or collapsing all when no heading has children", () => {
		// Arrange & Act

		renderWithProviders(
			<TableOfContents
				storageKey="asset-flat"
				entries={[{ id: "0", title: "Chapter 1", selectable: true }]}
				onSelect={vi.fn()}
			/>,
		);

		// Assert

		expect(
			screen.queryByRole("button", { name: "Expand all" }),
		).not.toBeInTheDocument();
	});

	it("Should move the highlight to the new entry when the active entry changes", () => {
		// Arrange

		const entries = [
			{ id: "0", title: "Chapter 1", selectable: true },
			{ id: "1", title: "Chapter 2", selectable: true },
		];
		const { rerender } = renderWithProviders(
			<TableOfContents
				storageKey="asset-moving"
				entries={entries}
				activeEntryId="0"
				onSelect={vi.fn()}
			/>,
		);

		// Act

		rerender(
			<TableOfContents
				storageKey="asset-moving"
				entries={entries}
				activeEntryId="1"
				onSelect={vi.fn()}
			/>,
		);

		// Assert

		const row = (title: string) =>
			screen.getByText(title).closest("[data-value]")!;
		expect(row("Chapter 2")).toHaveAttribute("aria-current", "location");
		expect(row("Chapter 1")).not.toHaveAttribute("aria-current");
	});

	it("Should hand the entry to the latest onSelect when the parent passes a new one", () => {
		// Arrange

		const entry = { id: "0", title: "Chapter 1", selectable: true };
		const first = vi.fn();
		const latest = vi.fn();
		const { rerender } = renderWithProviders(
			<TableOfContents
				storageKey="asset-latest"
				entries={[entry]}
				onSelect={first}
			/>,
		);
		rerender(
			<TableOfContents
				storageKey="asset-latest"
				entries={[entry]}
				onSelect={latest}
			/>,
		);

		// Act

		fireEvent.click(screen.getByText("Chapter 1"));

		// Assert

		expect(latest).toHaveBeenCalledWith(entry);
		expect(first).not.toHaveBeenCalled();
	});
});
