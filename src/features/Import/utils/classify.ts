export type ClassifiedInput =
	| { kind: "file"; files: File[] }
	| { kind: "url"; url: string }
	| { kind: "content"; html: string | null; text: string }
	| { kind: "ambiguous"; text: string };

const CONTENT_MIN_LENGTH = 200;

export function classifyPaste(dt: DataTransfer): ClassifiedInput {
	if (dt.files.length > 0) return { kind: "file", files: [...dt.files] };

	const text = dt.getData("text/plain").trim();
	const html = dt.getData("text/html") || null;

	const url = asUrl(text);
	if (url !== null) return { kind: "url", url };

	if (
		html !== null ||
		text.includes("\n") ||
		text.length > CONTENT_MIN_LENGTH
	)
		return { kind: "content", html, text };

	return { kind: "ambiguous", text };
}

export function asUrl(text: string): string | null {
	if (text.length === 0 || /\s/.test(text)) return null;
	return tryParse(text) ?? maybeSchemelessRetry(text);
}

function tryParse(text: string): string | null {
	try {
		const url = new URL(text);
		return url.protocol === "http:" || url.protocol === "https:"
			? url.href
			: null;
	} catch {
		return null;
	}
}

function maybeSchemelessRetry(text: string): string | null {
	if (!/^[\w-]+(\.[\w-]+)+([/?#]|$)/.test(text)) return null;
	return tryParse(`https://${text}`);
}
