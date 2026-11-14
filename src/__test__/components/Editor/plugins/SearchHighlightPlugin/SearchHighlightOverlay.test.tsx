import { act, render } from "@testing-library/react";
import SearchHighlightOverlay from "../../../../../components/Editor/plugins/SearchHighlightPlugin/SearchHighlightOverlay";
import { searchHighlightHostProps } from "../../../../../components/Editor/plugins/SearchHighlightPlugin/searchHighlightHost";
import { searchHighlightRegistry } from "../../../../../components/Editor/plugins/SearchHighlightPlugin/searchHighlightRegistry";

function rect(top: number, left: number, width = 20, height = 10): DOMRect {
	return {
		top,
		left,
		right: left + width,
		bottom: top + height,
		width,
		height,
		x: left,
		y: top,
		toJSON: () => ({}),
	};
}

/** A match over `container`'s text, reporting one client rect at `top`/`left`. */
function rangeIn(container: HTMLElement, top: number, left: number): Range {
	const range = document.createRange();
	range.selectNodeContents(container.firstChild!);
	// jsdom has no layout, so the range reports a fixed rect.
	range.getClientRects = () => [rect(top, left)] as unknown as DOMRectList;
	return range;
}

function paragraph(parent: HTMLElement) {
	const element = document.createElement("p");
	element.textContent = "needle";
	parent.appendChild(element);
	return element;
}

describe("SearchHighlightOverlay", () => {
	beforeEach(() => {
		vi.spyOn(window, "requestAnimationFrame").mockImplementation(
			callback => {
				callback(0);
				return 0;
			},
		);
	});

	afterEach(() => {
		act(() => searchHighlightRegistry.clearAll());
		document.body.innerHTML = "";
		vi.restoreAllMocks();
	});

	it("Should paint a match inside its host's layer relative to the layer when the range is in a host", () => {
		// Arrange

		const host = document.createElement("div");
		for (const [name, value] of Object.entries(searchHighlightHostProps))
			host.setAttribute(name, String(value));
		const content = document.createElement("div");
		host.appendChild(content);
		document.body.appendChild(host);
		const range = rangeIn(paragraph(content), 150, 40);
		vi.spyOn(
			HTMLElement.prototype,
			"getBoundingClientRect",
		).mockReturnValue(rect(100, 10, 0, 0));
		render(<SearchHighlightOverlay />);

		// Act

		act(() => searchHighlightRegistry.setAll("editor", [range]));

		// Assert

		const layer = host.lastElementChild as HTMLElement;
		expect(layer).not.toBe(content);
		const box = layer.firstElementChild as HTMLElement;
		expect(box.style.position).toBe("absolute");
		expect(box.style.top).toBe("50px");
		expect(box.style.left).toBe("30px");
	});

	it("Should paint a match fixed to the viewport when the range has no host", () => {
		// Arrange

		const range = rangeIn(paragraph(document.body), 150, 40);
		const { container } = render(<SearchHighlightOverlay />);

		// Act

		act(() => searchHighlightRegistry.setAll("editor", [range]));

		// Assert

		const box = container.querySelector<HTMLElement>(
			"[aria-hidden] > div",
		)!;
		expect(box.style.position).toBe("fixed");
		expect(box.style.top).toBe("150px");
		expect(box.style.left).toBe("40px");
	});

	it("Should remove the host's layer when the matches are cleared", () => {
		// Arrange

		const host = document.createElement("div");
		for (const [name, value] of Object.entries(searchHighlightHostProps))
			host.setAttribute(name, String(value));
		const content = document.createElement("div");
		host.appendChild(content);
		document.body.appendChild(host);
		render(<SearchHighlightOverlay />);
		act(() =>
			searchHighlightRegistry.setAll("editor", [
				rangeIn(paragraph(content), 150, 40),
			]),
		);

		// Act

		act(() => searchHighlightRegistry.clearAll());

		// Assert

		expect(host.children).toHaveLength(1);
		expect(host.firstElementChild).toBe(content);
	});
});
