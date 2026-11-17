import { useCallback, useState } from "react";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import {
	selectStudyResume,
	selectStudyReviewedElement,
} from "../../../stores/study/studySelectors";
import { reviewedElementLeft } from "../../../stores/study/studyReducer";
import { ReviewResume } from "../../../types/study/reviewResume";

type LeftState = Omit<ReviewResume, "learningAssetId">;

interface ReturnValue {
	/** How the element under review was last left, so any opening of it picks up there; read once, as the view mounts per element. */
	resume: ReviewResume | undefined;
	/** Reports how the view was left, which the session keeps only for the element under review. */
	reportLeft: (left: LeftState) => void;
	/** Whether a session is reviewing this asset, the only time a report is kept. */
	underReview: boolean;
}

export function useReviewResume(learningAssetId: string): ReturnValue {
	const dispatch = useAppDispatch();
	const reviewed = useAppSelector(selectStudyReviewedElement);
	const underReview =
		reviewed?.type === "learningAsset" && reviewed.id === learningAssetId;
	const stored = useAppSelector(selectStudyResume);
	const [resume] = useState(() =>
		stored?.learningAssetId === learningAssetId ? stored : undefined,
	);
	const reportLeft = useCallback(
		(left: LeftState) =>
			dispatch(reviewedElementLeft({ learningAssetId, ...left })),
		[dispatch, learningAssetId],
	);
	return { resume, reportLeft, underReview };
}
