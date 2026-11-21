import FolderView from "./FolderView";
import ElementContentViewer from "./ElementContentViewer";
import useAppSelector from "../../../hooks/useAppSelector";
import { useElementParams } from "../../../hooks/useElementParams";
import { selectCurrentElement } from "../../../stores/elements/elementsSelectors";

export default function ElementViewer() {
	const currentElement = useAppSelector(selectCurrentElement);
	const routeElementId = useElementParams();

	// Arriving from a page with no element (e.g. the browser), the route's element is still loading.
	if (routeElementId && !currentElement) return null;

	if (!currentElement || currentElement.type === "folder") {
		return <FolderView />;
	}

	return <ElementContentViewer currentElement={currentElement} />;
}
