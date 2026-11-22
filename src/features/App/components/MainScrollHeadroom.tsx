import { useLayoutEffect } from "react";
import useAppDispatch from "../../../hooks/useAppDispatch";
import { useElementHeadroom } from "../../../hooks/useElementHeadroom";
import { HEADROOM_FIXED_AT } from "../../../config/layout";
import { mainScrollPinnedChanged } from "../../../stores/app/appReducer";

interface MainScrollHeadroomProps {
	element: HTMLElement | null;
}

/** Renders nothing; publishes whether scrolling `element` shows the header, re-rendering only itself as it scrolls. */
export default function MainScrollHeadroom({
	element,
}: MainScrollHeadroomProps) {
	const dispatch = useAppDispatch();
	const { pinned } = useElementHeadroom({
		element,
		fixedAt: HEADROOM_FIXED_AT,
	});

	// Before paint, so the header moves in the same frame as before it went through the store.
	useLayoutEffect(() => {
		dispatch(mainScrollPinnedChanged(pinned));
	}, [dispatch, pinned]);

	return null;
}
