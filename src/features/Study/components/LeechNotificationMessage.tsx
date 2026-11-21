import { Button, Group, Stack, Text } from "@mantine/core";
import { countNoun } from "../../../utils/countNoun";

interface LeechNotificationMessageProps {
	lapses: number;
	suspended: boolean;
	/** `null` when the AI is turned off. */
	onRewrite: (() => void) | null;
	onOpen: () => void;
}

/** Says a card became a leech, and offers to fix it. */
export default function LeechNotificationMessage({
	lapses,
	suspended,
	onRewrite,
	onOpen,
}: LeechNotificationMessageProps) {
	return (
		<Stack gap="xs">
			<Text size="sm">
				{`You've forgotten this card ${countNoun(lapses, "time")}, so it's tagged leech${suspended ? " and suspended" : ""}. Rewriting it usually helps more than reviewing it again.`}
			</Text>
			<Group gap="xs">
				{onRewrite && (
					<Button
						size="compact-sm"
						variant="light"
						onClick={onRewrite}>
						Rewrite with AI
					</Button>
				)}
				<Button size="compact-sm" variant="subtle" onClick={onOpen}>
					Open card
				</Button>
			</Group>
		</Stack>
	);
}
