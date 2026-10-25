import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SplitSlot from "../../../../features/ElementViewer/LearningAssetView/SplitSlot";
import {
	ReaderCore,
	ReaderCoreContext,
} from "../../../../features/ElementViewer/LearningAssetView/core/readerCoreContext";
import {
	SplitStackContext,
	SplitStackWiring,
} from "../../../../features/ElementViewer/LearningAssetView/core/splitStackContext";

const editorProps = vi.hoisted(() => ({
	current: null as null | {
		initialContent: string;
		onChange: (content: string) => Promise<void>;
	},
}));

vi.mock("../../../../api/elements/api/elementsApi", () => ({
	getLearningAssetSplitContent: vi.fn().mockResolvedValue("original"),
	updateLearningAsset: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../features/ElementViewer/ElementEditor", () => ({
	default: (props: NonNullable<typeof editorProps.current>) => {
		editorProps.current = props;
		return <div data-testid="editor">{props.initialContent}</div>;
	},
}));

function renderSlot(mounted: boolean) {
	const core = {
		learningAssetId: "asset",
		mountedSeqs: new Set(mounted ? [1] : []),
		getHeight: () => 100,
		anchors: { trackCursor: vi.fn(), setMenuAnchor: vi.fn() },
	} as unknown as ReaderCore;
	const wiring: SplitStackWiring = {
		contentWidth: 100,
		containerRef: vi.fn(),
		slotRef: () => vi.fn(),
		observeSplit: () => vi.fn(),
		contentRootRef: () => vi.fn(),
		splitBoxRef: () => vi.fn(),
		notifyContentReady: vi.fn(),
	};
	return (
		<ReaderCoreContext value={core}>
			<SplitStackContext value={wiring}>
				<SplitSlot
					split={{ seq: 1, charCount: 10, blockCount: 1 }}
					index={0}
					buttons={[]}
					plugins={[]}
				/>
			</SplitStackContext>
		</ReaderCoreContext>
	);
}

describe("SplitSlot", () => {
	beforeEach(() => {
		editorProps.current = null;
	});

	it("Should re-mount the editor with the edited content when the split leaves and re-enters the mount window", async () => {
		// Arrange

		const { rerender } = render(renderSlot(true));
		await waitFor(() =>
			expect(editorProps.current?.initialContent).toBe("original"),
		);
		await act(async () => {
			await editorProps.current!.onChange("edited");
		});

		// Act

		rerender(renderSlot(false));
		rerender(renderSlot(true));

		// Assert

		expect(editorProps.current?.initialContent).toBe("edited");
	});
});
