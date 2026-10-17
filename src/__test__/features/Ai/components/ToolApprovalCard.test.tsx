import { fireEvent, screen, waitFor } from "@testing-library/react";
import ToolApprovalCard from "../../../../features/Ai/components/ToolApprovalCard";
import { resolveToolApproval } from "../../../../api/aiIntegration/api/aiApi";
import {
	ApprovalStatus,
	ToolCallContentDto,
} from "../../../../api/aiIntegration/dto/messageDto";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

vi.mock(import("../../../../api/aiIntegration/api/aiApi"));

const createCardCall = {
	id: "tc-1",
	name: "create_card",
	arguments: { front: "What is the capital of France?", back: "Paris" },
	approval: { context: null, status: "pending" as const },
};

const createCardMarkdown =
	"**Front**\n\nWhat is the capital of France?\n\n**Back**\n\nParis";

function resolvedMessage(status: ApprovalStatus) {
	return {
		id: "m-1",
		createdDate: "date",
		chatId: "chat-1",
		content: {
			type: "toolCall" as const,
			value: {
				...createCardCall,
				approval: { ...createCardCall.approval, status },
			},
		},
		contextSnippets: [],
		approvalResultMarkdown: "Created **the card**",
	};
}

function renderCard(
	status: ApprovalStatus,
	toolCall: ToolCallContentDto = createCardCall,
	onResolved = vi.fn(),
	resultMarkdown?: string,
) {
	renderWithProviders(
		<ToolApprovalCard
			messageId="m-1"
			toolCall={toolCall}
			status={status}
			markdown={createCardMarkdown}
			resultMarkdown={resultMarkdown}
			onResolved={onResolved}
		/>,
	);
	return onResolved;
}

describe("ToolApprovalCard", () => {
	beforeEach(() => vi.resetAllMocks());

	it("Should show the markdown the tool wrote for the call when pending", () => {
		// Arrange

		// Act

		renderCard("pending");

		// Assert

		expect(screen.getByText("Allow create card?")).toBeInTheDocument();
		expect(
			screen.getByText("What is the capital of France?"),
		).toBeInTheDocument();
		expect(screen.getByText("Paris")).toBeInTheDocument();
	});

	it("Should show the tool's result markdown when the approved call ran", () => {
		// Arrange

		// Act

		renderCard("approved", createCardCall, vi.fn(), "Created **the card**");

		// Assert

		expect(screen.getByText("the card").tagName).toBe("STRONG");
	});

	it("Should resolve the call and report its new status when Approve is clicked", async () => {
		// Arrange

		vi.mocked(resolveToolApproval).mockResolvedValue(
			resolvedMessage("approved"),
		);
		const onResolved = renderCard("pending");

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Approve" }));

		// Assert

		await waitFor(() =>
			expect(onResolved).toHaveBeenCalledWith("m-1", {
				status: "approved",
				resultMarkdown: "Created **the card**",
			}),
		);
		expect(resolveToolApproval).toHaveBeenCalledWith("m-1", true);
	});

	it("Should show the error inline when resolving fails", async () => {
		// Arrange

		vi.mocked(resolveToolApproval).mockRejectedValue("Failed to run");
		const onResolved = renderCard("pending");

		// Act

		fireEvent.click(screen.getByRole("button", { name: "Reject" }));

		// Assert

		expect(await screen.findByText("Failed to run")).toBeInTheDocument();
		expect(onResolved).not.toHaveBeenCalled();
	});

	it.each([
		["approved", "Approved"],
		["rejected", "Rejected"],
	] as const)(
		"Should show a status badge instead of the buttons when %s",
		(status, label) => {
			// Arrange

			// Act

			renderCard(status);

			// Assert

			expect(screen.getByText(label)).toBeInTheDocument();
			expect(screen.getByText("Paris")).toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: "Approve" }),
			).not.toBeInTheDocument();
		},
	);
});
