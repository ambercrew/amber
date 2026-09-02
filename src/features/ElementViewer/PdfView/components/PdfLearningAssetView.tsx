import { useEffect, useMemo, useState } from "react";
import { Center, Text } from "@mantine/core";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { DocumentManagerPluginPackage } from "@embedpdf/plugin-document-manager/react";
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { ScrollPluginPackage } from "@embedpdf/plugin-scroll/react";
import { RenderPluginPackage } from "@embedpdf/plugin-render/react";
import { ZoomPluginPackage } from "@embedpdf/plugin-zoom/react";
import { BookmarkPluginPackage } from "@embedpdf/plugin-bookmark/react";
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager/react";
import { SelectionPluginPackage } from "@embedpdf/plugin-selection/react";
import { SearchPluginPackage } from "@embedpdf/plugin-search/react";
import { getPdfBytes } from "../../../../api/elements/api/elementsApi";
import { MetaResponseDto } from "../../../../api/elements/dto/anyElementDto";
import { ReadPoint } from "../../../../types/elements/readPoint";
import { base64ToArrayBuffer } from "../../../../utils/base64ToArrayBuffer";
import { getPdfiumEngine } from "../utils/pdfiumEngine";
import PdfDocumentContent from "./PdfDocumentContent";

const WASM_URL = "/pdfium/pdfium.wasm";

interface PdfLearningAssetViewProps {
	learningAssetId: string;
	readPoint: ReadPoint;
	meta: MetaResponseDto;
}

// TODO:
// 1. Let extract and cloze be part of a floating menu like on the editor and make them work
// 2. Let the search use the same component as find in page appearing from top
// 3. Fix readpoints
// 4. Remember zoom percentage in local storage
// 5. Let scroll hide the actuall app header and footer
export default function PdfLearningAssetView({
	learningAssetId,
	readPoint,
	meta,
}: PdfLearningAssetViewProps) {
	const [pdfBytesBase64, setPdfBytesBase64] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void getPdfBytes(learningAssetId).then(({ bytesBase64 }) => {
			if (!cancelled) setPdfBytesBase64(bytesBase64);
		});
		return () => {
			cancelled = true;
		};
	}, [learningAssetId]);

	const buffer = useMemo(
		() => (pdfBytesBase64 ? base64ToArrayBuffer(pdfBytesBase64) : null),
		[pdfBytesBase64],
	);

	const [engine, setEngine] = useState<Awaited<
		ReturnType<typeof getPdfiumEngine>
	> | null>(null);
	const [engineError, setEngineError] = useState<unknown>(null);

	useEffect(() => {
		let cancelled = false;
		getPdfiumEngine(WASM_URL)
			.then(loadedEngine => {
				if (!cancelled) setEngine(loadedEngine);
			})
			.catch((loadError: unknown) => {
				if (!cancelled) setEngineError(loadError);
			});
		return () => {
			cancelled = true;
		};
	}, []);

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
					]
				: null,
		[buffer, meta.name],
	);

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
				<Text size="sm" c="dimmed">
					{!engine ? "Loading PDF engine…" : "Fetching PDF…"}
				</Text>
			</Center>
		);
	}

	return (
		<EmbedPDF engine={engine} plugins={plugins}>
			<PdfDocumentContent />
		</EmbedPDF>
	);
}
