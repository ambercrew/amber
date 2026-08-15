import { useState } from "react";
import { Spotlight, spotlight } from "@mantine/spotlight";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import GlobalHotkeys from "./GlobalHotkeys";
import { useSpotlightActions } from "./useSpotlightActions";
import { SPOTLIGHT_SHORTCUT } from "./commands";
import useBackButtonPress from "../hooks/useBackButtonPress";
import { BackButtonPriority } from "../managers/backButtonManager";

function CommandPalette() {
	const { actions, refresh } = useSpotlightActions();
	const [opened, setOpened] = useState(false);

	// The palette covers the screen on mobile, so back has to dismiss it
	// rather than navigate.
	useBackButtonPress(spotlight.close, opened, BackButtonPriority.Medium);

	return (
		<>
			<GlobalHotkeys />
			<Spotlight
				actions={actions}
				onSpotlightOpen={() => {
					setOpened(true);
					refresh();
				}}
				onSpotlightClose={() => setOpened(false)}
				shortcut={SPOTLIGHT_SHORTCUT}
				overlayProps={{ blur: 0 }}
				nothingFound="No matching commands"
				searchProps={{
					leftSection: <MagnifyingGlassIcon size={18} />,
					placeholder: "Search commands...",
				}}
				tagsToIgnore={[]}
				triggerOnContentEditable
			/>
		</>
	);
}

export default CommandPalette;
