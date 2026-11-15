import { flattenTreeData, MantineProvider, TreeNodeData } from "@mantine/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Range } from "@tanstack/react-virtual";
import { ComponentProps, createRef, useMemo } from "react";
import { useRowIndexes } from "../../../components/VirtualTree/useRowIndexes";
import VirtualTree, {
	VirtualTreeHandle,
} from "../../../components/VirtualTree/VirtualTree";

// The shared mock mounts every row, and these tests are about the rows that aren't.
const visible = vi.hoisted(() => ({ startIndex: 0, endIndex: 0 }));

vi.mock("@tanstack/react-virtual", async importOriginal => ({
	...(await importOriginal<typeof import("@tanstack/react-virtual")>()),
	useVirtualizer: ({
		getItemKey,
		rangeExtractor,
	}: {
		getItemKey: (index: number) => string;
		rangeExtractor: (range: Range) => number[];
	}) => ({
		range: visible,
		getVirtualItems: () =>
			rangeExtractor({ ...visible, overscan: 0, count: 6 }).map(
				index => ({
					index,
					key: getItemKey(index),
					start: 0,
					end: 0,
				}),
			),
		getTotalSize: () => 0,
		measureElement: () => undefined,
		scrollToIndex: vi.fn(),
	}),
}));

const DATA: TreeNodeData[] = [
	{
		value: "chapter",
		label: "Chapter",
		children: [
			{ value: "first", label: "First" },
			{ value: "second", label: "Second" },
		],
	},
	{ value: "middle", label: "Middle" },
	{ value: "far", label: "Far" },
	{ value: "farther", label: "Farther" },
];

const ALL_EXPANDED = { chapter: true, first: true, second: true };
const FAR_ROWS = { startIndex: 4, endIndex: 5 };

function createTree() {
	return {
		isNodeLoading: () => false,
		getNodeLoadError: () => null,
		selectedState: [],
		toggleExpanded: vi.fn(),
		expand: vi.fn(),
		collapse: vi.fn(),
	} as unknown as ComponentProps<typeof VirtualTree>["tree"];
}

function Harness({
	tree,
	handle,
	data,
}: {
	tree: ComponentProps<typeof VirtualTree>["tree"];
	handle: React.Ref<VirtualTreeHandle>;
	data: TreeNodeData[];
}) {
	// Kept between renders like the app's, so a rerender alone doesn't change the rows.
	const rows = useMemo(() => flattenTreeData(data, ALL_EXPANDED), [data]);
	return (
		<VirtualTree
			ref={handle}
			rows={rows}
			rowIndexes={useRowIndexes(rows)}
			tree={tree}
			renderNode={({ node, elementProps }) => (
				<div {...elementProps}>
					{node.value}
					<button type="button">{`caret ${node.value}`}</button>
				</div>
			)}
		/>
	);
}

function renderTree(range = FAR_ROWS) {
	Object.assign(visible, range);
	const tree = createTree();
	const handle = createRef<VirtualTreeHandle>();
	const ui = (data: TreeNodeData[]) => (
		<MantineProvider>
			<Harness tree={tree} handle={handle} data={data} />
		</MantineProvider>
	);
	const { rerender } = render(ui(DATA));
	return {
		tree,
		handle,
		rerenderTree: (data = DATA) => rerender(ui(data)),
	};
}

function row(value: string) {
	const item = document.querySelector<HTMLElement>(
		`[role=treeitem][data-value="${value}"]`,
	);
	if (!item) throw new Error(`Row ${value} isn't mounted`);
	return item;
}

function focusKeptRow(
	handle: React.RefObject<VirtualTreeHandle | null>,
	value: string,
) {
	act(() => handle.current?.focusRow(value));
}

