import { useCallback, useEffect, useState } from "react";
import { Center, Loader } from "@mantine/core";
import { getLearningAssetSplitManifest } from "../../../api/elements/api/elementsApi";
import { MetaResponseDto } from "../../../api/elements/dto/anyElementDto";
import { FloatingMenuItem } from "../../../components/Editor/plugins/FloatingMenuPlugin";
import { HighlightCreatedPayload } from "../../../components/Editor/plugins/HighlightPlugin/highlightCommands";
import { LearningAssetSplitMetaDto } from "../../../types/elements/learningAssetSplitMetaDto";
import { ReadingPosition } from "../../../types/elements/readingPosition";
import { ViewPosition } from "../../../types/elements/viewPosition";
import ContentOriginPanel from "../components/ContentOriginPanel";
import ReaderCoreProvider from "./core/ReaderCoreProvider";
import { learningAssetPlugins } from "./plugins";
import { PluginParts, PluginProviders } from "./plugins/PluginHost";
import SplitStack from "./SplitStack";
import { useReviewResume } from "../hooks/useReviewResume";

interface LearningAssetViewProps {
	learningAssetId: string;
	readPoint: ReadingPosition;
	meta: MetaResponseDto;
	buttons: FloatingMenuItem[];
	onHighlightCreated?: (payload: HighlightCreatedPayload) => void;
}

/**
 * A learning asset as a virtualized stack of splits (the reader core), with every feature (read point,
 * marks, search) a plugin from `plugins/`.
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
	// A Return lands where the reader left, not on the read point.
	const { resume, reportLeft, underReview } =
		useReviewResume(learningAssetId);
	const viewPosition = resume?.viewPosition;
	// Reports `undefined` too, so an earlier visit's position isn't kept.
	const handleLeave = useCallback(
		(position: ViewPosition | null) =>
			reportLeft({ viewPosition: position ?? undefined }),
		[reportLeft],
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

	const initialViewPosition = splits.some(
		split => split.seq === viewPosition?.split,
	)
		? viewPosition
		: undefined;

	return (
		<ReaderCoreProvider
			learningAssetId={learningAssetId}
			splits={splits}
			initialReadPoint={readPoint}
			initialViewPosition={initialViewPosition}
			onLeave={underReview ? handleLeave : undefined}
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
