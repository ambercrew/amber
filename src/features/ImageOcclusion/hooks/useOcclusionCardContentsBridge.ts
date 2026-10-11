import BuildOcclusionCardContentsEventDto, {
	BUILD_OCCLUSION_CARD_CONTENTS_EVENT,
} from "../../../api/imageOcclusion/events/buildOcclusionCardContentsEvent";
import { useFrontendRequestBridge } from "../../../hooks/useFrontendRequestBridge";
import { buildOcclusionCardContents } from "../utils/occlusionCardContents";

/** Answers the backend's requests for occlusion cards' Lexical content. */
export function useOcclusionCardContentsBridge() {
	useFrontendRequestBridge<BuildOcclusionCardContentsEventDto>(
		BUILD_OCCLUSION_CARD_CONTENTS_EVENT,
		event => JSON.stringify(buildOcclusionCardContents(event)),
	);
}
