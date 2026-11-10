import { renderHook, waitFor } from "@testing-library/react";
import { isCardSyncedFromAnki } from "../../../../api/ankiSync/api/ankiSyncApi";
import { useIsCardSyncedFromAnki } from "../../../../features/ElementViewer/hooks/useIsCardSyncedFromAnki";

vi.mock(import("../../../../api/ankiSync/api/ankiSyncApi"));

describe("useIsCardSyncedFromAnki", () => {
	it("Should report the card as from Anki when the sync keeps it paired with Anki", async () => {
		// Arrange

		vi.mocked(isCardSyncedFromAnki).mockResolvedValue(true);

		// Act

		const { result } = renderHook(() => useIsCardSyncedFromAnki("card-1"));

		// Assert

		await waitFor(() => expect(result.current).toBe(true));
		expect(isCardSyncedFromAnki).toHaveBeenCalledWith("card-1");
	});

	it("Should not report the card as from Anki when nothing syncs it from Anki", async () => {
		// Arrange

		vi.mocked(isCardSyncedFromAnki).mockResolvedValue(false);

		// Act

		const { result } = renderHook(() => useIsCardSyncedFromAnki("card-1"));

		// Assert

		await waitFor(() => expect(isCardSyncedFromAnki).toHaveBeenCalled());
		expect(result.current).toBe(false);
	});
});
