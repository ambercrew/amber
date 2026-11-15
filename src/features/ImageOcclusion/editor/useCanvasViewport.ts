import { RefObject, useState } from "react";
import { useGesture } from "@use-gesture/react";
import { useAppHotkeys } from "../../../commands/useAppHotkeys";
import {
	RESET_ZOOM_SHORTCUT,
	ZOOM_IN_ALT_SHORTCUT,
	ZOOM_IN_SHORTCUT,
	ZOOM_OUT_SHORTCUT,
} from "../../../config/shortcuts";
import {
	CanvasView,
	clampView,
	FIT_VIEW,
	fitScale,
	MAX_ZOOM,
	MIN_ZOOM,
	Point,
	ViewportSize,
	ZOOM_BUTTON_FACTOR,
	zoomViewAt,
} from "../utils/canvasViewport";

/** Zoom and pan for the occlusion canvas: pinch (touch or trackpad), wheel and the zoom shortcuts. */
export function useCanvasViewport(
	size: ViewportSize,
	containerRef: RefObject<HTMLDivElement | null>,
	onPinchStart: () => void,
) {
	const [rawView, setRawView] = useState(FIT_VIEW);
	// Clamped on read, so a resized window can never strand the image off screen.
	const view = clampView(rawView, size);
	const clampPosition = (position: Point) =>
		clampView({ ...view, ...position }, size);

	const zoomBy = (factor: number) =>
		setRawView(
			zoomViewAt(
				view,
				view.zoom * factor,
				{ x: size.width / 2, y: size.height / 2 },
				size,
			),
		);
	const zoomIn = () => zoomBy(ZOOM_BUTTON_FACTOR);
	const zoomOut = () => zoomBy(1 / ZOOM_BUTTON_FACTOR);
	const resetZoom = () => setRawView(FIT_VIEW);

	useAppHotkeys([
		[ZOOM_IN_SHORTCUT, zoomIn],
		[ZOOM_IN_ALT_SHORTCUT, zoomIn],
		[ZOOM_OUT_SHORTCUT, zoomOut],
		[RESET_ZOOM_SHORTCUT, resetZoom],
	]);

	useGesture(
		{
			onPinch: ({ first, origin, offset: [zoom], event, memo }) => {
				event.preventDefault();
				// Kept from the app-wide ctrl+wheel zoom listening on the window.
				event.stopPropagation();
				if (first) onPinchStart();
				const rect = containerRef.current!.getBoundingClientRect();
				const point = {
					x: origin[0] - rect.left,
					y: origin[1] - rect.top,
				};
				const start = (memo as
					{ view: CanvasView; point: Point } | undefined) ?? {
					view,
					point,
				};
				// Follows the fingers' midpoint too, so a pinch also pans.
				const moved = {
					...start.view,
					x: start.view.x + point.x - start.point.x,
					y: start.view.y + point.y - start.point.y,
				};
				setRawView(zoomViewAt(moved, zoom, point, size));
				return start;
			},
			onWheel: ({ event, delta: [dx, dy] }) => {
				event.preventDefault();
				event.stopPropagation();
				setRawView(clampPosition({ x: view.x - dx, y: view.y - dy }));
			},
		},
		{
			target: containerRef,
			eventOptions: { passive: false },
			pinch: {
				from: () => [view.zoom, 0],
				scaleBounds: { min: MIN_ZOOM, max: MAX_ZOOM },
				rubberband: false,
			},
		},
	);

	return {
		view,
		scale: fitScale(size) * view.zoom,
		clampPosition,
		setPosition: (position: Point) => setRawView(clampPosition(position)),
		zoomIn,
		zoomOut,
		resetZoom,
	};
}
