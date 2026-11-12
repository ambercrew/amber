import { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { computePosition, type Middleware } from "@floating-ui/dom";
import { useFloatingMenuPosition } from "../../../components/FloatingMenuBar/useFloatingMenuPosition";
import { VisibleAreaContext } from "../../../components/FloatingMenuBar/visibleAreaContext";

vi.mock(import("@floating-ui/dom"), async importOriginal => {
	const actual = await importOriginal();
	return { ...actual, computePosition: vi.fn() };
});

function placedAt(y: number, placement: "top" | "bottom") {
	vi.mocked(computePosition).mockResolvedValue({
		x: 10,
		y,
		placement,
		strategy: "absolute",
		middlewareData: {},
	});
}

function flipBoundary() {
	const middleware = vi.mocked(computePosition).mock.lastCall?.[2]
		?.middleware as Middleware[];
	const flip = middleware.find(item => item.name === "flip");
	return (flip?.options as { boundary?: unknown }).boundary;
}

describe("useFloatingMenuPosition", () => {
	let mainArea: HTMLDivElement;
	let visibleArea: HTMLDivElement;
	let reference: HTMLDivElement;
	let floating: HTMLDivElement;

	beforeEach(() => {
		mainArea = document.createElement("div");
		visibleArea = document.createElement("div");
		reference = document.createElement("div");
		floating = document.createElement("div");
		mainArea.append(reference, visibleArea);
		document.body.append(mainArea, floating);
	});

	afterEach(() => {
		mainArea.remove();
		floating.remove();
		vi.mocked(computePosition).mockReset();
	});

	function wrapper({ children }: { children: ReactNode }) {
		return (
			<VisibleAreaContext value={visibleArea}>
				{children}
			</VisibleAreaContext>
		);
	}

	async function renderOpen(onRender = () => {}) {
		const rendered = renderHook(
			() => {
				onRender();
				return useFloatingMenuPosition({
					open: true,
					floating,
					reference,
					placement: "bottom",
				});
			},
			{ wrapper },
		);
		await act(async () => {});
		return rendered;
	}

	it("Should flip against the visible area when the reference is in the main content area", async () => {
		// Arrange

		placedAt(40, "bottom");

		// Act

		await renderOpen();

		// Assert

		expect(flipBoundary()).toBe(visibleArea);
	});

	it("Should flip against its clipping ancestors when the reference is outside the main content area", async () => {
		// Arrange

		placedAt(40, "bottom");
		document.body.append(reference);

		// Act

		await renderOpen();

		// Assert

		expect(flipBoundary()).toBe("clippingAncestors");
	});

	it("Should move the menu without rendering again when the page scrolls", async () => {
		// Arrange

		placedAt(40, "bottom");
		let renders = 0;
		await renderOpen(() => renders++);
		const rendersBeforeScroll = renders;
		placedAt(25, "bottom");

		// Act

		await act(async () => {
			window.dispatchEvent(new Event("scroll"));
		});

		// Assert

		expect(floating.style.top).toBe("25px");
		expect(renders).toBe(rendersBeforeScroll);
	});

	it("Should report the reference hidden when it is scrolled out of view", async () => {
		// Arrange

		vi.mocked(computePosition).mockResolvedValue({
			x: 10,
			y: 40,
			placement: "bottom",
			strategy: "absolute",
			middlewareData: { hide: { referenceHidden: true } },
		});

		// Act

		const { result } = await renderOpen();

		// Assert

		expect(result.current.referenceHidden).toBe(true);
	});

	it("Should report it sits below once Floating UI places it there", async () => {
		// Arrange

		placedAt(40, "bottom");

		// Act

		const { result } = await renderOpen();

		// Assert

		expect(result.current).toMatchObject({ below: true, placed: true });
	});
});
