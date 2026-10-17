export type MessageContentDto =
	| { type: "human"; value: string }
	| { type: "document"; value: DocumentContentDto }
	| { type: "assistant"; value: string }
	| { type: "toolCall"; value: ToolCallContentDto }
	| { type: "toolResult"; value: ToolResultContentDto };

export interface DocumentContentDto {
	fileName: string;
}

export interface ToolCallContentDto {
	id: string;
	name: string;
	arguments: unknown;
	approval?: ToolApprovalDto;
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ToolApprovalDto {
	/** What the tool needs besides its arguments to run later; opaque to the frontend. */
	context: unknown;
	status: ApprovalStatus;
	output?: string;
}

export interface ToolResultContentDto {
	id: string;
	text: string;
}

export default interface MessageDto {
	id: string;
	createdDate: string;
	chatId: string;
	content: MessageContentDto;
	contextSnippets: string[];
	approvalMarkdown?: string;
	/** Added by the tool once an approved call ran, e.g. linking what it created. */
	approvalResultMarkdown?: string;
}
