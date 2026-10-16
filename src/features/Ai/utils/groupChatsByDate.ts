import dayjs from "dayjs";
import ChatResponseDto from "../../../api/aiIntegration/dto/chatResponseDto";

export interface ChatGroup {
	label: string;
	chats: ChatResponseDto[];
}

function groupLabel(date: dayjs.Dayjs, today: dayjs.Dayjs) {
	const daysAgo = today.diff(date.startOf("day"), "day");
	if (daysAgo <= 0) return "Today";
	if (daysAgo === 1) return "Yesterday";
	if (daysAgo < 7) return "Previous 7 days";
	if (daysAgo < 30) return "Previous 30 days";
	return date.format("MMMM YYYY");
}

/** Groups chats, already sorted newest first, by how long ago their last message was. */
export function groupChatsByDate(
	chats: ChatResponseDto[],
	now: Date = new Date(),
): ChatGroup[] {
	const today = dayjs(now).startOf("day");
	const groups: ChatGroup[] = [];
	for (const chat of chats) {
		const label = groupLabel(dayjs(chat.lastActivityDate), today);
		const last = groups[groups.length - 1];
		if (last?.label === label) last.chats.push(chat);
		else groups.push({ label, chats: [chat] });
	}
	return groups;
}
