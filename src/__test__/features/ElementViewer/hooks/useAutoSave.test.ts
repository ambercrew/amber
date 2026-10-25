import { fireEvent, renderHook } from "@testing-library/react";
import { act } from "react";
import useAutoSave, {
	CLOSE_REQUESTED_HANDLER_NAME_PREFIX,
} from "../../../../features/ElementViewer/hooks/useAutoSave";
import { defaultCloseRequestedEventManager } from "../../../../managers/closeRequestedEventManager";
import {
	defaultGlobalSyncEventManager,
	ListenerType,
} from "../../../../stores/sync/managers/syncEventManager";
import callApiMock from "../../../test-utils/callApiMock";

vi.mock(import("../../../../managers/closeRequestedEventManager"));
vi.mock(import("../../../../stores/sync/managers/syncEventManager"));

const renderAutoSave = () => {
	const onSaveCb = vi.fn().mockResolvedValue(undefined);
	const onSaveCompleteCb = vi.fn().mockResolvedValue(undefined);

	const returnValue = renderHook(() =>
		useAutoSave({
			onSave: onSaveCb,
			onSaveComplete: onSaveCompleteCb,
			callApi: callApiMock,
		}),
	);

	return {
		onSaveCb,
		onSaveCompleteCb,
		returnValue,
	};
};

