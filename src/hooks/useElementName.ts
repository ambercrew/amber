import { useEffect, useState } from "react";
import { getElementName } from "../api/elements/api/elementsApi";
import { selectElementTree } from "../stores/elements/elementsSelectors";
import { ElementId } from "../types/elements/elementId";
import useApi from "./useApi";
import useAppSelector from "./useAppSelector";

export interface ElementNameState {
	/** `null` while unset, loading, or failed. */
	name: string | null;
	errorMessage: string | null;
}

/** Fetches an element's current name, refetching whenever the tree changes (e.g. a rename). */
export default function useElementName(
	elementId: ElementId | null,
): ElementNameState {
	const { callApi, errorMessage } = useApi();
	const tree = useAppSelector(selectElementTree);
	const [resolved, setResolved] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const id = elementId?.id ?? null;
	const type = elementId?.type ?? null;

	useEffect(() => {
		if (!id || !type) return;
		let cancelled = false;
		void callApi(() => getElementName({ id, type })).then(name => {
			// `undefined` means the call failed; `callApi` has set the error.
			if (!cancelled && name !== undefined) setResolved({ id, name });
		});
		return () => {
			cancelled = true;
		};
	}, [callApi, id, type, tree]);

	if (!id) return { name: null, errorMessage: null };
	const current = resolved?.id === id ? resolved : null;
	return {
		name: current?.name ?? null,
		errorMessage: current ? null : errorMessage,
	};
}
