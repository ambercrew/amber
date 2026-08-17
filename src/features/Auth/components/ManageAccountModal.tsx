import { LockIcon, UserIcon, WarningIcon } from "@phosphor-icons/react";
import SectionedModal, {
	ModalSection,
} from "../../../components/AppModal/SectionedModal";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { closeManageAccountModal } from "../../../stores/app/appReducer";
import { selectIsManageAccountModalOpened } from "../../../stores/app/appSelectors";
import ProfileTab from "./ProfileTab";
import PasswordTab from "./PasswordTab";
import DangerZoneTab from "./DangerZoneTab";

const SECTIONS: ModalSection[] = [
	{
		value: "profile",
		label: "Profile",
		icon: <UserIcon />,
		render: () => <ProfileTab />,
	},
	{
		value: "password",
		label: "Password",
		icon: <LockIcon />,
		render: () => <PasswordTab />,
	},
	{
		value: "danger-zone",
		label: "Danger zone",
		icon: <WarningIcon />,
		render: () => <DangerZoneTab />,
	},
];

function ManageAccountModal() {
	const opened = useAppSelector(selectIsManageAccountModalOpened);
	const dispatch = useAppDispatch();

	return (
		<SectionedModal
			opened={opened}
			onClose={() => dispatch(closeManageAccountModal())}
			title="Manage account"
			navAriaLabel="Open account navigation"
			sections={SECTIONS}
			size="lg"
		/>
	);
}

export default ManageAccountModal;
