import { createCommand } from "lexical";

/** Opens the language picker of the code block holding the caret, e.g. right after inserting one. */
export const OPEN_CODE_LANGUAGE_PICKER_COMMAND = createCommand<void>(
	"OPEN_CODE_LANGUAGE_PICKER_COMMAND",
);
