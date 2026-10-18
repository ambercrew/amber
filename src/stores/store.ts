import { combineReducers, configureStore } from "@reduxjs/toolkit";
import userReducer from "./user/userReducer";
import syncReducer from "./sync/syncReducer";
import settingsReducer from "./settings/settingsReducer";
import appReducer from "./app/appReducer.ts";
import elementsReducer from "./elements/elementsReducer";
import studyReducer from "./study/studyReducer";
import bibliographicalSourcesReducer from "./bibliographicalSources/bibliographicalSourcesReducer";
import elementDetailsReducer from "./elementDetails/elementDetailsReducer";
import searchReducer from "./search/searchReducer";
import trashReducer from "./trash/trashReducer";
import aiReducer from "./aiContext/aiReducer";
import aiPromptsReducer from "./aiPrompts/aiPromptsReducer";

const reducers = combineReducers({
	user: userReducer,
	sync: syncReducer,
	settings: settingsReducer,
	app: appReducer,
	elements: elementsReducer,
	study: studyReducer,
	bibliographicalSources: bibliographicalSourcesReducer,
	elementDetails: elementDetailsReducer,
	search: searchReducer,
	trash: trashReducer,
	ai: aiReducer,
	aiPrompts: aiPromptsReducer,
});

export const setupStore = (preloadedState?: Partial<RootState>) => {
	return configureStore({
		reducer: reducers,
		middleware: getDefaultMiddleware =>
			getDefaultMiddleware({
				serializableCheck: false,
			}),
		preloadedState,
	});
};

export type RootState = ReturnType<typeof reducers>;
export type AppStore = ReturnType<typeof setupStore>;
export type AppDispatch = AppStore["dispatch"];
