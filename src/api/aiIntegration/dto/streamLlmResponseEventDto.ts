import ChatDto from "./chatDto";
import { ToolCallContentDto, ToolResultContentDto } from "./messageDto";

type StreamLlmResponseEventDto =
	| { event: "createdChat"; data: ChatDto }
	| { event: "inProgress"; data: { chatId: string; text: string } }
	| {
			event: "toolCall";
			data: {
				chatId: string;
				toolCall: ToolCallContentDto;
				messageId: string;
				approvalMarkdown?: string;
			};
	  }
	| {
			event: "toolResult";
			data: { chatId: string; toolResult: ToolResultContentDto };
	  }
	| { event: "error"; data: string };

export default StreamLlmResponseEventDto;
