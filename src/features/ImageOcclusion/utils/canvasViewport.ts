/** How the image sits in the canvas: `zoom` is relative to fitting it whole, `x`/`y` its on-screen offset in px. */
export interface CanvasView {
	zoom: number;
	x: number;
	y: number;
}

export interface ViewportSize {
	width: number;
	height: number;
	iw: number;
	ih: number;
}

export interface Point {
	x: number;
	y: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;
export const ZOOM_BUTTON_FACTOR = 1.25;

export const FIT_VIEW: CanvasView = { zoom: 1, x: 0, y: 0 };

export function fitScale({ width, height, iw, ih }: ViewportSize) {
	return width && height ? Math.min(width / iw, height / ih) : 0;
}

export function clampZoom(zoom: number) {
	return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
}

// Centers an axis the image doesn't fill, and otherwise keeps its edges from leaving the viewport's.
function clampAxis(position: number, content: number, viewport: number) {
	if (content <= viewport) return (viewport - content) / 2;
	return Math.min(0, Math.max(viewport - content, position));
}

export function clampView(view: CanvasView, size: ViewportSize): CanvasView {
	const zoom = clampZoom(view.zoom);
	const scale = fitScale(size) * zoom;
	return {
		zoom,
		x: clampAxis(view.x, size.iw * scale, size.width),
		y: clampAxis(view.y, size.ih * scale, size.height),
	};
}

/** Zooms to `zoom` while keeping the image point under `anchor` (viewport px) in place. */
export function zoomViewAt(
	view: CanvasView,
	zoom: number,
	anchor: Point,
	size: ViewportSize,
): CanvasView {
	const fit = fitScale(size);
	const oldScale = fit * view.zoom;
	const newZoom = clampZoom(zoom);
	const newScale = fit * newZoom;
	const imageX = (anchor.x - view.x) / oldScale;
	const imageY = (anchor.y - view.y) / oldScale;
	return clampView(
		{
			zoom: newZoom,
			x: anchor.x - imageX * newScale,
			y: anchor.y - imageY * newScale,
		},
		size,
	);
}
