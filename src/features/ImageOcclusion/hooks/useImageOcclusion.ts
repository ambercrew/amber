import { useEffect } from "react";
import { getImageOcclusion } from "../../../api/imageOcclusion/api/imageOcclusionApi";
import useApi from "../../../hooks/useApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { imageOcclusionLoaded } from "../../../stores/imageOcclusion/imageOcclusionReducer";
import {
	selectImageOcclusionLookup,
	selectImageOcclusionVersion,
} from "../../../stores/imageOcclusion/imageOcclusionSelectors";

/** The occlusion `id`, shown from the last fetch at once but refetched on mount, as a sync may have changed it. */
export function useImageOcclusion(id: string) {
	const { callApi, errorMessage } = useApi();
	const dispatch = useAppDispatch();
	const lookup = useAppSelector(state =>
		selectImageOcclusionLookup(state, id),
	);
	const version = useAppSelector(state =>
		selectImageOcclusionVersion(state, id),
	);

	useEffect(() => {
		// A fetch superseded by a newer version mustn't write back older masks.
		let superseded = false;
		void callApi(async () => {
			const fetched = await getImageOcclusion(id);
			if (!superseded)
				dispatch(imageOcclusionLoaded({ id, lookup: fetched }));
		});
		return () => {
			superseded = true;
		};
	}, [callApi, dispatch, id, version]);

	// Null until the first fetch answers.
	return { lookup, errorMessage };
}
