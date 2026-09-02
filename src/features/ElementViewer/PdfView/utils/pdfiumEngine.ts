import { createPdfiumEngine } from "@embedpdf/engines/pdfium-direct-engine";

// TEMPORARY: using the "direct" (main-thread) engine instead of the worker
// engine to get a real, visible error out of WASM instantiation — the worker
// variant's init failures get caught and reshaped into a `wasmError` message
// that the message-response router doesn't recognize, so they're silently
// dropped and the app just hangs on "Opening document…" forever instead of
// surfacing anything. Revert to `@embedpdf/engines/pdfium-worker-engine` once
// the underlying cause is found — the worker keeps PDF work off the main
// thread.
//
// A module-level singleton also means a duplicate call (e.g. React
// StrictMode's double-invoked effects) reuses the same engine instead of
// racing a second one.
let enginePromise: ReturnType<typeof createPdfiumEngine> | null = null;

export function getPdfiumEngine(
	wasmUrl: string,
): ReturnType<typeof createPdfiumEngine> {
	enginePromise ??= createPdfiumEngine(wasmUrl);
	return enginePromise;
}
