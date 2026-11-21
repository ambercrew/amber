import { PropsWithChildren } from "react";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useOpeningReadPointSource } from "../../../../features/ElementViewer/readPoint/useOpeningReadPointSource";
import { ReadPointSource } from "../../../../types/elements/readPointSource";
import { spotNavigationState } from "../../../../types/elements/spotNavigationState";

function renderOpening(
	state: unknown,
	resumeSource: ReadPointSource | undefined,
	underReview: boolean,
) {
	function Wrapper({ children }: PropsWithChildren) {
		return (
			<MemoryRouter initialEntries={[{ pathname: "/", state }]}>
				{children}
			</MemoryRouter>
		);
	}
	return renderHook(
		() => useOpeningReadPointSource(resumeSource, underReview),
		{ wrapper: Wrapper },
	).result.current;
}

describe("useOpeningReadPointSource", () => {
	it("Should open as a lookup when opened at a spot outside its review", () => {
		// Arrange & Act

		const actual = renderOpening(
			spotNavigationState("card-1"),
			undefined,
			false,
		);

		// Assert

		expect(actual).toBe("lookup");
	});

	it("Should keep tracking when opened at a spot while under review", () => {
		// Arrange & Act

		const actual = renderOpening(spotNavigationState(), undefined, true);

		// Assert

		expect(actual).toBeUndefined();
	});

	it("Should keep tracking when opened plainly", () => {
		// Arrange & Act

		const actual = renderOpening(null, undefined, false);

		// Assert

		expect(actual).toBeUndefined();
	});

	it("Should keep the review's own precedence when resuming it", () => {
		// Arrange & Act

		const actual = renderOpening(spotNavigationState(), "extract", false);

		// Assert

		expect(actual).toBe("extract");
	});
});
