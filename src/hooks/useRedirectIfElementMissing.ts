import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useElementParams } from "./useElementParams";
import { elementExists } from "../api/elements/api/elementsApi";
import { useTauriEvent } from "./useTauriEvent";
import { ELEMENTS_DELETED_EVENT } from "../api/trash/events/elementsDeletedEvent";
import { selectElementTree } from "../stores/elements/elementsSelectors";
import useAppSelector from "./useAppSelector";
import { paths } from "../paths";

/** Goes back when the URL points nowhere, and to the root when the open element is later deleted. */
export function useRedirectIfElementMissing() {
	const params = useElementParams();
	const type = params?.type;
	const id = params?.id;
	const tree = useAppSelector(selectElementTree);
	const navigate = useNavigate();
	const checkedRoute = useRef<string | null>(null);

	const leaveIfMissing = useCallback(() => {
		if (!type || !id) return;
		const isNewRoute = checkedRoute.current !== `${type}/${id}`;
		checkedRoute.current = `${type}/${id}`;
		void elementExists({ type, id }).then(exists => {
			if (exists) return;
			if (isNewRoute) void navigate(-1);
			else void navigate(paths.root(), { replace: true });
		});
	}, [type, id, navigate]);

	// The tree reloads after deletions from any source, e.g. a cloud sync.
	useEffect(leaveIfMissing, [leaveIfMissing, tree]);

	// Re-checked rather than matched by id, since the element may be inside a deleted folder.
	useTauriEvent(ELEMENTS_DELETED_EVENT, leaveIfMissing);
}
