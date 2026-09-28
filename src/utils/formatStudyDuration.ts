const MILLISECONDS_PER_SECOND = 1_000;

/** A study duration in its two largest units, e.g. "0 s", "45 s", "12 min 5 s", "1 h 5 min". */
export function formatStudyDuration(durationMs: number): string {
	const totalSeconds = Math.max(
		0,
		Math.floor(durationMs / MILLISECONDS_PER_SECOND),
	);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0)
		return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
	if (minutes > 0)
		return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
	return `${seconds} s`;
}
