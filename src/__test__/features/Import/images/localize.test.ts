import {
	localizeImage,
	localizeImages,
} from "../../../../features/Import/images/localize";
import { fetchImage } from "../../../../api/import/api/importApi";
import {
	compressDataUri,
	estimateDataUriBytes,
} from "../../../../features/Import/images/compressImage";
import { createAssets } from "../../../../api/assets/api/assetsApi";

vi.mock(import("../../../../api/import/api/importApi"));
vi.mock(import("../../../../features/Import/images/compressImage"));
vi.mock(import("../../../../api/assets/api/assetsApi"));

const ASSET_SRC = `amber-asset:${"a".repeat(64)}`;

describe("localizeImage", () => {
	beforeEach(() => {
		vi.mocked(compressDataUri).mockImplementation(async dataUri =>
			Promise.resolve({ ok: true, src: dataUri }),
		);
		vi.mocked(createAssets).mockImplementation(async ({ dataUris }) =>
			Promise.resolve(
				dataUris.map(() => ({ id: "a".repeat(64), src: ASSET_SRC })),
			),
		);
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
		expect(createAssets).toHaveBeenCalledWith({ dataUris: [url] });
	});

	it("Should store every image in one call when localizing several", async () => {
		// Arrange

		const png = "data:image/png;base64,AAAA";
		const svg = "data:image/svg+xml;base64,AAAA";

		// Act

		const actual = await localizeImages([png, svg], null);

		// Assert

		expect(createAssets).toHaveBeenCalledTimes(1);
		expect(createAssets).toHaveBeenCalledWith({ dataUris: [png, svg] });
		expect(actual).toEqual(
			new Map([
				[png, { ok: true, src: ASSET_SRC }],
				[svg, { ok: true, src: ASSET_SRC }],
			]),
		);
	});

	it("Should mark only the undecodable image broken when the backend can't read it", async () => {
		// Arrange

		vi.mocked(createAssets).mockResolvedValue([
			null,
			{ id: "a".repeat(64), src: ASSET_SRC },
		]);
		const unreadable = "data:image/png;base64,BBBB";
		const readable = "data:image/png;base64,AAAA";

		// Act

		const actual = await localizeImages([unreadable, readable], null);

		// Assert

		expect(actual).toEqual(
			new Map([
				[unreadable, { ok: false, originalUrl: unreadable }],
				[readable, { ok: true, src: ASSET_SRC }],
			]),
		);
	});

	it("Should mark the image broken when storing the asset fails", async () => {
		// Arrange

		vi.mocked(createAssets).mockRejectedValue(new Error("db error"));
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
		vi.mocked(createAssets).mockResolvedValue([null]);
		const url = "data:image/png,AAAA";

		// Act

		const actual = await localizeImage(url, null);

		// Assert

		expect(actual).toEqual({ ok: false, originalUrl: url });
	});

	it("Should store an svg data uri uncompressed when it is base64", async () => {
		// Arrange

		const url = "data:image/svg+xml;base64,AAAA";

		// Act

		const actual = await localizeImage(url, null);

		// Assert

		expect(actual).toEqual({ ok: true, src: ASSET_SRC });
		expect(fetchImage).not.toHaveBeenCalled();
		expect(compressDataUri).not.toHaveBeenCalled();
		expect(createAssets).toHaveBeenCalledWith({ dataUris: [url] });
	});

	it("Should store an svg data uri as base64 when it is url-encoded", async () => {
		// Arrange

		const url = "data:image/svg+xml;utf8,%3Csvg%3E%3C%2Fsvg%3E";

		// Act

		const actual = await localizeImage(url, null);

		// Assert

		expect(actual).toEqual({ ok: true, src: ASSET_SRC });
		expect(createAssets).toHaveBeenCalledWith({
			dataUris: [`data:image/svg+xml;base64,${btoa("<svg></svg>")}`],
		});
	});

	it("Should reject an svg when it is larger than the size cap", async () => {
		// Arrange

		vi.mocked(estimateDataUriBytes).mockReturnValueOnce(3 * 1024 * 1024);
		const url = "data:image/svg+xml;base64,AAAA";

		// Act

		const actual = await localizeImage(url, null);

		// Assert

		expect(actual).toEqual({ ok: false, originalUrl: url });
		expect(createAssets).not.toHaveBeenCalled();
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
		expect(createAssets).toHaveBeenCalledWith({
			dataUris: ["data:image/png;base64,AAAA"],
		});
		expect(actual).toEqual({ ok: true, src: ASSET_SRC });
	});

	it("Should store the fetched image uncompressed when it is an svg", async () => {
		// Arrange

		vi.mocked(fetchImage).mockResolvedValue({
			mime: "image/svg+xml",
			bytesBase64: "AAAA",
		});
		const url = "https://example.com/a.svg";

		// Act

		const actual = await localizeImage(url, null);

		// Assert

		expect(actual).toEqual({ ok: true, src: ASSET_SRC });
		expect(compressDataUri).not.toHaveBeenCalled();
		expect(createAssets).toHaveBeenCalledWith({
			dataUris: ["data:image/svg+xml;base64,AAAA"],
		});
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
