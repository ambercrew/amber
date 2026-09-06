import { useCallback, useMemo } from "react";
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
import { buildClozeCardDto, buildExtractDto } from "./pdfFloatingMenuContent";
import {
	buildHighlightAnnotations,
	CLOZE_HIGHLIGHT_COLOR,
	EXTRACT_HIGHLIGHT_COLOR,
	flattenHighlightRects,
} from "./pdfHighlightAnnotations";

interface PdfFloatingMenuProps extends SelectionSelectionMenuProps {
	learningAssetId: string;
}

// TODO: wire up onClick/isActive/isVisible handlers for add-to-AI-context and
// acting on the highlight under the current PDF text selection.
export default function PdfFloatingMenu({
	menuWrapperProps,
	placement,
	learningAssetId,
}: PdfFloatingMenuProps) {
	const dispatch = useAppDispatch();
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

	const handleCreateExtract = useCallback(() => {
		if (!selection || !activeDocumentId || !annotation) return;
		const scope = selection.forDocument(activeDocumentId);
		const boundingRects = flattenHighlightRects(scope.getHighlightRects());
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
					EXTRACT_HIGHLIGHT_COLOR,
				)) {
					annotationScope.createAnnotation(
						highlight.pageIndex,
						highlight,
					);
				}
			});
	}, [selection, activeDocumentId, annotation, parent, dispatch]);

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
		void Promise.all([
			scope.getSelectedText().toPromise(),
			Promise.all(
				pageIndexes.map(pageIndex =>
					engine.extractText(doc, [pageIndex]).toPromise(),
				),
			),
		]).then(([selectedTexts, pageTexts]) => {
			const dto = buildClozeCardDto(pageTexts, selectedTexts, parent);
			if (!dto) return;
			void dispatch(createCardAction(dto));
			const annotationScope = annotation.forDocument(activeDocumentId);
			for (const highlight of buildHighlightAnnotations(
				boundingRects,
				dto.id,
				CLOZE_HIGHLIGHT_COLOR,
			)) {
				annotationScope.createAnnotation(
					highlight.pageIndex,
					highlight,
				);
			}
		});
	}, [
		selection,
		activeDocumentId,
		documentManager,
		registry,
		annotation,
		parent,
		dispatch,
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
			OPEN_HIGHLIGHT_BUTTON,
			REMOVE_HIGHLIGHT_BUTTON,
		],
		[aiEnabled, handleCreateExtract, handleCreateCloze],
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
