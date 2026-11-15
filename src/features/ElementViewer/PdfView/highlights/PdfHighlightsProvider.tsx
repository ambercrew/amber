import {
	PropsWithChildren,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { notifications } from "@mantine/notifications";
import {
	getPdfHighlights,
	updatePdfHighlights,
} from "../../../../api/elements/api/elementsApi";
import errorToString from "../../../../utils/errorToString";
import {
	parseStoredHighlights,
	PdfHighlightAnnotation,
	serializeHighlights,
} from "./pdfHighlightAnnotations";
import {
	groupHighlightsByPage,
	PdfHighlightsContext,
} from "./pdfHighlightsContext";

function showHighlightError(message: string, error: unknown) {
	// eslint-disable-next-line no-console
	console.error(error);
	notifications.show({
		message: `${message} ${errorToString(error)}`,
		color: "red",
	});
}

interface PdfHighlightsProviderProps extends PropsWithChildren {
	learningAssetId: string;
}

/** Loads the learning asset's highlights and saves them back as they change. Remounted per asset, with the viewer. */
export default function PdfHighlightsProvider({
	learningAssetId,
	children,
}: PdfHighlightsProviderProps) {
	const [highlights, setHighlights] = useState<PdfHighlightAnnotation[]>([]);
	// `null` until loaded; stays `null` after a failed load, so saving can't replace the unread highlights with none.
	const [loaded, setLoaded] = useState<PdfHighlightAnnotation[] | null>(null);
	const changedRef = useRef(false);
	// Chained, so saves land in the order they were made and an earlier one can't overwrite a later one.
	const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());

	useEffect(() => {
		let cancelled = false;
		getPdfHighlights(learningAssetId)
			.then(({ highlightsJson }) => {
				if (cancelled) return;
				const stored = parseStoredHighlights(highlightsJson);
				// Keeps highlights made while loading.
				setHighlights(current => [...stored, ...current]);
				setLoaded(stored);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				showHighlightError(
					"Could not load this PDF's highlights — new highlights won't be saved.",
					error,
				);
			});
		return () => {
			cancelled = true;
		};
	}, [learningAssetId]);

	useEffect(() => {
		if (!loaded || !changedRef.current) return;
		const highlightsJson = serializeHighlights(highlights);
		saveQueueRef.current = saveQueueRef.current
			.then(() =>
				updatePdfHighlights({ learningAssetId, highlightsJson }),
			)
			.catch((error: unknown) =>
				showHighlightError(
					"Could not save this PDF's highlights.",
					error,
				),
			);
	}, [highlights, loaded, learningAssetId]);

	const addHighlights = useCallback((added: PdfHighlightAnnotation[]) => {
		if (added.length === 0) return;
		changedRef.current = true;
		setHighlights(current => [...current, ...added]);
	}, []);
	const removeHighlights = useCallback((ids: string[]) => {
		if (ids.length === 0) return;
		const removed = new Set(ids);
		changedRef.current = true;
		setHighlights(current => current.filter(({ id }) => !removed.has(id)));
	}, []);

	const highlightsByPage = useMemo(
		() => groupHighlightsByPage(highlights),
		[highlights],
	);
	const value = useMemo(
		() => ({
			highlights,
			highlightsByPage,
			addHighlights,
			removeHighlights,
		}),
		[highlights, highlightsByPage, addHighlights, removeHighlights],
	);
	return (
		<PdfHighlightsContext value={value}>{children}</PdfHighlightsContext>
	);
}
