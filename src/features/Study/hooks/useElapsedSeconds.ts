import { useEffect, useState } from "react";

/** Seconds since `startedAt`, ticking each second; derived from it, so a remount never restarts it. */
export function useElapsedSeconds(startedAt: number | null): number {
	const [now, setNow] = useState(() => Date.now());
	const [measuredFor, setMeasuredFor] = useState(startedAt);

	// The last tick may be long past (or never came), so a new start reads the time afresh.
	if (startedAt !== measuredFor) {
		setMeasuredFor(startedAt);
		setNow(() => Date.now());
	}

	useEffect(() => {
		if (startedAt === null) return;
		const interval = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(interval);
	}, [startedAt]);

	if (startedAt === null) return 0;
	return Math.max(Math.floor((now - startedAt) / 1000), 0);
}
