import SettingsDto from "../../../../api/settings/dto/settingsDto";
import { setSystemChromeTheme } from "../../../../api/systemChrome/api/systemChromeApi";
import {
	applyDocumentColorScheme,
	applySystemChrome,
	syncThemeColorMeta,
} from "../../../../features/App/components/systemChrome";

vi.mock(import("../../../../api/systemChrome/api/systemChromeApi"));

const baseSettings: SettingsDto = {
	baseDatabaseDirectory: "/home/user/amber",
	theme: "Light",
	font: { type: "systemDefault" },
	fontHeadings: { type: "systemDefault" },
	fontMonospace: { type: "systemDefault" },
	zoomPercentage: 100,
	autoSync: true,
	trashRetentionDays: 30,
	enableAi: false,
	aiProvider: "ollama",
	ollama: { modelName: null, embeddingsModelName: null },
	openai: { modelName: null, embeddingsModelName: null },
	openaiApiKeyIsSet: false,
};

describe("applyDocumentColorScheme", () => {
	beforeEach(() => {
		document.documentElement.style.colorScheme = "";
		document.head.innerHTML =
			'<meta name="color-scheme" content="light dark" />';
	});

	it("Should force a dark color-scheme when the theme is Dark", () => {
		// Arrange

		const settings = { ...baseSettings, theme: "Dark" as const };

		// Act

		applyDocumentColorScheme(settings);

		// Assert

		expect(document.documentElement.style.colorScheme).toBe("dark");
		expect(
			document.querySelector('meta[name="color-scheme"]'),
		).toHaveAttribute("content", "dark");
	});

	it("Should leave color-scheme as light dark when following the system", () => {
		// Arrange

		const settings = { ...baseSettings, theme: "FollowSystem" as const };

		// Act

		applyDocumentColorScheme(settings);

		// Assert

		expect(document.documentElement.style.colorScheme).toBe("light dark");
	});
});

describe("syncThemeColorMeta", () => {
	it("Should replace theme-color metas with the computed body background", () => {
		// Arrange

		document.head.innerHTML = `
			<meta name="theme-color" media="(prefers-color-scheme: light)" content="#fcfbf8" />
			<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#211e19" />
		`;
		vi.spyOn(window, "getComputedStyle").mockReturnValue({
			backgroundColor: "rgb(33, 30, 25)",
		} as CSSStyleDeclaration);

		// Act

		syncThemeColorMeta();

		// Assert

		const metas = document.querySelectorAll('meta[name="theme-color"]');
		expect(metas).toHaveLength(1);
		expect(metas[0]).toHaveAttribute("content", "rgb(33, 30, 25)");
		expect(metas[0]).not.toHaveAttribute("media");
	});

	it("Should not write a theme-color meta when the body background is transparent", () => {
		// Arrange

		document.head.innerHTML = "";
		vi.spyOn(window, "getComputedStyle").mockReturnValue({
			backgroundColor: "rgba(0, 0, 0, 0)",
		} as CSSStyleDeclaration);

		// Act

		syncThemeColorMeta();

		// Assert

		expect(
			document.querySelector('meta[name="theme-color"]'),
		).not.toBeInTheDocument();
	});
});

describe("applySystemChrome", () => {
	it("Should push the resolved chrome theme to the backend", async () => {
		// Arrange

		vi.mocked(setSystemChromeTheme).mockResolvedValue();
		const settings = { ...baseSettings, theme: "Dark" as const };

		// Act

		await applySystemChrome(settings);

		// Assert

		expect(setSystemChromeTheme).toHaveBeenCalledWith("Dark");
	});

	it("Should release the forced webview theme before resolving the document color scheme", async () => {
		// Arrange

		document.documentElement.style.colorScheme = "dark";
		const order: string[] = [];
		vi.mocked(setSystemChromeTheme).mockImplementation(() => {
			order.push(document.documentElement.style.colorScheme);
			return Promise.resolve();
		});
		const settings = { ...baseSettings, theme: "FollowSystem" as const };

		// Act

		await applySystemChrome(settings);

		// Assert

		expect(order).toEqual(["dark"]);
		expect(document.documentElement.style.colorScheme).toBe("light dark");
	});
});
