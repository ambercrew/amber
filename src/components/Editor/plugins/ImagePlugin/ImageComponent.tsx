import { useCallback, useEffect, useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { calculateZoomLevel } from "@lexical/utils";
import { Box, Image, Popover } from "@mantine/core";
import { ArrowsOutIcon } from "@phosphor-icons/react";
import {
	$getNodeByKey,
	CLICK_COMMAND,
	COMMAND_PRIORITY_LOW,
	DRAGSTART_COMMAND,
	mergeRegister,
} from "lexical";
import { $isImageNode } from "./ImageNode";
import { openImageLightbox } from "./imageLightbox";
import FloatingMenuBar from "../../../FloatingMenuBar/FloatingMenuBar";
import { useIsEditorFocused } from "../../hooks/useIsEditorFocused";

interface Props {
	src: string;
	altText: string;
	width: "inherit" | number;
	height: "inherit" | number;
	nodeKey: string;
}

const DIRECTIONS = ["ne", "se", "sw", "nw"] as const;
type Direction = (typeof DIRECTIONS)[number];

const HANDLE_OFFSETS: Record<
	Direction,
	{
		top?: number;
		bottom?: number;
		left?: number;
		right?: number;
		cursor: string;
	}
> = {
	ne: { top: -4, right: -4, cursor: "nesw-resize" },
	se: { bottom: -4, right: -4, cursor: "nwse-resize" },
	sw: { bottom: -4, left: -4, cursor: "nesw-resize" },
	nw: { top: -4, left: -4, cursor: "nwse-resize" },
};

const MIN_SIZE = 50;

export default function ImageComponent({
	src,
	altText,
	width,
	height,
	nodeKey,
}: Props) {
	const [editor] = useLexicalComposerContext();
	const [isSelected, setSelected, clearSelection] =
		useLexicalNodeSelection(nodeKey);
	const [isResizing, setIsResizing] = useState(false);
	const isEditable = useLexicalEditable();
	const isEditorFocused = useIsEditorFocused();
	const imageRef = useRef<HTMLImageElement | null>(null);

	const onClick = useCallback(
		(event: MouseEvent) => {
			if (isResizing) return true;
			if (event.target === imageRef.current) {
				if (event.shiftKey) {
					setSelected(!isSelected);
				} else {
					clearSelection();
					setSelected(true);
				}
				return true;
			}
			return false;
		},
		[isResizing, isSelected, setSelected, clearSelection],
	);

	useEffect(
		() =>
			mergeRegister(
				editor.registerCommand(
					CLICK_COMMAND,
					onClick,
					COMMAND_PRIORITY_LOW,
				),
				editor.registerCommand(
					DRAGSTART_COMMAND,
					event => {
						if (event.target === imageRef.current) {
							event.preventDefault();
							return true;
						}
						return false;
					},
					COMMAND_PRIORITY_LOW,
				),
			),
		[editor, onClick],
	);

	const onResizeStart = () => setIsResizing(true);

	const onResizeEnd = (
		nextWidth: "inherit" | number,
		nextHeight: "inherit" | number,
	) => {
		setTimeout(() => setIsResizing(false), 200);
		editor.update(() => {
			const node = $getNodeByKey(nodeKey);
			if ($isImageNode(node)) {
				node.setWidthAndHeight(nextWidth, nextHeight);
			}
		});
	};

	const isFocused = (isSelected || isResizing) && isEditable;
	const openLightbox = () => openImageLightbox(src, altText);

	return (
		// Node selection survives blur, so also gate on focus to keep it from floating over modals.
		<Popover
			opened={isSelected && isEditable && isEditorFocused && !isResizing}
			position="bottom"
			offset={8}
			trapFocus={false}
			returnFocus={false}
			transitionProps={{ transition: "pop", duration: 120 }}>
			<Popover.Target>
				<Box
					component="span"
					pos="relative"
					display="inline-block"
					// Subtracting the image resizer from max width to not have x-scroll.
					maw="calc(100% - 8px)"
					style={{ cursor: "default" }}>
					<Image
						ref={imageRef}
						src={src}
						alt={altText}
						draggable={isSelected}
						w={width}
						h={height}
						m={0}
						fit="fill"
						radius={0}
						onDoubleClick={openLightbox}
						style={{
							outline: isFocused
								? "2px solid var(--mantine-primary-color-filled)"
								: undefined,
						}}
					/>
					{isEditable && isFocused && (
						<ImageResizer
							imageRef={imageRef}
							onResizeStart={onResizeStart}
							onResizeEnd={onResizeEnd}
						/>
					)}
				</Box>
			</Popover.Target>
			<Popover.Dropdown p={0} bd={0} bg="transparent">
				<FloatingMenuBar
					items={[
						{
							name: "view",
							title: "View image",
							label: "View",
							showLabel: true,
							Icon: ArrowsOutIcon,
							onClick: openLightbox,
						},
					]}
				/>
			</Popover.Dropdown>
		</Popover>
	);
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function ImageResizer({
	imageRef,
	onResizeStart,
	onResizeEnd,
}: {
	imageRef: React.RefObject<HTMLImageElement | null>;
	onResizeStart: () => void;
	onResizeEnd: (
		width: "inherit" | number,
		height: "inherit" | number,
	) => void;
}) {
	const [editor] = useLexicalComposerContext();
	const positioningRef = useRef({
		direction: "" as Direction,
		startX: 0,
		startY: 0,
		startWidth: 0,
		startHeight: 0,
		ratio: 1,
		currentWidth: 0,
		currentHeight: 0,
		// Measured fresh at drag-start: how wide the editor currently
		// renders, since there's no longer a fixed per-image cap.
		maxWidth: Infinity,
	});

	function handlePointerMove(event: PointerEvent) {
		const image = imageRef.current;
		const positioning = positioningRef.current;
		if (!image) return;

		const zoom = calculateZoomLevel(image);
		const isSouth = positioning.direction.includes("s");

		let diff = Math.floor(positioning.startY - event.clientY / zoom);
		diff = isSouth ? -diff : diff;
		let height = clamp(positioning.startHeight + diff, MIN_SIZE, Infinity);
		let width = height * positioning.ratio;

		// Re-derive height from the clamped width so the two stay
		// proportional instead of width getting capped independently.
		if (width > positioning.maxWidth) {
			width = positioning.maxWidth;
			height = width / positioning.ratio;
		} else if (width < MIN_SIZE) {
			width = MIN_SIZE;
			height = width / positioning.ratio;
		}

		positioning.currentWidth = width;
		positioning.currentHeight = height;
		image.style.width = `${width}px`;
		image.style.height = `${height}px`;
	}

	function handlePointerUp() {
		const positioning = positioningRef.current;
		document.removeEventListener("pointermove", handlePointerMove);
		document.removeEventListener("pointerup", handlePointerUp);
		document.body.style.removeProperty("cursor");
		onResizeEnd(positioning.currentWidth, positioning.currentHeight);
	}

	const handlePointerDown = (
		event: React.PointerEvent<HTMLSpanElement>,
		direction: Direction,
	) => {
		const image = imageRef.current;
		if (!image) return;
		event.preventDefault();

		const { width, height } = image.getBoundingClientRect();
		const zoom = calculateZoomLevel(image);
		const positioning = positioningRef.current;
		positioning.direction = direction;
		positioning.startX = event.clientX / zoom;
		positioning.startY = event.clientY / zoom;
		positioning.startWidth = width;
		positioning.startHeight = height;
		positioning.currentWidth = width;
		positioning.currentHeight = height;
		positioning.ratio = width / height;
		positioning.maxWidth =
			editor.getRootElement()?.getBoundingClientRect().width ?? Infinity;

		document.body.style.setProperty(
			"cursor",
			getComputedStyle(event.currentTarget).cursor,
		);
		onResizeStart();

		document.addEventListener("pointermove", handlePointerMove);
		document.addEventListener("pointerup", handlePointerUp);
	};

	return (
		<>
			{DIRECTIONS.map(direction => {
				const { top, bottom, left, right, cursor } =
					HANDLE_OFFSETS[direction];
				return (
					<Box
						key={direction}
						component="span"
						pos="absolute"
						w={8}
						h={8}
						bg="var(--mantine-primary-color-filled)"
						bd="1px solid var(--editor-surface-bg)"
						bdrs={2}
						top={top}
						bottom={bottom}
						left={left}
						right={right}
						style={{ cursor }}
						onPointerDown={event =>
							handlePointerDown(event, direction)
						}
					/>
				);
			})}
		</>
	);
}
