import { useCallback, useEffect, useReducer } from "react";
import { getImageOcclusion } from "../../../api/imageOcclusion/api/imageOcclusionApi";
import { ImageOcclusionLookupDto } from "../../../api/imageOcclusion/dto/imageOcclusionLookupDto";
import useApi from "../../../hooks/useApi";

// Sibling cards share one occlusion, so reviewing them back to back shows it at once;
// it's still refetched on mount, since a sync may have changed it.
const cache = new Map<string, ImageOcclusionLookupDto>();
const listeners = new Set<(id: string) => void>();

/** Refetches the occlusion wherever it's shown, e.g. after the mask editor saves it. */
export function invalidateImageOcclusion(id: string) {
	cache.delete(id);
	listeners.forEach(listener => listener(id));
}

export function useImageOcclusion(id: string) {
	const { callApi, errorMessage } = useApi();
	const [, rerender] = useReducer((count: number) => count + 1, 0);

	const fetchOcclusion = useCallback(
		() =>
			callApi(async () => {
				cache.set(id, await getImageOcclusion(id));
				rerender();
			}),
		[id, callApi],
	);

	useEffect(() => {
		void fetchOcclusion();
		const listener = (changedId: string) => {
			if (changedId === id) void fetchOcclusion();
		};
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	}, [id, fetchOcclusion]);

	// Null until the first fetch answers.
	return { lookup: cache.get(id) ?? null, errorMessage };
}
