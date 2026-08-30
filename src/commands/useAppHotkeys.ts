import { useEffect, useEffectEvent } from "react";

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
 * `event.code` names the physical key, so it spells characters differently
 * from `event.key` (`KeyK`, `Digit1`, `Equal`, `NumpadAdd`). Normalize it onto
 * the same names a shortcut string uses.
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

function modifiersMatch(shortcut: ParsedShortcut, event: KeyboardEvent) {
	if (shortcut.alt !== event.altKey) return false;
	if (shortcut.shift !== event.shiftKey) return false;

	if (shortcut.mod) return event.ctrlKey || event.metaKey;

	return shortcut.ctrl === event.ctrlKey && shortcut.meta === event.metaKey;
}

/**
 * Non-latin layouts (Russian, Greek, Hebrew, ...) report a non-latin
 * `event.key` for the very same physical key, so a latin shortcut such as
 * `mod+K` never matches by key alone. Match on the produced key first, and
 * fall back to the physical key only when that character isn't latin — that
 * way a latin layout can never fire two different commands from one press.
 */
export function matchesShortcut(shortcut: string, event: KeyboardEvent) {
	const parsed = parseShortcut(shortcut);
	if (!parsed.key || !modifiersMatch(parsed, event)) return false;

	const expected = normalizeKey(parsed.key);
	if (event.key && normalizeKey(event.key) === expected) return true;

	const producesLatinCharacter =
		event.key?.length !== 1 || LATIN_CHARACTER.test(event.key);
	if (producesLatinCharacter) return false;

	return event.code ? normalizeCode(event.code) === expected : false;
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
	const handleKeydown = useEffectEvent((event: KeyboardEvent) => {
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
