import { DateTimePickerProps } from "@mantine/dates";

/**
 * The dropdown can be taller than the room around its trigger (e.g. in a centered modal), so the
 * `size` middleware sets `maxHeight` to the space really there and it scrolls instead of clipping.
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

/**
 * For a picker inside a modal: the dropdown lives in a portal, so closing it by
 * keyboard would drop focus outside the modal unless it returns to the input.
 */
export const dueDateTimePickerInModalProps: typeof dueDateTimePickerProps = {
	...dueDateTimePickerProps,
	popoverProps: { ...dueDateTimePickerProps.popoverProps, returnFocus: true },
};
