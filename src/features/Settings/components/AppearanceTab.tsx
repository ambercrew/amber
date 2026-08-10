import { useState } from "react";
import { Box, SegmentedControl, Slider, Stack, Text } from "@mantine/core";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectSettings } from "../../../stores/settings/settingsSelector";
import { saveSettings } from "../../../stores/settings/settingsActions";
import { buildUpdateSettingsRequest } from "../../../api/settings/dto/updateSettingsRequestDto";
import { Theme } from "../../../api/settings/dto/settingsDto";
import { isMobile } from "../../../utils/tauriUtils";

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_MARKS = [
	{ value: 50, label: "50%" },
	{ value: 100, label: "100%" },
	{ value: 150, label: "150%" },
	{ value: 200, label: "200%" },
];

function AppearanceTab() {
	const settings = useAppSelector(selectSettings);
	const dispatch = useAppDispatch();
	const [zoom, setZoom] = useState(settings?.zoomPercentage ?? 100);

	if (!settings) return null;

	function handleThemeChange(value: string) {
		void dispatch(
			saveSettings(buildUpdateSettingsRequest({ theme: value as Theme })),
		);
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
