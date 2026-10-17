import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useMounted } from "@mantine/hooks";
import {
	MANTINE_TRANSITIONS,
	MantineTransition,
	Transition,
} from "@mantine/core";
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
import {
	AppHotkeyItem,
	useAppHotkeys,
} from "../../../../commands/useAppHotkeys";
import useAppDispatch from "../../../../hooks/useAppDispatch";
import useAppSelector from "../../../../hooks/useAppSelector";
import { paths } from "../../../../paths";
import {
	createCardAction,
	createExtractAction,
} from "../../../../stores/elements/elementsActions";
import { selectSettings } from "../../../../stores/settings/settingsSelector";
import {
	addAiContextSnippet,
	requestAiPrompt,
} from "../../../../stores/aiContext/aiReducer";
import { requestFocus } from "../../../../hooks/useFocusRequest";
import { CONVERT_SNIPPET_TO_CARDS_PROMPT } from "../../../Ai/aiPrompts";
import {
	ADD_AI_CONTEXT_BUTTON,
	AI_CARDS_BUTTON,
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
	getActivePdfHighlights,
} from "./pdfHighlightAnnotations";
import {
	isBackwardPdfSelection,
	PdfMenuAlign,
	pdfMenuAnchor,
} from "./pdfMenuAnchor";
import { GlyphPointer } from "@embedpdf/plugin-selection";

const ALIGN_SHIFT: Record<PdfMenuAlign, string> = {
	start: "0%",
	center: "-50%",
	end: "-100%",
};
const ALIGN_ORIGIN: Record<PdfMenuAlign, string> = {
	start: "left",
	center: "center",
	end: "right",
};

/** Mantine's `pop`, growing out of the anchor whether the menu sits above or below it. */
function popTransition(above: boolean, align: PdfMenuAlign): MantineTransition {
	const pop = above
		? MANTINE_TRANSITIONS.pop
		: MANTINE_TRANSITIONS["pop-top-left"];
	return {
		...pop,
		common: {
			transformOrigin: `${above ? "bottom" : "top"} ${ALIGN_ORIGIN[align]}`,
		},
	};
}

// The bar's height plus its gap, needed above the selection to open there.
const MENU_ROOM_ABOVE_PX = 56;

interface PdfFloatingMenuProps extends SelectionSelectionMenuProps {
	learningAssetId: string;
	/** Where the current selection's drag began, to tell which end the pointer let go at. */
	selectionAnchor: GlyphPointer | null;
	onHighlightCreated: (lastPageIndex: number) => void;
}

