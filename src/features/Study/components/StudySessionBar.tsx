import { useEffect, useRef, useState } from "react";
import { Box, Button, Group, Text } from "@mantine/core";
import { useNavigate } from "react-router";
import { SMALL_SCREEN_BREAKPOINT } from "../../../hooks/useIsSmallScreen";
import { previewNextLearningAsset } from "../../../api/study/api/studyApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { useCardScheduling } from "../hooks/useCardScheduling";
import { useElapsedSeconds } from "../hooks/useElapsedSeconds";
import {
	finishLearningAssetAction,
	gradeCardAction,
	nextLearningAssetAction,
	skipLearningAssetAction,
} from "../../../stores/study/studyActions";
import { answerShown, elementShown } from "../../../stores/study/studyReducer";
import {
	selectStudyCardPhase,
	selectStudyCurrentElement,
	selectStudyQueue,
	selectStudyShownAt,
	selectStudyTotalCount,
} from "../../../stores/study/studySelectors";
import { ElementId } from "../../../types/elements/elementId";
import { Rating } from "../../../types/study/rating";
import { formatRelativeDueDate } from "../../../utils/formatRelativeDueDate";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import { useAppHotkeys } from "../../../commands/useAppHotkeys";

const SHOW_ANSWER_SHORTCUT = "space";

const RATINGS: { rating: Rating; label: string; shortcut: string }[] = [
	{ rating: "again", label: "Again", shortcut: "1" },
	{ rating: "hard", label: "Hard", shortcut: "2" },
	{ rating: "good", label: "Good", shortcut: "3" },
	{ rating: "easy", label: "Easy", shortcut: "4" },
];

function formatElapsed(totalSeconds: number): string {
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function StudySessionBar() {
	const dispatch = useAppDispatch();
	const navigate = useNavigate();
	const current = useAppSelector(selectStudyCurrentElement);
	const queue = useAppSelector(selectStudyQueue);
	const totalCount = useAppSelector(selectStudyTotalCount);
	const cardPhase = useAppSelector(selectStudyCardPhase);
	const shownAt = useAppSelector(selectStudyShownAt);
	const elapsedSeconds = useElapsedSeconds(shownAt);
	const currentKey = current ? `${current.type}:${current.id}` : null;
	const [trackedKey, setTrackedKey] = useState(currentKey);
	const [nextLearningAssetDue, setNextLearningAssetDue] = useState<
		string | null
	>(null);
	const isFirstRender = useRef(true);
	const { preview: cardDuePreview, schedule } = useCardScheduling(
		current?.type === "card" ? current.id : null,
		shownAt,
	);

	if (currentKey !== trackedKey) {
		setTrackedKey(currentKey);
		setNextLearningAssetDue(null);
	}

	useEffect(() => {
		if (!current) return;

		// Skip the mount that lands on whichever element the session already
		// started/advanced to — only reset the timer/phase for element
		// changes that happen afterwards (e.g. a jump via the priority
		// queue), which the session-advance actions don't already handle.
		if (isFirstRender.current) {
			isFirstRender.current = false;
		} else {
			dispatch(elementShown());
		}

		if (current.type !== "card") {
			void previewNextLearningAsset(current).then(
				setNextLearningAssetDue,
			);
		}
	}, [current, dispatch]);

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

	useAppHotkeys([
		[
			SHOW_ANSWER_SHORTCUT,
			() => {
				if (answerHidden) dispatch(answerShown());
			},
		],
		["1", gradeShortcut("again")],
		["2", gradeShortcut("hard")],
		["3", gradeShortcut("good")],
		["4", gradeShortcut("easy")],
		[
			"1",
			learningAssetShortcut(
				id => void dispatch(skipLearningAssetAction(id, navigate)),
			),
		],
		[
			"2",
			learningAssetShortcut(
				id => void dispatch(nextLearningAssetAction(id, navigate)),
			),
		],
		[
			"3",
			learningAssetShortcut(
				id => void dispatch(finishLearningAssetAction(id, navigate)),
			),
		],
	]);

	if (!current) return null;

	return (
		<Group h="100%" px="sm" py="xs" wrap="nowrap" align="center">
			<Box flex={1}>
				<Text
					size="sm"
					c="dimmed"
					visibleFrom={SMALL_SCREEN_BREAKPOINT}>
					{totalCount - queue.length + 1}/{totalCount}
				</Text>
			</Box>

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
						shortcut="1">
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
						shortcut="2">
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
					<AppTooltip touch label="Won't repeat" shortcut="3">
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

			<Box
				flex={1}
				style={{ display: "flex", justifyContent: "flex-end" }}>
				<Text
					size="sm"
					c="dimmed"
					visibleFrom={SMALL_SCREEN_BREAKPOINT}>
					{formatElapsed(elapsedSeconds)}
				</Text>
			</Box>
		</Group>
	);
}

export default StudySessionBar;
