import BuildOcclusionCardContentsEventDto, {
	BUILD_OCCLUSION_CARD_CONTENTS_EVENT,
} from "../../../api/imageOcclusion/events/buildOcclusionCardContentsEvent";
import { useFrontendRequestBridge } from "../../../hooks/useFrontendRequestBridge";

/** Answers the backend's requests for occlusion cards' Lexical content. */
export function useOcclusionCardContentsBridge() {
	useFrontendRequestBridge<BuildOcclusionCardContentsEventDto>(
		BUILD_OCCLUSION_CARD_CONTENTS_EVENT,
		// Builds Lexical content with a headless editor, so it loads on the first request.
		async event => {
			const { buildOcclusionCardContents } =
				await import("../utils/occlusionCardContents");
			return JSON.stringify(buildOcclusionCardContents(event));
		},
	);
}
