import { useEffect, useEffectEvent, useSyncExternalStore } from "react";

// The element may not be in the tree yet (its creation arrives in a batch), so the request waits here.
let pending: string | null = null;
const listeners = new Set<() => void>();

function setPending(id: string | null) {
	pending = id;
	listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Asks the element tree to expand down to element `id`, without taking focus. */
export function requestTreeReveal(id: string) {
	setPending(id);
}

/** Calls `expand` with the requested id whenever `data` changes, until it returns true (the element is in the tree). */
export function useTreeRevealRequest(
	data: unknown,
	expand: (id: string) => boolean,
) {
	const requested = useSyncExternalStore(subscribe, () => pending);
	const handleExpand = useEffectEvent(expand);

	useEffect(() => {
		if (requested === null || !handleExpand(requested)) return;
		if (pending === requested) setPending(null);
	}, [requested, data]);
}
