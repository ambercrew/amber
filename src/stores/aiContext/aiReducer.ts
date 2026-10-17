import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface AiContextSnippet {
	id: string;
	text: string;
}

export interface AiContextState {
	snippets: AiContextSnippet[];
	/** Asked from outside the chat (e.g. the editor's menu); the AI panel sends it once shown. */
	pendingPrompt: string | null;
}

const initialState: AiContextState = {
	snippets: [],
	pendingPrompt: null,
};

const aiSlice = createSlice({
	name: "aiContext",
	initialState,
	reducers: {
		addAiContextSnippet: (state, action: PayloadAction<string>) => {
			state.snippets.push({
				id: crypto.randomUUID(),
				text: action.payload,
			});
		},
		removeAiContextSnippet: (state, action: PayloadAction<string>) => {
			state.snippets = state.snippets.filter(
				snippet => snippet.id !== action.payload,
			);
		},
		requestAiPrompt: (state, action: PayloadAction<string>) => {
			state.pendingPrompt = action.payload;
		},
		clearPendingAiPrompt: state => {
			state.pendingPrompt = null;
		},
		clearAiContextSnippets: state => {
			state.snippets = [];
		},
		restoreAiContextSnippets: (
			state,
			action: PayloadAction<AiContextSnippet[]>,
		) => {
			state.snippets = [...action.payload, ...state.snippets];
		},
	},
});

export default aiSlice.reducer;

export const {
	addAiContextSnippet,
	removeAiContextSnippet,
	requestAiPrompt,
	clearPendingAiPrompt,
	clearAiContextSnippets,
	restoreAiContextSnippets,
} = aiSlice.actions;
