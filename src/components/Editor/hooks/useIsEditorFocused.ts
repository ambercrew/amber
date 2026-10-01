import { useCallback, useSyncExternalStore } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	BLUR_COMMAND,
	COMMAND_PRIORITY_LOW,
	FOCUS_COMMAND,
	mergeRegister,
} from "lexical";

export function useIsEditorFocused() {
	const [editor] = useLexicalComposerContext();
	const subscribe = useCallback(
		(onStoreChange: () => void) => {
			const notify = () => {
				onStoreChange();
				return false;
			};
			return mergeRegister(
				editor.registerCommand(
					BLUR_COMMAND,
					notify,
					COMMAND_PRIORITY_LOW,
				),
				editor.registerCommand(
					FOCUS_COMMAND,
					notify,
					COMMAND_PRIORITY_LOW,
				),
			);
		},
		[editor],
	);
	const getSnapshot = useCallback(
		() => editor.getRootElement() === document.activeElement,
		[editor],
	);
	// The root element can gain focus before this subscription is registered;
	// useSyncExternalStore re-checks the snapshot right after commit, so that isn't missed.
	return useSyncExternalStore(subscribe, getSnapshot);
}
