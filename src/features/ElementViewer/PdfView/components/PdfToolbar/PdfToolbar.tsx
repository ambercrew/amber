import { useState } from "react";
import {
	ActionIcon,
	Divider,
	Group,
	NumberInput,
	Popover,
	Text,
	TextInput,
} from "@mantine/core";
import { ListBulletsIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { useZoom } from "@embedpdf/plugin-zoom/react";
import { useScroll } from "@embedpdf/plugin-scroll/react";
import AppTooltip from "../../../../../components/AppTooltip/AppTooltip";
import {
	AppHotkeyItem,
	useAppHotkeys,
} from "../../../../../commands/useAppHotkeys";
import {
	RESET_ZOOM_SHORTCUT,
	ZOOM_IN_SHORTCUT,
	ZOOM_OUT_SHORTCUT,
} from "../../../../../commands/commands";
import PdfOutline from "../PdfOutline/PdfOutline";

interface PdfToolbarProps {
	documentId: string;
	pinned: boolean;
}

export default function PdfToolbar({ documentId, pinned }: PdfToolbarProps) {
	const { state: zoomState, provides: zoom } = useZoom(documentId);
	const { state: scrollState, provides: scroll } = useScroll(documentId);
	const [outlineOpened, setOutlineOpened] = useState(false);

	const [prevPinned, setPrevPinned] = useState(pinned);
	if (pinned !== prevPinned) {
		setPrevPinned(pinned);
		if (!pinned) setOutlineOpened(false);
	}

	useAppHotkeys(
		[
			[ZOOM_IN_SHORTCUT, () => zoom?.zoomIn()],
			[ZOOM_OUT_SHORTCUT, () => zoom?.zoomOut()],
			[RESET_ZOOM_SHORTCUT, () => zoom?.requestZoom(1)],
		] satisfies AppHotkeyItem[],
		[],
		true,
	);

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

	const [zoomInput, setZoomInput] = useState("");
	const [editingZoom, setEditingZoom] = useState(false);
	const currentZoomPercentage = Math.round(zoomState.currentZoomLevel * 100);

	function commitZoomInput() {
		const zoomPercentage = Number(zoomInput);
		if (Number.isFinite(zoomPercentage)) {
			zoom?.requestZoom(zoomPercentage / 100);
		}
		setEditingZoom(false);
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
				gap="md"
				px="sm"
				py="xs"
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
				<Popover
					opened={outlineOpened}
					onChange={setOutlineOpened}
					position="top-start"
					shadow="md"
					withArrow>
					<Popover.Target>
						<AppTooltip label="Table of contents">
							<ActionIcon
								variant={outlineOpened ? "light" : "subtle"}
								size="lg"
								onClick={() => setOutlineOpened(o => !o)}>
								<ListBulletsIcon size={18} />
							</ActionIcon>
						</AppTooltip>
					</Popover.Target>
					<Popover.Dropdown p={0}>
						<PdfOutline
							documentId={documentId}
							onNavigate={() => setOutlineOpened(false)}
						/>
					</Popover.Dropdown>
				</Popover>
				<Divider orientation="vertical" />
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
				<Divider orientation="vertical" />
				<Group gap={2} wrap="nowrap">
					<AppTooltip label="Zoom out">
						<ActionIcon
							variant="subtle"
							size="lg"
							onClick={() => zoom?.zoomOut()}>
							<MinusIcon size={18} />
						</ActionIcon>
					</AppTooltip>
					<NumberInput
						size="xs"
						w={48}
						hideControls
						suffix="%"
						styles={{ input: { textAlign: "center", padding: 0 } }}
						value={editingZoom ? zoomInput : currentZoomPercentage}
						onChange={value => setZoomInput(String(value))}
						onFocus={e => {
							setEditingZoom(true);
							setZoomInput(String(currentZoomPercentage));
							e.currentTarget.select();
						}}
						onBlur={commitZoomInput}
						onKeyDown={e => {
							if (e.key === "Enter") e.currentTarget.blur();
						}}
					/>
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
