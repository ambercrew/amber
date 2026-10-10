import DOMPurify from "dompurify";
import {
	CLOZE_HIDDEN_ATTRIBUTE,
	CLOZE_HIDDEN_TAG_NAME,
} from "../components/Editor/plugins/ClozePlugin/ClozeHiddenNode";

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

// Also allows relative/protocol-relative URLs (no scheme, or starting with
// "/" or "//") so that normalize() gets a chance to resolve them against the
// baseUrl — DOMPurify would otherwise strip them outright. Stored assets pass too, canonical
// (`amber-asset:<id>`) or as the macOS/Linux runtime URL (`amber-asset://localhost/<id>`).
const ALLOWED_URI_REGEXP =
	/^(?:https?:|data:image\/|amber-asset:(?:\/\/localhost\/)?[0-9a-f]{64}$|[^a-z]|[a-z\d+.-]+(?:[^a-z\d+.\-:]|$))/i;

export function sanitizeHtml(html: string): string {
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS,
		ALLOWED_ATTR,
		ALLOWED_URI_REGEXP,
		KEEP_CONTENT: true,
	});
}
