import { fireEvent, screen } from "@testing-library/react";
import AiMarkdown from "../../../../features/Ai/components/AiMarkdown";
import { getElementName } from "../../../../api/elements/api/elementsApi";
import {
	LOCATION_DISPLAY_TEST_ID,
	renderWithProviders,
} from "../../../test-utils/renderWithProviders";

vi.mock(import("../../../../api/elements/api/elementsApi"));

describe("AiMarkdown", () => {
	beforeEach(() => vi.resetAllMocks());

	it("Should link to the element by its name when the markdown references one", async () => {
		// Arrange

		vi.mocked(getElementName).mockResolvedValue("Geography");

		// Act

		renderWithProviders(
			<AiMarkdown markdown='In <element-ref data-type="folder" data-id="f-1"></element-ref> **now**' />,
		);
		fireEvent.click(await screen.findByRole("link", { name: "Geography" }));

		// Assert

		expect(getElementName).toHaveBeenCalledWith({
			type: "folder",
			id: "f-1",
		});
		expect(screen.getByText("now").tagName).toBe("STRONG");
		expect(screen.getByTestId(LOCATION_DISPLAY_TEST_ID)).toHaveTextContent(
			"/folder/f-1",
		);
	});

	it("Should show a missing element when the referenced element can't be found", async () => {
		// Arrange

		vi.mocked(getElementName).mockRejectedValue("Not found");

		// Act

		renderWithProviders(
			<AiMarkdown markdown='<element-ref data-type="card" data-id="c-1"></element-ref>' />,
		);

		// Assert

		expect(await screen.findByText("Missing element")).toBeInTheDocument();
	});

	it("Should leave the reference out when its type is unknown", () => {
		// Arrange

		// Act

		renderWithProviders(
			<AiMarkdown markdown='See <element-ref data-type="bogus" data-id="x"></element-ref>' />,
		);

		// Assert

		expect(screen.queryByRole("link")).not.toBeInTheDocument();
		expect(getElementName).not.toHaveBeenCalled();
	});
});
