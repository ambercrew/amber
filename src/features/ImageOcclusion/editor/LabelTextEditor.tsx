import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Textarea } from "@mantine/core";
import { TextShape } from "../../../api/imageOcclusion/dto/occlusionShape";
import {
	LABEL_FONT_FAMILY,
	LABEL_LINE_HEIGHT,
} from "../utils/occlusionLabelFont";

interface LabelTextEditorProps {
	shape: TextShape;
	iw: number;
	ih: number;
	scale: number;
	accent: string;
	onCommit: (text: string) => void;
	onClose: () => void;
}

/** A textarea laid exactly over a label: Konva has no text editing, and this is its documented approach. */
export default function LabelTextEditor({
	shape,
	iw,
	ih,
	scale,
	accent,
	onCommit,
	onClose,
}: LabelTextEditorProps) {
	const [text, setText] = useState(shape.text);
	const committed = useRef(shape.text);
	const lines = text.split("\n");

	// Clearing the label keeps its old text rather than leaving an invisible shape.
	const finalText = () => (text.trim() ? text : shape.text);
	const commitText = () => {
		const next = finalText();
		if (next === committed.current) return;
		committed.current = next;
		onCommit(next);
	};
	// A canvas click can replace this editor before any blur fires, so commit then too.
	const commitOnUnmount = useEffectEvent(commitText);
	useEffect(() => () => commitOnUnmount(), []);

	return (
		<Textarea
			unstyled
			autoFocus
			aria-label="Label text"
			rows={lines.length}
			value={text}
			onChange={event => setText(event.currentTarget.value)}
			onFocus={event => event.currentTarget.select()}
			onBlur={() => {
				commitText();
				onClose();
			}}
			onKeyDown={event => {
				if (event.key === "Escape") {
					// Kept from the modal, which would otherwise close the whole editor.
					event.preventDefault();
					event.stopPropagation();
					committed.current = finalText();
					onClose();
				} else if (event.key === "Enter" && !event.shiftKey) {
					event.preventDefault();
					event.currentTarget.blur();
				}
			}}
			style={{
				position: "absolute",
				left: shape.x * iw * scale,
				top: shape.y * ih * scale,
				transform: `rotate(${shape.rotation}deg)`,
				transformOrigin: "top left",
			}}
			styles={{
				input: {
					display: "block",
					// Matches the Konva text it covers.
					fontFamily: LABEL_FONT_FAMILY,
					fontWeight: "bold",
					fontSize: shape.fontSize * ih * scale,
					lineHeight: LABEL_LINE_HEIGHT,
					color: shape.color,
					width: `${Math.max(1, ...lines.map(line => line.length)) + 1}ch`,
					padding: 0,
					margin: 0,
					border: "none",
					outline: `1px dashed ${accent}`,
					background: "transparent",
					resize: "none",
					overflow: "hidden",
					whiteSpace: "pre",
				},
			}}
		/>
	);
}
