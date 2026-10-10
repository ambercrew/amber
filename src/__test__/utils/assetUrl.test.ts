import {
	assetIdFromSrc,
	resolveImageSrc,
	toCanonicalImageSrc,
} from "../../utils/assetUrl";

const ID = "a".repeat(64);

describe("assetUrl", () => {
	it.each([
		[`amber-asset:${ID}`],
		[`http://amber-asset.localhost/${ID}`],
		[`amber-asset://localhost/${ID}`],
	])("Should return the asset id when the src is %s", src => {
		// Arrange

		const expected = ID;

		// Act

		const actual = assetIdFromSrc(src);

		// Assert

		expect(actual).toBe(expected);
	});

	it.each([
		["data:image/png;base64,AAAA"],
		["https://example.com/image.png"],
		["amber-asset:not-a-hash"],
	])("Should return null when the src is %s", src => {
		// Arrange

		const expected = null;

		// Act

		const actual = assetIdFromSrc(src);

		// Assert

		expect(actual).toBe(expected);
	});

	it("Should resolve to the protocol URL when the src is a canonical asset src", () => {
		// Arrange

		const src = `amber-asset:${ID}`;

		// Act

		const actual = resolveImageSrc(src);

		// Assert

		expect(actual).toBe(`http://amber-asset.localhost/${ID}`);
	});

	it("Should pass the src through when it isn't an asset", () => {
		// Arrange

		const src = "data:image/png;base64,AAAA";

		// Act

		const actual = resolveImageSrc(src);

		// Assert

		expect(actual).toBe(src);
	});

	it("Should map back to the canonical src when the src is a runtime asset URL", () => {
		// Arrange

		const src = `http://amber-asset.localhost/${ID}`;

		// Act

		const actual = toCanonicalImageSrc(src);

		// Assert

		expect(actual).toBe(`amber-asset:${ID}`);
	});
});
