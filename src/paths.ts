import { ElementNodeType } from "./types/elements/elementNodeType";

export const paths = {
	root: () => "/",
	browser: () => "/browser",
	element: (type: ElementNodeType, id: string) => `/${type}/${id}`,
} as const;
