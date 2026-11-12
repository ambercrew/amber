import { useCallback, useMemo } from "react";
import { useMounted } from "@mantine/hooks";
import { MantineTransition, Transition } from "@mantine/core";
import { useStore } from "react-redux";
import { useNavigate } from "react-router";
import { useDocuments, useSelector } from "@embedpdf/react/runtime";
import { SelectionToken, useSelection } from "@embedpdf/react/selection";
import FloatingMenuBar, {
	FloatingMenuBarItem,
} from "../../../../components/FloatingMenuBar/FloatingMenuBar";
import { floatingMenuPop } from "../../../../components/FloatingMenuBar/floatingMenuPop";
import { MOTION_DURATION_MS, MOTION_EASING } from "../../../../config/motion";
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
	existsInTree,
} from "../../../../stores/elements/elementsActions";
import { RootState } from "../../../../stores/store";
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
import { buildClozeCardDto, buildExtractDto } from "./pdfFloatingMenuContent";
import {
	buildHighlightAnnotations,
	CLOZE_HIGHLIGHT_COLOR,
	EXTRACT_HIGHLIGHT_COLOR,
	findFirstHighlightedElement,
	findHighlightsUnderSelection,
	PdfHighlightCustomData,
} from "./pdfHighlightAnnotations";
import { usePdfHighlights } from "./pdfHighlightsContext";
import {
	listSelectedPages,
	readClozePageTexts,
	readSelectedTexts,
	SelectedPage,
	selectedLineRects,
} from "./pdfSelection";
import { PdfHighlightRemoval } from "./usePdfHighlightRemoval";

/** Mantine's `pop`, growing out of the selection whether the menu sits above or below it. */
function popTransition(above: boolean): MantineTransition {
	return {
		...floatingMenuPop(above),
		common: { transformOrigin: `${above ? "bottom" : "top"} center` },
	};
}

interface PdfFloatingMenuProps {
	learningAssetId: string;
	/** Whether the menu sits above the selection, so it grows out of the right edge. */
	above: boolean;
	onHighlightCreated: (lastPageIndex: number) => void;
	/** Asks to confirm a removal that would trash elements created from the highlights. */
	onConfirmRemoval: (removal: PdfHighlightRemoval) => void;
}