describe("useAutoSave", () => {
	it("Saves automatically after delay", async () => {
		// Arrange

		vi.useFakeTimers();

		// Act

		const { returnValue, onSaveCb, onSaveCompleteCb } = renderAutoSave();
		returnValue.result.current.onContentUpdate(() => "test");
		await vi.runAllTimersAsync();

		// Assert

		expect(onSaveCb).toHaveBeenCalledWith("test");
		expect(onSaveCompleteCb).toHaveBeenCalled();
		vi.useRealTimers();
		vi.clearAllTimers();
	});

	it("Does not save if timeout did not pass", () => {
		// Act

		const { returnValue, onSaveCb } = renderAutoSave();
		returnValue.result.current.onContentUpdate(() => "test");

		// Assert

		expect(onSaveCb).not.toHaveBeenCalled();
	});

	it("Does not save again when there is no pending content", async () => {
		// Arrange

		vi.useFakeTimers();

		// Act

		const { returnValue, onSaveCb } = renderAutoSave();
		returnValue.result.current.onContentUpdate(() => "test");
		await vi.runAllTimersAsync();
		await returnValue.result.current.saveChanges();

		// Assert

		expect(onSaveCb).toHaveBeenCalledTimes(1);
		vi.useRealTimers();
		vi.clearAllTimers();
	});

	it("Stops and saves before unload", async () => {
		// Arrange

		const event = new Event("beforeunload");
		const preventDefaultSpy = vi.spyOn(event, "preventDefault");

		// Act

		const { returnValue, onSaveCb, onSaveCompleteCb } = renderAutoSave();
		returnValue.result.current.onContentUpdate(() => "test");
		await act(() => fireEvent(window, event));

		// Assert

		expect(preventDefaultSpy).toHaveBeenCalled();
		expect(onSaveCb).toHaveBeenCalledWith("test");
		expect(onSaveCompleteCb).toHaveBeenCalled();
	});

	it("Saves on window close request", async () => {
		// Arrange

		const addHandlerSpy = vi.spyOn(
			defaultCloseRequestedEventManager,
			"addHandler",
		);

		// Act

		const { returnValue, onSaveCb, onSaveCompleteCb } = renderAutoSave();
		returnValue.result.current.onContentUpdate(() => "test");

		// Assert

		expect(addHandlerSpy).toHaveBeenCalledWith(
			expect.stringContaining(CLOSE_REQUESTED_HANDLER_NAME_PREFIX),
			expect.objectContaining({
				priority: 0,
			}),
		);
		await (addHandlerSpy.mock.calls[0][1].cb as () => Promise<void>)();
		expect(onSaveCb).toHaveBeenCalledWith("test");
		expect(onSaveCompleteCb).toHaveBeenCalled();
	});

	it("Saves on unmount", async () => {
		// Act

		const { returnValue, onSaveCb, onSaveCompleteCb } = renderAutoSave();
		returnValue.result.current.onContentUpdate(() => "test");
		returnValue.unmount();
		// Waiting for async callback to finish.
		await act(async () => {
			/* Nothing */
		});

		// Assert

		expect(onSaveCb).toHaveBeenCalledWith("test");
		expect(onSaveCompleteCb).toHaveBeenCalled();
	});

	it("Saves on pre-sync start", async () => {
		// Arrange

		const addListenerSpy = vi.spyOn(
			defaultGlobalSyncEventManager,
			"addListener",
		);

		// Act

		const { returnValue, onSaveCb, onSaveCompleteCb } = renderAutoSave();
		returnValue.result.current.onContentUpdate(() => "test");
		await addListenerSpy.mock.calls.find(
			a => a[0] === ListenerType.PreSyncStart,
		)![1]();

		// Assert

		expect(onSaveCb).toHaveBeenCalledWith("test");
		expect(onSaveCompleteCb).toHaveBeenCalled();
	});

	it("Calls onSaveComplete on pre-sync complete", async () => {
		// Arrange

		const addListenerSpy = vi.spyOn(
			defaultGlobalSyncEventManager,
			"addListener",
		);

		// Act

		const { onSaveCompleteCb } = renderAutoSave();
		await addListenerSpy.mock.calls.find(
			a => a[0] === ListenerType.PreSyncComplete,
		)![1]();

		// Assert

		expect(onSaveCompleteCb).toHaveBeenCalled();
	});

	it("Registers a separate close-requested handler per instance when multiple editors are mounted at once", async () => {
		// Arrange

		const addHandlerSpy = vi.spyOn(
			defaultCloseRequestedEventManager,
			"addHandler",
		);

		// Act

		const { returnValue: firstReturnValue, onSaveCb: firstOnSaveCb } =
			renderAutoSave();
		const { onSaveCb: secondOnSaveCb } = renderAutoSave();
		firstReturnValue.result.current.onContentUpdate(() => "first");

		// Assert

		expect(addHandlerSpy.mock.calls).toHaveLength(2);
		const [firstName] = addHandlerSpy.mock.calls[0];
		const [secondName] = addHandlerSpy.mock.calls[1];
		expect(firstName).not.toBe(secondName);

		for (const [, handler] of addHandlerSpy.mock.calls) {
			await (handler.cb as () => Promise<void>)();
		}
		expect(firstOnSaveCb).toHaveBeenCalledWith("first");
		expect(secondOnSaveCb).not.toHaveBeenCalled();
	});

	it("Unregister useEffect dependencies on unmount", () => {
		// Arrange

		const removeHandlerSpy = vi.spyOn(
			defaultCloseRequestedEventManager,
			"removeHandler",
		);
		const removeListenerSpy = vi.spyOn(
			defaultGlobalSyncEventManager,
			"removeListener",
		);

		// Act

		const { returnValue } = renderAutoSave();
		returnValue.unmount();

		// Assert

		expect(removeHandlerSpy).toHaveBeenCalledWith(
			expect.stringContaining(CLOSE_REQUESTED_HANDLER_NAME_PREFIX),
		);
		expect(removeListenerSpy).toHaveBeenCalledWith(
			ListenerType.PreSyncStart,
			expect.anything(),
		);
		expect(removeListenerSpy).toHaveBeenCalledWith(
			ListenerType.PreSyncComplete,
			expect.anything(),
		);
	});

	it("Should keep the same onContentUpdate when it rerenders", () => {
		// Arrange

		const { returnValue } = renderAutoSave();
		const before = returnValue.result.current.onContentUpdate;

		// Act

		returnValue.rerender();

		// Assert

		expect(returnValue.result.current.onContentUpdate).toBe(before);
	});
});
