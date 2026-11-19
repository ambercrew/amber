import { Component, ErrorInfo, PropsWithChildren } from "react";
import { error as logError } from "@tauri-apps/plugin-log";
import describeError from "../../utils/describeError";
import ErrorFallback from "./ErrorFallback";

interface AppErrorBoundaryState {
	error: unknown;
	hasError: boolean;
}

/** Catches render errors above the router (whose own errors go to `RouteErrorFallback`). */
class AppErrorBoundary extends Component<
	PropsWithChildren,
	AppErrorBoundaryState
> {
	state: AppErrorBoundaryState = { error: null, hasError: false };

	static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
		return { error, hasError: true };
	}

	componentDidCatch(error: unknown, info: ErrorInfo) {
		void logError(
			`Render error: ${describeError(error)}\nComponent stack:${info.componentStack ?? ""}`,
		);
	}

	render() {
		if (this.state.hasError)
			return <ErrorFallback error={this.state.error} />;
		return this.props.children;
	}
}

export default AppErrorBoundary;
