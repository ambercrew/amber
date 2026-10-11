/** Coordinates and sizes are normalized to the image (0..1); rotation is in degrees. */
export interface MaskShape {
	kind: "rect" | "ellipse";
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	fill: string;
	/** Masks sharing a group are quizzed together, as one card. */
	groupId: string | null;
}

/** An always-visible label; never hides anything or produces a card. */
export interface TextShape {
	kind: "text";
	id: string;
	x: number;
	y: number;
	rotation: number;
	text: string;
	/** Relative to the image height. */
	fontSize: number;
	color: string;
}

export type OcclusionShape = MaskShape | TextShape;

export type OcclusionMode = "hideAllGuessOne" | "hideOneGuessOne";
