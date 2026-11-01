import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createScrollSampler,
	FAST_SCROLL_WINDOW_IN_MILLISECONDS,
} from "../../../features/ElementViewer/scrollPace";

const VIEWPORT_HEIGHT_IN_PX = 800;

describe("createScrollSampler", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("Should be fast when the samples span more than a viewport", () => {
		// Arrange

		const sampler = createScrollSampler();

		// Act

		sampler.push(0);
		sampler.push(VIEWPORT_HEIGHT_IN_PX * 2);

		// Assert

		expect(sampler.isFast(VIEWPORT_HEIGHT_IN_PX)).toBe(true);
	});

	it("Should not be fast when the samples span less than a viewport", () => {
		// Arrange

		const sampler = createScrollSampler();

		// Act

		sampler.push(0);
		sampler.push(VIEWPORT_HEIGHT_IN_PX / 2);

		// Assert

		expect(sampler.isFast(VIEWPORT_HEIGHT_IN_PX)).toBe(false);
	});

	it("Should not be fast when the samples are older than the window", () => {
		// Arrange

		const sampler = createScrollSampler();
		sampler.push(0);
		sampler.push(VIEWPORT_HEIGHT_IN_PX * 2);

		// Act

		vi.advanceTimersByTime(FAST_SCROLL_WINDOW_IN_MILLISECONDS + 1);

		// Assert

		expect(sampler.isFast(VIEWPORT_HEIGHT_IN_PX)).toBe(false);
	});

	it("Should not be fast when cleared", () => {
		// Arrange

		const sampler = createScrollSampler();
		sampler.push(0);
		sampler.push(VIEWPORT_HEIGHT_IN_PX * 2);

		// Act

		sampler.clear();

		// Assert

		expect(sampler.isFast(VIEWPORT_HEIGHT_IN_PX)).toBe(false);
	});
});
