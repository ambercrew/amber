import {
	ArrowSquareOutIcon,
	CardsIcon,
	EraserIcon,
	ScissorsIcon,
	SparkleIcon,
} from "@phosphor-icons/react";
import { FloatingMenuBarButton } from "../../components/FloatingMenuBar/FloatingMenuBar";

type ButtonMetadata = Pick<
	FloatingMenuBarButton,
	"name" | "title" | "label" | "showLabel" | "color" | "Icon"
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
};

export const CLOZE_BUTTON: ButtonMetadata = {
	name: "cloze",
	title: "Create Cloze",
	label: "Cloze",
	showLabel: true,
	Icon: CardsIcon,
};

export const ADD_AI_CONTEXT_BUTTON: ButtonMetadata = {
	name: "add-ai-context",
	title: "Add to AI Context",
	Icon: SparkleIcon,
};

/** Acts on the highlight (if any) under the current selection. */
export const OPEN_HIGHLIGHT_BUTTON: ButtonMetadata = {
	name: "open-highlight",
	title: "Open",
	Icon: ArrowSquareOutIcon,
};

export const REMOVE_HIGHLIGHT_BUTTON: ButtonMetadata = {
	name: "remove-highlight",
	title: "Remove Highlight",
	color: "red",
	Icon: EraserIcon,
};
