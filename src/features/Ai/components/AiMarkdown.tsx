import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Typography } from "@mantine/core";
import ElementReference from "../../../components/ElementReference/ElementReference";
import {
	ELEMENT_REFERENCE_TAG,
	parseElementReference,
} from "../../../api/aiIntegration/elementReference";
import { ElementId } from "../../../types/elements/elementId";
import { renderMarkdown } from "../utils/renderMarkdown";

interface AiMarkdownProps {
	markdown: string;
}

interface Reference {
	node: Element;
	elementId: ElementId;
}

/** Renders AI markdown, turning each `<element-ref>` tag into a link to its element. */
function AiMarkdown({ markdown }: AiMarkdownProps) {
	const html = useMemo(() => renderMarkdown(markdown), [markdown]);
	const containerRef = useRef<HTMLDivElement>(null);
	const [references, setReferences] = useState<Reference[]>([]);

	// The tags only exist once React has written the HTML, so links are portalled into them after.
	useLayoutEffect(() => {
		const nodes =
			containerRef.current?.querySelectorAll(ELEMENT_REFERENCE_TAG) ?? [];
		setReferences(
			Array.from(nodes).flatMap(node => {
				const elementId = parseElementReference(node);
				return elementId ? [{ node, elementId }] : [];
			}),
		);
	}, [html]);

	return (
		<Typography>
			<div
				ref={containerRef}
				style={{ overflowX: "auto" }}
				dangerouslySetInnerHTML={{ __html: html }}
			/>
			{references.map(({ node, elementId }, index) =>
				createPortal(
					<ElementReference elementId={elementId} />,
					node,
					index,
				),
			)}
		</Typography>
	);
}

export default AiMarkdown;
