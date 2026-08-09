import "@fontsource-variable/noto-sans";
import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider } from "react-router";
import { router } from "./router.tsx";
import { setupStore } from "./stores/store.ts";
import { warn, debug, trace, info, error } from "@tauri-apps/plugin-log";
import "@mantine/core/styles.css";
import "@mantine/spotlight/styles.css";
import "@mantine/dropzone/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dates/styles.css";
import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { theme, cssVariablesResolver } from "./theme.ts";
import SettingsSync from "./features/App/components/SettingsSync.tsx";

function forwardConsole(
	fnName: "log" | "debug" | "info" | "warn" | "error",
	logger: (message: string) => Promise<void>,
) {
	// eslint-disable-next-line no-console, @typescript-eslint/unbound-method
	const original = console[fnName];
	// eslint-disable-next-line no-console
	console[fnName] = (...data: unknown[]) => {
		original(...data);
		const message = data
			.map(arg =>
				typeof arg === "string"
					? arg
					: (JSON.stringify(arg) ?? String(arg)),
			)
			.join(" ");
		void logger(message);
	};
}

forwardConsole("log", trace);
forwardConsole("debug", debug);
forwardConsole("info", info);
forwardConsole("warn", warn);
forwardConsole("error", error);

const store = setupStore();

createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<Provider store={store}>
			<MantineProvider
				theme={theme}
				cssVariablesResolver={cssVariablesResolver}>
				<SettingsSync />
				<ModalsProvider>
					<RouterProvider router={router} />
				</ModalsProvider>
			</MantineProvider>
		</Provider>
	</React.StrictMode>,
);
