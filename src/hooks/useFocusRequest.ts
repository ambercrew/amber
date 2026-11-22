import { addListener } from "@reduxjs/toolkit";
import { useEffect, useEffectEvent } from "react";
import useAppDispatch from "./useAppDispatch";
import useAppSelector from "./useAppSelector";
import {
	FocusTarget,
	focusTaken,
	requestFocus,
} from "../stores/app/appReducer";
import { selectPendingFocus } from "../stores/app/appSelectors";

export type { FocusTarget };
export { requestFocus };

/** Runs `onRequested` whenever focus is requested for `target` while mounted, e.g. to reveal its panel. */
export function useFocusRequested(
	target: FocusTarget,
	onRequested: () => void,
) {
	const dispatch = useAppDispatch();
	const handleRequest = useEffectEvent(onRequested);

	useEffect(
		() =>
			dispatch(
				addListener({
					actionCreator: requestFocus,
					effect: ({ payload }) => {
						if (payload === target) handleRequest();
					},
				}),
			),
		[dispatch, target],
	);
}

/** Calls `focus` once a request for `target` is pending while this component is mounted. */
export function useFocusOnRequest(target: FocusTarget, focus: () => void) {
	const dispatch = useAppDispatch();
	const requested = useAppSelector(
		state => selectPendingFocus(state) === target,
	);
	const handleFocus = useEffectEvent(focus);

	useEffect(() => {
		if (!requested) return;
		dispatch(focusTaken(target));
		handleFocus();
	}, [dispatch, requested, target]);
}
