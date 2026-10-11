import { screen } from "@testing-library/react";
import Editor from "../../../../components/Editor/Editor";
import { OcclusionOverlayProps } from "../../../../components/Editor/plugins/ImagePlugin/imageOcclusionOverlayContext";
import { $createParagraphNode, $getRoot } from "lexical";
import { runHeadless } from "../../../../components/Editor/lexicalJsonConversion";
import { $createImageNode } from "../../../../components/Editor/plugins/ImagePlugin/ImageNode";
import { buildOcclusionCardContents } from "../../../../features/ImageOcclusion/utils/occlusionCardContents";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

const OCCLUSION_ID = "0b6c5e2a-6f1e-4a43-9a7c-3f1d2e4b5a69";

function cardContent(revealed: boolean) {
	const { front, back } = buildOcclusionCardContents({
		requestId: "r",
		occlusionId: OCCLUSION_ID,
		src: `amber-asset:${"0".repeat(64)}`,
		altText: "Heart",
		targetKeys: ["group-1"],
	})["group-1"];
	return revealed ? back : front;
}

function renderCardSide(revealed: boolean) {
	const render = vi.fn(({ target }: OcclusionOverlayProps) => (
		<span>{`masks ${target?.targetKey} revealed=${target?.revealed}`}</span>
	));
	renderWithProviders(
		<Editor
			initialContent={cardContent(revealed)}
			renderOcclusionOverlay={render}
		/>,
	);
	return render;
}

describe("Image occlusion overlay", () => {
	it("Should draw the masks over the card's image when its content holds an occlusion target", async () => {
		// Arrange

		const revealed = false;

		// Act

		const render = renderCardSide(revealed);

		// Assert

		expect(await screen.findByAltText("Heart")).toBeInTheDocument();
		expect(
			screen.getByText("masks group-1 revealed=false"),
		).toBeInTheDocument();
		expect(render).toHaveBeenCalledWith(
			expect.objectContaining({ occlusionId: OCCLUSION_ID }),
		);
	});

	it("Should pass the revealed side through when rendering the card's back", async () => {
		// Arrange

		const revealed = true;

		// Act

		renderCardSide(revealed);

		// Assert

		expect(
			await screen.findByText("masks group-1 revealed=true"),
		).toBeInTheDocument();
	});

	it("Should draw the overlay without a target when the image is the occlusion's source", async () => {
		// Arrange

		const sourceContent = runHeadless(() => {
			$getRoot().append(
				$createParagraphNode().append(
					$createImageNode({
						src: `amber-asset:${"0".repeat(64)}`,
						altText: "Heart",
						occlusionId: OCCLUSION_ID,
					}),
				),
			);
		});
		const render = vi.fn(() => <span>source masks</span>);

		// Act

		renderWithProviders(
			<Editor
				initialContent={sourceContent}
				renderOcclusionOverlay={render}
			/>,
		);

		// Assert

		expect(await screen.findByText("source masks")).toBeInTheDocument();
		expect(render).toHaveBeenCalledWith({
			occlusionId: OCCLUSION_ID,
			target: null,
		});
	});
});
