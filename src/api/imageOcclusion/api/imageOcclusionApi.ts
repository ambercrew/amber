import { invoke } from "@tauri-apps/api/core";
import { CreateImageOcclusionDto } from "../dto/createImageOcclusionDto";
import { ImageOcclusionLookupDto } from "../dto/imageOcclusionLookupDto";
import { ImageOcclusionResponseDto } from "../dto/imageOcclusionResponseDto";
import { UpdateImageOcclusionDto } from "../dto/updateImageOcclusionDto";

export function getImageOcclusion(
	id: string,
): Promise<ImageOcclusionLookupDto> {
	return invoke("get_image_occlusion", { id });
}

/** The occlusion already made from this image in this element, if any. */
export function findImageOcclusionBySource(
	parentId: string,
	imageAssetId: string,
): Promise<ImageOcclusionResponseDto | null> {
	return invoke("find_image_occlusion_by_source", {
		parentId,
		imageAssetId,
	});
}

export function createImageOcclusion(
	dto: CreateImageOcclusionDto,
): Promise<void> {
	return invoke("create_image_occlusion", { dto });
}

export function updateImageOcclusion(
	dto: UpdateImageOcclusionDto,
): Promise<void> {
	return invoke("update_image_occlusion", { dto });
}
