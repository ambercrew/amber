import { act, fireEvent, screen } from "@testing-library/react";
import ChatInput from "../../../../features/Ai/components/ChatInput";
import AiPromptDto from "../../../../api/aiIntegration/dto/aiPromptDto";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

vi.mock(import("@tauri-apps/plugin-dialog"));

const PROMPTS: AiPromptDto[] = [
	{
		id: "1",
		createdAt: "",
		modifiedAt: "",
		name: "Explain simply",
		content: "Explain this like I'm new to it.",
	},
	{
		id: "2",
		createdAt: "",
		modifiedAt: "",
		name: "Quiz me",
		content: "Quiz me on this.",
	},
	{
		id: "3",
		createdAt: "",
		modifiedAt: "",
		name: "Teach",
		content: "Teach me {topic} at {level} level.",
	},
];

vi.mock(import("../../../../api/aiIntegration/api/aiApi"), () => ({
	listAiPrompts: vi.fn(() => Promise.resolve(PROMPTS)),
}));

const textbox = () => screen.getByRole("textbox");

async function type(value: string) {
	fireEvent.change(textbox(), { target: { value } });
	// Lets the prompt list load.
	await act(async () => {});
}

function renderInput(props: { isStreaming?: boolean; isUploading?: boolean }) {
	const onSend = vi.fn();
	const onStop = vi.fn();
	const onManagePrompts = vi.fn();
	renderWithProviders(
		<ChatInput
			isStreaming={props.isStreaming ?? false}
			isUploading={props.isUploading}
			onSend={onSend}
			onStop={onStop}
			onUpload={vi.fn()}
			onManagePrompts={onManagePrompts}
		/>,
	);
	return { onSend, onStop, onManagePrompts };
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
		fireEvent.change(textbox(), { target: { value: "Hello" } });

		// Act

		fireEvent.keyDown(textbox(), { key: "Enter" });

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

	it("Should list the matching saved prompts when / and part of a name is typed", async () => {
		// Arrange

		renderInput({});

		// Act

		await type("/quiz");

		// Assert

		expect(screen.getByText("Quiz me")).toBeInTheDocument();
		expect(screen.queryByText("Explain simply")).not.toBeInTheDocument();
	});

	it("Should insert the prompt in place of the slash query without sending when Enter picks it", async () => {
		// Arrange

		const { onSend } = renderInput({});
		await type("About photosynthesis: /quiz");

		// Act

		fireEvent.keyDown(textbox(), { key: "Enter" });

		// Assert

		expect(textbox()).toHaveValue("About photosynthesis: Quiz me on this.");
		expect(onSend).not.toHaveBeenCalled();
	});

	it("Should pick the next prompt when ArrowDown is pressed in the list", async () => {
		// Arrange

		renderInput({});
		await type("/");

		// Act

		fireEvent.keyDown(textbox(), { key: "ArrowDown" });
		fireEvent.keyDown(textbox(), { key: "Enter" });

		// Assert

		expect(textbox()).toHaveValue("Quiz me on this.");
	});

	it("Should send the text as typed when Enter is pressed after Escape hid the list", async () => {
		// Arrange

		const { onSend } = renderInput({});
		await type("/quiz");

		// Act

		fireEvent.keyDown(textbox(), { key: "Escape" });
		fireEvent.keyDown(textbox(), { key: "Enter" });

		// Assert

		expect(onSend).toHaveBeenCalledWith("/quiz");
	});

	it("Should open the prompt library when Manage prompts is picked with the arrow keys", async () => {
		// Arrange

		const { onManagePrompts } = renderInput({});
		await type("/quiz");

		// Act

		fireEvent.keyDown(textbox(), { key: "ArrowDown" });
		fireEvent.keyDown(textbox(), { key: "Enter" });

		// Assert

		expect(onManagePrompts).toHaveBeenCalledTimes(1);
		expect(textbox()).toHaveValue("/quiz");
	});

	it("Should keep the text as typed when Shift+Tab is pressed in the list", async () => {
		// Arrange

		renderInput({});
		await type("/quiz");

		// Act

		fireEvent.keyDown(textbox(), { key: "Tab", shiftKey: true });

		// Assert

		expect(textbox()).toHaveValue("/quiz");
	});

	it("Should send the text as typed when Enter is pressed and no prompt matches", async () => {
		// Arrange

		const { onSend, onManagePrompts } = renderInput({});
		await type("/nothing");

		// Act

		fireEvent.keyDown(textbox(), { key: "Enter" });

		// Assert

		expect(onSend).toHaveBeenCalledWith("/nothing");
		expect(onManagePrompts).not.toHaveBeenCalled();
	});

	it("Should select the first placeholder when a prompt with placeholders is inserted", async () => {
		// Arrange

		renderInput({});
		await type("/teach");

		// Act

		fireEvent.keyDown(textbox(), { key: "Enter" });

		// Assert

		const textarea = textbox() as HTMLTextAreaElement;
		expect(
			textarea.value.slice(
				textarea.selectionStart,
				textarea.selectionEnd,
			),
		).toBe("{topic}");
	});

	it("Should select the next placeholder when Tab is pressed", async () => {
		// Arrange

		renderInput({});
		await type("/teach");
		fireEvent.keyDown(textbox(), { key: "Enter" });

		// Act

		fireEvent.keyDown(textbox(), { key: "Tab" });

		// Assert

		const textarea = textbox() as HTMLTextAreaElement;
		expect(
			textarea.value.slice(
				textarea.selectionStart,
				textarea.selectionEnd,
			),
		).toBe("{level}");
	});

	it("Should leave Tab to the browser when no placeholder follows the caret", async () => {
		// Arrange

		renderInput({});
		await type("No placeholders here");

		// Act

		const notPrevented = fireEvent.keyDown(textbox(), { key: "Tab" });

		// Assert

		expect(notPrevented).toBe(true);
	});

	it("Should select the previous placeholder when Shift+Tab is pressed", async () => {
		// Arrange

		renderInput({});
		await type("/teach");
		fireEvent.keyDown(textbox(), { key: "Enter" });
		fireEvent.keyDown(textbox(), { key: "Tab" });

		// Act

		fireEvent.keyDown(textbox(), { key: "Tab", shiftKey: true });

		// Assert

		const textarea = textbox() as HTMLTextAreaElement;
		expect(
			textarea.value.slice(
				textarea.selectionStart,
				textarea.selectionEnd,
			),
		).toBe("{topic}");
	});
});
