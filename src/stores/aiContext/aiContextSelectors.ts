import { RootState } from "../store";

export const selectAiContextSnippets = (state: RootState) => state.ai.snippets;

export const selectPendingAiPrompt = (state: RootState) =>
	state.ai.pendingPrompt;

export const selectPendingAiPromptElementId = (state: RootState) =>
	state.ai.pendingPromptElementId;
