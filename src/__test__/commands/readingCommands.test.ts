import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
	runReadingCommand,
	useReadingCommand,
} from "../../commands/readingCommands";

describe("readingCommands", () => {
	it("Should call the handler with the command when a command of its type runs", () => {
		// Arrange

		const handler = vi.fn();
		renderHook(() => useReadingCommand("set-mark", handler));

		// Act

		runReadingCommand({ type: "set-mark", slot: 2 });

		// Assert

		expect(handler).toHaveBeenCalledWith({ type: "set-mark", slot: 2 });
	});

	it("Should not call the handler when a command of another type runs", () => {
		// Arrange

		const handler = vi.fn();
		renderHook(() => useReadingCommand("set-mark", handler));

		// Act

		runReadingCommand({ type: "go-to-mark", slot: 2 });

		// Assert

		expect(handler).not.toHaveBeenCalled();
	});

	it("Should stop calling the handler when its component unmounts", () => {
		// Arrange

		const handler = vi.fn();
		const { unmount } = renderHook(() =>
			useReadingCommand("set-read-point", handler),
		);

		// Act

		unmount();
		runReadingCommand({ type: "set-read-point" });

		// Assert

		expect(handler).not.toHaveBeenCalled();
	});
});
