import { Center, Loader, Text } from "@mantine/core";
import { OcclusionOverlayProps } from "../../../components/Editor/plugins/ImagePlugin/imageOcclusionOverlayContext";
import { useImageOcclusion } from "../hooks/useImageOcclusion";
import OcclusionMasks from "./OcclusionMasks";
import OcclusionSourceMasks from "./OcclusionSourceMasks";

/**
 * Masks over an occlusion card's image; covers it whole until they load (or if they can't), so nothing leaks.
 * The source image has nothing to hide, so it stays bare until then.
 */
export default function OcclusionOverlay({
	occlusionId,
	target,
}: OcclusionOverlayProps) {
	const { lookup, errorMessage } = useImageOcclusion(occlusionId);

	if (!target)
		return lookup?.status === "found" ? (
			<OcclusionSourceMasks occlusion={lookup.occlusion} />
		) : null;
	if (lookup?.status === "found")
		return (
			<OcclusionMasks
				key={target.targetKey}
				occlusion={lookup.occlusion}
				targetKey={target.targetKey}
				revealed={target.revealed}
			/>
		);
	return (
		<Center
			component="span"
			pos="absolute"
			inset={0}
			p="md"
			bg="var(--mantine-color-default-hover)"
			style={{ backdropFilter: "blur(16px)" }}>
			{errorMessage ? (
				<Text size="sm" c="red">
					{errorMessage}
				</Text>
			) : lookup ? (
				<Text size="sm" ta="center">
					{lookup.status === "deleted"
						? "This card's image occlusion was deleted."
						: "This image occlusion isn't on this device yet. Sync to see it."}
				</Text>
			) : (
				<Loader size="sm" />
			)}
		</Center>
	);
}
