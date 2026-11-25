import { loadUserState } from "../../../stores/user/userActions.ts";
import {
	loadSettings,
	saveSettings,
} from "../../../stores/settings/settingsActions.ts";
import { sync, withoutSync } from "../../../stores/sync/syncActions.ts";
import { loadElementTree } from "../../../stores/elements/elementsActions.ts";
import SettingsDto from "../../../api/settings/dto/settingsDto.ts";
import { Mock } from "vitest";
import { Procedure } from "@vitest/spy";
import useAppDispatch from "../../../hooks/useAppDispatch.ts";
import {
	changeDatabaseDirectory,
	initialLoadApplicationState,
} from "../../../stores/app/appActions.ts";
import { NavigateFunction } from "react-router";
import { RootState } from "../../../stores/store.ts";
import { AppState } from "../../../stores/app/appReducer.ts";

vi.mock(import("../../../hooks/useAppDispatch.ts"), () => ({
	default: vi.fn(),
}));
vi.mock(import("../../../stores/settings/settingsActions.ts"));
vi.mock(import("../../../stores/user/userActions.ts"));
vi.mock(import("../../../stores/sync/syncActions.ts"));
vi.mock(import("../../../stores/elements/elementsActions.ts"));

describe("appActions", () => {
	let dispatchMock: Mock<Procedure>;

	beforeEach(() => {
		dispatchMock = vi.fn();
		vi.mocked(useAppDispatch).mockReturnValue(dispatchMock);
	});

	it("Should load initial state when not loaded", async () => {
		// Arrange

		const expectedLoadSettingsCb = vi.fn();
		vi.mocked(loadUserState).mockReturnValue(expectedLoadSettingsCb);

		const expectedInitiateSettings = vi.fn();
		vi.mocked(loadSettings).mockReturnValue(expectedInitiateSettings);
		dispatchMock.mockImplementation(cb => {
			if (cb === expectedInitiateSettings) {
				return Promise.resolve({
					autoSync: true,
					spellCheck: true,
				} as Partial<SettingsDto>);
			}
			if (cb === expectedSync) return Promise.resolve(true);
		});

		const expectedSync = vi.fn();
		vi.mocked(sync).mockReturnValue(expectedSync);

		const expectedLoadElementTree = vi.fn();
		vi.mocked(loadElementTree).mockReturnValue(expectedLoadElementTree);

		const getState = vi.fn();
		getState.mockReturnValue({
			app: {} as AppState,
		} as RootState);

		// Act

		await initialLoadApplicationState()(dispatchMock, getState);

		// Assert

		expect(dispatchMock).toHaveBeenCalledWith(expectedLoadSettingsCb);
		expect(dispatchMock).toHaveBeenCalledWith(expectedInitiateSettings);
		expect(dispatchMock).toHaveBeenCalledWith(expectedSync);
		expect(dispatchMock).toHaveBeenCalledWith(expectedLoadElementTree);
	});

	it("Should not load initial state when loaded", async () => {
		// Arrange

		const expectedReviewTreeCb = vi.fn();
		const expectedLoadSettingsCb = vi.fn();
		vi.mocked(loadUserState).mockReturnValue(expectedLoadSettingsCb);

		const expectedInitiateSettings = vi.fn();
		vi.mocked(loadSettings).mockReturnValue(expectedInitiateSettings);
		dispatchMock.mockImplementation(cb => {
			if (cb === expectedInitiateSettings) {
				return Promise.resolve({
					autoSync: true,
					spellCheck: true,
				} as Partial<SettingsDto>);
			}
		});

		const expectedSync = vi.fn();
		vi.mocked(sync).mockReturnValue(expectedSync);

		const expectedLoadElementTree = vi.fn();
		vi.mocked(loadElementTree).mockReturnValue(expectedLoadElementTree);

		const getState = vi.fn();
		getState.mockReturnValue({
			app: {
				startedInitialStateLoading: true,
			} as AppState,
		} as RootState);

		// Act

		await initialLoadApplicationState()(dispatchMock, getState);

		// Assert

		expect(dispatchMock).not.toHaveBeenCalledWith(expectedReviewTreeCb);
		expect(dispatchMock).not.toHaveBeenCalledWith(expectedLoadSettingsCb);
		expect(dispatchMock).not.toHaveBeenCalledWith(expectedInitiateSettings);
		expect(dispatchMock).not.toHaveBeenCalledWith(expectedSync);
		expect(dispatchMock).not.toHaveBeenCalledWith(expectedLoadElementTree);
	});

	it("Should not auto-sync on start if it is not enabled", async () => {
		// Arrange

		const expectedInitiateSettings = vi.fn();
		vi.mocked(loadSettings).mockReturnValue(expectedInitiateSettings);
		dispatchMock.mockImplementation(cb => {
			if (cb === expectedInitiateSettings) {
				return Promise.resolve({
					autoSync: false,
					spellCheck: true,
				} as Partial<SettingsDto>);
			}
		});

		const expectedSync = vi.fn();
		vi.mocked(sync).mockReturnValue(expectedSync);

		const expectedLoadElementTree = vi.fn();
		vi.mocked(loadElementTree).mockReturnValue(expectedLoadElementTree);

		const getState = vi.fn();
		getState.mockReturnValue({
			app: {} as AppState,
		} as RootState);

		// Act

		await initialLoadApplicationState()(dispatchMock, getState);

		// Assert

		expect(dispatchMock).toHaveBeenCalledWith(expectedInitiateSettings);
		expect(dispatchMock).not.toHaveBeenCalledWith(expectedSync);
		expect(dispatchMock).toHaveBeenCalledWith(expectedLoadElementTree);
	});

	it("Should finish loading without waiting for the startup sync when auto sync is on", async () => {
		// Arrange

		const loadUserStateCb = vi.fn();
		vi.mocked(loadUserState).mockReturnValue(loadUserStateCb);
		const loadSettingsCb = vi.fn();
		vi.mocked(loadSettings).mockReturnValue(loadSettingsCb);
		const syncCb = vi.fn();
		vi.mocked(sync).mockReturnValue(syncCb);
		dispatchMock.mockImplementation(cb => {
			if (cb === loadSettingsCb)
				return Promise.resolve({ autoSync: true } as SettingsDto);
			// A sync that never ends, as on a stalled network.
			if (cb === syncCb) return new Promise(() => undefined);
		});
		const getState = vi.fn().mockReturnValue({
			app: {} as AppState,
		} as RootState);

		// Act

		await initialLoadApplicationState()(dispatchMock, getState);

		// Assert

		expect(dispatchMock).toHaveBeenCalledWith(syncCb);
		expect(
			dispatchMock.mock.calls.filter(([cb]) => cb === loadUserStateCb),
		).toHaveLength(1);
	});

	it("Should log the error when checking the profile after the startup sync fails", async () => {
		// Arrange

		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);
		const loadUserStateCb = vi.fn();
		vi.mocked(loadUserState).mockReturnValue(loadUserStateCb);
		const loadSettingsCb = vi.fn();
		vi.mocked(loadSettings).mockReturnValue(loadSettingsCb);
		const syncCb = vi.fn();
		vi.mocked(sync).mockReturnValue(syncCb);
		const failure = new Error("Backend unreachable");
		let profileChecks = 0;
		dispatchMock.mockImplementation(cb => {
			if (cb === loadSettingsCb)
				return Promise.resolve({ autoSync: true } as SettingsDto);
			if (cb === syncCb) return Promise.resolve(true);
			// The check before the sync passes; the one after it fails.
			if (cb === loadUserStateCb)
				return ++profileChecks === 1
					? Promise.resolve()
					: Promise.reject(failure);
		});
		const getState = vi.fn().mockReturnValue({
			app: {} as AppState,
		} as RootState);

		// Act

		await initialLoadApplicationState()(dispatchMock, getState);
		await new Promise(resolve => setTimeout(resolve, 0));

		// Assert

		expect(profileChecks).toBe(2);
		expect(consoleError).toHaveBeenCalledWith(failure);
	});

	it("Should save the new directory with no sync running when changing the database directory", async () => {
		// Arrange

		const withoutSyncCb = vi.fn();
		vi.mocked(withoutSync).mockReturnValue(withoutSyncCb);
		const saveSettingsCb = vi.fn();
		vi.mocked(saveSettings).mockReturnValue(saveSettingsCb);

		// Act

		await changeDatabaseDirectory(
			"/new/dir",
			vi.fn() as unknown as NavigateFunction,
		)(dispatchMock);
		const saveCalledBeforeRun = vi
			.mocked(dispatchMock)
			.mock.calls.some(([cb]) => cb === saveSettingsCb);
		await vi.mocked(withoutSync).mock.calls[0][0]();

		// Assert

		expect(dispatchMock).toHaveBeenCalledWith(withoutSyncCb);
		expect(saveCalledBeforeRun).toBe(false);
		expect(dispatchMock).toHaveBeenCalledWith(saveSettingsCb);
	});
});
