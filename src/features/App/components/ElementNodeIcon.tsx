import { ElementNodeType } from "../../../types/elements/elementNodeType";
import {
	CardElementIcon,
	ExtractElementIcon,
	FolderElementIcon,
	FolderOpenElementIcon,
	LearningAssetElementIcon,
} from "../../../config/icons";

interface ElementNodeIconProps {
	type: ElementNodeType;
	expanded?: boolean;
	size: number;
}

function ElementNodeIcon({ type, expanded, size }: ElementNodeIconProps) {
	switch (type) {
		case "folder":
			return expanded ? (
				<FolderOpenElementIcon size={size} />
			) : (
				<FolderElementIcon size={size} />
			);
		case "learningAsset":
			return <LearningAssetElementIcon size={size} />;
		case "extract":
			return <ExtractElementIcon size={size} />;
		case "card":
			return <CardElementIcon size={size} />;
	}
}

export default ElementNodeIcon;
