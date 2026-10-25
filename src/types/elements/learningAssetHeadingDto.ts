export interface LearningAssetHeadingDto {
	seq: number;
	/** Index of the heading among its split's top-level blocks. */
	block: number;
	/** 1 for `h1` through 6 for `h6`. */
	level: number;
	text: string;
}
