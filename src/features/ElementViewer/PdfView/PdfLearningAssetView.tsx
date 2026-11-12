import { useEffect, useMemo, useState } from "react";
import { localEngine } from "@embedpdf/engine";
import { interactionPlugin } from "@embedpdf/react/interaction";
import { linkPlugin } from "@embedpdf/react/link";
import { outlinePlugin } from "@embedpdf/react/outline";
import { renderPlugin } from "@embedpdf/react/render";
import { InitialDocument, Viewer } from "@embedpdf/react/runtime";
import { searchPlugin } from "@embedpdf/react/search";
import { selectionPlugin } from "@embedpdf/react/selection";
import { stagePlugin } from "@embedpdf/react/stage";
import { getPdfBytes } from "../../../api/elements/api/elementsApi";
import useApi from "../../../hooks/useApi";
import errorToString from "../../../utils/errorToString";
import { ReadingPosition } from "../../../types/elements/readingPosition";
import { base64ToArrayBuffer } from "../../../utils/base64ToArrayBuffer";
import { SEARCH_MATCH_COLOR } from "../../../theme";
import PdfStatus from "./core/PdfStatus";
import PdfDocumentContent from "./PdfDocumentContent";

// Costs nothing until a document opens; PDFium then boots in a worker, shared by every PDF opened.
const engine = localEngine();

const PAGE_SPACING_IN_PX = 16;
const COMPACT_PAGE_SPACING_IN_PX = 4;

/** Padding on every side but the top: a jump lands a page below the top padding, and should land it flush. */
function pagePadding(spacing: number) {
	return { top: 0, right: spacing, bottom: spacing, left: spacing };
}

// Annotations are left to the page picture: our highlights are drawn by the view, never written into the PDF.
const plugins = [
	stagePlugin({
		padding: pagePadding(PAGE_SPACING_IN_PX),
		gap: { px: PAGE_SPACING_IN_PX },
		// The Stage's own compact rule, with the thinner spacing between pages too.
		responsive: [
			{
				name: "compact",
				when: { maxWidth: 600 },
				settings: {
					padding: pagePadding(COMPACT_PAGE_SPACING_IN_PX),
					gap: { px: COMPACT_PAGE_SPACING_IN_PX },
				},
			},
		],
	}),
	renderPlugin(),
	interactionPlugin(),
	selectionPlugin(),
	searchPlugin({
		// Lands a match a third of the way down, clear of the header.
		reveal: { align: { y: 0.3 }, behavior: "instant" },
		// The text view's match colors, in their light shades in both schemes: PDF pages stay white paper.
		highlight: {
			color: `var(--mantine-color-${SEARCH_MATCH_COLOR}-2)`,
			activeColor: `var(--mantine-color-${SEARCH_MATCH_COLOR}-4)`,
			blendMode: "multiply",
		},
	}),
	linkPlugin(),
	outlinePlugin(),
];

interface PdfLearningAssetViewProps {
	learningAssetId: string;
	readPoint: ReadingPosition;
}

export default function PdfLearningAssetView({
	learningAssetId,
	readPoint,
}: PdfLearningAssetViewProps) {
	// Keyed by the id it was fetched for, so the document is never named after a different asset.
	const [pdf, setPdf] = useState<{ id: string; buffer: ArrayBuffer } | null>(
		null,
	);
	const { callApi, errorMessage } = useApi();

	useEffect(() => {
		let cancelled = false;
		void callApi(async () => {
			const { bytesBase64 } = await getPdfBytes(learningAssetId);
			if (!cancelled)
				setPdf({
					id: learningAssetId,
					buffer: base64ToArrayBuffer(bytesBase64),
				});
		});
		return () => {
			cancelled = true;
		};
	}, [learningAssetId, callApi]);

	const initialDocuments = useMemo<InitialDocument[] | null>(
		() =>
			pdf && [
				{
					source: { kind: "bytes", bytes: pdf.buffer },
					name: pdf.id,
				},
			],
		[pdf],
	);

	if (errorMessage)
		return <PdfStatus error={`Could not load the PDF: ${errorMessage}`} />;

	if (!pdf || !initialDocuments || pdf.id !== learningAssetId)
		return <PdfStatus loading="Fetching PDF…" />;

	return (
		// Keyed, as the Viewer reads its documents only when it mounts.
		<Viewer
			key={pdf.id}
			engine={engine}
			plugins={plugins}
			initialDocuments={initialDocuments}
			fallback={<PdfStatus loading="Loading PDF engine…" />}
			renderError={error => (
				<PdfStatus
					error={`Could not load the PDF engine: ${errorToString(error)}`}
				/>
			)}>
			<PdfDocumentContent
				learningAssetId={learningAssetId}
				readPoint={readPoint}
			/>
		</Viewer>
	);
}
