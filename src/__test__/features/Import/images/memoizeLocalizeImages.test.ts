import { localizeImages } from "../../../../features/Import/images/localize";
import { memoizeLocalizeImages } from "../../../../features/Import/images/memoizeLocalizeImages";

vi.mock(import("../../../../features/Import/images/localize"));

describe("memoizeLocalizeImages", () => {
	it("Should localize each url once when fragments share images", async () => {
		// Arrange

		vi.mocked(localizeImages).mockImplementation(
			async urls =>
				new Map(
					urls.map(url => [url, { ok: true, src: `asset ${url}` }]),
				),
		);
		const localize = memoizeLocalizeImages();

		// Act

		await localize(["https://a.png"], null);
		const actual = await localize(["https://a.png", "https://b.png"], null);

		// Assert

		expect(localizeImages).toHaveBeenCalledTimes(2);
		expect(localizeImages).toHaveBeenLastCalledWith(
			["https://b.png"],
			null,
		);
		expect(actual).toEqual(
			new Map([
				["https://a.png", { ok: true, src: "asset https://a.png" }],
				["https://b.png", { ok: true, src: "asset https://b.png" }],
			]),
		);
	});
});
