import { useCallback, useEffect, useMemo, useState } from "react";
import { getCardScheduling } from "../../../api/study/api/studyApi";
import { CardSchedulingDto } from "../../../api/study/dto/cardSchedulingDto";
import { CardReviewDto } from "../../../api/study/dto/cardReviewDto";
import { Rating } from "../../../types/study/rating";
import {
	CardScheduler,
	createScheduler,
	scheduleAllRatings,
} from "../utils/cardScheduling";

interface LoadedScheduling {
	review: CardReviewDto;
	scheduler: CardScheduler;
}

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
	const [loaded, setLoaded] = useState<LoadedScheduling | null>(null);
	const loadKey = cardId ? `${cardId}:${String(shownAt)}` : null;
	const [trackedKey, setTrackedKey] = useState(loadKey);

	// Drop the previous card's inputs during the render that switches cards,
	// so no preview is ever shown for the wrong card while the next load runs.
	if (loadKey !== trackedKey) {
		setTrackedKey(loadKey);
		setLoaded(null);
	}

	useEffect(() => {
		if (!cardId) return;

		let cancelled = false;
		void getCardScheduling(cardId)
			.then(async ({ profile, review }: CardSchedulingDto) => ({
				review,
				scheduler: await createScheduler(profile),
			}))
			.then(next => {
				if (!cancelled) setLoaded(next);
			});

		return () => {
			cancelled = true;
		};
	}, [cardId, shownAt]);

	const preview = useMemo(
		() =>
			loaded
				? scheduleAllRatings(
						loaded.scheduler,
						loaded.review,
						new Date(),
					)
				: null,
		[loaded],
	);

	const schedule = useCallback(
		(rating: Rating) =>
			loaded
				? scheduleAllRatings(
						loaded.scheduler,
						loaded.review,
						new Date(),
					)[rating]
				: null,
		[loaded],
	);

	return { preview, schedule };
}
