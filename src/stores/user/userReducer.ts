import { PayloadAction, createSlice } from "@reduxjs/toolkit";
import { UserInformationDto } from "../../api/backend/dto/userInformationDto";

export interface UserState {
	isSignedIn: boolean;
	/** True when signed in but the last refresh from the backend failed
	 * (e.g. no internet) — userInformation is then the last cached value,
	 * which may be stale. */
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
