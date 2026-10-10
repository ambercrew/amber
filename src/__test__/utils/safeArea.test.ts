import {
	safeAreaBottomStyle,
	safeAreaTopStyle,
	safeAreaVerticalStyle,
	SAFE_AREA_BOTTOM,
	SAFE_AREA_TOP,
} from "../../utils/safeArea";
import { isMobile } from "../../utils/tauriUtils";

vi.mock(import("../../utils/tauriUtils"));

describe("safeAreaTopStyle", () => {
	it("Should pad the top when running on mobile", () => {
		// Arrange

		vi.mocked(isMobile).mockReturnValue(true);

		// Act

		const actual = safeAreaTopStyle();

		// Assert

		expect(actual).toEqual({ paddingTop: SAFE_AREA_TOP });
	});

	it("Should return no style when running on desktop", () => {
		// Arrange

		vi.mocked(isMobile).mockReturnValue(false);

		// Act

		const actual = safeAreaTopStyle();

		// Assert

		expect(actual).toBeUndefined();
	});
});

describe("safeAreaBottomStyle", () => {
	it("Should pad the bottom when running on mobile", () => {
		// Arrange

		vi.mocked(isMobile).mockReturnValue(true);

		// Act

		const actual = safeAreaBottomStyle();

		// Assert

		expect(actual).toEqual({ paddingBottom: SAFE_AREA_BOTTOM });
	});

	it("Should return no style when running on desktop", () => {
		// Arrange

		vi.mocked(isMobile).mockReturnValue(false);

		// Act

		const actual = safeAreaBottomStyle();

		// Assert

		expect(actual).toBeUndefined();
	});
});

describe("safeAreaVerticalStyle", () => {
	it("Should pad the top and bottom when running on mobile", () => {
		// Arrange

		vi.mocked(isMobile).mockReturnValue(true);

		// Act

		const actual = safeAreaVerticalStyle();

		// Assert

		expect(actual).toEqual({
			paddingTop: SAFE_AREA_TOP,
			paddingBottom: SAFE_AREA_BOTTOM,
		});
	});

	it("Should return no style when running on desktop", () => {
		// Arrange

		vi.mocked(isMobile).mockReturnValue(false);

		// Act

		const actual = safeAreaVerticalStyle();

		// Assert

		expect(actual).toBeUndefined();
	});
});
