import { useCallback } from "react";
import useApi from "../../../hooks/useApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import AiPromptRequestDto from "../../../api/aiIntegration/dto/aiPromptRequestDto";
import {
	deleteAiPromptAction,
	loadAiPromptsAction,
	saveAiPromptAction,
} from "../../../stores/aiPrompts/aiPromptsActions";
import { selectAiPrompts } from "../../../stores/aiPrompts/aiPromptsSelectors";

/** The prompt library, shared through the store and reloaded after each sync. */
export default function useAiPrompts() {
	const dispatch = useAppDispatch();
	const prompts = useAppSelector(selectAiPrompts);
	const { callApi, errorMessage, clearErrorMessage, isSendingRequest } =
		useApi();

	// Clears the last error first, so a success doesn't leave a stale one shown.
	const run = useCallback(
		<T>(cb: () => Promise<T>) => {
			clearErrorMessage();
			return callApi(cb);
		},
		[callApi, clearErrorMessage],
	);

	const load = useCallback(
		() => run(() => dispatch(loadAiPromptsAction())),
		[run, dispatch],
	);

	const savePrompt = useCallback(
		async (id: string | null, dto: AiPromptRequestDto) =>
			(await run(() => dispatch(saveAiPromptAction(id, dto)))) !==
			undefined,
		[run, dispatch],
	);

	const deletePrompt = useCallback(
		(id: string) => run(() => dispatch(deleteAiPromptAction(id))),
		[run, dispatch],
	);

	return {
		prompts,
		load,
		savePrompt,
		deletePrompt,
		errorMessage,
		clearErrorMessage,
		isSendingRequest,
	};
}
