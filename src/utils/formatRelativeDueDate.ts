import { startOfLocalDay } from "./startOfLocalDay";

export function formatRelativeDueDate(due: string): string {
	const dueDate = new Date(due);
	const now = new Date();
	const diffMs = dueDate.getTime() - now.getTime();

	if (diffMs <= 0) return "Today";

	const diffMinutes = Math.round(diffMs / 60_000);
	if (diffMinutes < 60) {
		return `In ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"}`;
	}

	// Rounded, as a DST change makes a day 23 or 25 hours long.
	const diffDays = Math.round(
		(startOfLocalDay(dueDate).getTime() - startOfLocalDay(now).getTime()) /
			86_400_000,
	);
	if (diffDays <= 0) {
		const diffHours = Math.round(diffMs / 3_600_000);
		return `In ${diffHours} hour${diffHours === 1 ? "" : "s"}`;
	}
	if (diffDays === 1) return "Tomorrow";
	return `In ${diffDays} days`;
}
