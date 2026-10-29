import { StudyScopeDto } from "../../api/study/dto/studyScopeDto";

/**
 * The study scope, so it survives a restart. What to focus on is about the
 * device in front of the user, so it lives in localStorage rather than syncing.
 */

const KEY = "study.scope";

function isStudyScope(value: unknown): value is StudyScopeDto {
	if (typeof value !== "object" || value === null) return false;
	const scope = value as Record<string, unknown>;
	return (
		(scope.type === "savedSearch" &&
			typeof scope.savedSearchId === "string") ||
		(scope.type === "custom" && Array.isArray(scope.filters))
	);
}

export function loadStudyScope(): StudyScopeDto | null {
	try {
		const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
		// Guards against a hand-edited or outdated value.
		return isStudyScope(stored) ? stored : null;
	} catch {
		return null;
	}
}

export function saveStudyScope(scope: StudyScopeDto | null): void {
	try {
		if (scope) localStorage.setItem(KEY, JSON.stringify(scope));
		else localStorage.removeItem(KEY);
	} catch {
		// Ignore quota failures — the scope just won't outlive the session.
	}
}
