import { OcclusionOverlayProps } from "../../../components/Editor/plugins/ImagePlugin/imageOcclusionOverlayContext";
import OcclusionOverlay from "./OcclusionOverlay";

export function renderOcclusionOverlay(props: OcclusionOverlayProps) {
	return <OcclusionOverlay {...props} />;
}
