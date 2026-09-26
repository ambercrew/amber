import { useEffect, useMemo, useState } from "react";
import { Center, Loader, Stack, Text } from "@mantine/core";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { DocumentManagerPluginPackage } from "@embedpdf/plugin-document-manager/react";
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { ScrollPluginPackage } from "@embedpdf/plugin-scroll/react";
import { RenderPluginPackage } from "@embedpdf/plugin-render/react";
import { ZoomPluginPackage } from "@embedpdf/plugin-zoom/react";
import { AnnotationPluginPackage } from "@embedpdf/plugin-annotation/react";
import { BookmarkPluginPackage } from "@embedpdf/plugin-bookmark/react";
import { HistoryPluginPackage } from "@embedpdf/plugin-history/react";
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager/react";
import { PanPluginPackage } from "@embedpdf/plugin-pan/react";
import { SelectionPluginPackage } from "@embedpdf/plugin-selection/react";
import { SearchPluginPackage } from "@embedpdf/plugin-search/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import { getPdfBytes } from "../../../../api/elements/api/elementsApi";
import useApi from "../../../../hooks/useApi";
import { ReadPoint } from "../../../../types/elements/readPoint";
import { base64ToArrayBuffer } from "../../../../utils/base64ToArrayBuffer";
import PdfDocumentContent from "./PdfDocumentContent";

const WASM_URL = "/pdfium/pdfium.wasm";

interface PdfLearningAssetViewProps {
	learningAssetId: string;
	readPoint: ReadPoint;
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

	const { engine, error: engineError } = usePdfiumEngine({
		wasmUrl: WASM_URL,
		worker: false,
	});

	const plugins = useMemo(
		() =>
			pdf
				? [
						createPluginRegistration(DocumentManagerPluginPackage, {
							// No fixed `documentId` here: under StrictMode's double
							// mount, a shared-id orphaned instance can close the real
							// one's document. Let the plugin generate a fresh id.
							initialDocuments: [
								{ buffer: pdf.buffer, name: pdf.id },
							],
						}),
						createPluginRegistration(ViewportPluginPackage),
						createPluginRegistration(ScrollPluginPackage),
						createPluginRegistration(RenderPluginPackage),
						createPluginRegistration(ZoomPluginPackage),
						createPluginRegistration(BookmarkPluginPackage),
						createPluginRegistration(
							InteractionManagerPluginPackage,
						),
						createPluginRegistration(SelectionPluginPackage),
						// Touch drags pan the page instead of starting a text
						// selection; desktop click-drag still selects.
						createPluginRegistration(PanPluginPackage, {
							defaultMode: "mobile",
						}),
						createPluginRegistration(SearchPluginPackage),
						createPluginRegistration(HistoryPluginPackage),
						createPluginRegistration(AnnotationPluginPackage, {
							// Skip the slow native-PDF write; we persist our own
							// JSON blob instead (usePdfAnnotationsPersistence).
							autoCommit: false,
						}),
					]
				: null,
		[pdf],
	);

	if (errorMessage) {
		return (
			<Center h="100%">
				<Text c="red">Could not load the PDF: {errorMessage}</Text>
			</Center>
		);
	}

	if (engineError) {
		const message =
			engineError instanceof Error
				? engineError.message
				: JSON.stringify(engineError);
		return (
			<Center h="100%">
				<Text c="red">Could not load the PDF engine: {message}</Text>
			</Center>
		);
	}

	if (!pdf || !plugins || !engine) {
		return (
			<Center h="100%">
				<Stack align="center" gap="xs">
					<Loader size="md" />
					<Text size="md" c="dimmed">
						{!engine ? "Loading PDF engine…" : "Fetching PDF…"}
					</Text>
				</Stack>
			</Center>
		);
	}

	return (
		<EmbedPDF engine={engine} plugins={plugins}>
			<PdfDocumentContent
				learningAssetId={learningAssetId}
				readPoint={readPoint}
			/>
		</EmbedPDF>
	);
}
