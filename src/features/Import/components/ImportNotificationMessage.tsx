import { Button, Stack, Text } from "@mantine/core";

interface ImportNotificationMessageProps {
	text: string;
	actionLabel: string;
	onAction: () => void;
}

/** What an import running behind the closed modal reports, with a way back to it or to its result. */
export default function ImportNotificationMessage({
	text,
	actionLabel,
	onAction,
}: ImportNotificationMessageProps) {
	return (
		<Stack gap="xs" align="flex-start">
			<Text size="sm">{text}</Text>
			<Button size="compact-sm" variant="light" onClick={onAction}>
				{actionLabel}
			</Button>
		</Stack>
	);
}
