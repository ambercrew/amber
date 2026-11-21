import { lazy, Suspense } from "react";
import FolderView from "./FolderView";
import useAppSelector from "../../../hooks/useAppSelector";
import { useElementParams } from "../../../hooks/useElementParams";
import { selectCurrentElement } from "../../../stores/elements/elementsSelectors";

// The editor is large and the app opens on the home page, so it loads on first use.
const ElementContentViewer = lazy(() => import("./ElementContentViewer"));

export default function ElementViewer() {
	const currentElement = useAppSelector(selectCurrentElement);
	const routeElementId = useElementParams();

	// Arriving from a page with no element (e.g. the browser), the route's element is still loading.
	if (routeElementId && !currentElement) return null;

	if (!currentElement || currentElement.type === "folder") {
		return <FolderView />;
	}

	return (
		<Suspense>
			<ElementContentViewer currentElement={currentElement} />
		</Suspense>
	);
}
