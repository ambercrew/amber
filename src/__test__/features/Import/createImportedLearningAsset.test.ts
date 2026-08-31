import { createImportedLearningAsset } from "../../../features/Import/createImportedLearningAsset";
import { htmlToLexicalJson } from "../../../components/Editor/lexicalJsonConversion";
import { createLearningAssetAction } from "../../../stores/elements/elementsActions";
import { ImportContext } from "../../../features/Import/importContext";

vi.mock(import("../../../stores/elements/elementsActions"));
vi.mock(import("../../../components/Editor/lexicalJsonConversion"));

describe("createImportedLearningAsset", () => {
	it("Should dispatch createLearningAssetAction with a generated id, the name, parent, and content", async () => {
		// Arrange

		const thunk = Symbol("thunk");
		vi.mocked(createLearningAssetAction).mockReturnValue(
			thunk as unknown as ReturnType<typeof createLearningAssetAction>,
		);
		vi.mocked(htmlToLexicalJson).mockReturnValue('{"root":"json"}');
		const dispatch = vi.fn().mockResolvedValue(undefined);
		const navigate = vi.fn().mockResolvedValue(undefined);
		const parent = {
			type: "folder",
			id: "parent-id",
		} as ImportContext["parent"];
		const ctx: ImportContext = {
			dispatch: dispatch as unknown as ImportContext["dispatch"],
			navigate: navigate as unknown as ImportContext["navigate"],
			parent,
			priorityRank: 4,
		};

		// Act

		await createImportedLearningAsset(ctx, "My Title", "<p>content</p>");

		// Assert

		const dto = vi.mocked(createLearningAssetAction).mock.calls[0][0];
		expect(typeof dto.id).toBe("string");
		expect(dto.meta).toEqual({
			name: "My Title",
			parent,
			origin: { type: "custom" },
		});
		expect(htmlToLexicalJson).toHaveBeenCalledWith("<p>content</p>");
		expect(dto.splits).toEqual(['{"root":"json"}']);
		expect(dto.initialPriorityRank).toBe(4);
		expect(dispatch).toHaveBeenCalledWith(thunk);
	});

	it("Should navigate to the newly created learning asset's path", async () => {
		// Arrange

		vi.mocked(createLearningAssetAction).mockReturnValue(
			Symbol("thunk") as unknown as ReturnType<
				typeof createLearningAssetAction
			>,
		);
		const dispatch = vi.fn().mockResolvedValue(undefined);
		const navigate = vi.fn().mockResolvedValue(undefined);
		const ctx: ImportContext = {
			dispatch: dispatch as unknown as ImportContext["dispatch"],
			navigate: navigate as unknown as ImportContext["navigate"],
			parent: null,
			priorityRank: 5,
		};

		// Act

		await createImportedLearningAsset(ctx, "Title", "<p>content</p>");

		// Assert

		const dtoArg = vi.mocked(createLearningAssetAction).mock.calls[0][0];
		expect(navigate).toHaveBeenCalledWith(`/learningAsset/${dtoArg.id}`);
	});
});
