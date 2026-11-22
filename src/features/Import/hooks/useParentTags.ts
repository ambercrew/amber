import { useEffect, useState } from "react";
import { getElementMeta } from "../../../api/elements/api/elementsApi";
import useApi from "../../../hooks/useApi";
import { ElementId } from "../../../types/elements/elementId";
import { parentKey } from "../utils/parentKey";

/** The parent's tag names, which new elements under it copy; `tags` is `null` until they're known. */
export function useParentTags(parent: ElementId | null) {
	const { callApi, errorMessage, clearErrorMessage } = useApi();
	const [fetched, setFetched] = useState<{ key: string; tags: string[] }>();
	const key = parentKey(parent);
	const [fetchedFor, setFetchedFor] = useState(key);

	// A new parent, or closing the modal, drops the old tags so they're never sent stale.
	if (fetchedFor !== key) {
		setFetchedFor(key);
		setFetched(undefined);
		clearErrorMessage();
	}

	useEffect(() => {
		if (!parent) return;
		let cancelled = false;
		void callApi(() => getElementMeta(parent)).then(meta => {
			if (!cancelled && meta !== undefined)
				setFetched({ key, tags: meta?.tags.map(t => t.name) ?? [] });
		});
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key]);

	return {
		tags: !parent ? [] : fetched?.key === key ? fetched.tags : null,
		errorMessage: parent ? errorMessage : null,
	};
}
