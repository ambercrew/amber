import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { listen, TauriEvent } from "@tauri-apps/api/event";
import { CloseRequestedEventManager } from "../../managers/closeRequestedEventManager";
import { isMobile } from "../../utils/tauriUtils";

vi.mock(import("@tauri-apps/api/window"));
vi.mock(import("@tauri-apps/api/event"));
vi.mock(import("../../utils/tauriUtils"));

describe("CloseRequestedEventManager", () => {
	let onCloseRequestedMock: ReturnType<typeof vi.fn>;
	let manager: CloseRequestedEventManager;

	beforeEach(() => {
		onCloseRequestedMock = vi.fn();
		manager = new CloseRequestedEventManager();

		vi.mocked(getCurrentWindow).mockReturnValue({
			onCloseRequested: onCloseRequestedMock,
		} as Partial<Window> as Window);

		vi.mocked(isMobile).mockReturnValue(false);
		vi.mocked(listen).mockResolvedValue(() => {
			/* Empty */
		});
	});

	it("Should call handlers on tauri close requested event", async () => {
		// Arrange

		const cb = vi.fn();
		manager.addHandler("test 1", {
			priority: 1,
			cb,
		});

		// Act

		await (onCloseRequestedMock.mock.calls[0][0] as () => Promise<void>)();

		// Assert

		expect(cb).toHaveBeenCalled();
	});

	it("Should keep the window open and skip later handlers when a handler resolves false", async () => {
		// Arrange

		manager.addHandler("keeps open", {
			priority: 0,
			cb: () => Promise.resolve(false),
		});
		const later = vi.fn();
		manager.addHandler("later", { priority: 1, cb: later });
		const event = { preventDefault: vi.fn() };

		// Act

		await (
			onCloseRequestedMock.mock.calls[0][0] as (
				e: typeof event,
			) => Promise<void>
		)(event);

		// Assert

		expect(event.preventDefault).toHaveBeenCalled();
		expect(later).not.toHaveBeenCalled();
	});

	it("Should let the window close when every handler finishes", async () => {
		// Arrange

		manager.addHandler("saves", { priority: 0, cb: vi.fn() });
		manager.addHandler("syncs", {
			priority: 1,
			cb: () => Promise.resolve(true),
		});
		const event = { preventDefault: vi.fn() };

		// Act

		await (
			onCloseRequestedMock.mock.calls[0][0] as (
				e: typeof event,
			) => Promise<void>
		)(event);

		// Assert

		expect(event.preventDefault).not.toHaveBeenCalled();
	});

	it("Should not call removed handler", async () => {
		// Arrange

		const cb0 = vi.fn();
		manager.addHandler("test 0", {
			priority: 0,
			cb: cb0,
		});

		const cb1 = vi.fn();
		manager.addHandler("test 1", {
			priority: 1,
			cb: cb1,
		});

		// Act

		manager.removeHandler("test 1");
		await (onCloseRequestedMock.mock.calls[0][0] as () => Promise<void>)();

		// Assert
		expect(cb0).toHaveBeenCalled();
		expect(cb1).not.toHaveBeenCalled();
	});

	it("Should call handlers in correct order", async () => {
		// Arrange

		const cb1 = vi.fn();
		manager.addHandler("test 1", {
			priority: 1,
			cb: cb1,
		});

		const cb0 = vi.fn();
		cb0.mockImplementation(() => {
			expect(cb1).not.toHaveBeenCalled();
		});
		manager.addHandler("test 0", {
			priority: 0,
			cb: cb0,
		});

		// Act & Assert

		await (onCloseRequestedMock.mock.calls[0][0] as () => Promise<void>)();

		expect(cb0).toHaveBeenCalled();
		expect(cb1).toHaveBeenCalled();
	});

	it("Should not register WINDOW_SUSPENDED listener when not on mobile", () => {
		// Arrange & Act

		manager.addHandler("test", { priority: 1, cb: vi.fn() });

		// Assert

		expect(listen).not.toHaveBeenCalled();
	});

	describe("on mobile", () => {
		beforeEach(() => {
			vi.mocked(isMobile).mockReturnValue(true);

			Object.defineProperty(navigator, "locks", {
				value: {
					request: vi
						.fn()
						.mockImplementation(
							(_name: string, cb: () => Promise<void>) => cb(),
						),
				},
				writable: true,
				configurable: true,
			});
		});

		it("Should register WINDOW_SUSPENDED listener", () => {
			// Arrange & Act

			manager.addHandler("test", { priority: 1, cb: vi.fn() });

			// Assert

			expect(listen).toHaveBeenCalledWith(
				TauriEvent.WINDOW_SUSPENDED,
				expect.any(Function),
			);
		});

		it("Should call handlers on WINDOW_SUSPENDED event", async () => {
			// Arrange

			const cb = vi.fn();
			manager.addHandler("test", { priority: 1, cb });

			// Act

			const suspendCallback = vi.mocked(listen).mock
				.calls[0][1] as () => void;
			suspendCallback();

			// Assert

			await vi.waitFor(() => expect(cb).toHaveBeenCalled());
		});

		it("Should use suspend-handlers lock when handling WINDOW_SUSPENDED", async () => {
			// Arrange

			manager.addHandler("test", { priority: 1, cb: vi.fn() });

			// Act

			const suspendCallback = vi.mocked(listen).mock
				.calls[0][1] as () => void;
			suspendCallback();

			// Assert

			await vi.waitFor(() =>
				// eslint-disable-next-line @typescript-eslint/unbound-method
				expect(navigator.locks.request).toHaveBeenCalledWith(
					"suspend-handlers",
					expect.any(Function),
				),
			);
		});
	});
});
