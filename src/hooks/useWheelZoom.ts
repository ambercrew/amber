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

		// A non-passive wheel listener makes every scroll wait on the main thread, so it's only attached while Ctrl/Cmd is held.
		let attached = false;
		function setAttached(next: boolean) {
			if (next === attached) return;
			attached = next;
			if (next)
				window.addEventListener("wheel", onWheel, { passive: false });
			else window.removeEventListener("wheel", onWheel);
		}
		// The mouse catches a modifier pressed before the window had focus.
		const syncModifier = (e: KeyboardEvent | MouseEvent) =>
			setAttached(e.ctrlKey || e.metaKey);
		const release = () => setAttached(false);

		window.addEventListener("keydown", syncModifier);
		window.addEventListener("keyup", syncModifier);
		window.addEventListener("mousemove", syncModifier, { passive: true });
		window.addEventListener("blur", release);
		return () => {
			window.removeEventListener("keydown", syncModifier);
			window.removeEventListener("keyup", syncModifier);
			window.removeEventListener("mousemove", syncModifier);
			window.removeEventListener("blur", release);
			release();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
}
