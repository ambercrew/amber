import { useEffect, useState } from "react";
import { Badge, Button, Group, Stack, Text } from "@mantine/core";
import {
	BugIcon,
	DiscordLogoIcon,
	GithubLogoIcon,
	GlobeIcon,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getAppVersion } from "../../../utils/tauriUtils";

const WEBSITE_URL = "https://amberapp.dev/";
const GITHUB_URL = "https://github.com/ambercrew/amber";
const FEEDBACK_URL = "https://github.com/ambercrew/amber/issues/new";
const DISCORD_URL = "https://discord.gg/krb7uWTQjt";

function AboutTab() {
	const [version, setVersion] = useState<string | null>(null);

	useEffect(() => {
		void getAppVersion().then(setVersion);
	}, []);

	return (
		<Stack gap="lg" pt="md">
			<Group gap="xs">
				<Text fw={500} size="sm">
					Version
				</Text>
				<Badge variant="light">{version ?? "…"}</Badge>
			</Group>

			<Stack gap="xs">
				<Text size="sm">Feedback</Text>
				<Button
					variant="default"
					leftSection={<BugIcon />}
					onClick={() => void openUrl(FEEDBACK_URL)}>
					Send feedback
				</Button>
			</Stack>

			<Stack gap="xs">
				<Text fw={500} size="sm">
					Community
				</Text>
				<Group gap="sm">
					<Button
						variant="default"
						leftSection={<GlobeIcon />}
						onClick={() => void openUrl(WEBSITE_URL)}>
						Website
					</Button>
					<Button
						variant="default"
						leftSection={<DiscordLogoIcon />}
						onClick={() => void openUrl(DISCORD_URL)}>
						Discord
					</Button>
					<Button
						variant="default"
						leftSection={<GithubLogoIcon />}
						onClick={() => void openUrl(GITHUB_URL)}>
						GitHub
					</Button>
				</Group>
			</Stack>
		</Stack>
	);
}

export default AboutTab;