export default function PdfFloatingMenu({
	menuWrapperProps,
	placement,
	context,
	learningAssetId,
	selectionAnchor,
	onHighlightCreated,
}: PdfFloatingMenuProps) {
	// Mounts with the selection, so it opens a frame later for Mantine's enter animation to play.
	const opened = useMounted();
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

	// Re-render when the annotation plugin changes, so the highlight set
	// below can't go stale while this menu stays mounted.
	const annotationState = useSyncExternalStore(
		useCallback(
			(onStoreChange: () => void) => {
				if (!annotation || !activeDocumentId) return () => undefined;
				return annotation
					.forDocument(activeDocumentId)
					.onStateChange(onStoreChange);
			},
			[annotation, activeDocumentId],
		),
		() =>
			annotation && activeDocumentId
				? annotation.forDocument(activeDocumentId).getState()
				: null,
	);

	// Scanning all annotations is O(n), so only recompute when the set changes.
	const highlights = useMemo(
		() => getActivePdfHighlights(annotationState),
		[annotationState],
	);

	const highlightUnderSelection = useMemo(() => {
		if (!selection || !activeDocumentId) return null;
		const selectionRects = flattenHighlightRects(
			selection.forDocument(activeDocumentId).getHighlightRects(),
		);
		if (selectionRects.length === 0) return null;
		return findFirstHighlightedElement(highlights, selectionRects);
	}, [selection, activeDocumentId, highlights]);

	// Embedpdf always prefers below; a backward drag ends at the top, so open above when it fits.
	const { above, anchor } = useMemo(() => {
		const scope =
			selection && activeDocumentId
				? selection.forDocument(activeDocumentId)
				: null;
		const range = scope?.getState().selection ?? null;
		const backward = isBackwardPdfSelection(selectionAnchor, range);
		const above =
			placement.suggestTop ||
			(backward === true &&
				range?.start.page === context.pageIndex &&
				(placement.spaceAbove ?? 0) > MENU_ROOM_ABOVE_PX);
		return {
			above,
			// A fraction of the selection's width, so the page's zoom doesn't matter.
			anchor: pdfMenuAnchor(
				scope?.getHighlightRectsForPage(context.pageIndex) ?? [],
				backward ?? above,
			),
		};
	}, [
		selection,
		activeDocumentId,
		selectionAnchor,
		placement,
		context.pageIndex,
	]);

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
			highlights,
			selectionRects,
		);
		if (toDelete.length === 0) return;
		annotation.forDocument(activeDocumentId).deleteAnnotations(toDelete);
	}, [selection, annotation, activeDocumentId, highlights]);

	/** Attaches the selection to the AI chat, then sends `prompt` about it when given. */
	const sendSelectionToAi = useCallback(
		(prompt?: string) => {
			if (!selection || !activeDocumentId) return;
			const scope = selection.forDocument(activeDocumentId);
			void scope
				.getSelectedText()
				.toPromise()
				.then(pages => {
					const text = pages.join(" ").trim();
					if (!text) return;
					dispatch(addAiContextSnippet(text));
					if (prompt) {
						dispatch(requestAiPrompt(prompt));
						requestFocus("aiChat");
					}
					scope.clear();
				});
		},
		[selection, activeDocumentId, dispatch],
	);
	const handleAddAiContext = useCallback(
		() => sendSelectionToAi(),
		[sendSelectionToAi],
	);
	const handleAiCards = useCallback(
		() => sendSelectionToAi(CONVERT_SNIPPET_TO_CARDS_PROMPT),
		[sendSelectionToAi],
	);

	const handleCreateExtract = useCallback(() => {
		if (!selection || !activeDocumentId || !annotation) return;
		const scope = selection.forDocument(activeDocumentId);
		const boundingRects = flattenHighlightRects(scope.getHighlightRects());
		if (boundingRects.length === 0) return;
		void scope
			.getSelectedText()
			.toPromise()
			.then(async pages => {
				const dto = buildExtractDto(pages, parent);
				if (!dto) return;
				// Awaited so the extract's own DB write finishes before the
				// annotation event below triggers another one (see
				// usePdfAnnotationsPersistence) — otherwise both commands can
				// hit the DB concurrently and race into SQLITE_BUSY.
				await dispatch(createExtractAction(dto));
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
				scope.clear();
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
		]).then(async ([selectedTexts, pageTexts]) => {
			const dto = buildClozeCardDto(
				pageTexts,
				selectedTexts,
				parent,
				selectionSlices,
			);
			if (!dto) return;
			// Awaited for the same reason as the extract path above: keep the
			// card's DB write from racing the annotation-triggered one.
			await dispatch(createCardAction(dto));
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
			scope.clear();
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
						{
							...ADD_AI_CONTEXT_BUTTON,
							onClick: handleAddAiContext,
						},
						{ ...AI_CARDS_BUTTON, onClick: handleAiCards },
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
			handleAddAiContext,
			handleAiCards,
			handleCreateExtract,
			handleCreateCloze,
			highlightUnderSelection,
			handleOpenHighlight,
			handleRemoveHighlight,
		],
	);

	// This menu only mounts while text is selected, so its shortcuts can be global.
	useAppHotkeys(
		items.flatMap(item =>
			!item.divider &&
			item.shortcut &&
			item.onClick &&
			item.isVisible !== false
				? [[item.shortcut, item.onClick] satisfies AppHotkeyItem]
				: [],
		),
	);

	return (
		<div {...menuWrapperProps}>
			<div
				style={{
					position: "absolute",
					left: `${anchor.offset * 100}%`,
					transform: `translateX(${ALIGN_SHIFT[anchor.align]})`,
					pointerEvents: "auto",
					zIndex: 100,
					width: "max-content",
					...(above
						? { bottom: "100%", marginBottom: 8 }
						: { top: "100%", marginTop: 8 }),
				}}>
				<Transition
					mounted={opened}
					transition={popTransition(above, anchor.align)}
					duration={150}>
					{transitionStyles => (
						<FloatingMenuBar
							items={items}
							style={transitionStyles}
						/>
					)}
				</Transition>
			</div>
		</div>
	);
}
