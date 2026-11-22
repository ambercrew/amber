import { Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { Icon, InfoIcon, QuotesIcon } from "@phosphor-icons/react";
import AppModal from "../../../components/AppModal/AppModal";
import { AiDocumentIcon, AI_TOOL_ICONS } from "../../../config/icons";

interface AiCapabilitiesModalProps {
	opened: boolean;
	onClose: () => void;
}

interface Capability {
	icon: Icon;
	title: string;
	detail: string;
}

const READS: Capability[] = [
	{
		icon: InfoIcon,
		title: "The element you have open",
		detail: "Its name and origin, not its content.",
	},
	{
		icon: AI_TOOL_ICONS.search_open_element,
		title: "Searching the open element",
		detail: "Finds text in it, like find in page.",
	},
	{
		icon: QuotesIcon,
		title: "Snippets",
		detail: "Text you attach to a message as context.",
	},
	{
		icon: AiDocumentIcon,
		title: "Uploaded documents",
		detail: "Files you upload to the chat.",
	},
];

const CHANGES: Capability[] = [
	{
		icon: AI_TOOL_ICONS.create_card,
		title: "Creating cards",
		detail: "Question-and-answer cards and cloze deletions.",
	},
	{
		icon: AI_TOOL_ICONS.update_card,
		title: "Rewriting the open card",
		detail: "Rewrites the content of the card you have open.",
	},
	{
		icon: AI_TOOL_ICONS.clear_leech,
		title: "Clearing a leech",
		detail: "Removes the open card's leech tag and resumes it if it was suspended.",
	},
	{
		icon: AI_TOOL_ICONS.finish_extract,
		title: "Finishing the open extract",
		detail: "Marks it as finished, so it stops coming up for review.",
	},
];

function CapabilitySection({
	title,
	description,
	capabilities,
}: {
	title: string;
	description: string;
	capabilities: Capability[];
}) {
	return (
		<Stack gap="sm">
			<Stack gap={2}>
				<Text size="xs" c="dimmed" tt="uppercase" fw={600}>
					{title}
				</Text>
				<Text size="sm" c="dimmed">
					{description}
				</Text>
			</Stack>
			{capabilities.map(({ icon: CapabilityIcon, title, detail }) => (
				<Group key={title} gap="sm" wrap="nowrap" align="flex-start">
					<ThemeIcon variant="light" size="md" radius="md">
						<CapabilityIcon size={16} />
					</ThemeIcon>
					<Stack gap={0}>
						<Text size="sm" fw={500}>
							{title}
						</Text>
						<Text size="xs" c="dimmed">
							{detail}
						</Text>
					</Stack>
				</Group>
			))}
		</Stack>
	);
}

function AiCapabilitiesModal({ opened, onClose }: AiCapabilitiesModalProps) {
	return (
		<AppModal
			opened={opened}
			onClose={onClose}
			title="What the AI can do"
			size="lg">
			<Stack gap="lg">
				<CapabilitySection
					title="What it can read"
					description="Besides your messages, it only sees what's listed here."
					capabilities={READS}
				/>
				<CapabilitySection
					title="What it can change"
					description="Each change waits for your approval in the chat."
					capabilities={CHANGES}
				/>
			</Stack>
		</AppModal>
	);
}

export default AiCapabilitiesModal;
