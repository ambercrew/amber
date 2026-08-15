import { useEffect, useState } from "react";
import {
	Box,
	Group,
	Select,
	SegmentedControl,
	Slider,
	Stack,
	Text,
	Tooltip,
} from "@mantine/core";
import { InfoIcon } from "@phosphor-icons/react";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import useApi from "../../../hooks/useApi";
import { selectSettings } from "../../../stores/settings/settingsSelector";
import { saveSettings } from "../../../stores/settings/settingsActions";
import {
	buildUpdateSettingsRequest,
	default as UpdateSettingsRequestDto,
} from "../../../api/settings/dto/updateSettingsRequestDto";
import { Font, Theme } from "../../../api/settings/dto/settingsDto";
import { listSystemFonts } from "../../../api/settings/api/settingsApi";
import { isMobile } from "../../../utils/tauriUtils";
import {
	SYSTEM_DEFAULT_FONT_VALUE,
	fontToSelectValue,
	selectValueToFont,
} from "./fontSelectUtils";

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_MARKS = [
	{ value: 50, label: "50%" },
	{ value: 100, label: "100%" },
	{ value: 150, label: "150%" },
	{ value: 200, label: "200%" },
];

interface FontPickerProps {
	label: string;
	tooltip: string;
	font: Font;
	systemFonts: string[];
	onChange: (font: Font) => void;
}

function FontPicker({
	label,
	tooltip,
	font,
	systemFonts,
	onChange,
}: FontPickerProps) {
	return (
		<Stack gap="xs">
			<Group gap={4}>
				<Text size="sm">{label}</Text>
				<Tooltip
					label={tooltip}
					multiline
					w={260}
					events={{ hover: true, focus: true, touch: true }}>
					<InfoIcon />
				</Tooltip>
			</Group>
			<Select
				value={fontToSelectValue(font)}
				onChange={value => {
					if (!value) return;
					onChange(selectValueToFont(value));
				}}
				data={[
					{
						label: "System default",
						value: SYSTEM_DEFAULT_FONT_VALUE,
					},
					...systemFonts.map(name => ({ label: name, value: name })),
				]}
				searchable
				allowDeselect={false}
			/>
		</Stack>
	);
}

function AppearanceTab() {
	const settings = useAppSelector(selectSettings);
	const dispatch = useAppDispatch();
	const { callApi } = useApi();
	const [zoom, setZoom] = useState(settings?.zoomPercentage ?? 100);
	const [systemFonts, setSystemFonts] = useState<string[]>([]);

	useEffect(() => {
		// System font enumeration isn't supported on mobile, so the font
		// pickers are hidden there and there's no point fetching the list.
		if (isMobile()) return;
		void callApi(async () => {
			setSystemFonts(await listSystemFonts());
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	if (!settings) return null;

	function handleThemeChange(value: string) {
		void dispatch(
			saveSettings(buildUpdateSettingsRequest({ theme: value as Theme })),
		);
	}

	function persistFont(
		field: keyof Pick<
			UpdateSettingsRequestDto,
			"font" | "fontHeadings" | "fontMonospace"
		>,
	) {
		return (font: Font) => {
			void dispatch(
				saveSettings(buildUpdateSettingsRequest({ [field]: font })),
			);
		};
	}

	function persistZoom(value: number) {
		void dispatch(
			saveSettings(buildUpdateSettingsRequest({ zoomPercentage: value })),
		);
	}

	return (
		<Stack gap="lg" pt="md">
			<Stack gap="xs">
				<Text size="sm">Theme</Text>
				<SegmentedControl
					value={settings.theme}
					onChange={handleThemeChange}
					data={[
						{ label: "Light", value: "Light" },
						{ label: "Dark", value: "Dark" },
						{ label: "Follow system", value: "FollowSystem" },
					]}
				/>
			</Stack>

			{/* Font pickers rely on system font enumeration, which isn't
			supported on mobile, so hide them there. */}
			{!isMobile() && (
				<>
					<FontPicker
						label="Font"
						tooltip="The font used for regular text throughout the app."
						font={settings.font}
						systemFonts={systemFonts}
						onChange={persistFont("font")}
					/>

					<FontPicker
						label="Headings font"
						tooltip="The font used for headings, such as titles above sections."
						font={settings.fontHeadings}
						systemFonts={systemFonts}
						onChange={persistFont("fontHeadings")}
					/>

					<FontPicker
						label="Monospace font"
						tooltip="The font used for code and other fixed-width text."
						font={settings.fontMonospace}
						systemFonts={systemFonts}
						onChange={persistFont("fontMonospace")}
					/>
				</>
			)}

			{/* Zoom is a no-op inside the mobile webview, so hide it there. */}
			{!isMobile() && (
				<Stack gap="xs">
					<Text size="sm">Zoom</Text>
					<Box px="md">
						<Slider
							min={ZOOM_MIN}
							max={ZOOM_MAX}
							step={5}
							value={zoom}
							marks={ZOOM_MARKS}
							label={value => `${value}%`}
							onChange={setZoom}
							onChangeEnd={persistZoom}
						/>
					</Box>
				</Stack>
			)}
		</Stack>
	);
}

export default AppearanceTab;
