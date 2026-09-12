import { useState } from "react";
import {
	Collapse,
	Group,
	Stack,
	Switch,
	Text,
	UnstyledButton,
} from "@mantine/core";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import FieldInfoIcon from "../../../components/FieldLabel/FieldInfoIcon";

interface ImportPdfExtractionSectionProps {
	isPdf: boolean;
	extract: boolean;
	onExtractChange: (extract: boolean) => void;
}

/** Collapsible "Import options" section for the import modal — currently only
 * holds the PDF extraction toggle, shown when the pending file is a PDF. */
function ImportPdfExtractionSection({
	isPdf,
	extract,
	onExtractChange,
}: ImportPdfExtractionSectionProps) {
	const [opened, setOpened] = useState(false);

	return (
		<Stack gap="xs">
			<UnstyledButton onClick={() => setOpened(o => !o)}>
				<Group gap="xs">
					{opened ? (
						<CaretDownIcon size={14} />
					) : (
						<CaretRightIcon size={14} />
					)}
					<Text size="sm" fw={600}>
						Import options
					</Text>
				</Group>
			</UnstyledButton>
			<Collapse expanded={opened}>
				{isPdf ? (
					<Group gap="xs">
						<Switch
							label="Extract content"
							checked={extract}
							onChange={e =>
								onExtractChange(e.currentTarget.checked)
							}
						/>
						<FieldInfoIcon tooltip="Converts the PDF's text into an editable document instead of a page-accurate PDF viewer. Only applies to PDF files." />
					</Group>
				) : (
					<Text size="sm" c="dimmed">
						No options for this file.
					</Text>
				)}
			</Collapse>
		</Stack>
	);
}

export default ImportPdfExtractionSection;
