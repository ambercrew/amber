import { addPendingFiles } from "../../../features/Import/pendingFiles";

function file(name: string, content = "content", lastModified = 1): File {
	return new File([content], name, { lastModified });
}

describe("addPendingFiles", () => {
	it("Should keep the staged files and append the new ones when files are added", () => {
		// Arrange

		const first = file("first.pdf");
		const second = file("second.pdf");

		// Act

		const actual = addPendingFiles([first], [second]);

		// Assert

		expect(actual).toEqual([first, second]);
	});

	it("Should skip a file when the same file is already staged", () => {
		// Arrange

		const staged = file("first.pdf");
		const duplicate = file("first.pdf");

		// Act

		const actual = addPendingFiles([staged], [duplicate]);

		// Assert

		expect(actual).toEqual([staged]);
		expect(actual?.[0]).toBe(staged);
	});

	it("Should skip a file when it appears twice in the added files", () => {
		// Arrange

		const added = [file("first.pdf"), file("first.pdf")];

		// Act

		const actual = addPendingFiles(null, added);

		// Assert

		expect(actual).toHaveLength(1);
	});

	it("Should keep both files when they share a name but differ in content", () => {
		// Arrange

		const original = file("notes.md", "short", 1);
		const edited = file("notes.md", "much longer content", 2);

		// Act

		const actual = addPendingFiles([original], [edited]);

		// Assert

		expect(actual).toEqual([original, edited]);
	});

	it("Should return null when nothing is staged or added", () => {
		// Act

		const actual = addPendingFiles(null, []);

		// Assert

		expect(actual).toBeNull();
	});
});
