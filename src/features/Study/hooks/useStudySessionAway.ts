import { useEffect, useLayoutEffect, useRef } from "react";
import { NavigationType, useLocation, useNavigationType } from "react-router";
import useAppDispatch from "../../../hooks/useAppDispatch";
import { useElementParams } from "../../../hooks/useElementParams";
import { sessionRouteChangedAction } from "../../../stores/study/studyActions";
import { ReviewNavigationState } from "../../../types/study/reviewNavigationState";

// Only the queue's own moves change the element under review; any other page,
// even a queued element's, is a visit. Keyed on location.key: a click on the shown row counts.
export function useStudySessionAway() {
	const dispatch = useAppDispatch();
	const location = useLocation();
	const navigationType = useNavigationType();
	const navigationTypeRef = useRef(navigationType);
	const routeElement = useElementParams();
	const routeElementRef = useRef(routeElement);
	useLayoutEffect(() => {
		routeElementRef.current = routeElement;
		navigationTypeRef.current = navigationType;
	});

	useEffect(() => {
		const state = location.state as ReviewNavigationState | null;
		// Back and forward restore an entry's state, but only the queue's own moves choose.
		const choosesReview =
			navigationTypeRef.current !== NavigationType.Pop &&
			state?.choosesReview === true;
		dispatch(
			sessionRouteChangedAction(routeElementRef.current, choosesReview),
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [location.key, dispatch]);
}
