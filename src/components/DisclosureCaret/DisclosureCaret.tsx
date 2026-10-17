import { CaretRightIcon } from "@phosphor-icons/react";
import { MOTION_EASING } from "../../config/motion";
import { useMotionDuration } from "../../hooks/useMotionDuration";

interface DisclosureCaretProps {
	opened: boolean;
	size?: number;
}

/** A caret that turns to point down while its section is open, in step with Mantine's `Collapse`. */
export default function DisclosureCaret({
	opened,
	size,
}: DisclosureCaretProps) {
	const duration = useMotionDuration();
	return (
		<CaretRightIcon
			size={size}
			style={{
				transform: opened ? "rotate(90deg)" : undefined,
				transition: `transform ${duration}ms ${MOTION_EASING}`,
			}}
		/>
	);
}
