import {
	Alert,
	Anchor,
	Button,
	Checkbox,
	Divider,
	Stack,
	Tabs,
	TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { GoogleLogoIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import AppModal from "../../../components/AppModal/AppModal";
import useApi from "../../../hooks/useApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { closeAuthModal } from "../../../stores/app/appReducer";
import {
	selectAuthModalInitialTab,
	selectIsAuthModalOpened,
} from "../../../stores/app/appSelectors";
import {
	signIn,
	signInWithGoogle,
	signUp,
} from "../../../stores/user/userActions";

interface SignInFormValues {
	username: string;
	password: string;
}

interface SignUpFormValues {
	username: string;
	email: string;
	firstName: string;
	lastName: string;
	password: string;
	confirmPassword: string;
	agreedToTerms: boolean;
}

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 30;
const NAME_MAX_LENGTH = 50;
const EMAIL_MAX_LENGTH = 50;
const PASSWORD_MIN_LENGTH = 8;

const TERMS_AND_PRIVACY_URL =
	"https://github.com/ambercrew/amber/blob/main/docs/LEGAL.md";

function validateUsername(value: string) {
	if (value.trim().length === 0) return "Required";
	if (
		value.length < USERNAME_MIN_LENGTH ||
		value.length > USERNAME_MAX_LENGTH
	)
		return `Must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters`;
	return null;
}

function validateName(value: string) {
	if (value.trim().length === 0) return "Required";
	if (value.length > NAME_MAX_LENGTH)
		return `Must be ${NAME_MAX_LENGTH} characters or fewer`;
	return null;
}

function validateEmail(value: string) {
	if (value.trim().length === 0) return "Required";
	if (value.length > EMAIL_MAX_LENGTH)
		return `Must be ${EMAIL_MAX_LENGTH} characters or fewer`;
	return /^\S+@\S+\.\S+$/.test(value) ? null : "Invalid email";
}

function validatePassword(value: string) {
	return value.length >= PASSWORD_MIN_LENGTH
		? null
		: `Must be at least ${PASSWORD_MIN_LENGTH} characters`;
}

function SignInTab({ onSuccess }: { onSuccess: () => void }) {
	const navigate = useNavigate();
	const dispatch = useAppDispatch();
	const { callApi, isSendingRequest, errorMessage } = useApi();

	const form = useForm<SignInFormValues>({
		initialValues: { username: "", password: "" },
		validate: {
			username: validateUsername,
			password: validatePassword,
		},
	});

	async function handleSubmit(values: SignInFormValues) {
		await callApi(async () => {
			await dispatch(signIn(navigate, values.username, values.password));
			onSuccess();
		});
	}

	async function handleGoogleSignIn() {
		await callApi(async () => {
			await dispatch(signInWithGoogle(navigate));
			onSuccess();
		});
	}

	return (
		<form onSubmit={form.onSubmit(values => void handleSubmit(values))}>
			<Stack gap="sm" mt="md">
				{errorMessage && (
					<Alert color="red" icon={<WarningCircleIcon />}>
						{errorMessage}
					</Alert>
				)}
				<TextInput
					label="Username"
					maxLength={USERNAME_MAX_LENGTH}
					{...form.getInputProps("username")}
				/>
				<TextInput
					label="Password"
					type="password"
					{...form.getInputProps("password")}
				/>
				<Button
					type="submit"
					loading={isSendingRequest}
					fullWidth
					mt="xs">
					Sign in
				</Button>
				<Divider label="or" labelPosition="center" />
				<Button
					type="button"
					variant="default"
					leftSection={<GoogleLogoIcon />}
					loading={isSendingRequest}
					onClick={() => void handleGoogleSignIn()}
					fullWidth>
					Continue with Google
				</Button>
			</Stack>
		</form>
	);
}

function SignUpTab({ onSuccess }: { onSuccess: () => void }) {
	const navigate = useNavigate();
	const dispatch = useAppDispatch();
	const { callApi, isSendingRequest, errorMessage } = useApi();

	const form = useForm<SignUpFormValues>({
		initialValues: {
			username: "",
			email: "",
			firstName: "",
			lastName: "",
			password: "",
			confirmPassword: "",
			agreedToTerms: false,
		},
		validate: {
			username: validateUsername,
			email: validateEmail,
			firstName: validateName,
			lastName: validateName,
			password: validatePassword,
			confirmPassword: (value, values) =>
				value === values.password ? null : "Passwords do not match",
			agreedToTerms: value =>
				value ? null : "You must agree to the Terms & Privacy",
		},
	});

	async function handleSubmit(values: SignUpFormValues) {
		await callApi(async () => {
			const { username, email, firstName, lastName, password } = values;
			await dispatch(
				signUp(navigate, {
					username,
					email,
					firstName,
					lastName,
					password,
				}),
			);
			onSuccess();
		});
	}

	async function handleGoogleSignIn() {
		await callApi(async () => {
			await dispatch(signInWithGoogle(navigate));
			onSuccess();
		});
	}

	return (
		<form onSubmit={form.onSubmit(values => void handleSubmit(values))}>
			<Stack gap="sm" mt="md">
				{errorMessage && (
					<Alert color="red" icon={<WarningCircleIcon />}>
						{errorMessage}
					</Alert>
				)}
				<TextInput
					label="Username"
					maxLength={USERNAME_MAX_LENGTH}
					{...form.getInputProps("username")}
				/>
				<TextInput
					label="Email"
					maxLength={EMAIL_MAX_LENGTH}
					{...form.getInputProps("email")}
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
				<TextInput
					label="Password"
					type="password"
					{...form.getInputProps("password")}
				/>
				<TextInput
					label="Confirm password"
					type="password"
					{...form.getInputProps("confirmPassword")}
				/>
				<Checkbox
					label={
						<>
							I agree to the{" "}
							<Anchor
								href={TERMS_AND_PRIVACY_URL || undefined}
								target="_blank"
								rel="noopener noreferrer"
								onClick={e => {
									if (!TERMS_AND_PRIVACY_URL)
										e.preventDefault();
								}}>
								Terms &amp; Privacy
							</Anchor>
						</>
					}
					{...form.getInputProps("agreedToTerms", {
						type: "checkbox",
					})}
				/>
				<Button
					type="submit"
					loading={isSendingRequest}
					fullWidth
					mt="xs">
					Sign up
				</Button>
				<Divider label="or" labelPosition="center" />
				<Button
					type="button"
					variant="default"
					leftSection={<GoogleLogoIcon />}
					loading={isSendingRequest}
					onClick={() => void handleGoogleSignIn()}
					fullWidth>
					Continue with Google
				</Button>
			</Stack>
		</form>
	);
}

function AuthModal() {
	const opened = useAppSelector(selectIsAuthModalOpened);
	const initialTab = useAppSelector(selectAuthModalInitialTab);
	const dispatch = useAppDispatch();

	function handleClose() {
		dispatch(closeAuthModal());
	}

	return (
		<AppModal
			opened={opened}
			onClose={handleClose}
			title="Account"
			fullScreenOnSmallScreen
			size="sm">
			{/* Remounted (and thus reset to `initialTab`) each time the modal
			 * opens, since `opened` flips false in between opens. */}
			<Tabs key={`${opened}-${initialTab}`} defaultValue={initialTab}>
				<Tabs.List grow>
					<Tabs.Tab value="sign-in">Sign in</Tabs.Tab>
					<Tabs.Tab value="sign-up">Sign up</Tabs.Tab>
				</Tabs.List>
				<Tabs.Panel value="sign-in">
					<SignInTab onSuccess={handleClose} />
				</Tabs.Panel>
				<Tabs.Panel value="sign-up">
					<SignUpTab onSuccess={handleClose} />
				</Tabs.Panel>
			</Tabs>
		</AppModal>
	);
}

export default AuthModal;
