import { Alert, Button, Group, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import useApi from "../../../hooks/useApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { updateUserInformation } from "../../../stores/user/userActions";
import { selectUserInformation } from "../../../stores/user/userSelectors";

const NAME_MAX_LENGTH = 50;

interface ProfileFormValues {
	firstName: string;
	lastName: string;
}

function validateName(value: string) {
	if (value.trim().length === 0) return "Required";
	if (value.length > NAME_MAX_LENGTH)
		return `Must be ${NAME_MAX_LENGTH} characters or fewer`;
	return null;
}

function ProfileTab() {
	const userInformation = useAppSelector(selectUserInformation);
	const dispatch = useAppDispatch();
	const { callApi, isSendingRequest, errorMessage } = useApi();
	const [success, setSuccess] = useState(false);

	const form = useForm<ProfileFormValues>({
		initialValues: {
			firstName: userInformation?.firstName ?? "",
			lastName: userInformation?.lastName ?? "",
		},
		validate: {
			firstName: validateName,
			lastName: validateName,
		},
	});

	async function handleSubmit(values: ProfileFormValues) {
		setSuccess(false);
		await callApi(async () => {
			await dispatch(
				updateUserInformation(values.firstName, values.lastName),
			);
			setSuccess(true);
		});
	}

	return (
		<form onSubmit={form.onSubmit(values => void handleSubmit(values))}>
			<Stack gap="sm" pt="md">
				{errorMessage && (
					<Alert color="red" icon={<WarningCircleIcon />}>
						{errorMessage}
					</Alert>
				)}
				{success && <Alert color="green">Profile updated.</Alert>}
				<TextInput
					label="Username"
					value={userInformation?.username ?? ""}
					variant="filled"
					readOnly
				/>
				<TextInput
					label="First name"
					maxLength={NAME_MAX_LENGTH}
					{...form.getInputProps("firstName")}
				/>
				<TextInput
					label="Last name"
					maxLength={NAME_MAX_LENGTH}
					{...form.getInputProps("lastName")}
				/>
				<Group justify="flex-end">
					<Button type="submit" loading={isSendingRequest}>
						Save changes
					</Button>
				</Group>
			</Stack>
		</form>
	);
}

export default ProfileTab;
