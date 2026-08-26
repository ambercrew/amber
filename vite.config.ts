/// <reference types="vitest" />
///// <reference types="vitest/config" />
/// <reference types="vite/client" />

import { defineConfig } from "vitest/config";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

const host = process.env.TAURI_DEV_HOST as string | null;

function injectDevTools() {
	return {
		name: "inject-devtools",
		transformIndexHtml(html: string) {
			if (process.env.NODE_ENV === "development") {
				return html.replace(
					"</head>",
					'<script src="http://localhost:8097"></script></head>',
				);
			}
			return html;
		},
	};
}

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		babel({
			presets: [reactCompilerPreset()],
		}),
		injectDevTools(),
	],

	// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
	//
	// 1. prevent vite from obscuring rust errors
	clearScreen: false,
	// 2. tauri expects a fixed port, fail if that port is not available
	server: {
		port: 1420,
		strictPort: true,
		host: host ?? false,
		hmr: host
			? {
					protocol: "ws",
					host,
					port: 1421,
				}
			: undefined,
		watch: {
			// 3. tell vite to ignore watching `src-tauri`
			ignored: ["**/src-tauri/**"],
		},
	},

	test: {
		globals: true,
		environment: "jsdom",
		setupFiles: "./src/__test__/setup.ts",
		css: true,
		// Mantine + userEvent component tests regularly need more than the 5s
		// default when the whole suite runs in parallel on a loaded machine.
		testTimeout: 20000,
		hookTimeout: 20000,
		coverage: {
			reporter: ["lcov"],
			include: ["src/**/*.{ts,tsx,js,jsx}"],
		},
		clearMocks: true,
	},
});
