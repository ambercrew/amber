import { useEffect, useRef } from "react";
import { setCurrentElement } from "../stores/elements/elementsReducer";
import {
	loadCurrentElementAction,
	refreshCurrentElementMetaAction,
} from "../stores/elements/elementsActions";
import { selectElementTree } from "../stores/elements/elementsSelectors";
import useAppDispatch from "./useAppDispatch";
import useAppSelector from "./useAppSelector";
import { useElementParams } from "./useElementParams";
import { ElementId } from "../types/elements/elementId";

/** Loads the element the route points at; trashing it navigates away (see `useRedirectIfElementMissing`). */
export function useCurrentElementSync() {
	const params = useElementParams();
	const tree = useAppSelector(selectElementTree);
	const dispatch = useAppDispatch();
	const type = params?.type;
	const id = params?.id;
	// The tree the element was last loaded against; the route effect loads it on mount.
	const loadedTree = useRef(tree);

	useEffect(() => {
		if (!type || !id) {
			dispatch(setCurrentElement(null));
			return;
		}
		void dispatch(
			loadCurrentElementAction({ type, id } satisfies ElementId),
		);
	}, [type, id, dispatch]);

	// Tree changes (moves, renames, tags) only touch the meta, so the content isn't reloaded.
	useEffect(() => {
		if (tree === loadedTree.current || !type || !id) return;
		loadedTree.current = tree;
		void dispatch(refreshCurrentElementMetaAction({ type, id }));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- the route effect above loads it
	}, [tree, dispatch]);
}
