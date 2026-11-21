import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import CardElementViewer from "./CardElementViewer";
import ExtractElementViewer from "./ExtractElementViewer";
import FindInPageBar from "./FindInPageBar";
import RemoveHighlightModal from "./RemoveHighlightModal";
import LearningAssetView from "../LearningAssetView/LearningAssetView";
import SearchHighlightOverlay from "../../../components/Editor/plugins/SearchHighlightPlugin/SearchHighlightOverlay";
import { SearchHighlightRegistry } from "../../../components/Editor/plugins/SearchHighlightPlugin/searchHighlightRegistry";
import { SearchHighlightRegistryContext } from "../../../components/Editor/plugins/SearchHighlightPlugin/searchHighlightRegistryContext";
import {
	updateCard,
	updateExtract,
} from "../../../api/elements/api/elementsApi";
import { AnyElementDto } from "../../../api/elements/dto/anyElementDto";
import { useElementViewerButtons } from "../hooks/useElementViewerButtons";
import { useHighlightCreatedHandler } from "../hooks/useHighlightCreatedHandler";

// The PDF engine is large, so it loads with the first PDF opened rather than at startup.
const PdfLearningAssetView = lazy(
	() => import("../PdfView/PdfLearningAssetView"),
);

type ContentElement = Exclude<AnyElementDto, { type: "folder" }>;

/** Everything an open card, extract or learning asset needs, which brings in the editor. */
export default function ElementContentViewer({
	currentElement,
}: {
	currentElement: ContentElement;
}) {
	const elementId = currentElement.data.meta.elementId;
	const [searchHighlightRegistry] = useState(
		() => new SearchHighlightRegistry(),
	);
	const {
		buttons,
		pendingHighlightRemoval,
		confirmHighlightRemoval,
		cancelHighlightRemoval,
	} = useElementViewerButtons();
	const handleHighlightCreated = useHighlightCreatedHandler(elementId);

	const frontContentRef = useRef("");
	const backContentRef = useRef("");

	useEffect(() => {
		if (currentElement.type !== "card") return;
		frontContentRef.current = currentElement.data.front;
		backContentRef.current = currentElement.data.back;
		// eslint-disable-next-line react-hooks/exhaustive-deps -- only reset refs when navigating to a different card
	}, [elementId.id]);

	const handleChange = useCallback(
		async (content: string) => {
			if (elementId.type !== "extract") return;
			await updateExtract({ id: elementId.id, content });
		},
		[elementId],
	);

	const handleFrontChange = useCallback(
		async (content: string) => {
			if (elementId.type !== "card") return;
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
			if (elementId.type !== "card") return;
			backContentRef.current = content;
			await updateCard({
				id: elementId.id,
				front: frontContentRef.current,
				back: content,
			});
		},
		[elementId],
	);

	const isPdf =
		currentElement.type === "learningAsset" &&
		currentElement.data.type === "pdf";

	if (isPdf) {
		return (
			<Suspense>
				<PdfLearningAssetView
					key={`pdf-${elementId.id}`}
					learningAssetId={elementId.id}
					readPoint={currentElement.data.readPoint}
				/>
			</Suspense>
		);
	}

	return (
		<SearchHighlightRegistryContext value={searchHighlightRegistry}>
			<FindInPageBar />
			<SearchHighlightOverlay />
			<RemoveHighlightModal
				removal={pendingHighlightRemoval}
				onConfirm={confirmHighlightRemoval}
				onClose={cancelHighlightRemoval}
			/>
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
				/>
			)}
			{currentElement.type === "extract" && (
				<ExtractElementViewer
					elementId={elementId}
					extract={currentElement.data}
					buttons={buttons}
					onChange={handleChange}
					onHighlightCreated={handleHighlightCreated}
				/>
			)}
		</SearchHighlightRegistryContext>
	);
}
