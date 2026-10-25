import { useCallback, useRef } from "react";

type RefCallback<E> = (element: E | null) => void;

/** Memoizes `create` per argument list, so ref callbacks (and their observers) aren't re-attached every render; resets when `create` changes. */
export function useKeyedRefCallbacks<A extends (string | number)[], E>(
	create: (...args: A) => RefCallback<E>,
): (...args: A) => RefCallback<E> {
	const cacheRef = useRef({ create, fns: new Map<string, RefCallback<E>>() });
	return useCallback(
		(...args: A) => {
			if (cacheRef.current.create !== create) {
				cacheRef.current = { create, fns: new Map() };
			}
			const { fns } = cacheRef.current;
			const key = args.join(":");
			let fn = fns.get(key);
			if (!fn) {
				fn = create(...args);
				fns.set(key, fn);
			}
			return fn;
		},
		[create],
	);
}
