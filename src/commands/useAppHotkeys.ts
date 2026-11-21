import { createContext, use, useEffect, useEffectEvent } from "react";

export type AppHotkeyItem = [string, (event: KeyboardEvent) => void];

const DEFAULT_TAGS_TO_IGNORE = ["INPUT", "TEXTAREA", "SELECT"];

const MODIFIERS = ["alt", "ctrl", "meta", "shift", "mod"];

const LATIN_CHARACTER = /^[a-zA-Z0-9]$/;

/** Mirrors Mantine's own key naming so shortcut strings stay interchangeable. */
const KEY_NAMES: Record<string, string> = {
	" ": "space",
	arrowleft: "arrowleft",
	arrowright: "arrowright",
	arrowup: "arrowup",
	arrowdown: "arrowdown",
	esc: "escape",
	"+": "plus",
	"-": "minus",
	"*": "asterisk",
	"/": "slash",
	"=": "equal",
};

function normalizeKey(key: string) {
	const lowered = key.toLowerCase();
	return KEY_NAMES[key] ?? KEY_NAMES[lowered] ?? lowered;
}

/**
 * `event.code` spells keys differently from `event.key` (`KeyK`, `Digit1`, `Equal`, `NumpadAdd`);
 * normalize it onto a shortcut string's names.
 */
function normalizeCode(code: string) {
	const stripped = code
		.replace(/^(Key|Digit|Numpad)/, "")
		.replace(/^Add$/, "+")
		.replace(/^Subtract$/, "-");
	return normalizeKey(stripped);
}

interface ParsedShortcut {
	alt: boolean;
	ctrl: boolean;
	meta: boolean;
	mod: boolean;
	shift: boolean;
	key?: string;
}

function parseShortcut(shortcut: string): ParsedShortcut {
	const parts = shortcut
		.toLowerCase()
		.split("+")
		.map(part => part.trim());
	const key = parts.find(part => !MODIFIERS.includes(part));

	return {
		alt: parts.includes("alt"),
		ctrl: parts.includes("ctrl"),
		meta: parts.includes("meta"),
		mod: parts.includes("mod"),
		shift: parts.includes("shift"),
		key: key === "[plus]" ? "+" : key,
	};
}

/** `?` or `+` needs shift on most layouts, so shift can't be part of what identifies them. */
function isPunctuation(key: string | undefined) {
	return key?.length === 1 && !LATIN_CHARACTER.test(key);
}

function modifiersMatch(shortcut: ParsedShortcut, event: KeyboardEvent) {
	if (shortcut.alt !== event.altKey) return false;
	const ignoreShift = !shortcut.shift && isPunctuation(shortcut.key);
	if (!ignoreShift && shortcut.shift !== event.shiftKey) return false;

	if (shortcut.mod) return event.ctrlKey || event.metaKey;

	return shortcut.ctrl === event.ctrlKey && shortcut.meta === event.metaKey;
}

/**
 * Non-latin layouts report a non-latin `event.key`, so `mod+K` can't match by key alone: match the produced
 * key first and the physical key only when that isn't latin, so one press never fires two commands.
 */
export function matchesShortcut(shortcut: string, event: KeyboardEvent) {
	const parsed = parseShortcut(shortcut);
	if (!parsed.key || !modifiersMatch(parsed, event)) return false;
	// Alt with a numpad key types an Alt code on Windows, so it's never a shortcut.
	if (event.altKey && event.code?.startsWith("Numpad")) return false;

	const expected = normalizeKey(parsed.key);
	if (event.key && normalizeKey(event.key) === expected) return true;

	// A physical key means a different character with shift, so shift must match exactly here.
	if (parsed.shift !== event.shiftKey) return false;
	const producesLatinCharacter =
		event.key?.length !== 1 || LATIN_CHARACTER.test(event.key);
	if (producesLatinCharacter) return false;

	return event.code ? normalizeCode(event.code) === expected : false;
}

/** Marks hotkeys bound inside a modal, so they keep firing while it's open. */
export const ModalHotkeysContext = createContext(false);

// Modals' focus traps don't stop document listeners, so hotkeys behind one must skip themselves.
function isModalOpen() {
	return document.querySelector('[aria-modal="true"]') !== null;
}

function shouldFireEvent(
	event: KeyboardEvent,
	tagsToIgnore: string[],
	triggerOnContentEditable: boolean,
) {
	if (!(event.target instanceof HTMLElement)) return true;
	if (triggerOnContentEditable)
		return !tagsToIgnore.includes(event.target.tagName);
	return (
		!event.target.isContentEditable &&
		!tagsToIgnore.includes(event.target.tagName)
	);
}

/**
 * Drop-in replacement for Mantine's `useHotkeys` that also matches shortcuts
 * on non-latin keyboard layouts (see {@link matchesShortcut}).
 */
export function useAppHotkeys(
	hotkeys: AppHotkeyItem[],
	tagsToIgnore: string[] = DEFAULT_TAGS_TO_IGNORE,
	triggerOnContentEditable = false,
) {
	const insideModal = use(ModalHotkeysContext);

	const handleKeydown = useEffectEvent((event: KeyboardEvent) => {
		if (!insideModal && isModalOpen()) return;
		hotkeys.forEach(([shortcut, handler]) => {
			if (
				matchesShortcut(shortcut, event) &&
				shouldFireEvent(event, tagsToIgnore, triggerOnContentEditable)
			) {
				event.preventDefault();
				handler(event);
			}
		});
	});

	useEffect(() => {
		document.documentElement.addEventListener("keydown", handleKeydown);
		return () =>
			document.documentElement.removeEventListener(
				"keydown",
				handleKeydown,
			);
	}, []);
}
