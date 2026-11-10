import { DatabaseIcon, InfoIcon, PaletteIcon } from "@phosphor-icons/react";
import { AiIcon, AnkiIcon } from "../../../config/icons";
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
import AnkiTab from "./AnkiTab";
import { isMobile } from "../../../utils/tauriUtils";

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
	// AnkiConnect only runs inside Anki desktop.
	...(isMobile()
		? []
		: [
				{
					value: "anki",
					label: "Anki",
					icon: <AnkiIcon />,
					render: () => <AnkiTab />,
				},
			]),
	{
		value: "ai",
		label: "AI",
		icon: <AiIcon />,
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
			size="xl"
		/>
	);
}

export default SettingsModal;
