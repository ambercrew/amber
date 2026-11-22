import { ReactNode } from "react";
import { Tooltip, TooltipProps } from "@mantine/core";
import { useShortcutDisplay } from "../../commands/useShortcutDisplay";
import { useIsCoarsePointer } from "../../hooks/useIsCoarsePointer";

// About what browsers and desktop apps wait before a hover tooltip, so passing over a control doesn't flash one.
const HOVER_OPEN_DELAY_MS = 500;

export interface AppTooltipProps extends Omit<
	TooltipProps,
	"label" | "events"
> {
	/** Tooltip content. Optional so a tooltip may show only its `shortcut`. */
	label?: ReactNode;

	/** Overrides for the events that open the tooltip; merged over the defaults. */
	events?: Partial<NonNullable<TooltipProps["events"]>>;

	/**
	 * Opens on tap too. Off by default so tapping a labeled control still acts; use it where the meaning
	 * is otherwise unreachable on touch (info icons, study session buttons).
	 */
	touch?: boolean;

	/**
	 * A raw `useHotkeys` shortcut (e.g. `"mod+K"`), appended to the label through `useShortcutDisplay`,
	 * so it's left out on touch.
	 */
	shortcut?: string;
}

function labelWithShortcut(label: ReactNode, shortcut: string): ReactNode {
	const formatted = `(${shortcut})`;
	if (!label) return formatted;

	return (
		<>
			{label} {formatted}
		</>
	);
}

/**
 * Mantine's `Tooltip` plus a `shortcut` shown on pointer devices only; `touch` also opens it on tap.
 * Opens after a short hover delay, but at once on a tap, which is deliberate.
 */
function AppTooltip({
	label,
	shortcut,
	touch = false,
	events,
	children,
	...rest
}: AppTooltipProps) {
	const displayedShortcut = useShortcutDisplay()(shortcut);
	const coarsePointer = useIsCoarsePointer();
	const fullLabel = displayedShortcut
		? labelWithShortcut(label, displayedShortcut)
		: label;

	// A tooltip whose whole content is a shortcut has nothing left to say on
	// touch input, so it shouldn't open on tap at all.
	if (!fullLabel) return <>{children}</>;

	return (
		<Tooltip
			label={fullLabel}
			events={{ hover: true, focus: false, touch, ...events }}
			openDelay={coarsePointer ? 0 : HOVER_OPEN_DELAY_MS}
			{...rest}>
			{children}
		</Tooltip>
	);
}

export default AppTooltip;
