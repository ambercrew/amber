import {
	ArrowSquareOutIcon,
	CardsIcon,
	EraserIcon,
	ScissorsIcon,
	SparkleIcon,
} from "@phosphor-icons/react";
import { FloatingMenuBarButton } from "../../components/FloatingMenuBar/FloatingMenuBar";
import {
	ADD_TO_AI_CONTEXT_SHORTCUT,
	CREATE_CLOZE_SHORTCUT,
	CREATE_EXTRACT_SHORTCUT,
	OPEN_HIGHLIGHT_SHORTCUT,
	REMOVE_HIGHLIGHT_SHORTCUT,
} from "../../config/shortcuts";

type ButtonMetadata = Pick<
	FloatingMenuBarButton,
	"name" | "title" | "label" | "showLabel" | "color" | "Icon" | "shortcut"
>;

/**
 * Visual definitions for the floating-menu buttons shared by every place a
 * text selection can act on a highlight (the Lexical editor's
 * `FloatingMenuPlugin`, the PDF viewer). Each consumer supplies its own
 * `isActive`/`isVisible`/`onClick` on top of these — the behavior isn't
 * shareable since it depends on the selection API in play.
 */
export const EXTRACT_BUTTON: ButtonMetadata = {
	name: "extract",
	title: "Create Extract",
	label: "Extract",
	showLabel: true,
	Icon: ScissorsIcon,
	shortcut: CREATE_EXTRACT_SHORTCUT,
};

export const CLOZE_BUTTON: ButtonMetadata = {
	name: "cloze",
	title: "Create Cloze",
	label: "Cloze",
	showLabel: true,
	Icon: CardsIcon,
	shortcut: CREATE_CLOZE_SHORTCUT,
};

export const ADD_AI_CONTEXT_BUTTON: ButtonMetadata = {
	name: "add-ai-context",
	title: "Add to AI Context",
	Icon: SparkleIcon,
	shortcut: ADD_TO_AI_CONTEXT_SHORTCUT,
};

/** Acts on the highlight (if any) under the current selection. */
export const OPEN_HIGHLIGHT_BUTTON: ButtonMetadata = {
	name: "open-highlight",
	title: "Open",
	Icon: ArrowSquareOutIcon,
	shortcut: OPEN_HIGHLIGHT_SHORTCUT,
};

export const REMOVE_HIGHLIGHT_BUTTON: ButtonMetadata = {
	name: "remove-highlight",
	title: "Remove Highlight",
	color: "red",
	Icon: EraserIcon,
	shortcut: REMOVE_HIGHLIGHT_SHORTCUT,
};
