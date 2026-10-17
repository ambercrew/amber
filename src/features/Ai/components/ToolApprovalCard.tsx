import { ReactNode } from "react";
import { Button, Card, Group, Stack, Text } from "@mantine/core";
import {
	CheckIcon,
	ShieldCheckIcon,
	ShieldIcon,
	ShieldSlashIcon,
	XIcon,
} from "@phosphor-icons/react";
import {
	ApprovalStatus,
	ToolCallContentDto,
} from "../../../api/aiIntegration/dto/messageDto";
import { resolveToolApproval } from "../../../api/aiIntegration/api/aiApi";
import useApi from "../../../hooks/useApi";
import { ResolvedApproval } from "../utils/buildDisplayMessages";
import AiMarkdown from "./AiMarkdown";

export type OnToolApprovalResolved = (
	messageId: string,
	resolved: ResolvedApproval,
) => void;

interface ToolApprovalCardProps {
	messageId: string;
	toolCall: ToolCallContentDto;
	status: ApprovalStatus;
	/** What the user is asked to approve, written by the tool; may hold `<element-ref>` tags. */
	markdown: string;
	/** Added by the tool once an approved call ran, e.g. linking what it created. */
	resultMarkdown?: string;
	onResolved?: OnToolApprovalResolved;
}

const STATUS_ICONS: Record<ApprovalStatus, ReactNode> = {
	pending: <ShieldIcon size={18} />,
	approved: (
		<ShieldCheckIcon
			size={18}
			color="var(--mantine-primary-color-filled)"
		/>
	),
	rejected: <ShieldSlashIcon size={18} color="var(--mantine-color-dimmed)" />,
};

interface DecisionButtonProps {
	status: ApprovalStatus;
	decision: Exclude<ApprovalStatus, "pending">;
	disabled: boolean;
	onClick: () => void;
}

const DECISIONS = {
	approved: {
		label: "Approve",
		chosenLabel: "Approved",
		icon: <CheckIcon size={14} />,
		pendingVariant: "filled",
		color: undefined,
		ring: "var(--mantine-primary-color-light)",
	},
	rejected: {
		label: "Reject",
		chosenLabel: "Rejected",
		icon: <XIcon size={14} />,
		pendingVariant: "default",
		color: "dark",
		ring: "var(--mantine-color-dark-light)",
	},
} as const;

/** While pending, a choice; once resolved, the chosen one stays filled and the other recedes. */
function DecisionButton({
	status,
	decision,
	disabled,
	onClick,
}: DecisionButtonProps) {
	const { label, chosenLabel, icon, pendingVariant, color, ring } =
		DECISIONS[decision];

	if (status === "pending") {
		return (
			<Button
				variant={pendingVariant}
				size="xs"
				leftSection={icon}
				disabled={disabled}
				onClick={onClick}>
				{label}
			</Button>
		);
	}

	const chosen = status === decision;
	// A `div`, since a resolved decision can't be clicked again.
	return (
		<Button
			component="div"
			variant={chosen ? "filled" : "subtle"}
			color={chosen ? color : "gray"}
			c={chosen ? undefined : "dimmed"}
			size="xs"
			leftSection={icon}
			style={{
				pointerEvents: "none",
				boxShadow: chosen ? `0 0 0 2px ${ring}` : undefined,
			}}>
			{chosen ? chosenLabel : label}
		</Button>
	);
}

function ToolApprovalCard({
	messageId,
	toolCall,
	status,
	markdown,
	resultMarkdown,
	onResolved,
}: ToolApprovalCardProps) {
	const { callApi, isSendingRequest, errorMessage } = useApi();
	const toolName = toolCall.name.replace(/_/g, " ");

	const resolve = (approved: boolean) =>
		callApi(async () => {
			const message = await resolveToolApproval(messageId, approved);
			const resolved =
				message.content.type === "toolCall"
					? message.content.value.approval?.status
					: undefined;
			if (resolved) {
				onResolved?.(messageId, {
					status: resolved,
					resultMarkdown: message.approvalResultMarkdown,
				});
			}
		});

	return (
		<Card withBorder radius="md" padding="sm">
			<Card.Section withBorder inheritPadding py="sm">
				<Group gap={4} wrap="nowrap">
					{STATUS_ICONS[status]}
					<Text size="md" fw={500} lh={1}>
						{status === "pending"
							? `Allow ${toolName}?`
							: `Asked to ${toolName}`}
					</Text>
				</Group>
			</Card.Section>

			<Card.Section withBorder inheritPadding py="xs">
				<AiMarkdown markdown={markdown} />
			</Card.Section>

			{resultMarkdown && (
				<Card.Section withBorder inheritPadding py="xs">
					<AiMarkdown markdown={resultMarkdown} />
				</Card.Section>
			)}

			<Card.Section withBorder inheritPadding py="xs">
				<Stack gap="xs">
					{errorMessage && (
						<Text size="xs" c="red">
							{errorMessage}
						</Text>
					)}
					<Group justify="flex-end" gap="xs">
						<DecisionButton
							status={status}
							decision="rejected"
							disabled={isSendingRequest}
							onClick={() => void resolve(false)}
						/>
						<DecisionButton
							status={status}
							decision="approved"
							disabled={isSendingRequest}
							onClick={() => void resolve(true)}
						/>
					</Group>
				</Stack>
			</Card.Section>
		</Card>
	);
}

export default ToolApprovalCard;
