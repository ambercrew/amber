import { ReactNode, useMemo, useState } from "react";
import { Text } from "@mantine/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LinkOpenerContext } from "./linkOpenerContext";
import ConfirmModal from "../../../AppModal/ConfirmModal";

/**
 * Owns the confirmation modal shown before a link leaves the app, so every way
 * of opening one (ctrl/cmd+click, the right-click menu) behaves identically.
 */
export function LinkOpenerProvider({ children }: { children: ReactNode }) {
	const [pendingUrl, setPendingUrl] = useState<string | null>(null);
	const value = useMemo(() => ({ openLink: setPendingUrl }), []);

	return (
		<LinkOpenerContext.Provider value={value}>
			{children}
			<ConfirmModal
				opened={pendingUrl !== null}
				title="Open link"
				confirmLabel="Open"
				onConfirm={() => {
					if (pendingUrl) void openUrl(pendingUrl);
				}}
				onClose={() => setPendingUrl(null)}>
				<Text style={{ overflowWrap: "break-word" }}>{pendingUrl}</Text>
			</ConfirmModal>
		</LinkOpenerContext.Provider>
	);
}
