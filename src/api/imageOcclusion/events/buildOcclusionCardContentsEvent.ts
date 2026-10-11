import { FrontendRequestEvent } from "../../../hooks/useFrontendRequestBridge";

export const BUILD_OCCLUSION_CARD_CONTENTS_EVENT =
	"build-occlusion-card-contents";

interface BuildOcclusionCardContentsEventDto extends FrontendRequestEvent {
	occlusionId: string;
	src: string;
	altText: string;
	targetKeys: string[];
}

export interface OcclusionCardContentDto {
	front: string;
	back: string;
}

export default BuildOcclusionCardContentsEventDto;
