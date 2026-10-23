// All keyboard shortcuts, in `useHotkeys` notation ('mod+L', 'mod+shift+P', 'alt+ArrowUp').
// Commands' shortcuts appear in ShortcutsModal automatically; add any other new one to its CONTEXT_SECTIONS.

// App
export const SPOTLIGHT_SHORTCUT = "mod+K";
export const OPEN_SETTINGS_SHORTCUT = "mod+,";
export const IMPORT_SHORTCUT = "mod+shift+N";
export const TOGGLE_LEFT_SIDEBAR_SHORTCUT = "mod+shift+B";
export const TOGGLE_RIGHT_SIDEBAR_SHORTCUT = "mod+alt+B";
export const SHOW_SHORTCUTS_SHORTCUT = "F1";
export const SYNC_SHORTCUT = "mod+S";

// Navigation
export const GO_BACK_SHORTCUT = "alt+ArrowLeft";
export const GO_FORWARD_SHORTCUT = "alt+ArrowRight";
export const NEXT_TREE_ELEMENT_SHORTCUT = "alt+ArrowDown";
export const PREVIOUS_TREE_ELEMENT_SHORTCUT = "alt+ArrowUp";
export const FOCUS_TREE_SHORTCUT = "mod+shift+E";
export const OPEN_FOCUSED_TREE_ELEMENT_SHORTCUT = "Enter";

// Find in page
export const FIND_IN_PAGE_SHORTCUT = "mod+F";
export const FIND_NEXT_SHORTCUT = "mod+G";
export const FIND_PREVIOUS_SHORTCUT = "mod+shift+G";

// Zoom
export const ZOOM_IN_SHORTCUT = "mod+=";
export const ZOOM_IN_ALT_SHORTCUT = "mod+[plus]";
export const ZOOM_OUT_SHORTCUT = "mod+-";
export const RESET_ZOOM_SHORTCUT = "mod+0";

// Elements
export const CREATE_CARD_SHORTCUT = "mod+N";
export const SET_READ_POINT_SHORTCUT = "mod+shift+R";
export const GO_TO_READ_POINT_SHORTCUT = "alt+0";
export const SET_MARK_1_SHORTCUT = "mod+1";
export const SET_MARK_2_SHORTCUT = "mod+2";
export const SET_MARK_3_SHORTCUT = "mod+3";
export const GO_TO_MARK_1_SHORTCUT = "alt+1";
export const GO_TO_MARK_2_SHORTCUT = "alt+2";
export const GO_TO_MARK_3_SHORTCUT = "alt+3";
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
export const MAKE_AI_CARDS_SHORTCUT = "mod+shift+M";
export const NEW_LINE_SHORTCUT = "shift+Enter";
export const INSERT_AI_PROMPT_SHORTCUT = "/";
export const NEXT_PROMPT_PLACEHOLDER_SHORTCUT = "Tab";
export const PREVIOUS_PROMPT_PLACEHOLDER_SHORTCUT = "shift+Tab";

// Editor
export const CREATE_EXTRACT_SHORTCUT = "mod+shift+X";
export const CREATE_CLOZE_SHORTCUT = "mod+shift+C";
export const OPEN_HIGHLIGHT_SHORTCUT = "mod+shift+O";
export const REMOVE_HIGHLIGHT_SHORTCUT = "mod+shift+H";
export const SLASH_MENU_SHORTCUT = "/";

// Image occlusion editor
export const OCCLUSION_SELECT_TOOL_SHORTCUT = "V";
export const OCCLUSION_RECT_TOOL_SHORTCUT = "R";
export const OCCLUSION_ELLIPSE_TOOL_SHORTCUT = "E";
export const OCCLUSION_TEXT_TOOL_SHORTCUT = "T";
export const OCCLUSION_GROUP_SHORTCUT = "G";
export const OCCLUSION_UNGROUP_SHORTCUT = "shift+G";
export const OCCLUSION_DELETE_SHORTCUT = "Delete";
// macOS keyboards have no Delete key; theirs reports Backspace.
export const OCCLUSION_BACKSPACE_DELETE_SHORTCUT = "Backspace";
export const OCCLUSION_UNDO_SHORTCUT = "mod+Z";
export const OCCLUSION_REDO_SHORTCUT = "mod+Y";

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

// Reserved keys reused by full-screen modals, where Lexical never has focus to receive them.
export const MODAL_REUSED_EDITOR_SHORTCUTS = [
	OCCLUSION_UNDO_SHORTCUT,
	OCCLUSION_REDO_SHORTCUT,
];
