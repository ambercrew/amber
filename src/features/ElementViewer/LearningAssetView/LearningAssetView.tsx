import { useEffect, useState } from "react";
import { Center, Loader } from "@mantine/core";
import { getLearningAssetSplitManifest } from "../../../api/elements/api/elementsApi";
import { MetaResponseDto } from "../../../api/elements/dto/anyElementDto";
import { FloatingMenuItem } from "../../../components/Editor/plugins/FloatingMenuPlugin";
import { HighlightCreatedPayload } from "../../../components/Editor/plugins/HighlightPlugin/highlightCommands";
import { LearningAssetSplitMetaDto } from "../../../types/elements/learningAssetSplitMetaDto";
import { ReadingPosition } from "../../../types/elements/readingPosition";
import ContentOriginPanel from "../ContentOriginPanel";
import ReaderCoreProvider from "./core/ReaderCoreProvider";
import { learningAssetPlugins } from "./plugins";
import { PluginParts, PluginProviders } from "./plugins/PluginHost";
import SplitStack from "./SplitStack";

interface LearningAssetViewProps {
	learningAssetId: string;
	readPoint: ReadingPosition;
	meta: MetaResponseDto;
	buttons: FloatingMenuItem[];
	onHighlightCreated?: (payload: HighlightCreatedPayload) => void;
}

/**
 * Renders a learning asset as a virtualized stack of splits (the reader core),
 * with every feature on top of it — read point, marks, search — added as a
 * plugin from `plugins/`.
 */
export default function LearningAssetView({
	learningAssetId,
	readPoint,
	meta,
	buttons,
	onHighlightCreated,
}: LearningAssetViewProps) {
	// Only the lightweight split index, never the splits' content.
	const [splits, setSplits] = useState<LearningAssetSplitMetaDto[] | null>(
		null,
	);
	useEffect(() => {
		let cancelled = false;
		void getLearningAssetSplitManifest(learningAssetId)
			.then(manifest => {
				if (!cancelled) setSplits(manifest);
			})
			.catch(() => {
				if (!cancelled) setSplits([]);
			});
		return () => {
			cancelled = true;
		};
	}, [learningAssetId]);

	if (!splits) {
		return (
			<Center py="xl">
				<Loader />
			</Center>
		);
	}

	return (
		<ReaderCoreProvider
			learningAssetId={learningAssetId}
			splits={splits}
			initialReadPoint={readPoint}
			onHighlightCreated={onHighlightCreated}>
			<PluginProviders plugins={learningAssetPlugins}>
				<SplitStack buttons={buttons} plugins={learningAssetPlugins}>
					<ContentOriginPanel meta={meta} />
				</SplitStack>
				<PluginParts plugins={learningAssetPlugins} part="Overlay" />
			</PluginProviders>
		</ReaderCoreProvider>
	);
}
