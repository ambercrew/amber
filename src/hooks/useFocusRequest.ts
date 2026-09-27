import { useEffect, useEffectEvent, useSyncExternalStore } from "react";

export type FocusTarget = "tree" | "aiChat";

// A focus shortcut's target may not be mounted yet, so its request waits here until it is.
let pending: FocusTarget | null = null;
const storeListeners = new Set<() => void>();
const requestListeners = new Set<(target: FocusTarget) => void>();

function setPending(target: FocusTarget | null) {
	pending = target;
	storeListeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
	storeListeners.add(listener);
	return () => {
		storeListeners.delete(listener);
	};
}

/** Asks `target` to take focus, now if it's mounted or else as soon as it mounts. */
export function requestFocus(target: FocusTarget) {
	requestListeners.forEach(listener => listener(target));
	setPending(target);
}

/** Runs `onRequested` whenever focus is requested for `target`, e.g. to reveal its panel. */
export function useFocusRequested(
	target: FocusTarget,
	onRequested: () => void,
) {
	const handleRequest = useEffectEvent(onRequested);

	useEffect(() => {
		const listener = (requested: FocusTarget) => {
			if (requested === target) handleRequest();
		};
		requestListeners.add(listener);
		return () => {
			requestListeners.delete(listener);
		};
	}, [target]);
}

/** Calls `focus` once a request for `target` is pending while this component is mounted. */
export function useFocusOnRequest(target: FocusTarget, focus: () => void) {
	const requested = useSyncExternalStore(subscribe, () => pending === target);
	const handleFocus = useEffectEvent(focus);

	useEffect(() => {
		if (!requested) return;
		setPending(null);
		handleFocus();
	}, [requested]);
}
