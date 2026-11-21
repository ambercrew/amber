import { StrictMode } from "react";
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import SourceRevealProvider from "../../../../../../features/ElementViewer/LearningAssetView/plugins/sourceReveal/SourceRevealProvider";
import {
	ReaderCore,
	ReaderCoreContext,
} from "../../../../../../features/ElementViewer/LearningAssetView/core/readerCoreContext";
import { findLearningAssetHighlight } from "../../../../../../api/elements/api/elementsApi";
import { ReadingPosition } from "../../../../../../types/elements/readingPosition";
import { spotNavigationState } from "../../../../../../types/elements/spotNavigationState";

vi.mock(import("../../../../../../api/elements/api/elementsApi"));

function tree(navigate: ReaderCore["navigate"]) {
	const core = { learningAssetId: "asset-1", navigate } as ReaderCore;
	return (
		<StrictMode>
			<MemoryRouter
				initialEntries={[
					{ pathname: "/", state: spotNavigationState("card-1") },
				]}>
				<ReaderCoreContext value={core}>
					<SourceRevealProvider />
				</ReaderCoreContext>
			</MemoryRouter>
		</StrictMode>
	);
}

describe("SourceRevealProvider", () => {
	it("Should scroll to the highlight's split when navigate changes while the lookup runs", async () => {
		// Arrange

		let resolve: (position: ReadingPosition) => void = () => {};
		vi.mocked(findLearningAssetHighlight).mockReturnValue(
			new Promise(r => (resolve = r)),
		);
		const firstNavigate = vi.fn();
		const latestNavigate = vi.fn();
		const { rerender } = render(tree(firstNavigate));
		rerender(tree(latestNavigate));

		// Act

		await act(async () => resolve({ split: 3, block: 7 }));

		// Assert

		expect(findLearningAssetHighlight).toHaveBeenCalledWith(
			"asset-1",
			"card-1",
		);
		expect(latestNavigate).toHaveBeenCalledWith(3, expect.any(Function));
		expect(firstNavigate).not.toHaveBeenCalled();
	});
});
