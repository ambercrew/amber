import Updater from "../../Updater/components/Updater";
import CommandPalette from "../../../commands/CommandPalette";
import ImageLightbox from "../../../components/ImageLightbox/ImageLightbox";
import ImportModal from "../../Import/components/ImportModal";
import StudyProfileModal from "../../Study/components/StudyProfileModal";
import SettingsModal from "../../Settings/components/SettingsModal";
import AnkiSyncReviewModal from "../../AnkiSync/components/AnkiSyncReviewModal";
import PriorityModal from "../../Aside/components/PriorityModal";
import DueDateModal from "../../Aside/components/DueDateModal";
import AiPromptLibraryModal from "../../Ai/components/AiPromptLibraryModal";
import StudySessionSettingsModal from "../../Study/components/StudySessionSettingsModal";
import AuthModal from "../../Auth/components/AuthModal";
import VerifyEmailModal from "../../Auth/components/VerifyEmailModal";
import ManageAccountModal from "../../Auth/components/ManageAccountModal";
import SyncingModal from "../../Sidebar/components/SyncingModal";
import ShortcutsModal from "./ShortcutsModal";
import { isMobile } from "../../../utils/tauriUtils";

/** Everything app-wide that overlays the page: the command palette, the lightbox and the modals, each opened from Redux. */
export default function AppModals() {
	return (
		<>
			{!isMobile() && <Updater />}
			<CommandPalette />
			<ImageLightbox />
			<ImportModal />
			<StudyProfileModal />
			<SettingsModal />
			<AnkiSyncReviewModal />
			<PriorityModal />
			<DueDateModal />
			<ShortcutsModal />
			<AiPromptLibraryModal />
			<StudySessionSettingsModal />
			<AuthModal />
			<VerifyEmailModal />
			<ManageAccountModal />
			<SyncingModal />
		</>
	);
}
