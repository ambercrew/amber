import { RootState } from "../store";

export const selectIsSignedIn = (state: RootState) => state.user.isSignedIn;
export const selectIsOffline = (state: RootState) => state.user.isOffline;
export const selectUserInformation = (state: RootState) =>
	state.user.userInformation;
