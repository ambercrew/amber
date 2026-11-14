import { Badge, Group, Stack, Text, UnstyledButton } from "@mantine/core";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { FILE_FORMATS } from "../fileFormats";

interface ImportFilePickerProps {
	onBrowse: () => void;
}

/** Opens the file picker and lists the formats an import accepts. */
function ImportFilePicker({ onBrowse }: ImportFilePickerProps) {
	return (
		<UnstyledButton
			onClick={onBrowse}
			w="100%"
			p="md"
			style={{
				border: "1px dashed var(--mantine-color-default-border)",
				borderRadius: "var(--mantine-radius-sm)",
			}}>
			<Stack align="center" gap="xs">
				<UploadSimpleIcon
					size={24}
					color="var(--mantine-color-dimmed)"
				/>
				<Text size="sm" ta="center">
					<Text
						span
						size="sm"
						fw={500}
						c="var(--mantine-primary-color-light-color)">
						Choose files
					</Text>{" "}
					or drop them here
				</Text>
				<Group gap={4} justify="center">
					{FILE_FORMATS.map(format => (
						<Badge key={format.label} size="xs" variant="default">
							{format.label}
						</Badge>
					))}
				</Group>
			</Stack>
		</UnstyledButton>
	);
}

export default ImportFilePicker;
