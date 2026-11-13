import {
	ActionIcon,
	alpha,
	AppShell,
	Button,
	Collapse,
	Combobox,
	createTheme,
	Fieldset,
	lighten,
	Mark,
	MultiSelect,
	Select,
	CSSVariablesResolver,
	MantineColorsTuple,
	MantineTheme,
	virtualColor,
} from "@mantine/core";
import { generateColors } from "@mantine/colors-generator";
import { Dropzone } from "@mantine/dropzone";
import { MOTION_DURATION_MS } from "./config/motion";

// Ramps generated from one brand seed each; the seed lands at the shade matching
// its own lightness, so these all sit near the dark end of their tuple.
const blue = generateColors("#1478c0");
const orange = generateColors("#c2560a");

// The brand seed's hue (#076647), re-spaced by hand: generated, shades 5–7 were neon mint.
// 6 takes white text, 4 is dark-mode text and 8 light-mode text.
const green: MantineColorsTuple = [
	"#e8fcf2",
	"#cef6e2",
	"#a8eacb",
	"#7bdbb0",
	"#4bc494",
	"#17a878",
	"#08845d",
	"#01724f",
	"#015f41",
	"#014c34",
];

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

// Mantine's red hue, re-spaced by hand: 6 is dark enough for white-on-red and light-mode
// text, 4 light enough for dark-mode text. No `generateColors` seed lands in both windows.
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

// Warm stone grays, hand-tuned so chrome and content share the primary's temperature.
// Chroma rises toward the dark end; the light surfaces are lightened from shade 0.
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

// Low-chroma warm charcoal, spaced by luminance for Mantine's roles: text 0, dimmed 1–2,
// disabled 3, border 4, hover 5, input/popover 6, body 7. Surfaces lighten as they rise.
const dark: MantineColorsTuple = [
	"#d6d2cc",
	"#c0bbb3",
	"#a8a299",
	"#8d877e",
	"#5a554e",
	"#3d3934",
	"#302d29",
	"#1c1a17",
	"#161412",
	"#0f0e0c",
];

// Subtle primary buttons take their own text color, so dark mode can quiet them
// without touching selected rows and light badges, which read `-light-color`.
const subtlePrimaryColor = (
	theme: MantineTheme,
	props: { variant?: string; color?: string },
) => {
	const isPrimary = !props.color || props.color === theme.primaryColor;
	return props.variant === "subtle" && isPrimary
		? "var(--subtle-primary-color)"
		: undefined;
};

// Mantine color of search matches: the sidebar's filter, the editor's find in page and the PDF's.
export const SEARCH_MATCH_COLOR = "violet";

// The selected row of the sidebar's file tree and the table of contents, per color scheme.
// Mantine's primary `light` variant, its light fill pushed a third of the way to amber-2.
const SELECTED_ROW_COLORS = {
	background: {
		light: "color-mix(in srgb, var(--mantine-color-amber-1), var(--mantine-color-amber-2) 35%)",
		dark: "var(--mantine-primary-color-light)",
	},
	text: {
		light: "var(--mantine-primary-color-light-color)",
		dark: "var(--mantine-primary-color-light-color)",
	},
};

