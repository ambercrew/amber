import { Alert, Button, Group, PasswordInput, Stack } from "@mantine/core";
import { useForm } from "@mantine/form";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import useApi from "../../../hooks/useApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import { updateUserPassword } from "../../../stores/user/userActions";

const PASSWORD_MIN_LENGTH = 8;

interface PasswordFormValues {
	oldPassword: string;
	newPassword: string;
	confirmPassword: string;
}

function validatePassword(value: string) {
	return value.length >= PASSWORD_MIN_LENGTH
		? null
		: `Must be at least ${PASSWORD_MIN_LENGTH} characters`;
}

function PasswordTab() {
	const dispatch = useAppDispatch();
	const { callApi, isSendingRequest, errorMessage } = useApi();
	const [success, setSuccess] = useState(false);

	const form = useForm<PasswordFormValues>({
		initialValues: {
			oldPassword: "",
			newPassword: "",
			confirmPassword: "",
		},
		validate: {
			oldPassword: value => (value.length === 0 ? "Required" : null),
			newPassword: validatePassword,
			confirmPassword: (value, values) =>
				value === values.newPassword ? null : "Passwords do not match",
		},
	});

	async function handleSubmit(values: PasswordFormValues) {
		setSuccess(false);
		await callApi(async () => {
			await dispatch(
				updateUserPassword(values.oldPassword, values.newPassword),
			);
			form.reset();
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
				{success && <Alert color="green">Password updated.</Alert>}
				<PasswordInput
					label="Current password"
					{...form.getInputProps("oldPassword")}
				/>
				<PasswordInput
					label="New password"
					{...form.getInputProps("newPassword")}
				/>
				<PasswordInput
					label="Confirm new password"
					{...form.getInputProps("confirmPassword")}
				/>
				<Group justify="flex-end">
					<Button type="submit" loading={isSendingRequest}>
						Update password
					</Button>
				</Group>
			</Stack>
		</form>
	);
}

export default PasswordTab;
