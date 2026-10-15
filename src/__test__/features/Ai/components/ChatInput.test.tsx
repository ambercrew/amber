import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import ChatInput from "../../../../features/Ai/components/ChatInput";

vi.mock(import("@tauri-apps/plugin-dialog"));

function renderInput(props: { isStreaming?: boolean; isUploading?: boolean }) {
	const onSend = vi.fn();
	const onStop = vi.fn();
	render(
		<MantineProvider env="test">
			<ChatInput
				isStreaming={props.isStreaming ?? false}
				isUploading={props.isUploading}
				onSend={onSend}
				onStop={onStop}
				onUpload={vi.fn()}
			/>
		</MantineProvider>,
	);
	return { onSend, onStop };
}

describe("ChatInput", () => {
	it("Should show the send button when idle", () => {
		// Arrange

		const props = {};

		// Act

		renderInput(props);

		// Assert

		expect(screen.getByLabelText("Send message")).toBeInTheDocument();
	});

	it("Should stop the upload when the stop button is clicked while uploading", () => {
		// Arrange

		const { onStop } = renderInput({ isUploading: true });

		// Act

		fireEvent.click(screen.getByLabelText("Stop upload"));

		// Assert

		expect(onStop).toHaveBeenCalledTimes(1);
	});

	it("Should stop the generation when the stop button is clicked while streaming", () => {
		// Arrange

		const { onStop } = renderInput({ isStreaming: true });

		// Act

		fireEvent.click(screen.getByLabelText("Stop generation"));

		// Assert

		expect(onStop).toHaveBeenCalledTimes(1);
	});

	it("Should not send the prompt when Enter is pressed while uploading", () => {
		// Arrange

		const { onSend } = renderInput({ isUploading: true });
		const textarea = screen.getByPlaceholderText("Ask a question…");
		fireEvent.change(textarea, { target: { value: "Hello" } });

		// Act

		fireEvent.keyDown(textarea, { key: "Enter" });

		// Assert

		expect(onSend).not.toHaveBeenCalled();
	});

	it("Should disable the upload button when a reply is streaming", () => {
		// Arrange

		const props = { isStreaming: true };

		// Act

		renderInput(props);

		// Assert

		expect(screen.getByLabelText("Upload document")).toBeDisabled();
	});
});
