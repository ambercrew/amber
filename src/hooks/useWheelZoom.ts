import { useEffect, useRef } from "react";
import { useDebouncedCallback } from "@mantine/hooks";
import useAppDispatch from "./useAppDispatch";
import useAppSelector from "./useAppSelector";
import { selectSettings } from "../stores/settings/settingsSelector";
import { saveSettings } from "../stores/settings/settingsActions";
import { buildUpdateSettingsRequest } from "../api/settings/dto/updateSettingsRequestDto";
import { isMobile, tryGetCurrentWebView } from "../utils/tauriUtils";
import { ZOOM_STEP, clampZoom } from "../utils/zoom";
import { selectCanZoomAppWide } from "../stores/elements/elementsSelectors";

/**
 * Ctrl/Cmd+wheel zoom. Applies each tick to the webview immediately for
 * responsiveness, and persists the settled value (debounced) so a fast
 * scroll doesn't round-trip to the backend on every event.
 */
export function useWheelZoom() {
	const dispatch = useAppDispatch();
	const settings = useAppSelector(selectSettings);
	const zoomRef = useRef(settings?.zoomPercentage ?? 100);

	useEffect(() => {
		if (settings) zoomRef.current = settings.zoomPercentage;
	}, [settings]);

	const canZoom = useAppSelector(selectCanZoomAppWide);
	const canZoomRef = useRef(canZoom);

	useEffect(() => {
		canZoomRef.current = canZoom;
	}, [canZoom]);

	const persistZoom = useDebouncedCallback((value: number) => {
		void dispatch(
			saveSettings(buildUpdateSettingsRequest({ zoomPercentage: value })),
		);
	}, 300);

	useEffect(() => {
		if (isMobile()) return;

		function onWheel(e: WheelEvent) {
			if (!(e.ctrlKey || e.metaKey)) return;
			e.preventDefault();
			if (!canZoomRef.current) return;

			const next = clampZoom(
				zoomRef.current + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP),
			);
			if (next === zoomRef.current) return;

			zoomRef.current = next;
			void tryGetCurrentWebView()?.setZoom(next / 100);
			persistZoom(next);
		}

		window.addEventListener("wheel", onWheel, { passive: false });
		return () => window.removeEventListener("wheel", onWheel);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
}
