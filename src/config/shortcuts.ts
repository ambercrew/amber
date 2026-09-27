// All keyboard shortcuts, in `useHotkeys` notation ('mod+L', 'mod+shift+P', 'alt+ArrowUp').
// Commands' shortcuts appear in ShortcutsModal automatically; add any other new one to its CONTEXT_SECTIONS.

// App
export const SPOTLIGHT_SHORTCUT = "mod+K";
export const OPEN_SETTINGS_SHORTCUT = "mod+,";
export const IMPORT_SHORTCUT = "mod+shift+N";
export const TOGGLE_LEFT_SIDEBAR_SHORTCUT = "mod+shift+B";
export const TOGGLE_RIGHT_SIDEBAR_SHORTCUT = "mod+alt+B";
export const SHOW_SHORTCUTS_SHORTCUT = "F1";

// Navigation
export const GO_BACK_SHORTCUT = "alt+ArrowLeft";
export const GO_FORWARD_SHORTCUT = "alt+ArrowRight";
export const NEXT_TREE_ELEMENT_SHORTCUT = "alt+ArrowDown";
export const PREVIOUS_TREE_ELEMENT_SHORTCUT = "alt+ArrowUp";
export const FOCUS_TREE_SHORTCUT = "mod+shift+E";

// Find in page
export const FIND_IN_PAGE_SHORTCUT = "mod+F";
export const FIND_NEXT_SHORTCUT = "mod+G";
export const FIND_PREVIOUS_SHORTCUT = "mod+shift+G";

// Zoom
export const ZOOM_IN_SHORTCUT = "mod+=";
export const ZOOM_IN_ALT_SHORTCUT = "mod+[plus]";
export const ZOOM_OUT_SHORTCUT = "mod+-";
export const RESET_ZOOM_SHORTCUT = "mod+0";

// Element actions
export const CREATE_CARD_SHORTCUT = "mod+N";
export const SET_READ_POINT_SHORTCUT = "mod+shift+R";
export const OPEN_PRIORITY_SHORTCUT = "mod+shift+P";
export const OPEN_DUE_DATE_SHORTCUT = "mod+shift+D";

// Study session
export const TOGGLE_STUDY_SESSION_SHORTCUT = "mod+shift+L";
export const SHOW_ANSWER_SHORTCUT = "space";
export const GRADE_AGAIN_SHORTCUT = "1";
export const GRADE_HARD_SHORTCUT = "2";
export const GRADE_GOOD_SHORTCUT = "3";
export const GRADE_EASY_SHORTCUT = "4";
export const SKIP_LEARNING_ASSET_SHORTCUT = "S";
export const NEXT_LEARNING_ASSET_SHORTCUT = "N";
export const PICK_DUE_DATE_SHORTCUT = "D";
export const FINISH_LEARNING_ASSET_SHORTCUT = "F";

// AI
export const FOCUS_AI_CHAT_SHORTCUT = "mod+J";
export const ADD_TO_AI_CONTEXT_SHORTCUT = "mod+shift+A";
export const NEW_LINE_SHORTCUT = "shift+Enter";

// Editor
export const CREATE_EXTRACT_SHORTCUT = "mod+shift+X";
export const CREATE_CLOZE_SHORTCUT = "mod+shift+C";
export const OPEN_HIGHLIGHT_SHORTCUT = "mod+shift+O";
export const REMOVE_HIGHLIGHT_SHORTCUT = "mod+shift+H";
export const SLASH_MENU_SHORTCUT = "/";

// Handled by Lexical itself; Amber must never bind these.
export const EDITOR_RESERVED_SHORTCUTS = [
	"mod+B",
	"mod+I",
	"mod+U",
	"mod+Z",
	"mod+shift+Z",
	"mod+Y",
	"mod+A",
	"mod+C",
	"mod+X",
	"mod+V",
];
