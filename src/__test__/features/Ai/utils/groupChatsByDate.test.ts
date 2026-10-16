import { describe, expect, it } from "vitest";
import ChatResponseDto from "../../../../api/aiIntegration/dto/chatResponseDto";
import { groupChatsByDate } from "../../../../features/Ai/utils/groupChatsByDate";

const NOW = new Date(2026, 9, 16, 10, 0, 0);

function chat(id: string, lastActivity: Date): ChatResponseDto {
	return {
		id,
		title: id,
		createdDate: lastActivity.toISOString(),
		lastActivityDate: lastActivity.toISOString(),
	};
}

describe("groupChatsByDate", () => {
	it("Should label groups by recency when chats span several periods", () => {
		// Arrange

		const chats = [
			chat("today", new Date(2026, 9, 16, 0, 5)),
			chat("yesterday", new Date(2026, 9, 15, 23, 55)),
			chat("week", new Date(2026, 9, 10)),
			chat("month", new Date(2026, 8, 20)),
			chat("older", new Date(2026, 6, 4)),
		];

		// Act

		const actual = groupChatsByDate(chats, NOW);

		// Assert

		expect(actual.map(group => group.label)).toEqual([
			"Today",
			"Yesterday",
			"Previous 7 days",
			"Previous 30 days",
			"July 2026",
		]);
	});

	it("Should put chats in one group when they share a period", () => {
		// Arrange

		const chats = [
			chat("first", new Date(2026, 9, 16, 9)),
			chat("second", new Date(2026, 9, 16, 8)),
		];

		// Act

		const actual = groupChatsByDate(chats, NOW);

		// Assert

		expect(actual).toEqual([{ label: "Today", chats }]);
	});

	it("Should return no groups when there are no chats", () => {
		// Act

		const actual = groupChatsByDate([], NOW);

		// Assert

		expect(actual).toEqual([]);
	});
});
