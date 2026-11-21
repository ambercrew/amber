import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContentOriginPanel from "../../../../features/ElementViewer/components/ContentOriginPanel";
import { MetaResponseDto } from "../../../../api/elements/dto/anyElementDto";
import { paths } from "../../../../paths";
import { spotNavigationState } from "../../../../types/elements/spotNavigationState";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock(import("react-router"), async importOriginal => ({
	...(await importOriginal()),
	useNavigate: () => navigate,
}));

describe("ContentOriginPanel", () => {
	it("Should open the source at this element's highlight when the Derived from link is clicked", async () => {
		// Arrange

		const meta = {
			elementId: { type: "card", id: "card-1" },
			derivedFrom: { type: "learningAsset", id: "asset-1" },
		} as MetaResponseDto;
		const user = userEvent.setup();
		renderWithProviders(<ContentOriginPanel meta={meta} />);
		await user.click(screen.getByText("Origin"));

		// Act

		await user.click(screen.getByText("…"));

		// Assert

		expect(navigate).toHaveBeenCalledWith(
			paths.element("learningAsset", "asset-1"),
			{ state: spotNavigationState("card-1") },
		);
	});
});
