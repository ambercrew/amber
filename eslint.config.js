// @ts-check

import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import tseslint from "typescript-eslint";
import parser from "@typescript-eslint/parser";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { importX } from "eslint-plugin-import-x";
import { defineConfig } from "eslint/config";
import lexicalPlugin from "@lexical/eslint-plugin";
import mantine from "eslint-config-mantine";

export default defineConfig([
	{ ignores: ["dist", "src-tauri", "coverage"] },
	{
		settings: {
			react: {
				version: "detect",
			},
			"import-x/resolver-next": [createTypeScriptImportResolver()],
		},
		extends: [
			...mantine,
			js.configs.recommended,
			tseslint.configs.recommendedTypeChecked,
			tseslint.configs.stylisticTypeChecked,
			react.configs.flat.recommended,
			react.configs.flat["jsx-runtime"],
			reactHooks.configs.flat.recommended,
			eslintConfigPrettier,
			"import-x/flat/recommended",
			"import-x/flat/react",
			"import-x/flat/typescript",
		],
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			ecmaVersion: "latest",
			globals: globals.browser,
			parser,
			parserOptions: {
				ecmaFeatures: {
					jsx: true,
				},
				ecmaVersion: "latest",
				sourceType: "module",
				project: ["./tsconfig.json", "./tsconfig.node.json"],
				// @ts-ignore
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			"react-refresh": reactRefresh,
			// @ts-ignore
			"import-x": importX,
			// @ts-ignore
			"@lexical": lexicalPlugin,
		},
		rules: {
			"@typescript-eslint/no-unnecessary-type-assertion": "off",
			"@typescript-eslint/switch-exhaustiveness-check": "error",
			"react-refresh/only-export-components": [
				"warn",
				{ allowConstantExport: true },
			],
			"@lexical/rules-of-lexical": "error",
			"import-x/default": "off",
			"import-x/no-named-as-default": "off",
			"import-x/no-restricted-paths": [
				"error",
				{
					zones: [
						// enforce unidirectional codebase:
						{
							from: "./src/app",
							target: "./src/features",
						},
						{
							from: ["./src/features", "./src/app"],
							target: [
								"./src/components",
								"./src/hooks",
								"./src/lib",
								"./src/types",
								"./src/utils",
							],
						},
					],
				},
			],
			"@typescript-eslint/naming-convention": [
				"error",
				{
					selector: "interface",
					format: ["PascalCase"],
					custom: {
						regex: "^I[A-Z]",
						match: false,
					},
				},
			],
		},
	},
	{
		// React's `act()` only flushes pending effects and microtasks when its
		// callback is async, so the flush idiom is an async arrow that is
		// deliberately empty (`await act(async () => {})`) or that awaits
		// nothing. Both rules are false positives on that shape.
		files: ["src/__test__/**/*.{ts,tsx}"],
		rules: {
			"@typescript-eslint/no-empty-function": [
				"error",
				{ allow: ["arrowFunctions"] },
			],
			"@typescript-eslint/require-await": "off",
		},
	},
]);
