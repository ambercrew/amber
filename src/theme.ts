import {
	AppShell,
	createTheme,
	Fieldset,
	lighten,
	Mark,
	CSSVariablesResolver,
	MantineColorsTuple,
	virtualColor,
} from "@mantine/core";
import { generateColors } from "@mantine/colors-generator";
import { Dropzone } from "@mantine/dropzone";

const green = generateColors("#076647");
const blue = generateColors("#1478c0");
const orange = generateColors("#c2560a");
const red = generateColors("#dd2137");

// Warm gold, hand-tuned to sit on the same temperature as the amber
const yellow: MantineColorsTuple = [
	"#fdf8e9",
	"#fbf0cd",
	"#f8e3a0",
	"#f3d476",
	"#eec453",
	"#dfa71d",
	"#bd8a10",
	"#996e0c",
	"#7b580d",
	"#64480e",
];

// Hand-tuned honey-amber ramp.
const amber: MantineColorsTuple = [
	"#fdf6e3",
	"#faecc8",
	"#f7dd96",
	"#f5cb5f",
	"#f2b32e",
	"#e89b0c",
	"#cd7f05",
	"#a86107",
	"#874d0d",
	"#6f3f10",
];

// Warm stone grays with a faint amber undertone so chrome and content
// share the same temperature as the primary color.
const grayLight: MantineColorsTuple = [
	"#f4f2ec",
	"#edeae2",
	"#e4e0d5",
	"#d9d3c5",
	"#c9c1b1",
	"#8f8878",
	"#736c5e",
	"#615b4e",
	"#403b31",
	"#201c15",
];
const grayDark: MantineColorsTuple = [
	"#faf8f4",
	"#f0ece4",
	"#e5e0d5",
	"#d4cdbf",
	"#c2baa9",
	"#aaa290",
	"#847d6c",
	"#787162",
	"#6a6456",
	"#59544a",
];

// Dark surfaces: deep warm browns instead of neutral gray.
const dark: MantineColorsTuple = [
	"#efeae1",
	"#d8d1c4",
	"#a99a7e",
	"#897b61",
	"#4a4336",
	"#38322a",
	"#2a251f",
	"#221e19",
	"#191613",
	"#12100d",
];

export const theme = createTheme({
	primaryColor: "amber",
	primaryShade: { light: 6, dark: 7 },
	autoContrast: true,
	defaultRadius: "md",

	components: {
		// Offset the sidebar one shade from the body so the main content
		// area reads as the elevated "page" surface.
		AppShell: AppShell.extend({
			styles: {
				navbar: {
					backgroundColor: "var(--sidebar-bg)",
				},
				aside: {
					backgroundColor: "var(--sidebar-bg)",
				},
			},
		}),
		// Search-match marks (e.g. Highlight in the sidebar tree) sit on top
		// of amber-washed selected rows, so they need a saturated amber bg.
		Mark: Mark.extend({
			styles: {
				root: {
					backgroundColor:
						"light-dark(var(--mantine-color-amber-3), var(--mantine-color-amber-4))",
				},
			},
		}),
		// Dropzone's own background reads as an extra box when
		// it's embedded in a surface that already has a background (e.g. a
		// Modal), so make it transparent by default.
		Dropzone: Dropzone.extend({
			styles: {
				root: {
					backgroundColor: "transparent",
				},
			},
		}),
		Fieldset: Fieldset.extend({
			styles: {
				root: {
					backgroundColor: "transparent",
				},
				legend: {
					backgroundColor: "transparent",
				},
			},
		}),
	},
	colors: {
		dark,
		yellow,
		orange,
		green,
		blue,

		amber,

		"gray-light": grayLight,
		"gray-dark": grayDark,
		gray: virtualColor({
			name: "gray",
			light: "gray-light",
			dark: "gray-dark",
		}),

		red,
	},
});

export const cssVariablesResolver: CSSVariablesResolver = () => ({
	variables: {},
	light: {
		"--mantine-color-body": lighten("var(--mantine-color-gray-0)", 0.8),
		"--sidebar-bg": lighten("var(--mantine-color-gray-0)", 0.1),
		"--editor-surface-bg": "var(--sidebar-bg)",
	},
	dark: {
		"--mantine-color-body": "var(--mantine-color-dark-6)",
		"--sidebar-bg": "var(--mantine-color-dark-7)",
		"--editor-surface-bg": "var(--mantine-color-dark-5)",
	},
});
