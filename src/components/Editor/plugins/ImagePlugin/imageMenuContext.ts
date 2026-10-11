import { createContext } from "react";
import { FloatingMenuBarItem } from "../../../FloatingMenuBar/FloatingMenuBar";

export interface ImageMenuTarget {
	src: string;
	altText: string;
	occlusionId: string | null;
	setOcclusionId: (occlusionId: string) => void;
}

export type ImageMenuItems = (image: ImageMenuTarget) => FloatingMenuBarItem[];

/** Lets the host add actions to an image's popover without the editor knowing about elements. */
export const ImageMenuItemsContext = createContext<ImageMenuItems | null>(null);
