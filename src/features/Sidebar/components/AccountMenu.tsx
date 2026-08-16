import { Button, Group, Menu, Text } from "@mantine/core";
import {
	CaretDownIcon,
	SignInIcon,
	SignOutIcon,
	UserCircleGearIcon,
	UserCircleIcon,
	UserPlusIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { CommandMenuItem } from "../../../commands/CommandMenuItem";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { openAuthModal } from "../../../stores/app/appReducer";
import { signOut } from "../../../stores/user/userActions";
import {
	selectIsSignedIn,
	selectUserInformation,
} from "../../../stores/user/userSelectors";

// TODO: when signed in show user full name
function AccountMenu() {
	const isSignedIn = useAppSelector(selectIsSignedIn);
	const userInformation = useAppSelector(selectUserInformation);
	const dispatch = useAppDispatch();
	const navigate = useNavigate();

	return (
		<Menu position="bottom-start" shadow="md" withinPortal width={220}>
			<Menu.Target>
				<Button
					variant="subtle"
					color="gray"
					fullWidth
					justify="flex-start"
					leftSection={<UserCircleIcon size={18} />}>
					<Group gap={4} wrap="nowrap" miw={0}>
						<Text truncate="end">
							{isSignedIn && userInformation
								? userInformation.username
								: "Sign in"}
						</Text>
						<CaretDownIcon size={12} />
					</Group>
				</Button>
			</Menu.Target>
			<Menu.Dropdown>
				{isSignedIn ? (
					<>
						<Menu.Item
							leftSection={<UserCircleGearIcon size={16} />}>
							Manage account
						</Menu.Item>
						<Menu.Item
							color="red"
							leftSection={<SignOutIcon size={16} />}
							onClick={() => void dispatch(signOut(navigate))}>
							Sign out
						</Menu.Item>
						<Menu.Divider />
						<CommandMenuItem id="open-settings">
							Settings
						</CommandMenuItem>
					</>
				) : (
					<>
						<Menu.Item
							leftSection={<SignInIcon size={16} />}
							onClick={() => dispatch(openAuthModal("sign-in"))}>
							Sign in
						</Menu.Item>
						<Menu.Item
							leftSection={<UserPlusIcon size={16} />}
							onClick={() => dispatch(openAuthModal("sign-up"))}>
							Sign up
						</Menu.Item>
						<Menu.Divider />
						<CommandMenuItem id="open-settings">
							Settings
						</CommandMenuItem>
					</>
				)}
			</Menu.Dropdown>
		</Menu>
	);
}

export default AccountMenu;
