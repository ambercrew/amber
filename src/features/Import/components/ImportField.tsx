import { ReactNode } from "react";
import { Box, Group, Stack, Text } from "@mantine/core";

const LABEL_WIDTH = 96;

interface ImportFieldProps {
	label: string;
	/** Dimmed hint under the field. */
	description?: ReactNode;
	children: ReactNode;
}

/** One row of the import modal's form, labelled on its left. */
function ImportField({ label, description, children }: ImportFieldProps) {
	return (
		<Group align="flex-start" wrap="nowrap" gap="md">
			<Text
				size="sm"
				fw={500}
				w={LABEL_WIDTH}
				pt={7}
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
		</Group>
	);
}

export default ImportField;
