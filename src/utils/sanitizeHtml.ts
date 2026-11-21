import DOMPurify from "dompurify";
import {
	CLOZE_HIDDEN_ATTRIBUTE,
	CLOZE_HIDDEN_TAG_NAME,
} from "../components/Editor/plugins/ClozePlugin/clozeHiddenConstants";

const ALLOWED_TAGS = [
	"p",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"ul",
	"ol",
	"li",
	"blockquote",
	"pre",
	"code",
	"a",
	"strong",
	"b",
	"em",
	"i",
	"u",
	"s",
	"sup",
	"sub",
	"img",
	"hr",
	"br",
	"table",
	"thead",
	"tbody",
	"tr",
	"td",
	"th",
	// span/svg/path support KaTeX's `output: "html"` math rendering used by
	// the AI chat's markdown renderer (see MessageBubble.tsx).
	"span",
	"svg",
	"path",
	CLOZE_HIDDEN_TAG_NAME,
];

const ALLOWED_ATTR = [
	"href",
	"src",
	"alt",
	"class",
	"style",
	"aria-hidden",
	"xmlns",
	"width",
	"height",
	"viewBox",
	"preserveAspectRatio",
	"d",
	CLOZE_HIDDEN_ATTRIBUTE,
];

// Also allows relative URLs (no scheme, `/` or `//`) for normalize() to resolve against baseUrl, and
// stored assets (`amber-asset:<id>` or the runtime's `amber-asset://localhost/<id>`).
const ALLOWED_URI_REGEXP =
	/^(?:https?:|data:image\/|amber-asset:(?:\/\/localhost\/)?[0-9a-f]{64}$|[^a-z]|[a-z\d+.-]+(?:[^a-z\d+.\-:]|$))/i;

const CONFIG = {
	ALLOWED_ATTR,
	ALLOWED_URI_REGEXP,
	KEEP_CONTENT: true,
};

/** `extraTags` keeps further tags, e.g. ones a caller later replaces with components. */
export function sanitizeHtml(html: string, extraTags: string[] = []): string {
	return DOMPurify.sanitize(html, {
		...CONFIG,
		ALLOWED_TAGS: [...ALLOWED_TAGS, ...extraTags],
	});
}

/** Like `sanitizeHtml` for an already parsed body, whose content it moves into the sanitized body it returns. */
export function sanitizeBody(body: HTMLElement): HTMLElement {
	// As a fragment, since DOMPurify can't drop a detached `<body>` it was handed itself.
	const fragment = body.ownerDocument.createDocumentFragment();
	fragment.append(...Array.from(body.childNodes));
	// RETURN_DOM yields the `<body>` holding the sanitized content.
	return DOMPurify.sanitize(fragment, {
		...CONFIG,
		ALLOWED_TAGS,
		RETURN_DOM: true,
	}) as HTMLElement;
}
