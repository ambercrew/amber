import { Box, Group, Select, SelectProps, Text } from "@mantine/core";
import { CheckIcon, PlusIcon } from "@phosphor-icons/react";
import ChatDto from "../../../api/aiIntegration/dto/chatDto";

const NEW_CHAT_VALUE = "__new_chat__";
const ICON_SIZE = 14;
const NEW_CHAT_COLOR = "var(--mantine-primary-color-filled)";

// "New chat" is an action rather than a chat, so it gets a plus icon in the primary color.
const renderOption: SelectProps["renderOption"] = ({ option, checked }) => {
	const isNewChat = option.value === NEW_CHAT_VALUE;
	return (
		<Group gap="xs" wrap="nowrap" flex={1} miw={0}>
			<Box w={ICON_SIZE} display="flex" style={{ flexShrink: 0 }}>
				{isNewChat ? (
					<PlusIcon
						size={ICON_SIZE}
						weight="bold"
						color={NEW_CHAT_COLOR}
					/>
				) : (
					checked && <CheckIcon size={ICON_SIZE} />
				)}
			</Box>
			{/* The option and this group are both flex rows, so each needs `miw={0}` to let the title shrink and truncate. */}
			<Text size="sm" truncate flex={1} miw={0}>
				{option.label}
			</Text>
		</Group>
	);
};

interface ChatSelectMenuProps {
	chats: ChatDto[];
	selectedChatId: string | null;
	onSelect: (chatId: string) => void;
	onNewChat: () => void;
}

function ChatSelectMenu({
	chats,
	selectedChatId,
	onSelect,
	onNewChat,
}: ChatSelectMenuProps) {
	const isNewChat = selectedChatId === null;
	return (
		<Select
			data={[
				{ value: NEW_CHAT_VALUE, label: "New chat" },
				// An unlabeled group, so its border is a plain line below "New chat".
				...(chats.length > 0
					? [
							{
								group: "",
								items: chats.map(chat => ({
									value: chat.id,
									label: chat.title,
								})),
							},
						]
					: []),
			]}
			value={selectedChatId ?? NEW_CHAT_VALUE}
			onChange={value => {
				if (!value) return;
				if (value === NEW_CHAT_VALUE) onNewChat();
				else onSelect(value);
			}}
			renderOption={renderOption}
			// The scroll area otherwise widens to the longest title, past the dropdown.
			scrollAreaProps={{ styles: { content: { minWidth: 0 } } }}
			styles={{
				input: {
					textOverflow: "ellipsis",
					// Greyed out like a placeholder, since no chat has been picked yet.
					color: isNewChat
						? "var(--mantine-color-dimmed)"
						: undefined,
				},
				group: {
					borderTop: "1px solid var(--mantine-color-default-border)",
					marginTop: 4,
					paddingTop: 4,
				},
			}}
			allowDeselect={false}
			style={{ flex: 1, minWidth: 0 }}
		/>
	);
}

export default ChatSelectMenu;
