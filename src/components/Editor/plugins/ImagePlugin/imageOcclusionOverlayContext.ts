import { createContext, type ReactNode } from "react";

/** Which mask (or group) an occlusion card's image quizzes, and on which side. */
export interface OcclusionTarget {
	targetKey: string;
	/** False on the card's front (masked), true on its back. */
	revealed: boolean;
}

export interface OcclusionOverlayProps {
	occlusionId: string;
	/** Null on the image the occlusion was made from, which shows every mask as the editor does. */
	target: OcclusionTarget | null;
}

export type RenderOcclusionOverlay = (
	props: OcclusionOverlayProps,
) => ReactNode;

/** Lets the host draw an occlusion's masks over an image without the editor knowing their data. */
export const ImageOcclusionOverlayContext =
	createContext<RenderOcclusionOverlay | null>(null);
