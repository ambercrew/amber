import { ImageOcclusionResponseDto } from "./imageOcclusionResponseDto";

/** An occlusion by id, telling one that hasn't synced here yet from one that's gone for good. */
export type ImageOcclusionLookupDto =
	| { status: "found"; occlusion: ImageOcclusionResponseDto }
	| { status: "notSynced" }
	| { status: "deleted" };
