import { useCallback, useEffect, useMemo, useState } from "react";
import { getCardScheduling } from "../../../api/study/api/studyApi";
import { CardSchedulingDto } from "../../../api/study/dto/cardSchedulingDto";
import { CardReviewDto } from "../../../api/study/dto/cardReviewDto";
import { Rating } from "../../../types/study/rating";
import { scheduleAllRatings } from "../utils/cardScheduling";

export interface CardScheduling {
	preview: Record<Rating, CardReviewDto> | null;
	schedule: (rating: Rating) => CardReviewDto | null;
}

/**
 * Loads a card's review state and study profile, and schedules it with
 * ts-fsrs. Reloads whenever the card changes or is shown again — a card
 * requeued within the session keeps its id but not its review state.
 */
export function useCardScheduling(
	cardId: string | null,
	shownAt: number | null,
): CardScheduling {
	const [inputs, setInputs] = useState<CardSchedulingDto | null>(null);
	const loadKey = cardId ? `${cardId}:${String(shownAt)}` : null;
	const [trackedKey, setTrackedKey] = useState(loadKey);

	// Drop the previous card's inputs during the render that switches cards,
	// so no preview is ever shown for the wrong card while the next load runs.
	if (loadKey !== trackedKey) {
		setTrackedKey(loadKey);
		setInputs(null);
	}

	useEffect(() => {
		if (!cardId) return;

		let cancelled = false;
		void getCardScheduling(cardId).then(loaded => {
			if (!cancelled) setInputs(loaded);
		});

		return () => {
			cancelled = true;
		};
	}, [cardId, shownAt]);

	const preview = useMemo(
		() =>
			inputs
				? scheduleAllRatings(inputs.profile, inputs.review, new Date())
				: null,
		[inputs],
	);

	const schedule = useCallback(
		(rating: Rating) =>
			inputs
				? scheduleAllRatings(inputs.profile, inputs.review, new Date())[
						rating
					]
				: null,
		[inputs],
	);

	return { preview, schedule };
}
