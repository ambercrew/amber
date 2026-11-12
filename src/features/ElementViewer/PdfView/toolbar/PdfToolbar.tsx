import { useState } from "react";
import {
	ActionIcon,
	Divider,
	Group,
	NumberInput,
	Text,
	TextInput,
} from "@mantine/core";
import { MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { useStage, useStageState } from "@embedpdf/react/stage";
import { SAFE_AREA_BOTTOM } from "../../../../utils/safeArea";
import { useChromeInsets } from "../../../App/context/chromeInsetsContext";
import AppTooltip from "../../../../components/AppTooltip/AppTooltip";
import {
	AppHotkeyItem,
	useAppHotkeys,
} from "../../../../commands/useAppHotkeys";
import {
	RESET_ZOOM_SHORTCUT,
	ZOOM_IN_ALT_SHORTCUT,
	ZOOM_IN_SHORTCUT,
	ZOOM_OUT_SHORTCUT,
} from "../../../../config/shortcuts";
import { usePdfCore } from "../core/pdfCoreContext";

interface PdfToolbarProps {
	pinned: boolean;
}

export default function PdfToolbar({ pinned }: PdfToolbarProps) {
	const zoom = useStage();
	const zoomLevel = useStageState(state => state.zoomLevel);
	const currentPage = useStageState(state => state.currentPageIndex + 1);
	const totalPages = useStageState(state => state.pageCount);
	const { goToPage } = usePdfCore();

	// Floats above the study session footer while it's shown, instead of behind it.
	const insets = useChromeInsets();

	useAppHotkeys(
		[
			[ZOOM_IN_SHORTCUT, () => zoom.zoomIn()],
			[ZOOM_IN_ALT_SHORTCUT, () => zoom.zoomIn()],
			[ZOOM_OUT_SHORTCUT, () => zoom.zoomOut()],
			[RESET_ZOOM_SHORTCUT, () => zoom.zoomTo(1)],
		] satisfies AppHotkeyItem[],
		[],
		true,
	);

	const [pageInput, setPageInput] = useState("");
	const [editingPage, setEditingPage] = useState(false);

	function commitPageInput() {
		const pageNumber = Number(pageInput);
		if (Number.isInteger(pageNumber)) {
			const clamped = Math.min(Math.max(pageNumber, 1), totalPages);
			goToPage(clamped, { behavior: "instant" });
		}
		setEditingPage(false);
	}

	const [zoomInput, setZoomInput] = useState("");
	const [editingZoom, setEditingZoom] = useState(false);
	const currentZoomPercentage = Math.round(zoomLevel * 100);

	function commitZoomInput() {
		const zoomPercentage = Number(zoomInput);
		if (Number.isFinite(zoomPercentage) && zoomPercentage > 0) {
			zoom.zoomTo(zoomPercentage / 100);
		}
		setEditingZoom(false);
	}

	return (
		<div
			style={{
				position: "absolute",
				insetInline: 0,
				bottom: `calc(var(--mantine-spacing-md) + ${insets.bottom})`,
				display: "flex",
				justifyContent: "center",
				pointerEvents: "none",
				zIndex: 1,
				transitionProperty: "bottom",
				transitionDuration: "var(--app-shell-transition-duration)",
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
						: `translateY(calc(100% + var(--mantine-spacing-md) + ${SAFE_AREA_BOTTOM}))`,
					transitionProperty: "transform",
					transitionDuration: "var(--app-shell-transition-duration)",
				}}>
				<Group gap={4} wrap="nowrap">
					<TextInput
						size="xs"
						w={36}
						styles={{ input: { textAlign: "center", padding: 0 } }}
						value={editingPage ? pageInput : String(currentPage)}
						onChange={e => setPageInput(e.currentTarget.value)}
						onFocus={e => {
							setEditingPage(true);
							setPageInput(String(currentPage));
							e.currentTarget.select();
						}}
						onBlur={commitPageInput}
						onKeyDown={e => {
							if (e.key === "Enter") e.currentTarget.blur();
						}}
					/>
					<Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
						/ {totalPages}
					</Text>
				</Group>
				<Divider orientation="vertical" />
				<Group gap={2} wrap="nowrap">
					<AppTooltip label="Zoom out">
						<ActionIcon
							variant="subtle"
							size="lg"
							onClick={() => zoom.zoomOut()}>
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
							onClick={() => zoom.zoomIn()}>
							<PlusIcon size={18} />
						</ActionIcon>
					</AppTooltip>
				</Group>
			</Group>
		</div>
	);
}
