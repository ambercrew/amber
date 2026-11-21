import { ReactNode } from "react";
import { Box, Flex, Stack, Text } from "@mantine/core";
import { useIsSmallScreen } from "../../../hooks/useIsSmallScreen";

const LABEL_WIDTH = 96;

interface ImportFieldProps {
	label: string;
	/** Dimmed hint under the field. */
	description?: ReactNode;
	children: ReactNode;
}

/** One row of the import modal's form, labelled on its left, or above it on a small screen. */
function ImportField({ label, description, children }: ImportFieldProps) {
	// Switches with the modal's full-screen layout, so the two never mix.
	const isSmallScreen = useIsSmallScreen();
	return (
		<Flex
			direction={isSmallScreen ? "column" : "row"}
			align={isSmallScreen ? "stretch" : "flex-start"}
			gap={isSmallScreen ? 4 : "md"}>
			<Text
				size="sm"
				fw={500}
				w={isSmallScreen ? "auto" : LABEL_WIDTH}
				pt={isSmallScreen ? 0 : 7}
				style={{ flexShrink: 0 }}>
				{label}
			</Text>
			<Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
				<Box>{children}</Box>
				{description && (
					<Text size="xs" c="dimmed">
						{description}
					</Text>
				)}
			</Stack>
		</Flex>
	);
}

export default ImportField;
