import {
	MaskShape,
	OcclusionShape,
} from "../../../api/imageOcclusion/dto/occlusionShape";

export function isMask(shape: OcclusionShape): shape is MaskShape {
	return shape.kind !== "text";
}

/** Mirrors the backend: a mask's group, or the mask itself when ungrouped. */
export function targetKeyOf(mask: MaskShape): string {
	return mask.groupId ?? mask.id;
}

/** One key per card, unique and in shape order. */
export function targetKeys(shapes: OcclusionShape[]): string[] {
	return [...new Set(shapes.filter(isMask).map(targetKeyOf))];
}

/** Places a mask at its position and rotation, in its SVG's image units. */
export function maskTransform(shape: MaskShape, w: number, h: number) {
	return `translate(${shape.x * w} ${shape.y * h}) rotate(${shape.rotation})`;
}
