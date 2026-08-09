import { createBrowserRouter } from "react-router";
import App from "./features/App/components/App";
import ElementViewer from "./features/ElementViewer/ElementViewer";
import ElementsBrowser from "./features/ElementsBrowser/components/ElementsBrowser";

export const router = createBrowserRouter([
	{
		path: "/",
		element: <App />,
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
