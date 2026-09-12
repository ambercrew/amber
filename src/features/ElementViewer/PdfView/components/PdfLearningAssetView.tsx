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
import { SelectionPluginPackage } from "@embedpdf/plugin-selection/react";
import { SearchPluginPackage } from "@embedpdf/plugin-search/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import { getPdfBytes } from "../../../../api/elements/api/elementsApi";
import { MetaResponseDto } from "../../../../api/elements/dto/anyElementDto";
import useApi from "../../../../hooks/useApi";
import { ReadPoint } from "../../../../types/elements/readPoint";
import { base64ToArrayBuffer } from "../../../../utils/base64ToArrayBuffer";
import PdfDocumentContent from "./PdfDocumentContent";

const WASM_URL = "/pdfium/pdfium.wasm";

interface PdfLearningAssetViewProps {
	learningAssetId: string;
	readPoint: ReadPoint;
	meta: MetaResponseDto;
}

// TODO:
// 1. More manual testing (also test sync)
// 2. Better performance (mesaure on big documents with many highlights) and seraching
export default function PdfLearningAssetView({
	learningAssetId,
	readPoint,
	meta,
}: PdfLearningAssetViewProps) {
	const [pdfBytesBase64, setPdfBytesBase64] = useState<string | null>(null);
	const { callApi, errorMessage } = useApi();

	useEffect(() => {
		let cancelled = false;
		void callApi(async () => {
			const { bytesBase64 } = await getPdfBytes(learningAssetId);
			if (!cancelled) setPdfBytesBase64(bytesBase64);
		});
		return () => {
			cancelled = true;
		};
	}, [learningAssetId, callApi]);

	const buffer = useMemo(
		() => (pdfBytesBase64 ? base64ToArrayBuffer(pdfBytesBase64) : null),
		[pdfBytesBase64],
	);

	const { engine, error: engineError } = usePdfiumEngine({
		wasmUrl: WASM_URL,
		worker: false,
	});

	const plugins = useMemo(
		() =>
			buffer
				? [
						createPluginRegistration(DocumentManagerPluginPackage, {
							// No fixed `documentId` here: under StrictMode's double
							// mount, a shared-id orphaned instance can close the real
							// one's document. Let the plugin generate a fresh id.
							initialDocuments: [{ buffer, name: meta.name }],
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
						createPluginRegistration(SearchPluginPackage),
						createPluginRegistration(HistoryPluginPackage),
						createPluginRegistration(AnnotationPluginPackage, {
							// Skip the slow native-PDF write; we persist our own
							// JSON blob instead (usePdfAnnotationsPersistence).
							autoCommit: false,
						}),
					]
				: null,
		[buffer, meta.name],
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

	if (!buffer || !plugins || !engine) {
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
