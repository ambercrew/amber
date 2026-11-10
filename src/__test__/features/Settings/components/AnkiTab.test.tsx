import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { getAnkiSyncStatus } from "../../../../api/ankiSync/api/ankiSyncApi";
import AnkiTab from "../../../../features/Settings/components/AnkiTab";
import { renderWithProviders } from "../../../test-utils/renderWithProviders";

vi.mock("../../../../api/ankiSync/api/ankiSyncApi");

const unreachable = {
	profile: null,
	lastSyncedAt: null,
	error: "Couldn't reach Anki.",
};

describe("AnkiTab", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("Should show why the connection failed when testing it fails", async () => {
		// Arrange

		vi.mocked(getAnkiSyncStatus).mockResolvedValue(unreachable);
		renderWithProviders(<AnkiTab />);
		await screen.findByText("Not connected");

		// Act

		fireEvent.click(screen.getByText("Test connection"));

		// Assert

		expect(
			await screen.findByText("Couldn’t connect to Anki"),
		).toBeInTheDocument();
		expect(screen.getByText("Couldn't reach Anki.")).toBeInTheDocument();
	});

	it("Should show an error when the status can't be read", async () => {
		// Arrange

		vi.mocked(getAnkiSyncStatus).mockResolvedValueOnce(unreachable);
		vi.mocked(getAnkiSyncStatus).mockRejectedValueOnce("Command failed");
		renderWithProviders(<AnkiTab />);
		await screen.findByText("Not connected");

		// Act

		fireEvent.click(screen.getByText("Test connection"));

		// Assert

		expect(await screen.findByText("Command failed")).toBeInTheDocument();
	});

	it("Should confirm the connection when testing it works", async () => {
		// Arrange

		vi.mocked(getAnkiSyncStatus).mockResolvedValue({
			profile: "User 1",
			lastSyncedAt: null,
			error: null,
		});
		renderWithProviders(<AnkiTab />);
		await screen.findByText("Connected");

		// Act

		fireEvent.click(screen.getByText("Test connection"));

		// Assert

		expect(await screen.findByText("Connection works")).toBeInTheDocument();
	});
});
