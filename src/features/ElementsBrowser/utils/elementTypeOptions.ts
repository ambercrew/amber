import { ElementNodeType } from "../../../types/elements/elementNodeType";

export const elementTypeOptions: { value: ElementNodeType; label: string }[] = [
	{ value: "folder", label: "Folder" },
	{ value: "learningAsset", label: "Learning Asset" },
	{ value: "extract", label: "Extract" },
	{ value: "card", label: "Card" },
];
