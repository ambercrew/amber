import {
	Alert,
	Button,
	Group,
	Loader,
	PinInput,
	Stack,
	Text,
} from "@mantine/core";
import {
	CheckCircleIcon,
	EnvelopeIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { SubmitEvent, useEffect, useState } from "react";
import AppModal from "../../../components/AppModal/AppModal";
import useApi from "../../../hooks/useApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import {
	closeVerifyEmailModal,
	openVerifyEmailModal,
} from "../../../stores/app/appReducer";
import { selectIsVerifyEmailModalOpened } from "../../../stores/app/appSelectors";
import {
	resendEmailVerificationCode,
	verifyEmail,
} from "../../../stores/user/userActions";
import {
	selectIsSignedIn,
	selectUserInformation,
} from "../../../stores/user/userSelectors";

const VERIFICATION_CODE_LENGTH = 8;

function VerifyEmailModal() {
	const opened = useAppSelector(selectIsVerifyEmailModalOpened);
	const isSignedIn = useAppSelector(selectIsSignedIn);
	const userInformation = useAppSelector(selectUserInformation);
	const isEmailVerified = userInformation?.isEmailVerified;
	const dispatch = useAppDispatch();
	const { callApi, isSendingRequest, errorMessage, clearErrorMessage } =
		useApi();
	const [verificationCode, setVerificationCode] = useState("");
	const [resent, setResent] = useState(false);

	// TODO: add unit test
	useEffect(() => {
		if (isSignedIn && isEmailVerified === false) {
			dispatch(openVerifyEmailModal());
		}
	}, [dispatch, isSignedIn, isEmailVerified]);

	function handleClose() {
		if (isSendingRequest) return;
		setVerificationCode("");
		setResent(false);
		clearErrorMessage();
		dispatch(closeVerifyEmailModal());
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		await callApi(async () => {
			await dispatch(verifyEmail(verificationCode));
			handleClose();
		});
	}

	async function handleResend() {
		setResent(false);
		await callApi(async () => {
			await dispatch(resendEmailVerificationCode());
			setResent(true);
		});
	}

	return (
		<AppModal
			opened={opened}
			onClose={handleClose}
			title="Verify your email"
			closeOnEscape={!isSendingRequest}
			size="sm">
			<form onSubmit={event => void handleSubmit(event)}>
				<Stack gap="sm">
					<Group gap="xs" wrap="nowrap" align="flex-start">
						<EnvelopeIcon size={24} style={{ flexShrink: 0 }} />
						<Text size="sm">
							Enter the verification code we sent to{" "}
							<b>{userInformation?.email}</b>.
						</Text>
					</Group>
					<Text size="xs" c="dimmed">
						Can&apos;t find the email? Check your spam or junk
						folder.
					</Text>
					{errorMessage && (
						<Alert color="red" icon={<WarningCircleIcon />}>
							{errorMessage}
						</Alert>
					)}
					{resent && (
						<Alert color="blue" icon={<CheckCircleIcon />}>
							Verification code resent.
						</Alert>
					)}
					<Stack gap={4}>
						<PinInput
							length={VERIFICATION_CODE_LENGTH}
							value={verificationCode}
							onChange={setVerificationCode}
							autoFocus
						/>
					</Stack>
					{!resent && (
						<Button
							type="button"
							variant="subtle"
							size="xs"
							onClick={() => void handleResend()}
							loading={isSendingRequest}
							disabled={isSendingRequest}>
							Resend verification code
						</Button>
					)}
					{isSendingRequest ? (
						<Group justify="center">
							<Loader size="sm" />
						</Group>
					) : (
						<Group justify="flex-end">
							<Button
								type="button"
								variant="default"
								onClick={handleClose}>
								Close
							</Button>
							<Button type="submit">Verify</Button>
						</Group>
					)}
				</Stack>
			</form>
		</AppModal>
	);
}

export default VerifyEmailModal;
