import { useComputedColorScheme } from "@mantine/core";
import { Scrollbar } from "@embedpdf/react/stage";
import { useChromeInsets } from "../../../App/context/chromeInsetsContext";

interface PdfScrollbarProps {
	/** Whether the pointer is over the PDF, which shows the thumb. */
	hovered: boolean;
}

/** The PDF's scrollbar, styled like the old native one: always grabbable, its thumb shown while the PDF is hovered. For the Stage's overlay. */
export default function PdfScrollbar({ hovered }: PdfScrollbarProps) {
	const insets = useChromeInsets();
	const dark = useComputedColorScheme() === "dark";
	const thumbColor = dark ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.4)";

	return (
		<Scrollbar
			axis="y"
			// Never hidden: a hidden bar lets the pointer through, so grabbing it would select text instead.
			autoHide={false}
			// Clear of the header and footer, like the main scrollbar.
			style={{
				top: insets.top,
				bottom: insets.bottom,
				transition: insets.transition,
				// Overrides the hand it would inherit from the Stage's tool cursor.
				cursor: "default",
			}}
			thumbStyle={{
				left: 3,
				right: 3,
				borderRadius: 12,
				background: hovered ? thumbColor : "transparent",
			}}
		/>
	);
}
