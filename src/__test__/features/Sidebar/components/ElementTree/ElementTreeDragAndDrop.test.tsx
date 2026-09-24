import { TreeNodeData } from "@mantine/core";
import { fireEvent, screen } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { NodeDto } from "../../../../../api/elements/dto/nodeDto";
import ElementTree from "../../../../../features/Sidebar/components/ElementTree/ElementTree";
import {
	getDropPosition,
	isValidDropTarget,
	MOVE_THRESHOLD_PX,
} from "../../../../../features/Sidebar/hooks/useElementTreeDragAndDrop";
import { moveElementAction } from "../../../../../stores/elements/elementsActions";
import {
	LOCATION_DISPLAY_TEST_ID,
	renderWithProviders,
} from "../../../../test-utils/renderWithProviders";

vi.mock(import("../../../../../stores/elements/elementsActions"));
vi.mock(
	import("../../../../../features/Sidebar/components/ElementTree/ElementTreeMenuItems"),
	() => ({ default: () => <></> }),
);
vi.mock(
	import("../../../../../features/Sidebar/components/TrashElementModal"),
	() => ({ default: () => <></> }),
);
vi.mock(
	import("../../../../../features/Sidebar/components/ElementTree/RenameElementForm"),
	() => ({ default: () => <></> }),
);

function makeNode(
	id: NodeDto["meta"]["elementId"],
	name: string,
	children: Partial<NodeDto["children"]> = {},
): NodeDto {
	return {
		meta: { elementId: id, name, position: "0" },
		children: {
			folders: [],
			learningAssets: [],
			extracts: [],
			cards: [],
			...children,
		},
	};
}

const TREE: NodeDto[] = [
	makeNode({ type: "folder", id: "folder-science" }, "Science", {
		learningAssets: [
			makeNode(
				{ type: "learningAsset", id: "learningAsset-biology" },
				"Biology Basics",
			),
		],
	}),
	makeNode({ type: "folder", id: "folder-art" }, "Art", {
		extracts: [
			makeNode(
				{ type: "extract", id: "extract-impressionism" },
				"Impressionism",
			),
		],
	}),
];

describe("getDropPosition", () => {
	const rect = { top: 100, height: 100 };

	it("Should return before when a childless node is hovered in its top half", () => {
		// Arrange

		const clientY = 120;

		// Act

		const actual = getDropPosition(clientY, rect, false, false);

		// Assert

		expect(actual).toBe("before");
	});

	it("Should return after when a childless node is hovered in its bottom half", () => {
		// Arrange

		const clientY = 180;

		// Act

		const actual = getDropPosition(clientY, rect, false, false);

		// Assert

		expect(actual).toBe("after");
	});

	it("Should return inside when an expanded parent is hovered in its bottom half", () => {
		// Arrange

		const clientY = 180;

		// Act

		const actual = getDropPosition(clientY, rect, true, true);

		// Assert

		expect(actual).toBe("inside");
	});

	it("Should return before when an expanded parent is hovered in its top half", () => {
		// Arrange

		const clientY = 120;

		// Act

		const actual = getDropPosition(clientY, rect, true, true);

		// Assert

		expect(actual).toBe("before");
	});

	it("Should return before, inside and after when hovering a collapsed parent", () => {
		// Arrange

		// Act

		const before = getDropPosition(110, rect, true, false);
		const inside = getDropPosition(150, rect, true, false);
		const after = getDropPosition(190, rect, true, false);

		// Assert

		expect([before, inside, after]).toEqual(["before", "inside", "after"]);
	});
});

describe("isValidDropTarget", () => {
	const data: TreeNodeData[] = [
		{
			value: "a",
			label: "a",
			children: [
				{
					value: "a1",
					label: "a1",
					children: [{ value: "a1x", label: "a1x" }],
				},
				{ value: "a2", label: "a2" },
			],
		},
		{ value: "b", label: "b" },
	];

	it("Should reject the dragged node itself", () => {
		// Arrange

		// Act

		const actual = isValidDropTarget(data, "a", "a");

		// Assert

		expect(actual).toBe(false);
	});

	it("Should reject a descendant of the dragged node", () => {
		// Arrange

		// Act

		const actual = isValidDropTarget(data, "a", "a1x");

		// Assert

		expect(actual).toBe(false);
	});

	it("Should accept a node in another branch", () => {
		// Arrange

		// Act

		const actual = isValidDropTarget(data, "a", "b");

		// Assert

		expect(actual).toBe(true);
	});

	it("Should accept a sibling of the dragged node", () => {
		// Arrange

		// Act

		const actual = isValidDropTarget(data, "a1", "a2");

		// Assert

		expect(actual).toBe(true);
	});

	it("Should accept an ancestor of the dragged node", () => {
		// Arrange

		// Act

		const actual = isValidDropTarget(data, "a1x", "a1");

		// Assert

		expect(actual).toBe(true);
	});

	it("Should accept a root node with no ancestors when dragging another branch onto it", () => {
		// Arrange

		// Act

		const actual = isValidDropTarget(data, "b", "a");

		// Assert

		expect(actual).toBe(true);
	});
});

