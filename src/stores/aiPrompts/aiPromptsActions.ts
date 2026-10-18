import {
	createAiPrompt,
	deleteAiPrompt,
	listAiPrompts,
	updateAiPrompt,
} from "../../api/aiIntegration/api/aiApi";
import AiPromptDto from "../../api/aiIntegration/dto/aiPromptDto";
import AiPromptRequestDto from "../../api/aiIntegration/dto/aiPromptRequestDto";
import { AppDispatch, RootState } from "../store";
import {
	removeAiPrompt,
	setAiPrompts,
	upsertAiPrompt,
} from "./aiPromptsReducer";
import { selectAiPromptsLoaded } from "./aiPromptsSelectors";

export function loadAiPromptsAction() {
	return async (dispatch: AppDispatch, getState: () => RootState) => {
		if (selectAiPromptsLoaded(getState())) return;
		dispatch(setAiPrompts(await listAiPrompts()));
	};
}

/** Reloads the prompts after a sync, unless they were never loaded (the first load fetches them anyway). */
export function refreshAiPromptsAction() {
	return async (dispatch: AppDispatch, getState: () => RootState) => {
		if (!selectAiPromptsLoaded(getState())) return;
		dispatch(setAiPrompts(await listAiPrompts()));
	};
}

/** Creates the prompt when `id` is null, otherwise updates it. */
export function saveAiPromptAction(id: string | null, dto: AiPromptRequestDto) {
	return async (dispatch: AppDispatch): Promise<AiPromptDto> => {
		const saved = id
			? await updateAiPrompt(id, dto)
			: await createAiPrompt(dto);
		dispatch(upsertAiPrompt(saved));
		return saved;
	};
}

export function deleteAiPromptAction(id: string) {
	return async (dispatch: AppDispatch) => {
		await deleteAiPrompt(id);
		dispatch(removeAiPrompt(id));
	};
}
