import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import AiPromptDto from "../../api/aiIntegration/dto/aiPromptDto";

export interface AiPromptsState {
	prompts: AiPromptDto[];
	loaded: boolean;
}

const initialState: AiPromptsState = {
	prompts: [],
	loaded: false,
};

// Matches the backend's `ORDER BY name COLLATE NOCASE, created_at`.
function compareByName(a: AiPromptDto, b: AiPromptDto) {
	const nameA = a.name.toLowerCase();
	const nameB = b.name.toLowerCase();
	if (nameA !== nameB) return nameA < nameB ? -1 : 1;
	return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

const aiPromptsSlice = createSlice({
	name: "aiPrompts",
	initialState,
	reducers: {
		setAiPrompts: (state, action: PayloadAction<AiPromptDto[]>) => {
			state.prompts = action.payload;
			state.loaded = true;
		},
		upsertAiPrompt: (state, action: PayloadAction<AiPromptDto>) => {
			const index = state.prompts.findIndex(
				p => p.id === action.payload.id,
			);
			if (index === -1) state.prompts.push(action.payload);
			else state.prompts[index] = action.payload;
			state.prompts.sort(compareByName);
		},
		removeAiPrompt: (state, action: PayloadAction<string>) => {
			state.prompts = state.prompts.filter(p => p.id !== action.payload);
		},
	},
});

export default aiPromptsSlice.reducer;

export const { setAiPrompts, upsertAiPrompt, removeAiPrompt } =
	aiPromptsSlice.actions;
