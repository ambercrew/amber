import dayjs from "dayjs";

const DATE_TIME_RE =
	/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

function parsePickerValue(value: string): dayjs.Dayjs {
	const match = DATE_TIME_RE.exec(value);
	if (!match) return dayjs(value);
	const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
	return dayjs(
		new Date(
			Number(year),
			Number(month) - 1,
			Number(day),
			Number(hour),
			Number(minute),
			Number(second),
		),
	);
}

/** `DateTimePicker` stores values as `YYYY-MM-DD HH:mm:ss` in local time. */
export function toDateInputValue(iso: string | null): string | null {
	if (!iso) return null;
	const parsed = dayjs(iso);
	return parsed.isValid() ? parsed.format("YYYY-MM-DD HH:mm:ss") : null;
}

/** Local datetime from the picker, as a UTC ISO string. */
export function fromDateInputValue(value: string): string {
	return parsePickerValue(value).toISOString();
}
