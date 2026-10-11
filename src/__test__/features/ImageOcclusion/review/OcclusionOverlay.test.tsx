import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import OcclusionOverlay from "../../../../features/ImageOcclusion/review/OcclusionOverlay";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

const { getImageOcclusionMock } = vi.hoisted(() => ({
	getImageOcclusionMock: vi.fn(),
}));

vi.mock("../../../../api/imageOcclusion/api/imageOcclusionApi", () => ({
	getImageOcclusion: getImageOcclusionMock,
}));

describe("OcclusionOverlay", () => {
	it("Should say the occlusion was deleted when the lookup reports it deleted", async () => {
		// Arrange

		getImageOcclusionMock.mockResolvedValue({ status: "deleted" });

		// Act

		renderWithProviders(
			<OcclusionOverlay
				occlusionId="deleted"
				target={{ targetKey: "a", revealed: false }}
			/>,
		);

		// Assert

		expect(
			await screen.findByText("This card's image occlusion was deleted."),
		).toBeInTheDocument();
	});

	it("Should ask to sync when the occlusion isn't on this device yet", async () => {
		// Arrange

		getImageOcclusionMock.mockResolvedValue({ status: "notSynced" });

		// Act

		renderWithProviders(
			<OcclusionOverlay
				occlusionId="not-synced"
				target={{ targetKey: "a", revealed: false }}
			/>,
		);

		// Assert

		expect(
			await screen.findByText(
				"This image occlusion isn't on this device yet. Sync to see it.",
			),
		).toBeInTheDocument();
	});

	it("Should number every mask by its card when shown over the source image", async () => {
		// Arrange

		const mask = (id: string, groupId: string | null) => ({
			kind: "rect" as const,
			id,
			x: 0,
			y: 0,
			width: 0.1,
			height: 0.1,
			rotation: 0,
			fill: "#ffeba2",
			groupId,
		});
		getImageOcclusionMock.mockResolvedValue({
			status: "found",
			occlusion: {
				id: "source",
				name: "Heart",
				imageAssetId: "0".repeat(64),
				imageWidth: 100,
				imageHeight: 50,
				shapes: [mask("a", "g"), mask("b", "g"), mask("c", null)],
				mode: "hideAllGuessOne",
			},
		});

		// Act

		renderWithProviders(
			<OcclusionOverlay occlusionId="source" target={null} />,
		);

		// Assert

		expect(
			await screen.findAllByTestId("occlusion-source-mask"),
		).toHaveLength(3);
		expect(screen.getAllByText("1")).toHaveLength(2);
		expect(screen.getByText("2")).toBeInTheDocument();
	});

	it("Should leave the source image bare when the occlusion isn't on this device yet", async () => {
		// Arrange

		getImageOcclusionMock.mockResolvedValue({ status: "notSynced" });

		// Act

		renderWithProviders(
			<OcclusionOverlay occlusionId="source-missing" target={null} />,
		);

		// Assert

		await vi.waitFor(() =>
			expect(getImageOcclusionMock).toHaveBeenCalledWith(
				"source-missing",
			),
		);
		expect(
			screen.queryByText(
				"This image occlusion isn't on this device yet. Sync to see it.",
			),
		).not.toBeInTheDocument();
	});
});
