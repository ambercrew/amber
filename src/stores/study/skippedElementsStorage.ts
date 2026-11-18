import { DueElementDto } from "../../api/study/dto/dueElementDto";
import { ElementId } from "../../types/elements/elementId";
import { elementKey } from "../../utils/elementKey";

// Today's skipped elements, so a restarted session still puts them last; they're forgotten at local midnight.
const KEY = "study.skipped";

interface StoredSkips {
	day: string;
	keys: string[];
}

function today(now = new Date()): string {
	return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function isStoredSkips(value: unknown): value is StoredSkips {
	if (typeof value !== "object" || value === null) return false;
	const stored = value as Record<string, unknown>;
	return (
		typeof stored.day === "string" &&
		Array.isArray(stored.keys) &&
		stored.keys.every(key => typeof key === "string")
	);
}

/** Today's skipped element keys, oldest skip first. */
export function loadSkippedElements(): string[] {
	try {
		const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
		return isStoredSkips(stored) && stored.day === today()
			? stored.keys
			: [];
	} catch {
		return [];
	}
}

export function recordSkippedElement(elementId: ElementId): void {
	const key = elementKey(elementId);
	const keys = [...loadSkippedElements().filter(k => k !== key), key];
	try {
		localStorage.setItem(KEY, JSON.stringify({ day: today(), keys }));
	} catch {
		// Ignore quota failures — the skip just won't outlive the session.
	}
}

/** Moves today's skipped elements to the end of `queue`, in the order they were skipped. */
export function deferSkippedElements(queue: DueElementDto[]): DueElementDto[] {
	const keys = loadSkippedElements();
	if (keys.length === 0) return queue;
	const byKey = new Map(
		queue.map(item => [elementKey(item.elementId), item]),
	);
	const skipped = keys.flatMap(key => byKey.get(key) ?? []);
	if (skipped.length === 0) return queue;
	const skippedSet = new Set(skipped);
	return [...queue.filter(item => !skippedSet.has(item)), ...skipped];
}
