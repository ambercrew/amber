import { invoke } from "@tauri-apps/api/core";
import { UserInformationDto } from "../dto/userInformationDto";
import SignUpRequestDto from "../dto/signUpRequestDto";

export function signIn(
	username: string,
	password: string,
): Promise<UserInformationDto> {
	return invoke("sign_in", {
		username,
		password,
	});
}

export function signInWithGoogle(): Promise<UserInformationDto> {
	return invoke("sign_in_with_google");
}

export function signUp(request: SignUpRequestDto): Promise<UserInformationDto> {
	return invoke("sign_up", {
		request,
	});
}

export function signOut(): Promise<boolean> {
	return invoke("sign_out");
}

export function isSignedIn(): Promise<boolean> {
	return invoke("is_signed_in");
}

export function verifyUserEmail(verificationCode: string): Promise<void> {
	return invoke("verify_user_email", { verificationCode });
}

export function resendEmailVerificationCode(): Promise<void> {
	return invoke("resend_email_verification_code");
}

export function updatePassword(
	oldPassword: string,
	newPassword: string,
): Promise<void> {
	return invoke("update_password", { oldPassword, newPassword });
}
