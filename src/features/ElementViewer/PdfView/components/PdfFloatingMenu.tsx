import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { useRegistry } from "@embedpdf/core/react";
import { useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import {
	useActiveDocument,
	useDocumentManagerCapability,
} from "@embedpdf/plugin-document-manager/react";
import {
	SelectionSelectionMenuProps,
	useSelectionCapability,
} from "@embedpdf/plugin-selection/react";
import FloatingMenuBar, {
	FloatingMenuBarItem,
} from "../../../../components/FloatingMenuBar/FloatingMenuBar";
import useAppDispatch from "../../../../hooks/useAppDispatch";
import useAppSelector from "../../../../hooks/useAppSelector";
import { paths } from "../../../../paths";
import {
	createCardAction,
	createExtractAction,
} from "../../../../stores/elements/elementsActions";
import { selectSettings } from "../../../../stores/settings/settingsSelector";
import {
	ADD_AI_CONTEXT_BUTTON,
	CLOZE_BUTTON,
	EXTRACT_BUTTON,
	OPEN_HIGHLIGHT_BUTTON,
	REMOVE_HIGHLIGHT_BUTTON,
} from "../../highlightFloatingMenuButtons";
import {
	buildClozeCardDto,
	buildExtractDto,
	ClozeSelectionSlice,
} from "./pdfFloatingMenuContent";
import {
	buildHighlightAnnotations,
	CLOZE_HIGHLIGHT_COLOR,
	EXTRACT_HIGHLIGHT_COLOR,
	findFirstHighlightedElement,
	findHighlightsUnderSelection,
	flattenHighlightRects,
	isPdfHighlightAnnotation,
} from "./pdfHighlightAnnotations";

interface PdfFloatingMenuProps extends SelectionSelectionMenuProps {
	learningAssetId: string;
	onHighlightCreated: (lastPageIndex: number) => void;
}

export default function PdfFloatingMenu({
	menuWrapperProps,
	placement,
	learningAssetId,
	onHighlightCreated,
}: PdfFloatingMenuProps) {
	const dispatch = useAppDispatch();
	const navigate = useNavigate();
	const aiEnabled = useAppSelector(selectSettings)?.enableAi ?? false;
	const { activeDocumentId } = useActiveDocument();
	const { provides: selection } = useSelectionCapability();
	const { provides: documentManager } = useDocumentManagerCapability();
	const { provides: annotation } = useAnnotationCapability();
	const { registry } = useRegistry();
	const parent = useMemo(
		() => ({ type: "learningAsset" as const, id: learningAssetId }),
		[learningAssetId],
	);

	const getPdfHighlights = useCallback(() => {
		if (!annotation || !activeDocumentId) return [];
		return annotation
			.forDocument(activeDocumentId)
			.getAnnotations()
			.map(tracked => tracked.object)
			.filter(isPdfHighlightAnnotation);
	}, [annotation, activeDocumentId]);

	const highlightUnderSelection = useMemo(() => {
		if (!selection || !activeDocumentId) return null;
		const selectionRects = flattenHighlightRects(
			selection.forDocument(activeDocumentId).getHighlightRects(),
		);
		if (selectionRects.length === 0) return null;
		return findFirstHighlightedElement(getPdfHighlights(), selectionRects);
	}, [selection, activeDocumentId, getPdfHighlights]);

	const handleOpenHighlight = useCallback(() => {
		if (!highlightUnderSelection) return;
		void navigate(
			paths.element(
				highlightUnderSelection.elementType,
				highlightUnderSelection.elementId,
			),
		);
	}, [highlightUnderSelection, navigate]);

	const handleRemoveHighlight = useCallback(() => {
		if (!selection || !annotation || !activeDocumentId) return;
		const selectionRects = flattenHighlightRects(
			selection.forDocument(activeDocumentId).getHighlightRects(),
		);
		if (selectionRects.length === 0) return;
		const toDelete = findHighlightsUnderSelection(
			getPdfHighlights(),
			selectionRects,
		);
		if (toDelete.length === 0) return;
		annotation.forDocument(activeDocumentId).deleteAnnotations(toDelete);
	}, [selection, annotation, activeDocumentId, getPdfHighlights]);

	const handleCreateExtract = useCallback(() => {
		if (!selection || !activeDocumentId || !annotation) return;
		const scope = selection.forDocument(activeDocumentId);
		const boundingRects = flattenHighlightRects(scope.getHighlightRects());
		if (boundingRects.length === 0) return;
		void scope
			.getSelectedText()
			.toPromise()
			.then(pages => {
				const dto = buildExtractDto(pages, parent);
				if (!dto) return;
				void dispatch(createExtractAction(dto));
				const annotationScope =
					annotation.forDocument(activeDocumentId);
				for (const highlight of buildHighlightAnnotations(
					boundingRects,
					dto.id,
					"extract",
					EXTRACT_HIGHLIGHT_COLOR,
				)) {
					annotationScope.createAnnotation(
						highlight.pageIndex,
						highlight,
					);
				}
				onHighlightCreated(
					Math.max(...boundingRects.map(({ page }) => page)),
				);
			});
	}, [
		selection,
		activeDocumentId,
		annotation,
		parent,
		dispatch,
		onHighlightCreated,
	]);

	const handleCreateCloze = useCallback(() => {
		if (
			!selection ||
			!activeDocumentId ||
			!documentManager ||
			!registry ||
			!annotation
		) {
			return;
		}
		const scope = selection.forDocument(activeDocumentId);
		const boundingRects = flattenHighlightRects(scope.getHighlightRects());
		const pageIndexes = Array.from(
			new Set(boundingRects.map(({ page }) => page)),
		).sort((a, b) => a - b);
		const doc = documentManager.getActiveDocument();
		if (pageIndexes.length === 0 || !doc) return;

		const engine = registry.getEngine();
		const slices = scope.getState().slices;
		const selectionSlices: (ClozeSelectionSlice | undefined)[] =
			pageIndexes.map(pageIndex => slices[pageIndex]);
		void Promise.all([
			scope.getSelectedText().toPromise(),
			Promise.all(
				pageIndexes.map(pageIndex =>
					engine.extractText(doc, [pageIndex]).toPromise(),
				),
			),
		]).then(([selectedTexts, pageTexts]) => {
			const dto = buildClozeCardDto(
				pageTexts,
				selectedTexts,
				parent,
				selectionSlices,
			);
			if (!dto) return;
			void dispatch(createCardAction(dto));
			const annotationScope = annotation.forDocument(activeDocumentId);
			for (const highlight of buildHighlightAnnotations(
				boundingRects,
				dto.id,
				"card",
				CLOZE_HIGHLIGHT_COLOR,
			)) {
				annotationScope.createAnnotation(
					highlight.pageIndex,
					highlight,
				);
			}
			onHighlightCreated(Math.max(...pageIndexes));
		});
	}, [
		selection,
		activeDocumentId,
		documentManager,
		registry,
		annotation,
		parent,
		dispatch,
		onHighlightCreated,
	]);

	const items = useMemo<FloatingMenuBarItem[]>(
		() => [
			{ ...EXTRACT_BUTTON, onClick: handleCreateExtract },
			{ ...CLOZE_BUTTON, onClick: handleCreateCloze },
			...(aiEnabled
				? [
						{
							name: "add-ai-context-divider",
							divider: true as const,
						},
						ADD_AI_CONTEXT_BUTTON,
					]
				: []),
			{ name: "create-highlight-divider", divider: true },
			{
				...OPEN_HIGHLIGHT_BUTTON,
				isVisible: !!highlightUnderSelection,
				onClick: handleOpenHighlight,
			},
			{
				...REMOVE_HIGHLIGHT_BUTTON,
				isVisible: !!highlightUnderSelection,
				onClick: handleRemoveHighlight,
			},
		],
		[
			aiEnabled,
			handleCreateExtract,
			handleCreateCloze,
			highlightUnderSelection,
			handleOpenHighlight,
			handleRemoveHighlight,
		],
	);

	return (
		<div {...menuWrapperProps}>
			<FloatingMenuBar
				items={items}
				style={{
					position: "absolute",
					left: "50%",
					transform: "translateX(-50%)",
					pointerEvents: "auto",
					zIndex: 100,
					width: "max-content",
					...(placement.suggestTop
						? { bottom: "100%", marginBottom: 8 }
						: { top: "100%", marginTop: 8 }),
				}}
			/>
		</div>
	);
}
