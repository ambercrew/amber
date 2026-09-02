import { useState } from "react";
import { ActionIcon, Group, Text, TextInput } from "@mantine/core";
import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { useZoom } from "@embedpdf/plugin-zoom/react";
import { useScroll } from "@embedpdf/plugin-scroll/react";
import AppTooltip from "../../../../components/AppTooltip/AppTooltip";

interface PdfToolbarProps {
	documentId: string;
	pinned: boolean;
}

/** Floats over the PDF viewport as a rounded zoom panel near the bottom
 * edge, sliding out of view on scroll-down and back in on scroll-up —
 * mirroring the app header's headroom behavior, but as a footer.
 * Positioned absolutely (over the viewport, not in flex flow) so it never
 * affects the viewport's layout size, which would upset `Scroller`'s
 * virtualized page layout (see PdfViewportScrollWatcher). */
export default function PdfToolbar({ documentId, pinned }: PdfToolbarProps) {
	const { state: zoomState, provides: zoom } = useZoom(documentId);
	const { state: scrollState, provides: scroll } = useScroll(documentId);

	const [pageInput, setPageInput] = useState("");
	const [editingPage, setEditingPage] = useState(false);

	function commitPageInput() {
		const pageNumber = Number(pageInput);
		if (Number.isInteger(pageNumber)) {
			const clamped = Math.min(
				Math.max(pageNumber, 1),
				scrollState.totalPages,
			);
			scroll?.scrollToPage({ pageNumber: clamped, behavior: "instant" });
		}
		setEditingPage(false);
	}

	return (
		<div
			style={{
				position: "absolute",
				insetInline: 0,
				bottom: "var(--mantine-spacing-md)",
				display: "flex",
				justifyContent: "center",
				pointerEvents: "none",
				zIndex: 1,
			}}>
			<Group
				gap="lg"
				px="md"
				py="sm"
				wrap="nowrap"
				style={{
					pointerEvents: "auto",
					borderRadius: "var(--mantine-radius-md)",
					boxShadow: "var(--mantine-shadow-md)",
					border: "1px solid var(--mantine-color-default-border)",
					backgroundColor: "var(--mantine-color-body)",
					transform: pinned
						? "translateY(0)"
						: "translateY(calc(100% + var(--mantine-spacing-md)))",
					transitionProperty: "transform",
					transitionDuration: "var(--app-shell-transition-duration)",
				}}>
				<Group gap={4} wrap="nowrap">
					<TextInput
						size="xs"
						w={36}
						styles={{ input: { textAlign: "center", padding: 0 } }}
						value={
							editingPage
								? pageInput
								: String(scrollState.currentPage)
						}
						onChange={e => setPageInput(e.currentTarget.value)}
						onFocus={e => {
							setEditingPage(true);
							setPageInput(String(scrollState.currentPage));
							e.currentTarget.select();
						}}
						onBlur={commitPageInput}
						onKeyDown={e => {
							if (e.key === "Enter") e.currentTarget.blur();
						}}
					/>
					<Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
						/ {scrollState.totalPages}
					</Text>
				</Group>
				<Group gap={0} wrap="nowrap">
					<AppTooltip label="Zoom out">
						<ActionIcon
							variant="subtle"
							size="lg"
							onClick={() => zoom?.zoomOut()}>
							<MinusIcon size={18} />
						</ActionIcon>
					</AppTooltip>
					<Text size="sm" w={48} ta="center">
						{Math.round(zoomState.currentZoomLevel * 100)}%
					</Text>
					<AppTooltip label="Zoom in">
						<ActionIcon
							variant="subtle"
							size="lg"
							onClick={() => zoom?.zoomIn()}>
							<PlusIcon size={18} />
						</ActionIcon>
					</AppTooltip>
				</Group>
			</Group>
		</div>
	);
}