export const theme = createTheme({
	primaryColor: "amber",
	primaryShade: { light: 6, dark: 6 },
	autoContrast: true,
	defaultRadius: "md",

	components: {
		Button: Button.extend({
			vars: (theme, props) => ({
				root: { "--button-color": subtlePrimaryColor(theme, props) },
			}),
		}),
		ActionIcon: ActionIcon.extend({
			vars: (theme, props) => ({
				root: { "--ai-color": subtlePrimaryColor(theme, props) },
			}),
		}),
		// Offset the sidebar from the body: darker in light mode, lighter in dark mode.
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
		// Search matches (the sidebar tree's Highlight) share find in page's color.
		Mark: Mark.extend({
			styles: {
				root: {
					backgroundColor: "var(--search-match-bg)",
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
		// Matches the app's other animations, and the carets turning beside it.
		Collapse: Collapse.extend({
			defaultProps: { transitionDuration: MOTION_DURATION_MS },
		}),
		// Absolute dropdowns portaled into the body shift the page layout, making
		// full-screen modals flicker on mobile and dropdowns bounce on scroll.
		Combobox: Combobox.extend({
			defaultProps: { floatingStrategy: "fixed" },
		}),
		Select: Select.extend({
			defaultProps: { withAlignedLabels: true },
		}),
		MultiSelect: MultiSelect.extend({
			defaultProps: { withAlignedLabels: true },
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

// Dark tinted text is shade 3, so status colors keep their hue. Amber stays a quiet cream:
// it's on every subtle button and selected row, where a saturated shade is too loud.
const darkLightTextShade: Record<string, number> = { gray: 1, amber: 1 };

// Mantine's dark `variant="light"` background, darken(shade9, 0.5), lands below the body
// and reads as a hole, so wash the mid shade over the surface.
const lightVariantColors = Object.fromEntries(
	// Every color used with `variant="light"`; the marks set their own tints in `markButtonVars`.
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
				`var(--mantine-color-${name}-${darkLightTextShade[name] ?? 3})`,
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
		"--selected-row-bg": SELECTED_ROW_COLORS.background.light,
		"--selected-row-color": SELECTED_ROW_COLORS.text.light,
		"--search-match-bg": `var(--mantine-color-${SEARCH_MATCH_COLOR}-2)`,
		"--search-match-current-bg": `var(--mantine-color-${SEARCH_MATCH_COLOR}-4)`,
		"--mantine-color-body": lighten("var(--mantine-color-gray-0)", 0.8),
		"--sidebar-bg": lighten("var(--mantine-color-gray-0)", 0.3),
		"--editor-surface-bg": "var(--sidebar-bg)",
		"--inset-surface-bg": "var(--sidebar-bg)",
		"--pdf-viewport-bg": "#e8e5dc",
		// Mantine's gray-0 hover (nav links, tabs) is the sidebar's own background, so it never shows there.
		"--sidebar-hover-bg": "var(--mantine-color-gray-2)",
		// Spotlight's gray-0 hover is 1.09:1 on the palette's near-white surface.
		"--spotlight-hover-bg": "var(--mantine-color-gray-2)",
		"--subtle-primary-color": "var(--mantine-color-amber-light-color)",

		// Mantine's stock teal is the one cool color here; green-8 is closest to the brand seed.
		"--mantine-color-success": "var(--mantine-color-green-8)",
		// Mantine's gray-6 reads 4.7:1 on the sidebar and under 4.5:1 on hovered rows.
		"--mantine-color-dimmed": "var(--mantine-color-gray-7)",
		// gray-5 reads ~3.5:1 on a white input.
		"--mantine-color-placeholder": "var(--mantine-color-gray-6)",
		// amber-7 reads 4.3:1 on the sidebar; 30% of the way from 8 clears 4.5:1 even on hovered and selected rows.
		"--mantine-color-anchor":
			"color-mix(in srgb, var(--mantine-color-amber-7) 30%, var(--mantine-color-amber-8))",
		"--anchor-hover-color": "var(--mantine-color-amber-9)",
	},
	dark: {
		"--selected-row-bg": SELECTED_ROW_COLORS.background.dark,
		"--selected-row-color": SELECTED_ROW_COLORS.text.dark,
		"--search-match-bg": `var(--mantine-color-${SEARCH_MATCH_COLOR}-9)`,
		"--search-match-current-bg": `var(--mantine-color-${SEARCH_MATCH_COLOR}-6)`,
		"--mantine-color-body": "#201e1b",
		"--sidebar-bg": "#2a2723",
		"--editor-surface-bg": "var(--sidebar-bg)",
		"--inset-surface-bg": "var(--sidebar-bg)",
		"--pdf-viewport-bg": "var(--mantine-color-body)",
		// dark-6 is 1.14:1 on the sidebar; dark-5 matches Spotlight's hover below.
		"--sidebar-hover-bg": "var(--mantine-color-dark-5)",
		// One step above Spotlight's own dark-6, which sits 1.27:1 on the body.
		"--spotlight-hover-bg": "var(--mantine-color-dark-5)",
		// Link amber muted halfway to dimmed text: full amber on every icon button is too loud.
		"--subtle-primary-color":
			"color-mix(in srgb, var(--mantine-color-anchor), var(--mantine-color-dimmed))",

		// Mantine's dark defaults are shade 8 of its stock red and teal, ~2:1 on our body.
		// Shade 4 is dark mode's own tinted text.
		"--mantine-color-error": "var(--mantine-color-red-4)",
		"--mantine-color-success": "var(--mantine-color-green-4)",
		// Halfway to dark-1: Mantine's dark-2 read dull, and dark-1 sits too close to body text.
		"--mantine-color-dimmed":
			"color-mix(in srgb, var(--mantine-color-dark-2), var(--mantine-color-dark-1))",
		// dark-3 clears AA on the body but not on dark-6, the input it sits inside.
		"--mantine-color-placeholder": "var(--mantine-color-dark-2)",

		...lightVariantColors,

		// Derived as primaryShade - 4, which would be a near-white cream.
		"--mantine-color-amber-outline": "var(--mantine-color-amber-4)",
		"--anchor-hover-color": "var(--mantine-color-amber-3)",
	},
});
