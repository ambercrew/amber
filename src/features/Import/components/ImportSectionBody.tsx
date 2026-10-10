import { ReactNode } from "react";
import { Box } from "@mantine/core";

/** A slightly darker panel for an expanded import section's contents. */
function ImportSectionBody({ children }: { children: ReactNode }) {
	return (
		<Box
			p="sm"
			bg="var(--inset-surface-bg)"
			style={{ borderRadius: "var(--mantine-radius-sm)" }}>
			{children}
		</Box>
	);
}

export default ImportSectionBody;
