import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import MessageBubble from "../../../../features/Ai/components/MessageBubble";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

function renderMessageBubble(contextSnippets?: string[]) {
	return renderWithProviders(
		<MessageBubble
			id="message-1"
			content={{ type: "human", value: "What does this mean?" }}
			contextSnippets={contextSnippets}
		/>,
	);
}

describe("MessageBubble", () => {
	it("Should render a collapsed context toggle when the human message has context snippets", () => {
		// Arrange

		// Act

		renderMessageBubble(["Selected passage one", "Selected passage two"]);

		// Assert

		expect(screen.getByText("2 snippets")).toBeInTheDocument();
		expect(
			screen.queryByText("Selected passage one"),
		).not.toBeInTheDocument();
	});

	it("Should show each context snippet with its own heading when expanded", async () => {
		// Arrange

		renderMessageBubble(["Selected passage one", "Selected passage two"]);

		// Act

		fireEvent.click(screen.getByText("2 snippets"));

		// Assert

		await waitFor(() => {
			expect(screen.getByText("Snippet 1")).toBeInTheDocument();
			expect(
				screen.getByText("Selected passage one"),
			).toBeInTheDocument();
			expect(screen.getByText("Snippet 2")).toBeInTheDocument();
			expect(
				screen.getByText("Selected passage two"),
			).toBeInTheDocument();
		});
	});

	it("Should not render the context toggle when the human message has no context snippets", () => {
		// Arrange

		// Act

		renderMessageBubble([]);

		// Assert

		expect(screen.queryByText(/context snippet/)).not.toBeInTheDocument();
	});

	it("Should copy the message text when the copy button is clicked", async () => {
		// Arrange

		const writeText = vi.fn(() => Promise.resolve());
		Object.defineProperty(navigator, "clipboard", {
			value: { writeText },
			configurable: true,
		});
		renderWithProviders(
			<MessageBubble
				id="message-1"
				content={{
					type: "assistant",
					value: "Photosynthesis makes sugar.",
				}}
			/>,
		);

		// Act

		await act(async () => {
			fireEvent.click(screen.getByLabelText("Copy message"));
		});

		// Assert

		expect(writeText).toHaveBeenCalledWith("Photosynthesis makes sugar.");
	});

	it("Should not show the copy button when the reply is still streaming", () => {
		// Arrange

		// Act

		renderWithProviders(
			<MessageBubble
				id="message-1"
				content={{ type: "assistant", value: "Photosynth" }}
				isStreaming
			/>,
		);

		// Assert

		expect(screen.queryByLabelText("Copy message")).not.toBeInTheDocument();
	});

	it("Should show the copy button only when the message is hovered", () => {
		// Arrange

		renderWithProviders(
			<MessageBubble
				id="message-1"
				content={{
					type: "assistant",
					value: "Photosynthesis makes sugar.",
				}}
			/>,
		);
		const button = screen.getByLabelText("Copy message");
		const hidden = getComputedStyle(button.parentElement!).opacity;

		// Act

		// `mouseenter` doesn't bubble, so it's fired on the message's own container.
		fireEvent.mouseEnter(button.parentElement!.parentElement!);

		// Assert

		expect(hidden).toBe("0");
		expect(button.parentElement).toHaveStyle({ opacity: "1" });
	});

	it("Should branch the chat when the branch button is clicked", () => {
		// Arrange

		const onBranch = vi.fn();
		renderWithProviders(
			<MessageBubble
				id="message-1"
				content={{ type: "human", value: "What does this mean?" }}
				onBranch={onBranch}
			/>,
		);

		// Act

		fireEvent.click(screen.getByLabelText("Branch in new chat"));

		// Assert

		expect(onBranch).toHaveBeenCalledTimes(1);
	});

	it("Should not show the branch button when the message can't be branched", () => {
		// Arrange

		// Act

		renderMessageBubble();

		// Assert

		expect(
			screen.queryByLabelText("Branch in new chat"),
		).not.toBeInTheDocument();
	});
});
