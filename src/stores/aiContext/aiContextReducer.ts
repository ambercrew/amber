import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { ElementId } from "../../types/elements/elementId";

export interface AiContextSnippet {
	id: string;
	text: string;
}

export interface AiContextState {
	snippets: AiContextSnippet[];
	/** Asked from outside the chat (e.g. the editor's menu); the AI panel sends it once shown. */
	pendingPrompt: string | null;
	/** The element the pending prompt is about, sent in place of the open one, which may not have loaded yet. */
	pendingPromptElementId: ElementId | null;
}

const initialState: AiContextState = {
	snippets: [],
	pendingPrompt: null,
	pendingPromptElementId: null,
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
		requestAiPrompt: {
			reducer: (
				state,
				action: PayloadAction<{
					prompt: string;
					elementId: ElementId | null;
				}>,
			) => {
				state.pendingPrompt = action.payload.prompt;
				state.pendingPromptElementId = action.payload.elementId;
			},
			prepare: (prompt: string, elementId: ElementId | null = null) => ({
				payload: { prompt, elementId },
			}),
		},
		clearPendingAiPrompt: state => {
			state.pendingPrompt = null;
			state.pendingPromptElementId = null;
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
