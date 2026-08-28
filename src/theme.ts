import {
	alpha,
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

// Ramps generated from one brand seed each; the seed lands at the shade matching
// its own lightness, so these all sit near the dark end of their tuple.
const green = generateColors("#076647");
const blue = generateColors("#1478c0");
const orange = generateColors("#c2560a");

// Warm gold, hand-tuned by eye to share the amber's temperature.
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

// Hand-tuned: light mode reads red text from shade 6 and dark mode from shade 5,
// and no single `generateColors` seed lands in both windows. Mantine's default red
// hue, re-spaced in luminance so 6 stays dark enough for white-on-red and 5 stays
// light enough to clear AA on the dark body (4.5:1) without turning salmon.
const red: MantineColorsTuple = [
	"#fff5f4",
	"#ffe1de",
	"#ffc1bc",
	"#fc9a94",
	"#f57167",
	"#f14b3c",
	"#d52418",
	"#b92217",
	"#9d1f15",
	"#801c15",
];

// Hand-tuned honey-amber ramp; the brand color, so it was picked by eye.
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

// Warm stone grays, hand-tuned so chrome and content share the primary's
// temperature. Chroma rises toward the dark end, which is why the app's own
// surfaces are set from literal values rather than shades of this tuple.
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
// Same warm hue as `grayLight`, scaled to ~75% brightness rather than reused
// as-is: on dark backgrounds the un-scaled curve read as too light.
const grayDark: MantineColorsTuple = [
	"#b7b6b1",
	"#b2b0aa",
	"#aba8a0",
	"#a39e94",
	"#979185",
	"#6b665a",
	"#565147",
	"#49443b",
	"#302c25",
	"#181510",
];

// Warm charcoal. Spaced by relative luminance, not by eye: Mantine derives most
// of its dark semantic colors from this one tuple (text 0, dimmed 2,
// placeholder/disabled 3, border 4, hover 5, input surface 6, body 7, sidebar 8),
// so each step is set to the value its own role needs to clear contrast. Body (7)
// and sidebar (8) sit only 1.09:1 apart — close enough to read as one dark
// surface, far enough (4 L* steps) that the seam is still visible.
const dark: MantineColorsTuple = [
	"#d1cecb",
	"#bfbbb6",
	"#afa9a1",
	"#9c9386",
	"#6b6156",
	"#554c44",
	"#3e3831",
	"#211e19",
	"#191512",
	"#090807",
];

export const theme = createTheme({
	primaryColor: "amber",
	primaryShade: { light: 6, dark: 6 },
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

// Dark `variant="light"` backgrounds are derived as darken(shade9, 0.5), which
// lands below the body for palettes seeded from dark colors — a light Badge
// reads as a hole rather than a tint. Wash the mid shade over the surface.
const lightVariantColors = Object.fromEntries(
	["amber", "gray", "red", "green", "blue", "orange", "yellow"].flatMap(
		name => [
			[
				`--mantine-color-${name}-light`,
				alpha(`var(--mantine-color-${name}-5)`, 0.25),
			],
			[
				`--mantine-color-${name}-light-hover`,
				alpha(`var(--mantine-color-${name}-5)`, 0.35),
			],
			[
				`--mantine-color-${name}-light-color`,
				`var(--mantine-color-${name}-1)`,
			],
		],
	),
);

export const cssVariablesResolver: CSSVariablesResolver = () => ({
	variables: {
		"--selection-bg": "var(--mantine-color-blue-8)",
		"--selection-color": "var(--mantine-color-white)",
	},
	light: {
		"--mantine-color-body": lighten("var(--mantine-color-gray-0)", 0.8),
		"--sidebar-bg": lighten("var(--mantine-color-gray-0)", 0.1),
		"--editor-surface-bg": "var(--sidebar-bg)",
	},
	dark: {
		"--mantine-color-body": "var(--mantine-color-dark-7)",
		"--sidebar-bg": "var(--mantine-color-dark-8)",
		"--editor-surface-bg": "var(--sidebar-bg)",

		// Mantine's dark defaults for these come from shade 8 of a stock red/teal
		// it never sees us replace, which reads ~2:1 on our body. Shade 4 is where
		// dark mode already takes its text color from.
		"--mantine-color-error": "var(--mantine-color-red-4)",
		"--mantine-color-success": "var(--mantine-color-green-8)",
		// dark-3 clears AA on the body but not on dark-6, the input it sits inside.
		"--mantine-color-placeholder": "var(--mantine-color-dark-2)",

		...lightVariantColors,

		// Derived as primaryShade - 4, which would be a near-white cream.
		"--mantine-color-amber-outline": "var(--mantine-color-amber-4)",
	},
});
