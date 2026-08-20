use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProblemDetails {
    pub detail: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SignInDto {
    pub username: String,
    pub password: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserInformationDto {
    pub id: Uuid,
    pub username: String,
    pub first_name: String,
    pub last_name: String,
    pub email: String,
    pub is_email_verified: bool,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GoogleSignInDto {
    pub id_token: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SignInResponseDto {
    pub user: UserInformationDto,
    pub token: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SignUpDto {
    pub username: String,
    pub password: String,
    pub email: String,
    pub first_name: String,
    pub last_name: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserInformationDto {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VerifyEmailDto {
    pub email_verification_code: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePasswordDto {
    pub old_password: String,
    pub new_password: String,
}
