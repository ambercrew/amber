import { PayloadAction, createSlice } from "@reduxjs/toolkit";
import { UserInformationDto } from "../../api/backend/dto/userInformationDto";

export interface UserState {
	isSignedIn: boolean;
	/**
	 * Signed in but the last backend refresh failed (e.g. offline), so `userInformation`
	 * is the cached, possibly stale value.
	 */
	isOffline: boolean;
	userInformation: UserInformationDto | null;
}

const initialState: UserState = {
	isSignedIn: false,
	isOffline: false,
	userInformation: null,
};

const userSlice = createSlice({
	name: "user",
	initialState,
	reducers: {
		setUserInformation: (
			state,
			payload: PayloadAction<UserInformationDto>,
		) => {
			state.isSignedIn = true;
			state.isOffline = false;
			state.userInformation = payload.payload;
		},
		setOfflineUserInformation: (
			state,
			payload: PayloadAction<UserInformationDto>,
		) => {
			state.isSignedIn = true;
			state.isOffline = true;
			state.userInformation = payload.payload;
		},
		setLoggedOf: state => {
			state.isSignedIn = false;
			state.isOffline = false;
			state.userInformation = null;
		},
		setOnline: state => {
			state.isOffline = false;
		},
	},
});

export default userSlice.reducer;

export const {
	setUserInformation,
	setOfflineUserInformation,
	setLoggedOf,
	setOnline,
} = userSlice.actions;
