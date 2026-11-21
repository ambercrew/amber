import { useEffect, useEffectEvent } from "react";
import useAppDispatch from "./useAppDispatch";
import useAppSelector from "./useAppSelector";
import { treeRevealed } from "../stores/app/appReducer";
import { selectPendingTreeReveal } from "../stores/app/appSelectors";

export { requestTreeReveal } from "../stores/app/appReducer";

/** Calls `expand` with the requested id whenever `data` changes, until it returns true (the element is in the tree). */
export function useTreeRevealRequest(
	data: unknown,
	expand: (id: string) => boolean,
) {
	const dispatch = useAppDispatch();
	const requested = useAppSelector(selectPendingTreeReveal);
	const handleExpand = useEffectEvent(expand);

	useEffect(() => {
		if (requested === null || !handleExpand(requested)) return;
		dispatch(treeRevealed(requested));
	}, [dispatch, requested, data]);
}
