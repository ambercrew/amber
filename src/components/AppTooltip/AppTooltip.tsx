import { ReactNode } from "react";
import { Tooltip, TooltipProps } from "@mantine/core";
import { useShortcutDisplay } from "../../commands/useShortcutDisplay";

export interface AppTooltipProps extends Omit<
	TooltipProps,
	"label" | "events"
> {
	/** Tooltip content. Optional so a tooltip may show only its `shortcut`. */
	label?: ReactNode;

	/** Overrides for the events that open the tooltip; merged over the defaults. */
	events?: Partial<NonNullable<TooltipProps["events"]>>;

	/**
	 * Open the tooltip on tap. Off by default so tapping a labeled control
	 * still performs its action; enable on targets whose meaning is otherwise
	 * unreachable on touch (info icons, study session buttons).
	 */
	touch?: boolean;

	/**
	 * Raw shortcut in `useHotkeys` notation (e.g. `"mod+K"`), appended to the
	 * label as `useShortcutDisplay` renders it — so it's left out on touch
	 * input, where there's no keyboard to press it with.
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
 * The app's Tooltip: Mantine's `Tooltip` plus a `shortcut` rendered next to
 * the label on pointer devices only. Pass `touch` to also open on tap.
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
			{...rest}>
			{children}
		</Tooltip>
	);
}

export default AppTooltip;
