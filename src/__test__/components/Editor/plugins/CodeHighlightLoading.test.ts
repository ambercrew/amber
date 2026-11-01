import { buildEditorFromExtensions } from "@lexical/extension";
import {
	$createCodeHighlightNode,
	$createCodeNode,
	$isCodeHighlightNode,
	$isCodeNode,
} from "@lexical/code-core";
import { $getRoot, defineExtension, type LexicalEditor } from "lexical";
import { CodeHighlightExtension } from "../../../../components/Editor/plugins/CodeHighlightPlugin/CodeHighlightExtension";

// Kept apart from CodeHighlightExtension.test.ts: Shiki keeps loaded grammars per module, and each test file gets its own.
const loads = vi.hoisted(() => ({ language: 0, theme: 0 }));
vi.mock("@lexical/code-shiki", async importOriginal => {
	const original =
		await importOriginal<typeof import("@lexical/code-shiki")>();
	return {
		...original,
		loadCodeLanguage: (
			...args: Parameters<typeof original.loadCodeLanguage>
		) => {
			const loading = original.loadCodeLanguage(...args);
			if (loading) loads.language++;
			return loading;
		},
		loadCodeTheme: (...args: Parameters<typeof original.loadCodeTheme>) => {
			const loading = original.loadCodeTheme(...args);
			if (loading) loads.theme++;
			return loading;
		},
	};
});

function buildEditor(): LexicalEditor {
	return buildEditorFromExtensions(
		defineExtension({
			name: "test",
			dependencies: [CodeHighlightExtension],
			onError: error => {
				throw error;
			},
		}),
	);
}

describe("CodeHighlightExtension loading", () => {
	it("Should load the grammar and theme once when given code blocks of many tokens", async () => {
		// Arrange

		const editor = buildEditor();

		// Act

		editor.update(
			() => {
				for (let block = 0; block < 3; block++) {
					const code = $createCodeNode("javascript");
					for (let token = 0; token < 50; token++)
						code.append(
							$createCodeHighlightNode(`let x${token} = 1;`),
						);
					$getRoot().append(code);
				}
			},
			{ discrete: true },
		);
		await vi.waitFor(() => {
			const highlighted = editor.getEditorState().read(() =>
				$getRoot()
					.getChildren()
					.filter($isCodeNode)
					.every(code =>
						code
							.getAllTextNodes()
							.some(
								node =>
									$isCodeHighlightNode(node) &&
									node.getStyle(),
							),
					),
			);
			expect(highlighted).toBe(true);
		});

		// Assert

		expect(loads).toEqual({ language: 1, theme: 1 });
	});
});
