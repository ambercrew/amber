import { useMemo } from "react";
import { PdfAnnotationSubtype, PdfLinkAnnoObject } from "@embedpdf/models";
import {
	BoxedAnnotationRenderer,
	createRenderer,
	useAnnotationCapability,
} from "@embedpdf/plugin-annotation/react";

/** Replaces embedpdf's link renderer (same `id`) with one that follows the link on click.
 * The built-in one only navigates for locked annotations, and locking links would lock highlights too. */
export function usePdfLinkNavigationRenderer(
	documentId: string | null,
): BoxedAnnotationRenderer[] {
	const { provides } = useAnnotationCapability();

	return useMemo<BoxedAnnotationRenderer[]>(() => {
		if (!documentId || !provides) return [];

		return [
			createRenderer<PdfLinkAnnoObject>({
				id: "link",
				matches: (a): a is PdfLinkAnnoObject =>
					a.type === PdfAnnotationSubtype.LINK,
				render: ({ onClick }) => (
					<div
						onPointerDown={onClick}
						style={{
							width: "100%",
							height: "100%",
							cursor: onClick ? "pointer" : "default",
							pointerEvents: onClick ? "auto" : "none",
						}}
					/>
				),
				useAppearanceStream: false,
				selectOverride: (e, annotation, helpers) => {
					e.stopPropagation();
					const target = annotation.object.target;
					if (target) {
						void provides
							.forDocument(documentId)
							.navigateTarget(target);
						return;
					}
					helpers.clearSelection();
					if (annotation.object.inReplyToId) {
						const parent = helpers.allAnnotations.find(
							a => a.object.id === annotation.object.inReplyToId,
						);
						if (parent) {
							helpers.selectAnnotation(
								parent.object.pageIndex,
								parent.object.id,
							);
							return;
						}
					}
					helpers.selectAnnotation(
						helpers.pageIndex,
						annotation.object.id,
					);
				},
			}),
		];
	}, [documentId, provides]);
}