describe("VirtualTree", () => {
	it("Should focus the next row when it is unmounted and ArrowDown is pressed", () => {
		// Arrange

		const { handle } = renderTree();
		focusKeptRow(handle, "chapter");

		// Act

		fireEvent.keyDown(row("chapter"), { code: "ArrowDown" });

		// Assert

		expect(row("first")).toHaveFocus();
	});

	it("Should focus the adjacent row when ArrowDown is pressed with a modifier", () => {
		// Arrange

		const { handle } = renderTree();
		focusKeptRow(handle, "chapter");

		// Act

		fireEvent.keyDown(row("chapter"), {
			code: "ArrowDown",
			shiftKey: true,
		});

		// Assert

		expect(row("first")).toHaveFocus();
	});

	it("Should focus the first child when it is unmounted and ArrowRight is pressed", () => {
		// Arrange

		const { handle } = renderTree();
		focusKeptRow(handle, "chapter");

		// Act

		fireEvent.keyDown(row("chapter"), { code: "ArrowRight" });

		// Assert

		expect(row("first")).toHaveFocus();
	});

	it("Should focus the parent when an expanded leaf is left with ArrowLeft", () => {
		// Arrange

		const { handle } = renderTree();
		focusKeptRow(handle, "second");

		// Act

		fireEvent.keyDown(row("second"), { code: "ArrowLeft" });

		// Assert

		expect(row("chapter")).toHaveFocus();
	});

	it("Should collapse the row when it has children and ArrowLeft is pressed", () => {
		// Arrange

		const { tree, handle } = renderTree();
		focusKeptRow(handle, "chapter");

		// Act

		fireEvent.keyDown(row("chapter"), { code: "ArrowLeft" });

		// Assert

		expect(tree.collapse).toHaveBeenCalledWith("chapter");
	});

	it("Should keep the row mounted when a control inside it has focus", () => {
		// Arrange

		const { rerenderTree } = renderTree({ startIndex: 0, endIndex: 1 });
		act(() => screen.getByText("caret chapter").focus());

		// Act

		Object.assign(visible, FAR_ROWS);
		rerenderTree();

		// Assert

		expect(screen.getByText("caret chapter")).toHaveFocus();
	});

	it("Should make the first visible row the tab stop when nothing has focus", () => {
		// Arrange & Act

		renderTree();

		// Assert

		expect(row("far")).toHaveAttribute("tabindex", "0");
		expect(row("farther")).toHaveAttribute("tabindex", "-1");
	});

	it("Should make the focused row the tab stop when it is off screen", () => {
		// Arrange

		const { handle } = renderTree();

		// Act

		focusKeptRow(handle, "chapter");

		// Assert

		expect(row("chapter")).toHaveAttribute("tabindex", "0");
		expect(row("far")).toHaveAttribute("tabindex", "-1");
	});

	it("Should describe each row's place in the tree when rows are mounted", () => {
		// Arrange & Act

		renderTree({ startIndex: 0, endIndex: 5 });

		// Assert

		expect(row("second")).toHaveAttribute("aria-level", "2");
		expect(row("second")).toHaveAttribute("aria-posinset", "2");
		expect(row("second")).toHaveAttribute("aria-setsize", "2");
		expect(row("far")).toHaveAttribute("aria-level", "1");
		expect(row("far")).toHaveAttribute("aria-posinset", "3");
		expect(row("far")).toHaveAttribute("aria-setsize", "4");
	});

	it("Should describe a row's place when it mounts as the tree scrolls", () => {
		// Arrange

		const { handle } = renderTree();

		// Act

		Object.assign(visible, { startIndex: 0, endIndex: 5 });
		// Re-renders the tree from its own state, as scrolling does.
		focusKeptRow(handle, "far");

		// Assert

		expect(row("second")).toHaveAttribute("aria-posinset", "2");
		expect(row("far")).toHaveAttribute("aria-posinset", "3");
	});

	it("Should update a mounted row's place when a row is added before it", () => {
		// Arrange

		const { rerenderTree } = renderTree();
		const added = [...DATA.slice(0, 2), { value: "new", label: "New" }];

		// Act

		rerenderTree([...added, ...DATA.slice(2)]);

		// Assert

		expect(row("far")).toHaveAttribute("aria-posinset", "4");
		expect(row("far")).toHaveAttribute("aria-setsize", "5");
	});
});
