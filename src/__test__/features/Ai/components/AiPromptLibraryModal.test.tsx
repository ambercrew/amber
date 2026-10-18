import { act, fireEvent, screen } from "@testing-library/react";
import AiPromptLibraryModal from "../../../../features/Ai/components/AiPromptLibraryModal";
import AiPromptDto from "../../../../api/aiIntegration/dto/aiPromptDto";
import AiPromptRequestDto from "../../../../api/aiIntegration/dto/aiPromptRequestDto";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";
import { openAiPromptLibraryModal } from "../../../../stores/app/appReducer";

const api = vi.hoisted(() => ({ prompts: [] as AiPromptDto[] }));

vi.mock(import("../../../../api/aiIntegration/api/aiApi"), () => ({
	listAiPrompts: vi.fn(() => Promise.resolve([...api.prompts])),
	createAiPrompt: vi.fn(({ name, content }: AiPromptRequestDto) => {
		const prompt = {
			id: name,
			createdAt: "",
			modifiedAt: "",
			name,
			content,
		};
		api.prompts.push(prompt);
		return Promise.resolve(prompt);
	}),
	deleteAiPrompt: vi.fn((id: string) => {
		api.prompts = api.prompts.filter(prompt => prompt.id !== id);
		return Promise.resolve();
	}),
}));

async function renderModal(newPrompt = false) {
	const { store } = renderWithProviders(<AiPromptLibraryModal />);
	act(() => {
		store.dispatch(openAiPromptLibraryModal({ newPrompt }));
	});
	await act(async () => {});
	return store;
}

describe("AiPromptLibraryModal", () => {
	beforeEach(() => {
		api.prompts = [];
	});

	it("Should list the new prompt when one is saved", async () => {
		// Arrange

		await renderModal();
		fireEvent.click(screen.getByRole("button", { name: "New prompt" }));
		fireEvent.change(screen.getByLabelText("Name"), {
			target: { value: "Quiz me" },
		});
		fireEvent.change(screen.getByLabelText("Prompt"), {
			target: { value: "Quiz me on this." },
		});

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await act(async () => {});

		// Assert

		expect(screen.getByText("Quiz me")).toBeInTheDocument();
		expect(screen.getByText("Quiz me on this.")).toBeInTheDocument();
	});

	it("Should keep Save disabled when the prompt has no text", async () => {
		// Arrange

		await renderModal();
		fireEvent.click(screen.getByRole("button", { name: "New prompt" }));

		// Act

		fireEvent.change(screen.getByLabelText("Name"), {
			target: { value: "Quiz me" },
		});

		// Assert

		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
	});

	it("Should remove the prompt when its deletion is confirmed", async () => {
		// Arrange

		api.prompts = [
			{
				id: "1",
				createdAt: "",
				modifiedAt: "",
				name: "Quiz me",
				content: "Quiz me on this.",
			},
		];
		await renderModal();
		fireEvent.click(screen.getByRole("button", { name: "Delete Quiz me" }));

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Delete" }));
		await act(async () => {});

		// Assert

		expect(screen.queryByText("Quiz me")).not.toBeInTheDocument();
		expect(screen.getByText("No saved prompts yet.")).toBeInTheDocument();
	});

	it("Should keep the prompt when its deletion is cancelled", async () => {
		// Arrange

		api.prompts = [
			{
				id: "1",
				createdAt: "",
				modifiedAt: "",
				name: "Quiz me",
				content: "Quiz me on this.",
			},
		];
		await renderModal();
		fireEvent.click(screen.getByRole("button", { name: "Delete Quiz me" }));

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		await act(async () => {});

		// Assert

		expect(api.prompts).toHaveLength(1);
		expect(screen.getByText("Quiz me")).toBeInTheDocument();
	});

	it("Should focus the New prompt button when opened on the list", async () => {
		// Arrange & Act

		await renderModal();

		// Assert

		expect(
			screen.getByRole("button", { name: "New prompt" }),
		).toHaveFocus();
	});

	it("Should open on a blank new prompt when opened to add one", async () => {
		// Arrange & Act

		await renderModal(true);

		// Assert

		expect(screen.getByLabelText("Name")).toHaveValue("");
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
	});

	it("Should start a blank new prompt when one is asked for while the list is open", async () => {
		// Arrange

		const store = await renderModal(true);
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		// Act

		act(() => {
			store.dispatch(openAiPromptLibraryModal({ newPrompt: true }));
		});

		// Assert

		expect(screen.getByLabelText("Name")).toHaveValue("");
	});

	it("Should show the prompt list when Cancel is clicked on a new prompt", async () => {
		// Arrange

		const store = await renderModal(true);

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		// Assert

		expect(store.getState().app.aiPromptLibraryModalOpened).toBe(true);
		expect(
			screen.getByRole("button", { name: "New prompt" }),
		).toBeInTheDocument();
	});
});
