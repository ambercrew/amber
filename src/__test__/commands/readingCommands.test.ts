import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReadingCommand } from "../../commands/readingCommands";
import { createReadingCommandStore } from "../test-utils/readingCommandStore";

let readingCommands: ReturnType<typeof createReadingCommandStore>;

beforeEach(() => {
	readingCommands = createReadingCommandStore();
});

describe("readingCommands", () => {
	it("Should call the handler with the command when a command of its type runs", () => {
		// Arrange

		const handler = vi.fn();
		renderHook(() => useReadingCommand("set-mark", handler), {
			wrapper: readingCommands.wrapper,
		});

		// Act

		act(() => readingCommands.send({ type: "set-mark", slot: 2 }));

		// Assert

		expect(handler).toHaveBeenCalledWith({ type: "set-mark", slot: 2 });
	});

	it("Should not call the handler when a command of another type runs", () => {
		// Arrange

		const handler = vi.fn();
		renderHook(() => useReadingCommand("set-mark", handler), {
			wrapper: readingCommands.wrapper,
		});

		// Act

		act(() => readingCommands.send({ type: "go-to-mark", slot: 2 }));

		// Assert

		expect(handler).not.toHaveBeenCalled();
	});

	it("Should not call the handler with a command sent before it mounted", () => {
		// Arrange

		const handler = vi.fn();
		readingCommands.send({ type: "set-read-point" });

		// Act

		renderHook(() => useReadingCommand("set-read-point", handler), {
			wrapper: readingCommands.wrapper,
		});

		// Assert

		expect(handler).not.toHaveBeenCalled();
	});

	it("Should stop calling the handler when its component unmounts", () => {
		// Arrange

		const handler = vi.fn();
		const { unmount } = renderHook(
			() => useReadingCommand("set-read-point", handler),
			{ wrapper: readingCommands.wrapper },
		);

		// Act

		unmount();
		act(() => readingCommands.send({ type: "set-read-point" }));

		// Assert

		expect(handler).not.toHaveBeenCalled();
	});

	it("Should call each handler when several commands run before a render", () => {
		// Arrange

		const setMark = vi.fn();
		const goToReadPoint = vi.fn();
		renderHook(() => useReadingCommand("set-mark", setMark), {
			wrapper: readingCommands.wrapper,
		});
		renderHook(() => useReadingCommand("go-to-read-point", goToReadPoint), {
			wrapper: readingCommands.wrapper,
		});

		// Act

		act(() => {
			readingCommands.send({ type: "set-mark", slot: 1 });
			readingCommands.send({ type: "go-to-read-point" });
			readingCommands.send({ type: "set-mark", slot: 3 });
		});

		// Assert

		expect(setMark.mock.calls).toEqual([
			[{ type: "set-mark", slot: 1 }],
			[{ type: "set-mark", slot: 3 }],
		]);
		expect(goToReadPoint).toHaveBeenCalledOnce();
	});
});
