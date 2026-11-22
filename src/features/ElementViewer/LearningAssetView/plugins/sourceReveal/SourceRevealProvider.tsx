import { PropsWithChildren, useEffect, useEffectEvent } from "react";
import { notifications } from "@mantine/notifications";
import { useLocation } from "react-router";
import { findLearningAssetHighlight } from "../../../../../api/elements/api/elementsApi";
import { readSpotNavigationState } from "../../../../../types/elements/spotNavigationState";
import useApi from "../../../../../hooks/useApi";
import { landOnBlock } from "../../core/landOnBlock";
import { ReadingPosition } from "../../../../../types/elements/readingPosition";
import { useReaderCore } from "../../core/readerCoreContext";

/** Scrolls to the highlight an opening asks for, such as the passage a card was made from. */
export default function SourceRevealProvider({ children }: PropsWithChildren) {
	const { learningAssetId, navigate } = useReaderCore();
	const location = useLocation();
	const { revealHighlightOf } = readSpotNavigationState(location.state);
	const { callApi, errorMessage, clearErrorMessage } = useApi();
	useEffect(() => {
		if (!errorMessage) return;
		notifications.show({
			message: `Couldn't find the passage. ${errorMessage}`,
			color: "red",
		});
		clearErrorMessage();
	}, [errorMessage, clearErrorMessage]);
	// An event, so `navigate` changing identity while the asset opens can't cancel the lookup.
	const reveal = useEffectEvent((position: ReadingPosition) =>
		navigate(position.split, landOnBlock(position.block)),
	);

	useEffect(() => {
		// Runs once per navigation (`location.key`), not on re-renders.
		if (!revealHighlightOf) return;
		let cancelled = false;
		void callApi(() =>
			findLearningAssetHighlight(learningAssetId, revealHighlightOf),
		).then(position => {
			if (!cancelled && position) reveal(position);
		});
		return () => {
			cancelled = true;
		};
	}, [callApi, learningAssetId, location.key, revealHighlightOf]);

	return children;
}
