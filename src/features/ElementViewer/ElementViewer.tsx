import { useCallback, useEffect, useRef } from "react";
import { Center, Loader } from "@mantine/core";
import CardElementViewer from "./CardElementViewer";
import ExtractElementViewer from "./ExtractElementViewer";
import FindInPageBar from "./FindInPageBar";
import FolderView from "./FolderView";
import LearningAssetView from "./LearningAssetView/LearningAssetView";
import useAppSelector from "../../hooks/useAppSelector";
import { selectCurrentElement } from "../../stores/elements/elementsSelectors";
import { selectStudyStatus } from "../../stores/study/studySelectors";
import { selectIsSyncing } from "../../stores/sync/syncSelector";
import { updateCard, updateExtract } from "../../api/elements/api/elementsApi";
import { useElementViewerButtons } from "./hooks/useElementViewerButtons";
import { useHighlightCreatedHandler } from "./hooks/useHighlightCreatedHandler";

export default function ElementViewer() {
	const currentElement = useAppSelector(selectCurrentElement);
	const studyStatus = useAppSelector(selectStudyStatus);
	const isSyncing = useAppSelector(selectIsSyncing);
	const elementId = currentElement?.data?.meta?.elementId;
	const buttons = useElementViewerButtons();
	const handleHighlightCreated = useHighlightCreatedHandler(elementId);

	const frontContentRef = useRef("");
	const backContentRef = useRef("");

	useEffect(() => {
		if (currentElement?.type !== "card") return;
		frontContentRef.current = currentElement.data.front;
		backContentRef.current = currentElement.data.back;
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only reset refs when navigating to a different card
	}, [elementId?.id]);

	const handleChange = useCallback(
		async (content: string) => {
			if (elementId?.type !== "extract") return;
			await updateExtract({ id: elementId.id, content });
		},
		[elementId],
	);

	const handleFrontChange = useCallback(
		async (content: string) => {
			if (elementId?.type !== "card") return;
			frontContentRef.current = content;
			await updateCard({
				id: elementId.id,
				front: content,
				back: backContentRef.current,
			});
		},
		[elementId],
	);

	const handleBackChange = useCallback(
		async (content: string) => {
			if (elementId?.type !== "card") return;
			backContentRef.current = content;
			await updateCard({
				id: elementId.id,
				front: frontContentRef.current,
				back: content,
			});
		},
		[elementId],
	);

	if (!currentElement || !elementId || currentElement.type === "folder") {
		return <FolderView />;
	}

	if (isSyncing) {
		return (
			<Center py="xl">
				<Loader />
			</Center>
		);
	}

	return (
		<>
			<FindInPageBar />
			{currentElement.type === "card" && (
				<CardElementViewer
					elementId={elementId}
					card={currentElement.data}
					buttons={buttons}
					onFrontChange={handleFrontChange}
					onBackChange={handleBackChange}
					onHighlightCreated={handleHighlightCreated}
				/>
			)}
			{currentElement.type === "learningAsset" && (
				<LearningAssetView
					key={`learningAsset-${elementId.id}`}
					learningAssetId={elementId.id}
					readPoint={currentElement.data.readPoint}
					meta={currentElement.data.meta}
					buttons={buttons}
					onHighlightCreated={handleHighlightCreated}
					autoFocus={studyStatus === "editing"}
				/>
			)}
			{currentElement.type === "extract" && (
				<ExtractElementViewer
					elementId={elementId}
					extract={currentElement.data}
					buttons={buttons}
					autoFocus={studyStatus === "editing"}
					onChange={handleChange}
					onHighlightCreated={handleHighlightCreated}
				/>
			)}
		</>
	);
}
