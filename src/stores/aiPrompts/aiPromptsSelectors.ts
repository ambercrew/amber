import { RootState } from "../store";

export const selectAiPrompts = (state: RootState) => state.aiPrompts.prompts;
export const selectAiPromptsLoaded = (state: RootState) =>
	state.aiPrompts.loaded;
