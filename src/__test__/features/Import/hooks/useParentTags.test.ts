import { renderHook, waitFor } from "@testing-library/react";
import { getElementMeta } from "../../../../api/elements/api/elementsApi";
import { MetaResponseDto } from "../../../../api/elements/dto/anyElementDto";
import { useParentTags } from "../../../../features/Import/hooks/useParentTags";
import { ElementId } from "../../../../types/elements/elementId";

vi.mock(import("../../../../api/elements/api/elementsApi.ts"));

const PARENT: ElementId = { type: "folder", id: "parent-id" };

function metaWithTags(names: string[]): MetaResponseDto {
	return {
		tags: names.map(name => ({ name, createdAt: "", modifiedAt: "" })),
	} as unknown as MetaResponseDto;
}

describe("useParentTags", () => {
	it("Should return the parent's tag names when a parent is given", async () => {
		// Arrange

		vi.mocked(getElementMeta).mockResolvedValue(
			metaWithTags(["history", "rome"]),
		);

		// Act

		const { result } = renderHook(() => useParentTags(PARENT));

		// Assert

		await waitFor(() => {
			expect(result.current.tags).toEqual(["history", "rome"]);
		});
		expect(getElementMeta).toHaveBeenCalledWith(PARENT);
	});

	it("Should return no tags when there is no parent", () => {
		// Arrange & Act

		const { result } = renderHook(() => useParentTags(null));

		// Assert

		expect(result.current.tags).toEqual([]);
		expect(getElementMeta).not.toHaveBeenCalled();
	});

	it("Should return null tags and an error when the lookup fails", async () => {
		// Arrange

		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.mocked(getElementMeta).mockRejectedValue(new Error("gone"));

		// Act

		const { result } = renderHook(() => useParentTags(PARENT));

		// Assert

		await waitFor(() => {
			expect(result.current.errorMessage).not.toBeNull();
		});
		expect(result.current.tags).toBeNull();
	});

	it("Should not return the old tags when the parent is given again", async () => {
		// Arrange

		vi.mocked(getElementMeta).mockResolvedValueOnce(metaWithTags(["old"]));
		const { result, rerender } = renderHook(
			({ parent }) => useParentTags(parent),
			{ initialProps: { parent: PARENT as ElementId | null } },
		);
		await waitFor(() => {
			expect(result.current.tags).toEqual(["old"]);
		});
		vi.mocked(getElementMeta).mockReturnValue(new Promise(() => {}));
		rerender({ parent: null });

		// Act

		rerender({ parent: PARENT });

		// Assert

		expect(result.current.tags).toBeNull();
	});
});
