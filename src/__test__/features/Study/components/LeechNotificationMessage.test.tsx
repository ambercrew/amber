import { fireEvent, screen } from "@testing-library/react";
import LeechNotificationMessage from "../../../../features/Study/components/LeechNotificationMessage";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

describe("LeechNotificationMessage", () => {
	it("Should offer to rewrite the card when the AI is on", () => {
		// Arrange

		const onRewrite = vi.fn();
		renderWithProviders(
			<LeechNotificationMessage
				lapses={8}
				suspended
				onRewrite={onRewrite}
				onOpen={vi.fn()}
			/>,
		);

		// Act

		fireEvent.click(
			screen.getByRole("button", { name: "Rewrite with AI" }),
		);

		// Assert

		expect(onRewrite).toHaveBeenCalledOnce();
		expect(
			screen.getByText(/forgotten this card 8 times/),
		).toHaveTextContent("tagged leech and suspended");
	});

	it("Should only offer to open the card when the AI is off", () => {
		// Arrange & Act

		renderWithProviders(
			<LeechNotificationMessage
				lapses={8}
				suspended={false}
				onRewrite={null}
				onOpen={vi.fn()}
			/>,
		);

		// Assert

		expect(
			screen.queryByRole("button", { name: "Rewrite with AI" }),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Open card" }),
		).toBeInTheDocument();
	});
});
