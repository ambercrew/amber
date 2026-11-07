import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrollToCurrentOnShow } from "../../../components/TableOfContents/useScrollToCurrentOnShow";

function Harness({
	activeEntryId,
	scrollToCurrent,
}: {
	activeEntryId: string | null;
	scrollToCurrent: () => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const targetRef = useRef({ scrollToCurrent });
	useScrollToCurrentOnShow(containerRef, targetRef, activeEntryId);
	return <div ref={containerRef} />;
}

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

		const scrollToCurrent = vi.fn();
		render(<Harness activeEntryId="1" scrollToCurrent={scrollToCurrent} />);

		// Act

		setVisible(true);

		// Assert

		expect(scrollToCurrent).toHaveBeenCalledOnce();
	});

	it("Should scroll to the current entry when it only arrives after the table is shown", () => {
		// Arrange

		const scrollToCurrent = vi.fn();
		const { rerender } = render(
			<Harness activeEntryId={null} scrollToCurrent={scrollToCurrent} />,
		);
		setVisible(true);

		// Act

		rerender(
			<Harness activeEntryId="1" scrollToCurrent={scrollToCurrent} />,
		);

		// Assert

		expect(scrollToCurrent).toHaveBeenCalledOnce();
	});

	it("Should not scroll when the current entry changes while the table stays shown", () => {
		// Arrange

		const scrollToCurrent = vi.fn();
		const { rerender } = render(
			<Harness activeEntryId="0" scrollToCurrent={scrollToCurrent} />,
		);
		setVisible(true);
		scrollToCurrent.mockClear();

		// Act

		rerender(
			<Harness activeEntryId="1" scrollToCurrent={scrollToCurrent} />,
		);

		// Assert

		expect(scrollToCurrent).not.toHaveBeenCalled();
	});

	it("Should scroll to it again when the table is hidden and shown again", () => {
		// Arrange

		const scrollToCurrent = vi.fn();
		render(<Harness activeEntryId="0" scrollToCurrent={scrollToCurrent} />);
		setVisible(true);
		setVisible(false);
		scrollToCurrent.mockClear();

		// Act

		setVisible(true);

		// Assert

		expect(scrollToCurrent).toHaveBeenCalledOnce();
	});
});
