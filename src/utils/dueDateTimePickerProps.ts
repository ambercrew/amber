import { DateTimePickerProps } from "@mantine/dates";

/**
 * The dropdown (calendar + time row + submit button) can be taller than the
 * space actually available around its trigger — e.g. a due-date field inside
 * a centered modal only has roughly half the window's height to grow into on
 * either side, so a static `vh` cap can still overflow. The `size`
 * middleware measures the real available height at the popover's resolved
 * position and writes it as `maxHeight` on the dropdown, so combined with
 * `overflowY: auto` the dropdown always fits and scrolls internally instead
 * of clipping.
 */
export const dueDateTimePickerProps: Pick<
	DateTimePickerProps,
	"clearable" | "popoverProps" | "submitButtonProps" | "timePickerProps"
> = {
	clearable: false,
	popoverProps: {
		withinPortal: true,
		middlewares: { size: true },
		styles: {
			dropdown: { overflowY: "auto" },
		},
	},
	submitButtonProps: { "aria-label": "Confirm due date" },
	timePickerProps: {
		hoursInputLabel: "Hours",
		minutesInputLabel: "Minutes",
	},
};
