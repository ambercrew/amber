import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SplitSlot from "../../../../features/ElementViewer/LearningAssetView/SplitSlot";

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

vi.mock("../../../../components/Editor/plugins/ReadPointMenu", () => ({
	default: () => null,
}));

function renderSlot(mounted: boolean) {
	return (
		<SplitSlot
			learningAssetId="asset"
			seq={1}
			splitNumber={1}
			isFirst
			mounted={mounted}
			height={100}
			buttons={[]}
			slotRef={vi.fn()}
			observeSplit={vi.fn()}
			registerContentRoot={vi.fn()}
			onContentReady={vi.fn()}
		/>
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
