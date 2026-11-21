import { type KeyboardEvent, type Ref } from "react";
import { Textarea, TextareaProps } from "@mantine/core";

interface AutosizeTextInputProps extends TextareaProps {
	ref?: Ref<HTMLTextAreaElement>;
}

/**
 * A single-line field that grows vertically, so long values wrap instead of scrolling sideways;
 * Enter is suppressed but still forwarded to `onKeyDown`.
 */
function AutosizeTextInput({ onKeyDown, ...props }: AutosizeTextInputProps) {
	function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter") e.preventDefault();
		onKeyDown?.(e);
	}

	return (
		<Textarea autosize minRows={1} onKeyDown={handleKeyDown} {...props} />
	);
}

export default AutosizeTextInput;