/** The actions on a settled text selection: extract, cloze, AI, and opening or removing a highlight under it. */
export default function PdfFloatingMenu({
	learningAssetId,
	above,
	onHighlightCreated,
	onConfirmRemoval,
}: PdfFloatingMenuProps) {
	// Mounts with the selection, so it opens a frame later for Mantine's enter animation to play.
	const opened = useMounted();
	const dispatch = useAppDispatch();
	const store = useStore<RootState>();
	const navigate = useNavigate();
	const aiEnabled = useAppSelector(selectSettings)?.enableAi ?? false;
	const selection = useSelection();
	const documents = useDocuments();
	const { highlights, addHighlights, removeHighlights } = usePdfHighlights();
	const parent = useMemo(
		() => ({ type: "learningAsset" as const, id: learningAssetId }),
		[learningAssetId],
	);

	const selectedPages = useCallback(
		() => listSelectedPages(selection, documents),
		[selection, documents],
	);

	// Reference-stable until the selection changes, so this follows lines that land after the menu mounts.
	const snapshot = useSelector(SelectionToken, current =>
		current.getSnapshot(),
	);
	const highlightUnderSelection = useMemo(
		() =>
			findFirstHighlightedElement(
				highlights,
				selectedLineRects(selectedPages()),
			),
		// eslint-disable-next-line react-hooks/exhaustive-deps -- `snapshot` is what `selectedPages` reads.
		[highlights, selectedPages, snapshot],
	);

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
		const underSelection = new Set(
			findHighlightsUnderSelection(
				highlights,
				selectedLineRects(selectedPages()),
			),
		);
		if (underSelection.size === 0) return;
		// As in the editor, the element goes with every highlight made for it, on every page.
		const elements = new Map(
			highlights
				.filter(({ id }) => underSelection.has(id))
				.map(({ custom }) => [
					custom.elementId,
					{ type: custom.elementType, id: custom.elementId },
				]),
		);
		const highlightIds = highlights
			.filter(({ custom }) => elements.has(custom.elementId))
			.map(({ id }) => id);
		const { tree } = store.getState().elements;
		const elementIds = Array.from(elements.values()).filter(elementId =>
			existsInTree(tree, elementId),
		);
		// Nothing would be trashed, so there's nothing to confirm.
		if (elementIds.length === 0) {
			removeHighlights(highlightIds);
			return;
		}
		onConfirmRemoval({ highlightIds, elementIds });
	}, [highlights, selectedPages, store, removeHighlights, onConfirmRemoval]);

	/** Attaches the selection to the AI chat, then sends `prompt` about it when given. */
	const sendSelectionToAi = useCallback(
		(prompt?: string) => {
			void readSelectedTexts(selection, selectedPages()).then(pages => {
				const text = pages.join(" ").trim();
				if (!text) return;
				dispatch(addAiContextSnippet(text));
				if (prompt) {
					dispatch(requestAiPrompt(prompt));
					requestFocus("aiChat");
				}
				selection.clear();
			});
		},
		[selection, selectedPages, dispatch],
	);
	const handleAddAiContext = useCallback(
		() => sendSelectionToAi(),
		[sendSelectionToAi],
	);
	const handleAiCards = useCallback(
		() => sendSelectionToAi(CONVERT_SNIPPET_TO_CARDS_PROMPT),
		[sendSelectionToAi],
	);

	/** Highlights the selection as the element just created from it, then moves the read point and clears the selection. */
	const highlightCreatedElement = useCallback(
		(
			pages: SelectedPage[],
			elementId: string,
			kind: PdfHighlightCustomData["elementType"],
			color: string,
		) => {
			addHighlights(
				buildHighlightAnnotations(
					selectedLineRects(pages),
					elementId,
					kind,
					color,
				),
			);
			onHighlightCreated(
				Math.max(...pages.map(({ pageIndex }) => pageIndex)),
			);
			selection.clear();
		},
		[addHighlights, onHighlightCreated, selection],
	);

	const handleCreateExtract = useCallback(() => {
		const pages = selectedPages();
		if (pages.length === 0) return;
		void readSelectedTexts(selection, pages).then(async texts => {
			const dto = buildExtractDto(texts, parent);
			if (!dto) return;
			// Awaited so the element exists before its highlight is saved pointing at it; a failure keeps the selection.
			if (!(await dispatch(createExtractAction(dto)))) return;
			highlightCreatedElement(
				pages,
				dto.id,
				"extract",
				EXTRACT_HIGHLIGHT_COLOR,
			);
		});
	}, [selectedPages, selection, parent, dispatch, highlightCreatedElement]);

	const handleCreateCloze = useCallback(() => {
		const pages = selectedPages();
		if (pages.length === 0) return;
		void readClozePageTexts(selection, pages).then(async pageTexts => {
			const dto = buildClozeCardDto(pageTexts, parent);
			if (!dto) return;
			// Awaited for the same reason as the extract's.
			if (!(await dispatch(createCardAction(dto)))) return;
			highlightCreatedElement(
				pages,
				dto.id,
				"card",
				CLOZE_HIGHLIGHT_COLOR,
			);
		});
	}, [selectedPages, selection, parent, dispatch, highlightCreatedElement]);

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
		<Transition
			mounted={opened}
			transition={popTransition(above)}
			duration={MOTION_DURATION_MS}
			timingFunction={MOTION_EASING}>
			{transitionStyles => (
				<FloatingMenuBar items={items} style={transitionStyles} />
			)}
		</Transition>
	);
}