describe("ElementTree pointer drag and drop", () => {
	beforeEach(() => {
		vi.mocked(listen).mockResolvedValue(() => {
			/* Empty */
		});
		vi.mocked(moveElementAction).mockReturnValue(() => Promise.resolve());
	});

	function labelFor(name: string): HTMLElement {
		return screen
			.getByLabelText(name)
			.closest<HTMLElement>("[data-tree-label]")!;
	}

	function stubRect(element: HTMLElement, top: number, height: number) {
		vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
			top,
			bottom: top + height,
			left: 0,
			right: 100,
			width: 100,
			height,
			x: 0,
			y: top,
			toJSON: () => ({}),
		});
	}

	function drag(
		source: HTMLElement,
		target: HTMLElement,
		targetClientY: number,
	) {
		const elementsFromPoint = vi.fn().mockReturnValue([target]);
		Object.defineProperty(document, "elementsFromPoint", {
			configurable: true,
			value: elementsFromPoint,
		});

		fireEvent.pointerDown(source, {
			button: 0,
			isPrimary: true,
			pointerType: "mouse",
			clientX: 10,
			clientY: 10,
		});
		fireEvent.pointerMove(document, {
			clientX: 10,
			clientY: 10 + MOVE_THRESHOLD_PX + 1,
		});
		fireEvent.pointerMove(document, {
			clientX: 10,
			clientY: targetClientY,
		});
	}

	function render() {
		return renderWithProviders(<ElementTree tree={TREE} />);
	}

	it("Should dispatch a move when a node is dragged onto another branch", () => {
		// Arrange

		render();
		fireEvent.click(screen.getAllByRole("button", { name: "Expand" })[0]);
		const source = labelFor("Biology Basics");
		const target = labelFor("Art");
		stubRect(target, 0, 100);

		// Act — drop in Art's middle, which resolves to "inside".

		drag(source, target, 50);
		const overPosition = target.getAttribute("data-drag-over");
		fireEvent.pointerUp(document);

		// Assert

		expect(overPosition).toBe("inside");
		expect(moveElementAction).toHaveBeenCalledWith({
			draggedId: { type: "learningAsset", id: "learningAsset-biology" },
			targetId: { type: "folder", id: "folder-art" },
			position: "inside",
		});
	});

	it("Should not dispatch a move when the target is a descendant of the dragged node", () => {
		// Arrange

		render();
		fireEvent.click(screen.getAllByRole("button", { name: "Expand" })[0]);
		const source = labelFor("Science");
		const target = labelFor("Biology Basics");
		stubRect(target, 0, 100);

		// Act

		drag(source, target, 50);
		fireEvent.pointerUp(document);

		// Assert

		expect(moveElementAction).not.toHaveBeenCalled();
	});

	it("Should swallow the click that follows a drag instead of navigating", () => {
		// Arrange

		render();
		fireEvent.click(screen.getAllByRole("button", { name: "Expand" })[0]);
		const source = labelFor("Biology Basics");
		const target = labelFor("Art");
		stubRect(target, 0, 100);

		// Act

		drag(source, target, 50);
		fireEvent.pointerUp(document);
		fireEvent.click(source);

		// Assert

		expect(screen.getByTestId(LOCATION_DISPLAY_TEST_ID)).toHaveTextContent(
			"/",
		);
	});

	it("Should cancel the drag when Escape is pressed", () => {
		// Arrange

		render();
		fireEvent.click(screen.getAllByRole("button", { name: "Expand" })[0]);
		const source = labelFor("Biology Basics");
		const target = labelFor("Art");
		stubRect(target, 0, 100);

		// Act

		drag(source, target, 50);
		fireEvent.keyDown(window, { key: "Escape" });
		fireEvent.pointerUp(document);

		// Assert

		expect(moveElementAction).not.toHaveBeenCalled();
		expect(target).not.toHaveAttribute("data-drag-over");
	});
});
