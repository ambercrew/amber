import { loadUserState } from "../../../stores/user/userActions.ts";
import { loadSettings } from "../../../stores/settings/settingsActions.ts";
import { sync } from "../../../stores/sync/syncActions.ts";
import { loadElementTree } from "../../../stores/elements/elementsActions.ts";
import SettingsDto from "../../../api/settings/dto/settingsDto.ts";
import { Mock } from "vitest";
import { Procedure } from "@vitest/spy";
import useAppDispatch from "../../../hooks/useAppDispatch.ts";
import { initialLoadApplicationState } from "../../../stores/app/appActions.ts";
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
});
