import { $createParagraphNode, $getRoot } from "lexical";
import BuildOcclusionCardContentsEventDto, {
	OcclusionCardContentDto,
} from "../../../api/imageOcclusion/events/buildOcclusionCardContentsEvent";
import { $createImageNode } from "../../../components/Editor/plugins/ImagePlugin/ImageNode";
import { runHeadless } from "../../../components/Editor/lexicalJsonConversion";

/** One card side: the image quizzing `targetKey`, then an empty paragraph for notes. */
function cardSide(
	{ occlusionId, src, altText }: BuildOcclusionCardContentsEventDto,
	targetKey: string,
	revealed: boolean,
): string {
	return runHeadless(() => {
		const image = $createImageNode({
			src,
			altText,
			occlusionId,
			occlusionTarget: { targetKey, revealed },
		});
		$getRoot()
			.clear()
			.append(
				$createParagraphNode().append(image),
				$createParagraphNode(),
			);
	});
}

/** Front (masked) and back (revealed) content for each requested occlusion card. */
export function buildOcclusionCardContents(
	request: BuildOcclusionCardContentsEventDto,
): Record<string, OcclusionCardContentDto> {
	return Object.fromEntries(
		request.targetKeys.map(targetKey => [
			targetKey,
			{
				front: cardSide(request, targetKey, false),
				back: cardSide(request, targetKey, true),
			},
		]),
	);
}
