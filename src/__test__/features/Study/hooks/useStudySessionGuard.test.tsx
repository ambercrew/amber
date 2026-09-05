import { fireEvent, screen } from "@testing-library/react";
import { useNavigate } from "react-router";
import { useStudySessionGuard } from "../../../../features/Study/hooks/useStudySessionGuard";
import {
	LOCATION_DISPLAY_TEST_ID,
	renderWithProviders,
} from "../../../test-utils/renderWithProviders";
import { StudySessionLocationState } from "../../../../types/study/studySessionLocationState";
import { STUDY_SESSION_FINISHED } from "../../../../types/events/studySessionFinishedEvent";

const BASE_STUDY_STATE = {
	queue: [],
	totalCount: 0,
	cardPhase: "question" as const,
	shownAt: null,
	counts: { cards: 0, learningAssets: 0, extracts: 0, finished: 0 },
	summary: null,
};

function HookWrapper() {
	useStudySessionGuard();
	const navigate = useNavigate();
	return (
		<>
			<button
				type="button"
				onClick={() => void navigate("/other")}
				data-testid="navigate-manual">
				navigate manual
			</button>
			<button
				type="button"
				onClick={() => {
					const state: StudySessionLocationState = {
						studySessionNav: true,
					};
					void navigate("/other", { state });
				}}
				data-testid="navigate-session">
				navigate session
			</button>
		</>
	);
}

describe("useStudySessionGuard", () => {
	it("Should not stop the session when not currently studying", () => {
		// Arrange

		const { store } = renderWithProviders(<HookWrapper />, {
			preloadedState: {
				study: { ...BASE_STUDY_STATE, status: "editing" },
			},
		});

		// Act

		fireEvent.click(screen.getByTestId("navigate-manual"));

		// Assert

		expect(store.getState().study.status).toBe("editing");
	});

	it("Should stop the session when navigating away without study session navigation state", () => {
		// Arrange

		const initialState: StudySessionLocationState = {
			studySessionNav: true,
		};
		const { store } = renderWithProviders(<HookWrapper />, {
			preloadedState: {
				study: { ...BASE_STUDY_STATE, status: "studying" },
			},
			memoryRouterProps: {
				initialEntries: [{ pathname: "/", state: initialState }],
			},
		});

		// Act

		fireEvent.click(screen.getByTestId("navigate-manual"));

		// Assert

		expect(store.getState().study.status).toBe("editing");
	});

	it("Should fire STUDY_SESSION_FINISHED when stopping the session via navigation", () => {
		// Arrange

		const initialState: StudySessionLocationState = {
			studySessionNav: true,
		};
		const listener = vi.fn();
		window.addEventListener(STUDY_SESSION_FINISHED, listener);

		renderWithProviders(<HookWrapper />, {
			preloadedState: {
				study: { ...BASE_STUDY_STATE, status: "studying" },
			},
			memoryRouterProps: {
				initialEntries: [{ pathname: "/", state: initialState }],
			},
		});

		// Act

		fireEvent.click(screen.getByTestId("navigate-manual"));

		// Assert

		expect(listener).toHaveBeenCalledTimes(1);
		window.removeEventListener(STUDY_SESSION_FINISHED, listener);
	});

	it("Should not stop the session when navigating with study session navigation state", () => {
		// Arrange

		const initialState: StudySessionLocationState = {
			studySessionNav: true,
		};
		const { store } = renderWithProviders(<HookWrapper />, {
			preloadedState: {
				study: { ...BASE_STUDY_STATE, status: "studying" },
			},
			memoryRouterProps: {
				initialEntries: [{ pathname: "/", state: initialState }],
			},
		});

		// Act

		fireEvent.click(screen.getByTestId("navigate-session"));

		// Assert

		expect(store.getState().study.status).toBe("studying");
		expect(screen.getByTestId(LOCATION_DISPLAY_TEST_ID)).toHaveTextContent(
			"/other",
		);
	});
});
