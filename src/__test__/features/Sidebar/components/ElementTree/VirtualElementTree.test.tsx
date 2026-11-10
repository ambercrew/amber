import { flattenTreeData, MantineProvider, TreeNodeData } from "@mantine/core";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { ComponentProps } from "react";
import VirtualElementTree from "../../../../../features/Sidebar/components/ElementTree/VirtualElementTree";

const DATA: TreeNodeData[] = [
	{
		value: "folder",
		label: "Folder",
		hasChildren: true,
		children: [{ value: "child", label: "Child", hasChildren: true }],
	},
	{ value: "other", label: "Other", hasChildren: true },
];

const ROW_TOP = 0;
const ROW_HEIGHT = 40;

function renderTree(onMove = vi.fn(), expandedState = { folder: true }) {
	const tree = {
		isNodeLoading: () => false,
		getNodeLoadError: () => null,
		selectedState: [],
		toggleExpanded: vi.fn(),
		expand: vi.fn(),
		collapse: vi.fn(),
	} as unknown as ComponentProps<typeof VirtualElementTree>["tree"];
	render(
		<MantineProvider>
			<VirtualElementTree
				rows={flattenTreeData(DATA, expandedState)}
				tree={tree}
				selectedValue={null}
				renamingValue={null}
				onMove={onMove}
				renderNode={({ node, elementProps }) => (
					<div {...elementProps} draggable>
						{node.value}
					</div>
				)}
			/>
		</MantineProvider>,
	);
	return onMove;
}

function dragEvent(
	target: HTMLElement,
	type: "dragOver" | "dragStart" | "drop",
	clientY = 0,
) {
	const event = createEvent[type](target);
	Object.assign(event, {
		clientY,
		dataTransfer: { setData: vi.fn(), effectAllowed: "", dropEffect: "" },
	});
	fireEvent(target, event);
}

function hoverAt(label: HTMLElement, fraction: number) {
	label.getBoundingClientRect = () =>
		({ top: ROW_TOP, height: ROW_HEIGHT }) as DOMRect;
	dragEvent(label, "dragOver", ROW_TOP + ROW_HEIGHT * fraction);
}

describe("VirtualElementTree", () => {
	it("Should move the element when it is dropped on another row", () => {
		// Arrange

		const onMove = renderTree();
		const other = screen.getByText("other");

		// Act

		dragEvent(screen.getByText("child"), "dragStart");
		hoverAt(other, 0.1);
		dragEvent(other, "drop");

		// Assert

		expect(onMove).toHaveBeenCalledExactlyOnceWith({
			draggedNode: "child",
			targetNode: "other",
			position: "before",
		});
	});

	it("Should offer dropping inside when hovering the middle of a collapsed row", () => {
		// Arrange

		renderTree();
		const other = screen.getByText("other");

		// Act

		dragEvent(screen.getByText("child"), "dragStart");
		hoverAt(other, 0.5);

		// Assert

		expect(other).toHaveAttribute("data-drag-over", "inside");
	});

	it("Should offer dropping after when hovering the bottom of a collapsed row", () => {
		// Arrange

		renderTree();
		const other = screen.getByText("other");

		// Act

		dragEvent(screen.getByText("child"), "dragStart");
		hoverAt(other, 0.9);

		// Assert

		expect(other).toHaveAttribute("data-drag-over", "after");
	});

	it("Should offer dropping inside when hovering the bottom of an expanded row", () => {
		// Arrange

		renderTree();
		const folder = screen.getByText("folder");

		// Act

		dragEvent(screen.getByText("other"), "dragStart");
		hoverAt(folder, 0.9);

		// Assert

		expect(folder).toHaveAttribute("data-drag-over", "inside");
	});

	it("Should refuse a drop when the target is inside the dragged element", () => {
		// Arrange

		const onMove = renderTree();
		const child = screen.getByText("child");

		// Act

		dragEvent(screen.getByText("folder"), "dragStart");
		hoverAt(child, 0.5);
		dragEvent(child, "drop");

		// Assert

		expect(child).not.toHaveAttribute("data-drag-over");
		expect(onMove).not.toHaveBeenCalled();
	});

	it("Should clear the drag marks when the drag ends", () => {
		// Arrange

		renderTree();
		const child = screen.getByText("child");
		const other = screen.getByText("other");
		dragEvent(child, "dragStart");
		hoverAt(other, 0.5);

		// Act

		fireEvent.dragEnd(child);

		// Assert

		expect(other).not.toHaveAttribute("data-drag-over");
		expect(child.closest("[role=treeitem]")).not.toHaveAttribute(
			"data-dragging",
		);
	});
});
