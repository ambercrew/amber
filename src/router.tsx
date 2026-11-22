import { createBrowserRouter } from "react-router";
import App from "./features/App/components/App";
import ElementViewer from "./features/ElementViewer/components/ElementViewer";
import ElementsBrowser from "./features/ElementsBrowser/components/ElementsBrowser";
import RouteErrorFallback from "./components/AppErrorBoundary/RouteErrorFallback";

export const router = createBrowserRouter([
	{
		path: "/",
		element: <App />,
		errorElement: <RouteErrorFallback />,
		children: [
			{
				index: true,
				element: <ElementViewer />,
			},
			{
				path: "browser",
				element: <ElementsBrowser />,
			},
			{
				path: ":type/:id",
				element: <ElementViewer />,
			},
		],
	},
]);
