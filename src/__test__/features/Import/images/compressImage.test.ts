import {
	compressDataUri,
	estimateDataUriBytes,
} from "../../../../features/Import/images/compressImage";
import imageCompression from "browser-image-compression";

vi.mock("browser-image-compression", () => ({
	default: vi.fn(),
}));

describe("estimateDataUriBytes", () => {
	it("Should approximate decoded bytes from the base64 payload", () => {
		// Arrange

		const dataUri = "data:image/png;base64,AAAA";

		// Act

		const actual = estimateDataUriBytes(dataUri);

		// Assert

		expect(actual).toBe(3);
	});
});

describe("compressDataUri", () => {
	beforeEach(() => {
		vi.mocked(imageCompression).mockReset();
		vi.unstubAllGlobals();
	});

	it("Should pass through svg and gif data uris without re-encoding", async () => {
		// Arrange

		const svg = "data:image/svg+xml;base64,AAAA";
		const gif = "data:image/gif;base64,AAAA";

		// Act

		const svgResult = await compressDataUri(svg, 2 * 1024 * 1024);
		const gifResult = await compressDataUri(gif, 2 * 1024 * 1024);

		// Assert

		expect(svgResult).toEqual({ ok: true, src: svg });
		expect(gifResult).toEqual({ ok: true, src: gif });
		expect(imageCompression).not.toHaveBeenCalled();
	});

	it("Should compress small images instead of skipping them", async () => {
		// Arrange

		const dataUri = "data:image/png;base64,AAAA";
		const originalBlob = new Blob(["png-bytes"], { type: "image/png" });
		Object.defineProperty(originalBlob, "size", { value: 4 });

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				blob: () => Promise.resolve(originalBlob),
			}),
		);
		vi.mocked(imageCompression).mockResolvedValue(
			new File(["x"], "import-image.webp", { type: "image/webp" }),
		);
		vi.stubGlobal(
			"FileReader",
			class {
				onload: (() => void) | null = null;
				onerror: (() => void) | null = null;

				readAsDataURL() {
					queueMicrotask(() => this.onload?.());
				}

				readonly result = "data:image/webp;base64,compressed";
			},
		);

		// Act

		const actual = await compressDataUri(dataUri, 2 * 1024 * 1024);

		// Assert

		expect(imageCompression).toHaveBeenCalled();
		expect(actual).toEqual({
			ok: true,
			src: "data:image/webp;base64,compressed",
		});
	});

	it("Should attempt compression when the original exceeds the max size and reject if still too large", async () => {
		// Arrange

		const originalBytes = 5 * 1024 * 1024;
		const originalBase64 = "A".repeat(Math.ceil((originalBytes * 4) / 3));
		const dataUri = `data:image/png;base64,${originalBase64}`;
		const originalBlob = new Blob(["png-bytes"], { type: "image/png" });
		Object.defineProperty(originalBlob, "size", { value: originalBytes });

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				blob: () => Promise.resolve(originalBlob),
			}),
		);
		vi.mocked(imageCompression).mockResolvedValue(
			new File(["x".repeat(originalBytes)], "import-image.webp", {
				type: "image/webp",
			}),
		);

		// Act

		const actual = await compressDataUri(dataUri, 2 * 1024 * 1024);

		// Assert

		expect(imageCompression).toHaveBeenCalled();
		expect(actual).toEqual({ ok: false, reason: "too-large" });
	});

	it("Should compress an oversized original when the result fits under the max size", async () => {
		// Arrange

		const originalBytes = 5 * 1024 * 1024;
		const originalBase64 = "A".repeat(Math.ceil((originalBytes * 4) / 3));
		const dataUri = `data:image/png;base64,${originalBase64}`;
		const originalBlob = new Blob(["png-bytes"], { type: "image/png" });
		Object.defineProperty(originalBlob, "size", { value: originalBytes });

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				blob: () => Promise.resolve(originalBlob),
			}),
		);
		vi.mocked(imageCompression).mockResolvedValue(
			new File(["compressed"], "import-image.webp", {
				type: "image/webp",
			}),
		);
		vi.stubGlobal(
			"FileReader",
			class {
				onload: (() => void) | null = null;
				onerror: (() => void) | null = null;

				readAsDataURL() {
					queueMicrotask(() => this.onload?.());
				}

				readonly result = "data:image/webp;base64,compressed";
			},
		);

		// Act

		const actual = await compressDataUri(dataUri, 2 * 1024 * 1024);

		// Assert

		expect(imageCompression).toHaveBeenCalled();
		expect(actual).toEqual({
			ok: true,
			src: "data:image/webp;base64,compressed",
		});
	});

	it("Should return a smaller webp data uri when compression helps", async () => {
		// Arrange

		const originalBytes = 64 * 1024;
		const originalBase64 = "A".repeat(Math.ceil((originalBytes * 4) / 3));
		const dataUri = `data:image/png;base64,${originalBase64}`;
		const originalBlob = new Blob(["png-bytes"], { type: "image/png" });
		Object.defineProperty(originalBlob, "size", { value: originalBytes });

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				blob: () => Promise.resolve(originalBlob),
			}),
		);
		vi.mocked(imageCompression).mockResolvedValue(
			new File(["compressed"], "import-image.webp", {
				type: "image/webp",
			}),
		);
		vi.stubGlobal(
			"FileReader",
			class {
				onload: (() => void) | null = null;
				onerror: (() => void) | null = null;

				readAsDataURL() {
					queueMicrotask(() => this.onload?.());
				}

				readonly result = "data:image/webp;base64,compressed";
			},
		);

		// Act

		const actual = await compressDataUri(dataUri, 2 * 1024 * 1024);

		// Assert

		expect(imageCompression).toHaveBeenCalledWith(
			expect.any(File),
			expect.objectContaining({
				maxSizeMB: 384 / 1024,
				maxWidthOrHeight: 1280,
				initialQuality: 0.6,
				fileType: "image/webp",
				useWebWorker: false,
			}),
		);
		expect(actual).toEqual({
			ok: true,
			src: "data:image/webp;base64,compressed",
		});
	});

	it("Should keep the original data uri when compression does not reduce size", async () => {
		// Arrange

		const originalBytes = 64 * 1024;
		const originalBase64 = "A".repeat(Math.ceil((originalBytes * 4) / 3));
		const dataUri = `data:image/png;base64,${originalBase64}`;
		const originalBlob = new Blob(["png-bytes"], { type: "image/png" });
		Object.defineProperty(originalBlob, "size", { value: originalBytes });

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				blob: () => Promise.resolve(originalBlob),
			}),
		);
		vi.mocked(imageCompression).mockResolvedValue(
			new File(["x".repeat(originalBytes)], "import-image.webp", {
				type: "image/webp",
			}),
		);

		// Act

		const actual = await compressDataUri(dataUri, 2 * 1024 * 1024);

		// Assert

		expect(actual).toEqual({ ok: true, src: dataUri });
	});
});
