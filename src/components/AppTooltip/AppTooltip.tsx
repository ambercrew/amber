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
 * The app's Tooltip: Mantine's `Tooltip` with two additions every tooltip in
 * Amber wants — it also opens on tap (Mantine's default `events` are
 * hover-only, which leaves touch users with no way to read it), and it renders
 * a keyboard shortcut next to the label on pointer devices only.
 */
function AppTooltip({
	label,
	shortcut,
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
			events={{ hover: true, focus: false, touch: true, ...events }}
			{...rest}>
			{children}
		</Tooltip>
	);
}

export default AppTooltip;
