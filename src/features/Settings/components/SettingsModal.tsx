import {
	DatabaseIcon,
	InfoIcon,
	PaletteIcon,
	SparkleIcon,
} from "@phosphor-icons/react";
import SectionedModal, {
	ModalSection,
} from "../../../components/AppModal/SectionedModal";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { closeSettingsModal } from "../../../stores/app/appReducer";
import { selectIsSettingsModalOpened } from "../../../stores/app/appSelectors";
import AppearanceTab from "./AppearanceTab";
import DataTab from "./DataTab";
import AboutTab from "./AboutTab";
import AiTab from "./AiTab";

const SECTIONS: ModalSection[] = [
	{
		value: "appearance",
		label: "Appearance",
		icon: <PaletteIcon />,
		render: () => <AppearanceTab />,
	},
	{
		value: "data",
		label: "Data",
		icon: <DatabaseIcon />,
		render: () => <DataTab />,
	},
	{
		value: "ai",
		label: "AI",
		icon: <SparkleIcon />,
		render: () => <AiTab />,
	},
	{
		value: "about",
		label: "About",
		icon: <InfoIcon />,
		render: () => <AboutTab />,
	},
];

function SettingsModal() {
	const opened = useAppSelector(selectIsSettingsModalOpened);
	const dispatch = useAppDispatch();

	return (
		<SectionedModal
			opened={opened}
			onClose={() => dispatch(closeSettingsModal())}
			title="Settings"
			navAriaLabel="Open settings navigation"
			sections={SECTIONS}
			size="lg"
		/>
	);
}

export default SettingsModal;
