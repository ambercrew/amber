import {
	combineReducers,
	configureStore,
	createListenerMiddleware,
} from "@reduxjs/toolkit";
import userReducer from "./user/userReducer";
import syncReducer from "./sync/syncReducer";
import ankiSyncReducer from "./ankiSync/ankiSyncReducer";
import settingsReducer from "./settings/settingsReducer";
import appReducer from "./app/appReducer.ts";
import elementsReducer from "./elements/elementsReducer";
import studyReducer from "./study/studyReducer";
import bibliographicalSourcesReducer from "./bibliographicalSources/bibliographicalSourcesReducer";
import elementDetailsReducer from "./elementDetails/elementDetailsReducer";
import searchReducer from "./search/searchReducer";
import trashReducer from "./trash/trashReducer";
import aiReducer from "./aiContext/aiContextReducer";
import aiPromptsReducer from "./aiPrompts/aiPromptsReducer";
import tableOfContentsReducer from "./tableOfContents/tableOfContentsReducer";
import imageOcclusionReducer from "./imageOcclusion/imageOcclusionReducer";

const reducers = combineReducers({
	user: userReducer,
	sync: syncReducer,
	ankiSync: ankiSyncReducer,
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
	tableOfContents: tableOfContentsReducer,
	imageOcclusion: imageOcclusionReducer,
});

export const setupStore = (preloadedState?: Partial<RootState>) => {
	// Lets mounted components react to an action as it's dispatched (`addListener`).
	const listeners = createListenerMiddleware();
	return configureStore({
		reducer: reducers,
		middleware: getDefaultMiddleware =>
			getDefaultMiddleware({
				serializableCheck: false,
			}).prepend(listeners.middleware),
		preloadedState,
	});
};

export type RootState = ReturnType<typeof reducers>;
export type AppStore = ReturnType<typeof setupStore>;
export type AppDispatch = AppStore["dispatch"];
