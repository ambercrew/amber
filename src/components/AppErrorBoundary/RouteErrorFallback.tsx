import { useEffect } from "react";
import { useRouteError } from "react-router";
import { error as logError } from "@tauri-apps/plugin-log";
import describeError from "../../utils/describeError";
import ErrorFallback from "./ErrorFallback";

/** The router's `errorElement`: logs the error and shows the same fallback as `AppErrorBoundary`. */
function RouteErrorFallback() {
	const error = useRouteError();

	useEffect(() => {
		void logError(`Route error: ${describeError(error)}`);
	}, [error]);

	return <ErrorFallback error={error} />;
}

export default RouteErrorFallback;
