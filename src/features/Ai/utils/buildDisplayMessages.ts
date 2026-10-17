import MessageDto, {
	ApprovalStatus,
	MessageContentDto,
} from "../../../api/aiIntegration/dto/messageDto";

export interface DisplayMessage {
	id: string;
	content: MessageContentDto;
	/** Name of the tool a `toolCall`/`toolResult` message belongs to, resolved by matching ids. */
	toolName?: string;
	/** Whether this is the assistant reply currently being streamed in. */
	isStreaming?: boolean;
	/** Text snippets the user selected as additional context, for `human` messages. */
	contextSnippets?: string[];
	/** Set on calls awaiting approval; `messageId` is the persisted message to resolve. */
	approval?: {
		messageId: string;
		status: ApprovalStatus;
		markdown: string;
		resultMarkdown?: string;
	};
}

/**
 * Combines the persisted messages of a chat with the ephemeral,
 * not-yet-persisted human prompt and streaming assistant text so the message
 * list can render a consistent view while a response is streaming in.
 *
 * The backend only persists messages once `DefaultAiStreamer::stream`
 * finishes, so until then the human prompt and the assistant's growing reply
 * exist only in memory here.
 */
/** An approval the user resolved since the messages were loaded. */
export interface ResolvedApproval {
	status: ApprovalStatus;
	resultMarkdown?: string;
}

export interface StreamingToolMessage {
	id: string;
	content: MessageContentDto;
	/** The persisted message id of a streaming `toolCall`. */
	messageId?: string;
	/** What a streaming `toolCall` awaiting approval asks the user. */
	approvalMarkdown?: string;
}

export function buildDisplayMessages(
	persisted: MessageDto[],
	pendingHumanText: string | null,
	streamingAssistantText: string | null,
	pendingDocumentFileName: string | null = null,
	pendingContextSnippets: string[] | null = null,
	streamingToolMessages: StreamingToolMessage[] = [],
	/** Approvals resolved since the messages were loaded, keyed by message id. */
	resolvedApprovals: Record<string, ResolvedApproval> = {},
): DisplayMessage[] {
	// `toolResult` messages don't carry the tool's name, only the id of the
	// `toolCall` they answer, so it has to be looked up from that call.
	const toolNamesById = new Map<string, string>();
	const approvalCallIds = new Set<string>();
	for (const message of [...persisted, ...streamingToolMessages]) {
		if (message.content.type === "toolCall") {
			toolNamesById.set(
				message.content.value.id,
				message.content.value.name,
			);
			if (message.content.value.approval) {
				approvalCallIds.add(message.content.value.id);
			}
		}
	}

	const approvalFor = (
		content: MessageContentDto,
		messageId: string | undefined,
		markdown: string | undefined,
		resultMarkdown?: string,
	): DisplayMessage["approval"] => {
		if (content.type !== "toolCall" || messageId === undefined) {
			return undefined;
		}
		const approval = content.value.approval;
		if (!approval) return undefined;
		const resolved = resolvedApprovals[messageId] as
			ResolvedApproval | undefined;
		const result = resolved ? resolved.resultMarkdown : resultMarkdown;
		return {
			messageId,
			status: resolved?.status ?? approval.status,
			markdown: markdown ?? "",
			...(result !== undefined && { resultMarkdown: result }),
		};
	};

	// The approval card on the call already says what became of it.
	const isApprovalResult = (content: MessageContentDto) =>
		content.type === "toolResult" && approvalCallIds.has(content.value.id);

	const items: DisplayMessage[] = persisted
		.filter(message => !isApprovalResult(message.content))
		.map(message => {
			const toolName =
				message.content.type === "toolCall"
					? message.content.value.name
					: message.content.type === "toolResult"
						? toolNamesById.get(message.content.value.id)
						: undefined;

			const approval = approvalFor(
				message.content,
				message.id,
				message.approvalMarkdown,
				message.approvalResultMarkdown,
			);

			return {
				id: message.id,
				content: message.content,
				...(toolName !== undefined && { toolName }),
				...(approval && { approval }),
				...(message.contextSnippets.length > 0 && {
					contextSnippets: message.contextSnippets,
				}),
			};
		});

	if (pendingDocumentFileName !== null) {
		items.push({
			id: "pending-document",
			content: {
				type: "document",
				value: { fileName: pendingDocumentFileName },
			},
			isStreaming: true,
		});
	}

	if (pendingHumanText !== null) {
		items.push({
			id: "pending-human",
			content: { type: "human", value: pendingHumanText },
			...(pendingContextSnippets &&
				pendingContextSnippets.length > 0 && {
					contextSnippets: pendingContextSnippets,
				}),
		});
	}

	for (const message of streamingToolMessages) {
		if (isApprovalResult(message.content)) continue;

		const toolName =
			message.content.type === "toolCall"
				? message.content.value.name
				: message.content.type === "toolResult"
					? toolNamesById.get(message.content.value.id)
					: undefined;

		const approval = approvalFor(
			message.content,
			message.messageId,
			message.approvalMarkdown,
		);

		items.push({
			id: message.id,
			content: message.content,
			...(toolName !== undefined && { toolName }),
			...(approval && { approval }),
		});
	}

	if (streamingAssistantText !== null) {
		items.push({
			id: "pending-assistant",
			content: { type: "assistant", value: streamingAssistantText },
			isStreaming: true,
		});
	}

	return items;
}
