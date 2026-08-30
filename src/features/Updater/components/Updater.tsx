import { useEffect, useState } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Loader, Stack, Text } from "@mantine/core";
import AppModal from "../../../components/AppModal/AppModal";
import ConfirmModal from "../../../components/AppModal/ConfirmModal";
import { isStoreInstalled } from "../../../api/appInfo/api/appInfoApi";
import useApi from "../../../hooks/useApi";

function Updater() {
	const { callApi, errorMessage, clearErrorMessage } = useApi();

	const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
	const [isUpdating, setIsUpdating] = useState(false);
	const [isRestarting, setIsRestarting] = useState(false);
	const [updatePercentage, setUpdatePercentage] = useState("0");

	useEffect(() => {
		void (async () => {
			try {
				if (await isStoreInstalled()) return;

				const update = await check();
				if (!update) return;

				setPendingUpdate(update);
			} catch (e) {
				// Passive background check — don't interrupt the user over a
				// network hiccup or being offline. A real failure during an
				// install still surfaces via handleConfirm below.
				// eslint-disable-next-line no-console
				console.error(e);
			}
		})();
	}, []);

	async function installUpdate(update: Update) {
		setIsUpdating(true);

		let downloaded = 0;
		let contentLength = 0;
		await update.downloadAndInstall(event => {
			switch (event.event) {
				case "Started":
					contentLength = event.data.contentLength ?? 0;
					break;
				case "Progress":
					downloaded += event.data.chunkLength;
					setUpdatePercentage(
						((100 * downloaded) / contentLength).toFixed(1),
					);
					break;
				case "Finished":
					break;
			}
		});

		setIsRestarting(true);
		await new Promise(resolve => setTimeout(resolve, 2000));
		await relaunch();
	}

	function handleConfirm() {
		if (!pendingUpdate) return;
		void callApi(
			() => installUpdate(pendingUpdate),
			() => {
				setIsUpdating(false);
				return Promise.resolve();
			},
		);
	}

	return (
		<>
			<ConfirmModal
				opened={!!pendingUpdate}
				title="Update available"
				confirmLabel="Update"
				onConfirm={handleConfirm}
				onClose={() => setPendingUpdate(null)}>
				<Text>
					Do you want to update the application to the latest version?
				</Text>
			</ConfirmModal>

			<AppModal
				opened={isUpdating}
				onClose={() => {
					/* Empty */
				}}
				withCloseButton={false}
				closeOnClickOutside={false}
				closeOnEscape={false}>
				<Stack align="center">
					<Loader size="lg" />
					<Text>
						{isRestarting
							? "Restarting the application to install the update!"
							: `Updating the application (${updatePercentage}%), please wait...`}
					</Text>
				</Stack>
			</AppModal>

			<AppModal
				opened={!!errorMessage}
				onClose={clearErrorMessage}
				title="Update failed">
				<Text>{errorMessage}</Text>
			</AppModal>
		</>
	);
}

export default Updater;
