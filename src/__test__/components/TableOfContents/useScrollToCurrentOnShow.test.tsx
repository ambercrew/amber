import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	scrollCurrentRowToTop,
	useScrollToCurrentOnShow,
} from "../../../components/TableOfContents/useScrollToCurrentOnShow";

function rect(top: number, height: number) {
	return { top, height, bottom: top + height } as DOMRect;
}

/** A 400px scroller whose rows are 20px tall, each `top` px below the scroller's top. */
function Harness({ activeEntryId }: { activeEntryId: string | null }) {
	const containerRef = useRef<HTMLDivElement>(null);
	useScrollToCurrentOnShow(containerRef, activeEntryId);
	return (
		<div data-testid="scroller" style={{ overflowY: "auto" }}>
			<div ref={containerRef}>
				{["0", "1"].map(id => (
					<div
						key={id}
						data-testid={`row-${id}`}
						aria-current={
							id === activeEntryId ? "location" : undefined
						}
					/>
				))}
			</div>
		</div>
	);
}

describe("scrollCurrentRowToTop", () => {
	it("Should scroll the current row to the top of its scroller when it is further down", () => {
		// Arrange

		const scroller = document.createElement("div");
		scroller.style.overflowY = "auto";
		const container = document.createElement("div");
		const row = document.createElement("div");
		row.setAttribute("aria-current", "location");
		container.append(row);
		scroller.append(container);
		scroller.getBoundingClientRect = () => rect(100, 400);
		row.getBoundingClientRect = () => rect(800, 20);
		scroller.scrollTop = 50;

		// Act

		scrollCurrentRowToTop(container);

		// Assert

		expect(scroller.scrollTop).toBe(50 + (800 - 100));
	});

	it("Should scroll to the deepest highlighted heading when the current row is collapsed away", () => {
		// Arrange

		const scroller = document.createElement("div");
		scroller.style.overflowY = "auto";
		const container = document.createElement("div");
		const part = document.createElement("div");
		const chapter = document.createElement("div");
		part.setAttribute("data-active", "true");
		chapter.setAttribute("data-active", "true");
		container.append(part, chapter);
		scroller.append(container);
		scroller.getBoundingClientRect = () => rect(0, 400);
		part.getBoundingClientRect = () => rect(0, 20);
		chapter.getBoundingClientRect = () => rect(600, 20);

		// Act

		scrollCurrentRowToTop(container);

		// Assert

		expect(scroller.scrollTop).toBe(600);
	});
});

describe("useScrollToCurrentOnShow", () => {
	let observed: ((entries: { isIntersecting: boolean }[]) => void)[];

	beforeEach(() => {
		observed = [];
		vi.stubGlobal(
			"IntersectionObserver",
			class {
				constructor(
					callback: (entries: { isIntersecting: boolean }[]) => void,
				) {
					observed.push(callback);
				}
				observe() {
					/* Nothing */
				}
				disconnect() {
					/* Nothing */
				}
			},
		);
		vi.spyOn(window, "requestAnimationFrame").mockImplementation(
			callback => {
				callback(0);
				return 0;
			},
		);
		vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
			function (this: Element) {
				const testId = this.getAttribute("data-testid");
				if (testId === "scroller") return rect(0, 400);
				return rect(testId === "row-1" ? 900 : 0, 20);
			},
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function setVisible(visible: boolean) {
		act(() => {
			observed[observed.length - 1]([{ isIntersecting: visible }]);
		});
	}

	it("Should scroll to the current entry when the table comes into view", () => {
		// Arrange

		const { getByTestId } = render(<Harness activeEntryId="1" />);

		// Act

		setVisible(true);

		// Assert

		expect(getByTestId("scroller").scrollTop).toBe(900);
	});

	it("Should scroll to the current entry when it only arrives after the table is shown", () => {
		// Arrange

		const { getByTestId, rerender } = render(
			<Harness activeEntryId={null} />,
		);
		setVisible(true);

		// Act

		rerender(<Harness activeEntryId="1" />);

		// Assert

		expect(getByTestId("scroller").scrollTop).toBe(900);
	});

	it("Should not scroll when the current entry changes while the table stays shown", () => {
		// Arrange

		const { getByTestId, rerender } = render(<Harness activeEntryId="0" />);
		setVisible(true);
		getByTestId("scroller").scrollTop = 0;

		// Act

		rerender(<Harness activeEntryId="1" />);

		// Assert

		expect(getByTestId("scroller").scrollTop).toBe(0);
	});

	it("Should scroll to it again when the table is hidden and shown again", () => {
		// Arrange

		const { getByTestId, rerender } = render(<Harness activeEntryId="0" />);
		setVisible(true);
		rerender(<Harness activeEntryId="1" />);
		setVisible(false);
		getByTestId("scroller").scrollTop = 0;

		// Act

		setVisible(true);

		// Assert

		expect(getByTestId("scroller").scrollTop).toBe(900);
	});
});
