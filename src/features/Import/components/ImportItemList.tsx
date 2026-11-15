import { ReactNode } from "react";
import {
	Anchor,
	Box,
	CloseButton,
	Group,
	SegmentedControl,
	Stack,
	Text,
} from "@mantine/core";
import {
	BookOpenIcon,
	CardsIcon,
	FileDocIcon,
	FileHtmlIcon,
	FileIcon,
	FileMdIcon,
	FilePdfIcon,
	FileTextIcon,
	LinkIcon,
	PlusIcon,
	TextAlignLeftIcon,
	type Icon,
} from "@phosphor-icons/react";
import {
	describeItem,
	ImportItem,
	ImportItemError,
	isPdfItem,
} from "../importItems";
import { SUPPORTED_FORMATS_ANY } from "../fileFormats";
import { FileFormat } from "../fileFormat";
import { pdfFormat } from "../pdf/format";
import { epubFormat } from "../epub/format";
import { docxFormat } from "../docx/format";
import { ankiFormat } from "../anki/format";
import { markdownFormat } from "../markdown/format";
import { htmlFormat } from "../html/format";
import { textFormat } from "../text/format";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";

const BORDER = "1px solid var(--mantine-color-default-border)";
const ICON_SIZE = 18;

const FORMAT_ICONS = new Map<FileFormat, Icon>([
	[pdfFormat, FilePdfIcon],
	[epubFormat, BookOpenIcon],
	[docxFormat, FileDocIcon],
	[ankiFormat, CardsIcon],
	[markdownFormat, FileMdIcon],
	[htmlFormat, FileHtmlIcon],
	[textFormat, FileTextIcon],
]);

const PDF_MODES = [
	{ value: "extract", label: "Extract text" },
	{ value: "pdf", label: "Keep as PDF" },
];

function itemIcon(item: ImportItem): ReactNode {
	switch (item.kind) {
		case "file": {
			const FormatIcon =
				(item.format && FORMAT_ICONS.get(item.format)) ?? FileIcon;
			return <FormatIcon size={ICON_SIZE} />;
		}
		case "url":
		case "raw":
			return <LinkIcon size={ICON_SIZE} />;
		case "content":
			return <TextAlignLeftIcon size={ICON_SIZE} />;
	}
}

interface ImportItemListProps {
	items: ImportItem[];
	/** The item that stopped the last import, shown on its row. */
	error: (ImportItemError & { key: string }) | null;
	onRemove: (key: string) => void;
	onExtractPdfChange: (key: string, extract: boolean) => void;
	onImportRawPage: (key: string) => void;
	onBrowse: () => void;
	/** The field for adding another link or pasted content. */
	addInput: ReactNode;
}

/** The staged imports, one row each, ending in a row for adding more. */
function ImportItemList({
	items,
	error,
	onRemove,
	onExtractPdfChange,
	onImportRawPage,
	onBrowse,
	addInput,
}: ImportItemListProps) {
	return (
		<Box bd={BORDER} style={{ borderRadius: "var(--mantine-radius-sm)" }}>
			{items.map(item => {
				const { title, subtitle } = describeItem(item);
				const itemError = error?.key === item.key ? error : null;
				return (
					<Group
						key={item.key}
						wrap="nowrap"
						gap="sm"
						px="sm"
						py="xs"
						style={{ borderBottom: BORDER }}>
						<Box
							c="dimmed"
							style={{ flexShrink: 0, display: "flex" }}>
							{itemIcon(item)}
						</Box>
						<Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
							<Text size="sm" fw={500} truncate>
								{title}
							</Text>
							{itemError ? (
								<Text size="xs" c="red">
									{itemError.message}
									{itemError.rawPage && (
										<>
											{" "}
											<Anchor
												size="xs"
												component="button"
												type="button"
												onClick={() =>
													onImportRawPage(item.key)
												}>
												Import raw page
											</Anchor>
										</>
									)}
								</Text>
							) : (
								<Text size="xs" c="dimmed" truncate>
									{subtitle}
								</Text>
							)}
						</Stack>
						{item.kind === "file" && isPdfItem(item) && (
							<SegmentedControl
								size="xs"
								data={PDF_MODES}
								value={item.extractPdf ? "extract" : "pdf"}
								aria-label={`How to import ${item.file.name}`}
								onChange={mode =>
									onExtractPdfChange(
										item.key,
										mode === "extract",
									)
								}
								style={{ flexShrink: 0 }}
							/>
						)}
						<CloseButton
							size="sm"
							aria-label={`Remove ${title}`}
							onClick={() => onRemove(item.key)}
						/>
					</Group>
				);
			})}
			<Group wrap="nowrap" gap="sm" px="sm" py={4}>
				<Box c="dimmed" style={{ flexShrink: 0, display: "flex" }}>
					<PlusIcon size={ICON_SIZE} />
				</Box>
				<Box style={{ flex: 1, minWidth: 0 }}>{addInput}</Box>
				<Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
					<Text span size="xs" visibleFrom="xs">
						or drop more files —{" "}
					</Text>
					<AppTooltip label={`${SUPPORTED_FORMATS_ANY} files`}>
						<Anchor
							size="xs"
							component="button"
							type="button"
							onClick={onBrowse}>
							browse
						</Anchor>
					</AppTooltip>
				</Text>
			</Group>
		</Box>
	);
}

export default ImportItemList;
