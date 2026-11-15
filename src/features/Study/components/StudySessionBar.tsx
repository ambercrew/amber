import { useEffect, useState } from "react";
import { Button, Group } from "@mantine/core";
import { useNavigate } from "react-router";
import { previewNextLearningAsset } from "../../../api/study/api/studyApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { useCardScheduling } from "../hooks/useCardScheduling";
import SessionBarFrame from "./SessionBarFrame";
import {
	finishLearningAssetAction,
	gradeCardAction,
	nextLearningAssetAction,
	skipLearningAssetAction,
} from "../../../stores/study/studyActions";
import { answerShown } from "../../../stores/study/studyReducer";
import {
	selectStudyCardPhase,
	selectStudyAway,
	selectStudySessionElement,
	selectStudyShownAt,
} from "../../../stores/study/studySelectors";
import { ElementId } from "../../../types/elements/elementId";
import { Rating } from "../../../types/study/rating";
import { formatRelativeDueDate } from "../../../utils/formatRelativeDueDate";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import AwayStudySessionBar from "./AwayStudySessionBar";
import { useAppHotkeys } from "../../../commands/useAppHotkeys";
import { useRunCommand } from "../../../commands/useRunCommand";
import {
	FINISH_LEARNING_ASSET_SHORTCUT,
	GRADE_AGAIN_SHORTCUT,
	GRADE_EASY_SHORTCUT,
	GRADE_GOOD_SHORTCUT,
	GRADE_HARD_SHORTCUT,
	NEXT_LEARNING_ASSET_SHORTCUT,
	PICK_DUE_DATE_SHORTCUT,
	SHOW_ANSWER_SHORTCUT,
	SKIP_LEARNING_ASSET_SHORTCUT,
} from "../../../config/shortcuts";

const RATINGS: { rating: Rating; label: string; shortcut: string }[] = [
	{ rating: "again", label: "Again", shortcut: GRADE_AGAIN_SHORTCUT },
	{ rating: "hard", label: "Hard", shortcut: GRADE_HARD_SHORTCUT },
	{ rating: "good", label: "Good", shortcut: GRADE_GOOD_SHORTCUT },
	{ rating: "easy", label: "Easy", shortcut: GRADE_EASY_SHORTCUT },
];

function StudySessionBar() {
	const dispatch = useAppDispatch();
	const navigate = useNavigate();
	const runCommand = useRunCommand();
	const current = useAppSelector(selectStudySessionElement);
	const away = useAppSelector(selectStudyAway);
	const cardPhase = useAppSelector(selectStudyCardPhase);
	const shownAt = useAppSelector(selectStudyShownAt);
	const currentKey = current ? `${current.type}:${current.id}` : null;
	const [trackedKey, setTrackedKey] = useState(currentKey);
	const [nextLearningAssetDue, setNextLearningAssetDue] = useState<
		string | null
	>(null);
	const { preview: cardDuePreview, schedule } = useCardScheduling(
		current?.type === "card" ? current.id : null,
		shownAt,
	);

	if (currentKey !== trackedKey) {
		setTrackedKey(currentKey);
		setNextLearningAssetDue(null);
	}

	useEffect(() => {
		if (!current || current.type === "card") return;
		void previewNextLearningAsset(current).then(setNextLearningAssetDue);
	}, [current]);

	const answerHidden = current?.type === "card" && cardPhase === "question";

	const grade = (rating: Rating) => {
		if (current?.type !== "card") return;
		const scheduledReview = schedule(rating);
		if (!scheduledReview) return;
		void dispatch(
			gradeCardAction(current.id, scheduledReview, rating, navigate),
		);
	};

	const gradeShortcut = (rating: Rating) => () => {
		if (answerHidden) return;
		grade(rating);
	};
	const learningAssetShortcut = (action: (id: ElementId) => void) => () => {
		if (!current || current.type === "card") return;
		action(current);
	};

	// Only bound mid-session, so these keys stay free the rest of the time.
	useAppHotkeys(
		current
			? [
					[
						SHOW_ANSWER_SHORTCUT,
						() => {
							if (answerHidden) dispatch(answerShown());
						},
					],
					[GRADE_AGAIN_SHORTCUT, gradeShortcut("again")],
					[GRADE_HARD_SHORTCUT, gradeShortcut("hard")],
					[GRADE_GOOD_SHORTCUT, gradeShortcut("good")],
					[GRADE_EASY_SHORTCUT, gradeShortcut("easy")],
					[
						SKIP_LEARNING_ASSET_SHORTCUT,
						learningAssetShortcut(
							id =>
								void dispatch(
									skipLearningAssetAction(id, navigate),
								),
						),
					],
					[
						NEXT_LEARNING_ASSET_SHORTCUT,
						learningAssetShortcut(
							id =>
								void dispatch(
									nextLearningAssetAction(id, navigate),
								),
						),
					],
					[
						PICK_DUE_DATE_SHORTCUT,
						learningAssetShortcut(() =>
							runCommand("open-due-date"),
						),
					],
					[
						FINISH_LEARNING_ASSET_SHORTCUT,
						learningAssetShortcut(
							id =>
								void dispatch(
									finishLearningAssetAction(id, navigate),
								),
						),
					],
				]
			: [],
	);

	if (away) return <AwayStudySessionBar />;
	if (!current) return null;

	return (
		<SessionBarFrame>
			{answerHidden ? (
				<AppTooltip touch shortcut={SHOW_ANSWER_SHORTCUT}>
					<Button
						variant="default"
						size="sm"
						onClick={() => dispatch(answerShown())}>
						Show answer
					</Button>
				</AppTooltip>
			) : current.type === "card" ? (
				<Group gap="xs" wrap="nowrap" align="flex-end">
					{RATINGS.map(({ rating, label, shortcut }) => (
						<AppTooltip
							key={rating}
							touch
							label={
								cardDuePreview &&
								formatRelativeDueDate(
									cardDuePreview[rating].due,
								)
							}
							shortcut={shortcut}>
							<Button
								size="sm"
								variant="default"
								onClick={() => grade(rating)}>
								{label}
							</Button>
						</AppTooltip>
					))}
				</Group>
			) : (
				<Group gap="xs" wrap="nowrap" align="flex-end">
					<AppTooltip
						touch
						label="Move to the end of the queue"
						shortcut={SKIP_LEARNING_ASSET_SHORTCUT}>
						<Button
							variant="default"
							size="sm"
							onClick={() =>
								void dispatch(
									skipLearningAssetAction(current, navigate),
								)
							}>
							Skip
						</Button>
					</AppTooltip>
					<AppTooltip
						touch
						label={
							nextLearningAssetDue &&
							formatRelativeDueDate(nextLearningAssetDue)
						}
						shortcut={NEXT_LEARNING_ASSET_SHORTCUT}>
						<Button
							variant="default"
							size="sm"
							onClick={() =>
								void dispatch(
									nextLearningAssetAction(current, navigate),
								)
							}>
							Next
						</Button>
					</AppTooltip>
					<AppTooltip
						touch
						label="Won't repeat"
						shortcut={FINISH_LEARNING_ASSET_SHORTCUT}>
						<Button
							variant="default"
							size="sm"
							onClick={() =>
								void dispatch(
									finishLearningAssetAction(
										current,
										navigate,
									),
								)
							}>
							Finish
						</Button>
					</AppTooltip>
				</Group>
			)}
		</SessionBarFrame>
	);
}

export default StudySessionBar;
