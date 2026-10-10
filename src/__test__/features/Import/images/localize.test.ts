import { localizeImage } from "../../../../features/Import/images/localize";
import { fetchImage } from "../../../../api/import/api/importApi";
import { compressDataUri } from "../../../../features/Import/images/compressImage";
import { createAsset } from "../../../../api/assets/api/assetsApi";

vi.mock(import("../../../../api/import/api/importApi"));
vi.mock(import("../../../../features/Import/images/compressImage"));
vi.mock(import("../../../../api/assets/api/assetsApi"));

const ASSET_SRC = `amber-asset:${"a".repeat(64)}`;

describe("localizeImage", () => {
	beforeEach(() => {
		vi.mocked(compressDataUri).mockImplementation(async dataUri =>
			Promise.resolve({ ok: true, src: dataUri }),
		);
		vi.mocked(createAsset).mockResolvedValue({
			id: "a".repeat(64),
			src: ASSET_SRC,
		});
	});

	it("Should store the compressed image as an asset when it is already a non-svg data uri", async () => {
		// Arrange

		const url = "data:image/png;base64,AAAA";

		// Act

		const actual = await localizeImage(url, null);

		// Assert

		expect(actual).toEqual({ ok: true, src: ASSET_SRC });
		expect(fetchImage).not.toHaveBeenCalled();
		expect(compressDataUri).toHaveBeenCalledWith(url, 2 * 1024 * 1024);
		expect(createAsset).toHaveBeenCalledWith({ dataUri: url });
	});

	it("Should mark the image broken when storing the asset fails", async () => {
		// Arrange

		vi.mocked(createAsset).mockRejectedValue(new Error("db error"));
		const url = "data:image/png;base64,AAAA";

		// Act

		const actual = await localizeImage(url, null);

		// Assert

		expect(actual).toEqual({ ok: false, originalUrl: url });
	});

	it("Should reject instead of throwing when an undecodable image can't be stored", async () => {
		// Arrange

		vi.mocked(compressDataUri).mockResolvedValue({
			ok: false,
			reason: "decode-failed",
		});
		vi.mocked(createAsset).mockRejectedValue(
			new Error("The image could not be read."),
		);
		const url = "data:image/png,AAAA";

		// Act

		const actual = await localizeImage(url, null);

		// Assert

		expect(actual).toEqual({ ok: false, originalUrl: url });
	});

	it("Should reject a data:image/svg+xml uri", async () => {
		// Arrange

		const url = "data:image/svg+xml;base64,AAAA";

		// Act

		const actual = await localizeImage(url, null);

		// Assert

		expect(actual).toEqual({ ok: false, originalUrl: url });
		expect(fetchImage).not.toHaveBeenCalled();
	});

	it("Should fetch and store the image as an asset when fetching succeeds", async () => {
		// Arrange

		vi.mocked(fetchImage).mockResolvedValue({
			mime: "image/png",
			bytesBase64: "AAAA",
		});
		const url = "https://example.com/a.png";

		// Act

		const actual = await localizeImage(url, "https://example.com");

		// Assert

		expect(fetchImage).toHaveBeenCalledWith(url, "https://example.com");
		expect(createAsset).toHaveBeenCalledWith({
			dataUri: "data:image/png;base64,AAAA",
		});
		expect(actual).toEqual({ ok: true, src: ASSET_SRC });
	});

	it("Should reject when the fetched image is an svg", async () => {
		// Arrange

		vi.mocked(fetchImage).mockResolvedValue({
			mime: "image/svg+xml",
			bytesBase64: "AAAA",
		});
		const url = "https://example.com/a.svg";

		// Act

		const actual = await localizeImage(url, null);

		// Assert

		expect(actual).toEqual({ ok: false, originalUrl: url });
	});

	it("Should reject when compression reports the image is too large", async () => {
		// Arrange

		const hugeBase64 = "A".repeat(15 * 1024 * 1024);
		vi.mocked(fetchImage).mockResolvedValue({
			mime: "image/png",
			bytesBase64: hugeBase64,
		});
		vi.mocked(compressDataUri).mockResolvedValue({
			ok: false,
			reason: "too-large",
		});
		const url = "https://example.com/big.png";

		// Act

		const actual = await localizeImage(url, null);

		// Assert

		expect(actual).toEqual({ ok: false, originalUrl: url });
	});

	it("Should reject when fetching the image throws", async () => {
		// Arrange

		vi.mocked(fetchImage).mockRejectedValue(new Error("network error"));
		const url = "https://example.com/a.png";

		// Act

		const actual = await localizeImage(url, null);

		// Assert

		expect(actual).toEqual({ ok: false, originalUrl: url });
	});
});
