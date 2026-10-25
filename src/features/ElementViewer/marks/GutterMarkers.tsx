import { Badge, Box, Flex, ThemeIcon, UnstyledButton } from "@mantine/core";
import { commandsById } from "../../../commands/commands";
import { useRunCommand } from "../../../commands/useRunCommand";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import { ReadPointIcon } from "../../../config/icons";
import { MarkSlot } from "../../../types/elements/learningAssetMark";
import {
	COMPACT_GUTTER_MARGIN_IN_PX,
	COMPACT_MARKER_GAP_IN_PX,
	COMPACT_MARKER_HEIGHT_IN_PX,
	COMPACT_MARKER_WIDTH_IN_PX,
	GUTTER_MARGIN_IN_PX,
	GUTTER_MARKER_GAP_IN_PX,
	GUTTER_MARKER_SIZE_IN_PX,
	GutterLayout,
	gutterLayout,
} from "./gutterLayout";
import {
	findMark,
	goToMarkLabel,
	markFillColor,
	READ_POINT_COLOR,
} from "./markLogic";
import { useMarksContext } from "./marksContext";

const READ_POINT_LABEL = "You'll resume here next time";

/** A thin color tab standing in for a marker when the gutter is too narrow for it. */
function CompactMarker({ color }: { color: string }) {
	return (
		<Box
			w={COMPACT_MARKER_WIDTH_IN_PX}
			h={COMPACT_MARKER_HEIGHT_IN_PX}
			bg={color}
			style={{ borderRadius: COMPACT_MARKER_WIDTH_IN_PX / 2 }}
		/>
	);
}

function ReadPointMarker({ compact }: { compact: boolean }) {
	return (
		<AppTooltip
			label={READ_POINT_LABEL}
			shortcut={commandsById["go-to-read-point"].shortcut}
			position="left"
			withArrow>
			{compact ? (
				<Box aria-label={READ_POINT_LABEL}>
					<CompactMarker color={READ_POINT_COLOR} />
				</Box>
			) : (
				<ThemeIcon
					aria-label={READ_POINT_LABEL}
					size={GUTTER_MARKER_SIZE_IN_PX}
					radius="xl"
					color={READ_POINT_COLOR}>
					<ReadPointIcon size={12} weight="fill" />
				</ThemeIcon>
			)}
		</AppTooltip>
	);
}

export function MarkFlag({
	slot,
	compact = false,
}: {
	slot: MarkSlot;
	compact?: boolean;
}) {
	const runCommand = useRunCommand();
	const { marks, progressOf } = useMarksContext();
	const mark = findMark(marks, slot);
	const label = goToMarkLabel(
		slot,
		!!mark,
		mark ? progressOf(mark.anchor) : null,
	);

	return (
		<AppTooltip
			label={label}
			shortcut={commandsById[`go-to-mark-${slot}`].shortcut}
			position="left"
			withArrow>
			<UnstyledButton
				aria-label={label}
				display="flex"
				onClick={() => runCommand(`go-to-mark-${slot}`)}>
				{compact ? (
					<CompactMarker color={markFillColor(slot)} />
				) : (
					<Badge
						h={GUTTER_MARKER_SIZE_IN_PX}
						w={GUTTER_MARKER_SIZE_IN_PX}
						radius="xs"
						circle
						color={markFillColor(slot)}>
						{slot}
					</Badge>
				)}
			</UnstyledButton>
		</AppTooltip>
	);
}

interface GutterMarkersProps {
	/** Offset (px or CSS) from the positioned parent's top, level with the marked block. */
	top: number | string;
	/** Room left of the content; `null` before it's measured. */
	gutterWidth: number | null;
	readPoint?: boolean;
	slots: MarkSlot[];
}

/** One block's read point and mark markers, just left of the content, arranged to fit the room there. */
export default function GutterMarkers({
	top,
	gutterWidth,
	readPoint = false,
	slots,
}: GutterMarkersProps) {
	const count = slots.length + (readPoint ? 1 : 0);
	if (count === 0 || gutterWidth === null) return null;

	const layout: GutterLayout = gutterLayout(count, gutterWidth);
	const compact = layout === "compact";

	return (
		<Flex
			pos="absolute"
			top={top}
			right="100%"
			mr={compact ? COMPACT_GUTTER_MARGIN_IN_PX : GUTTER_MARGIN_IN_PX}
			// Reversed in a row so the read point sits nearest the text.
			direction={layout === "row" ? "row-reverse" : "column"}
			gap={compact ? COMPACT_MARKER_GAP_IN_PX : GUTTER_MARKER_GAP_IN_PX}
			style={{ zIndex: 1 }}>
			{readPoint && <ReadPointMarker compact={compact} />}
			{slots.map(slot => (
				<MarkFlag key={slot} slot={slot} compact={compact} />
			))}
		</Flex>
	);
}
