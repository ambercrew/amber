import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Box, MantineColor, UnstyledButton } from "@mantine/core";
import { commandsById } from "../../../commands/commands";
import { useRunCommand } from "../../../commands/useRunCommand";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import { ReadingPosition } from "../../../types/elements/readingPosition";
import {
	goToMarkLabel,
	goToReadPointLabel,
	markFillColor,
	READ_POINT_COLOR,
} from "./markLogic";
import { useMarksContext } from "./marksContext";
import { scrollAreaScrollbarPadding, thumbTopFraction } from "./scrollbarThumb";

const TRACK_WIDTH_IN_PX = 12;
const TICK_HEIGHT_IN_PX = 4;
const READ_POINT_KEY = "read-point";

interface ScrollbarTickProps {
	/** Fraction (0 to 1) of the track's height. */
	position: number;
	label: string;
	shortcut?: string;
	color: MantineColor;
	onClick: () => void;
}

function ScrollbarTick({
	position,
	label,
	shortcut,
	color,
	onClick,
}: ScrollbarTickProps) {
	return (
		<AppTooltip label={label} shortcut={shortcut} position="left" withArrow>
			<UnstyledButton
				aria-label={label}
				pos="absolute"
				left={0}
				right={0}
				h={TICK_HEIGHT_IN_PX}
				bg={color}
				onClick={onClick}
				style={{
					top: `calc(${position * 100}% - ${TICK_HEIGHT_IN_PX / 2}px)`,
					pointerEvents: "auto",
					borderRadius: TICK_HEIGHT_IN_PX / 2,
				}}
			/>
		</AppTooltip>
	);
}

interface MarkScrollbarTicksProps {
	/** Positioned element whose right edge holds the scrollbar track the ticks overlay. */
	container: HTMLElement | null;
	/** When positions are estimates refined while scrolling (text splits), the element to refresh them on. */
	scrollElement?: HTMLElement | null;
	/** CSS inset of the scrollbar track from the container's top. */
	trackTop: string;
	/** CSS inset of the scrollbar track from the container's bottom. */
	trackBottom: string;
	/** Animates inset changes to match a track that animates its own; omit for one that snaps. */
	trackTransition?: string;
	/** The read point shown in the reading, ticked in its own color; `null` when there is none. */
	readPoint?: ReadingPosition | null;
	/**
	 * With a Mantine ScrollArea `scrollElement`: the `scrollTop` a jump to an anchor lands on,
	 * so its tick sits where the thumb's top will be. Ticks are otherwise placed by progress.
	 */
	landingScrollTopOf?: (anchor: ReadingPosition) => number | null;
}

/** A clickable tick per set mark (and the read point) on the scrollbar track, placed from its stored anchor. */
export default function MarkScrollbarTicks({
	container,
	scrollElement,
	trackTop,
	trackBottom,
	trackTransition,
	readPoint,
	landingScrollTopOf,
}: MarkScrollbarTicksProps) {
	const runCommand = useRunCommand();
	const { marks, progressOf } = useMarksContext();
	const [track, setTrack] = useState<HTMLDivElement | null>(null);
	const hasTicks = marks.length > 0 || !!readPoint;

	const positionOf = useCallback(
		(anchor: ReadingPosition) => {
			const scrollTop = landingScrollTopOf?.(anchor);
			if (
				scrollTop === undefined ||
				scrollTop === null ||
				!scrollElement ||
				!track
			)
				return progressOf(anchor);
			return thumbTopFraction(scrollTop, {
				scrollHeight: scrollElement.scrollHeight,
				clientHeight: scrollElement.clientHeight,
				trackHeight: track.clientHeight,
				padding: scrollAreaScrollbarPadding(scrollElement),
			});
		},
		[landingScrollTopOf, scrollElement, track, progressOf],
	);

	// Keyed by mark slot, or `READ_POINT_KEY`; measured outside render, and kept when unchanged.
	const [positions, setPositions] = useState<Record<string, number | null>>(
		{},
	);
	const measure = useCallback(() => {
		const next: Record<string, number | null> = {};
		if (readPoint) next[READ_POINT_KEY] = positionOf(readPoint);
		for (const { slot, anchor } of marks) next[slot] = positionOf(anchor);
		setPositions(current => {
			const keys = Object.keys(next);
			return keys.length === Object.keys(current).length &&
				keys.every(key => current[key] === next[key])
				? current
				: next;
		});
	}, [readPoint, marks, positionOf]);
	// Measured a frame after any change, per frame while scrolling refines split height estimates, and as the track resizes with the chrome.
	useEffect(() => {
		if (!hasTicks) return;
		let frame: number | null = null;
		const schedule = () => {
			if (frame !== null) return;
			frame = requestAnimationFrame(() => {
				frame = null;
				measure();
			});
		};
		// Ticks sit at a % of the track, so they follow its slide with the chrome; re-measuring every frame of it only re-renders.
		const onResize = () => {
			if (track?.getAnimations?.().length) return;
			schedule();
		};
		schedule();
		scrollElement?.addEventListener("scroll", schedule, { passive: true });
		track?.addEventListener("transitionend", schedule);
		const resizeObserver =
			track && typeof ResizeObserver !== "undefined"
				? new ResizeObserver(onResize)
				: null;
		if (track) resizeObserver?.observe(track);
		return () => {
			scrollElement?.removeEventListener("scroll", schedule);
			track?.removeEventListener("transitionend", schedule);
			resizeObserver?.disconnect();
			if (frame !== null) cancelAnimationFrame(frame);
		};
	}, [scrollElement, track, hasTicks, measure]);

	if (!container || !hasTicks) return null;
	const readPointPosition = positions[READ_POINT_KEY] ?? null;

	return createPortal(
		<Box
			ref={setTrack}
			pos="absolute"
			top={trackTop}
			bottom={trackBottom}
			right={0}
			w={TRACK_WIDTH_IN_PX}
			style={{
				pointerEvents: "none",
				zIndex: 1,
				transition: trackTransition,
			}}>
			{readPoint && readPointPosition !== null && (
				<ScrollbarTick
					position={readPointPosition}
					label={goToReadPointLabel(progressOf(readPoint))}
					shortcut={commandsById["go-to-read-point"].shortcut}
					color={READ_POINT_COLOR}
					onClick={() => runCommand("go-to-read-point")}
				/>
			)}
			{marks.map(({ slot, anchor }) => {
				const position = positions[slot] ?? null;
				if (position === null) return null;
				return (
					<ScrollbarTick
						key={slot}
						position={position}
						label={goToMarkLabel(slot, true, progressOf(anchor))}
						shortcut={commandsById[`go-to-mark-${slot}`].shortcut}
						color={markFillColor(slot)}
						onClick={() => runCommand(`go-to-mark-${slot}`)}
					/>
				);
			})}
		</Box>,
		container,
	);
}
