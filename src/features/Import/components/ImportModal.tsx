import {
	ClipboardEvent,
	KeyboardEvent,
	SyntheticEvent,
	useRef,
	useState,
} from "react";
import { useNavigate } from "react-router";
import {
	Button,
	Group,
	Loader,
	Progress,
	Stack,
	TagsInput,
	Text,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { ArrowsInSimpleIcon } from "@phosphor-icons/react";
import AppModal from "../../../components/AppModal/AppModal";
import AutosizeTextInput from "../../../components/AutosizeTextInput/AutosizeTextInput";
import ElementSelect from "../../../components/ElementSelect/ElementSelect";
import useAppSelector from "../../../hooks/useAppSelector";
import useAppDispatch from "../../../hooks/useAppDispatch";
import { selectIsImportModalOpened } from "../../../stores/app/appSelectors";
import { selectCurrentElement } from "../../../stores/elements/elementsSelectors";
import { closeImportModal } from "../../../stores/app/appReducer";
import { ElementId } from "../../../types/elements/elementId";
import { ElementNodeType } from "../../../types/elements/elementNodeType";
import { asUrl, classifyPaste } from "../classify";
import { FILE_FORMATS_ACCEPT, SUPPORTED_FORMATS_ALL } from "../fileFormats";
import { PdfProgress } from "../pdf/extract";
import { ImportContext } from "../importContext";
import { openImportedElement } from "../openImportedElement";
import {
	addContent,
	addFiles,
	addUrl,
	ImportItem,
	ImportItemError,
	runImportItem,
} from "../importItems";
import ImportPrioritySection from "./ImportPrioritySection";
import ImportItemList from "./ImportItemList";
import ImportFilePicker from "./ImportFilePicker";
import ImportField from "./ImportField";
import { useImportPriority } from "../hooks/useImportPriority";

// Dropzone turns off pointer events on its contents, so the form turns them back on.
const CLICKABLE_STYLE = { pointerEvents: "all" as const };

const PARENT_TYPES: ElementNodeType[] = ["folder", "learningAsset", "extract"];

type Phase =
	| { kind: "idle" }
	| {
			kind: "importing";
			label: string;
			progress?: PdfProgress;
	  }
	/** `key` is the item that failed; an error typing a link has none. */
	| { kind: "error"; key: string | null; error: ImportItemError };

function defaultParent(current: ElementId | null): ElementId | null {
	return current && PARENT_TYPES.includes(current.type) ? current : null;
}

function itemsLabel(count: number): string {
	return count === 1 ? "1 item" : `${count} items`;
}

function ImportModal() {
	const opened = useAppSelector(selectIsImportModalOpened);
	const currentElement = useAppSelector(selectCurrentElement);
	const dispatch = useAppDispatch();
	const navigate = useNavigate();

	const [value, setValue] = useState("");
	const [items, setItems] = useState<ImportItem[]>([]);
	const [tags, setTags] = useState<string[]>([]);
	// `undefined` until the user picks, so it follows the open element.
	const [pickedParent, setPickedParent] = useState<ElementId | null>();
	const [phase, setPhase] = useState<Phase>({ kind: "idle" });
	const parent =
		pickedParent === undefined
			? defaultParent(currentElement?.data.meta.elementId ?? null)
			: pickedParent;
	const priority = useImportPriority(opened, parent);
	const openRef = useRef<() => void>(null);
	const cancelledRef = useRef(false);

	function reset() {
		setValue("");
		setItems([]);
		setTags([]);
		setPickedParent(undefined);
		setPhase({ kind: "idle" });
		priority.reset();
	}

	function handleClose() {
		cancelledRef.current = true;
		reset();
		dispatch(closeImportModal());
	}

	function updateItems(update: (items: ImportItem[]) => ImportItem[]) {
		setItems(update);
		setPhase({ kind: "idle" });
	}

	/** Stages the typed link; resolves to the staged items, or `null` if the text isn't a link. */
	function stageTypedLink(): ImportItem[] | null {
		const trimmed = value.trim();
		if (!trimmed) return items;

		const url = asUrl(trimmed);
		if (url === null) {
			setPhase({
				kind: "error",
				key: null,
				error: { message: "Enter a link." },
			});
			return null;
		}

		const staged = addUrl(items, url);
		setItems(staged);
		setValue("");
		return staged;
	}

	async function importAll(toImport: ImportItem[]) {
		if (toImport.length === 0) return;
		cancelledRef.current = false;
		// Pinned, so opening an imported element doesn't move a retry's parent.
		setPickedParent(parent);

		const ctx: ImportContext = {
			dispatch,
			parent,
			priorityPosition: await priority.resolvePosition(),
			tags,
		};
		// Each element takes the next position, keeping the batch in order.
		let placed = 0;
		let lastCreated: ElementId | null = null;

		for (const [index, item] of toImport.entries()) {
			const label =
				toImport.length > 1
					? `Importing ${index + 1} of ${toImport.length}…`
					: "Importing…";
			setPhase({ kind: "importing", label });

			const result = await runImportItem(
				item,
				{ ...ctx, priorityPosition: ctx.priorityPosition + placed },
				progress => {
					if (cancelledRef.current) return;
					setPhase({ kind: "importing", label, progress });
				},
			);
			if (result.ok && result.created) {
				lastCreated = result.created;
				placed++;
			}
			if (cancelledRef.current) return;

			if (!result.ok) {
				// Keep only what's left, so a retry doesn't import anything twice.
				setItems(toImport.slice(index));
				setPhase({ kind: "error", key: item.key, error: result.error });
				if (placed > 0) priority.advance(ctx.priorityPosition, placed);
				if (lastCreated)
					await openImportedElement(navigate, lastCreated);
				return;
			}
		}

		if (lastCreated) await openImportedElement(navigate, lastCreated);
		reset();
		dispatch(closeImportModal());
	}

	function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
		e.preventDefault();
		const staged = stageTypedLink();
		if (staged) void importAll(staged);
	}

	function handleImportRawPage(key: string) {
		if (phase.kind !== "error" || !phase.error.rawPage) return;
		const { rawHtml, sourceUrl } = phase.error.rawPage;
		void importAll(
			items.map(item =>
				item.key === key
					? { kind: "raw", key, rawHtml, sourceUrl }
					: item,
			),
		);
	}

	function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key !== "Enter") return;
		// Enter stages a typed link, and imports once there's nothing left to stage.
		if (value.trim()) stageTypedLink();
		else e.currentTarget.form?.requestSubmit();
	}

	function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
		const input = classifyPaste(e.clipboardData);
		switch (input.kind) {
			case "ambiguous":
				return;
			case "file":
				// Staged here, so the Dropzone around the form doesn't stage them again.
				e.preventDefault();
				e.stopPropagation();
				updateItems(staged => addFiles(staged, input.files));
				return;
			case "url":
				e.preventDefault();
				updateItems(staged => addUrl(staged, input.url));
				return;
			case "content":
				e.preventDefault();
				updateItems(staged =>
					addContent(staged, input.html, input.text),
				);
		}
	}

	const isImporting = phase.kind === "importing";
	const inputError =
		phase.kind === "error" && phase.key === null
			? phase.error.message
			: null;
	const itemError =
		phase.kind === "error" && phase.key !== null
			? { key: phase.key, ...phase.error }
			: null;
	const count = items.length + (value.trim() ? 1 : 0);

	const input = (
		<AutosizeTextInput
			placeholder={
				items.length > 0
					? "Paste another link or content"
					: "Paste a link or content"
			}
			aria-label="Link or content"
			variant={items.length > 0 ? "unstyled" : "default"}
			data-autofocus
			value={value}
			error={inputError}
			onKeyDown={handleKeyDown}
			onPaste={handlePaste}
			onChange={e => {
				setValue(e.currentTarget.value);
				if (inputError) setPhase({ kind: "idle" });
			}}
		/>
	);

	return (
		<AppModal
			opened={opened}
			onClose={handleClose}
			title="Import"
			size="lg"
			withCloseButton={!isImporting}
			closeOnClickOutside={!isImporting}
			closeOnEscape={!isImporting}>
			<Dropzone
				accept={FILE_FORMATS_ACCEPT}
				activateOnClick={false}
				disabled={isImporting}
				openRef={openRef}
				onDrop={files => updateItems(staged => addFiles(staged, files))}
				onReject={() =>
					setPhase({
						kind: "error",
						key: null,
						error: {
							message: `Only ${SUPPORTED_FORMATS_ALL} files are supported.`,
						},
					})
				}
				p={0}
				style={{ border: "none" }}>
				{phase.kind === "importing" ? (
					<Stack align="center" gap="sm" py="md">
						<Loader size="sm" />
						<Text size="sm" c="dimmed">
							{phase.label}
							{phase.progress
								? ` ${phase.progress.done}/${phase.progress.total}`
								: ""}
						</Text>
						{phase.progress && (
							<Progress
								w="100%"
								value={
									(phase.progress.done /
										phase.progress.total) *
									100
								}
							/>
						)}
					</Stack>
				) : (
					<form onSubmit={handleSubmit} style={CLICKABLE_STYLE}>
						<Stack gap="md">
							{items.length > 0 ? (
								<ImportItemList
									items={items}
									error={itemError}
									onRemove={key =>
										updateItems(staged =>
											staged.filter(
												item => item.key !== key,
											),
										)
									}
									onExtractPdfChange={(key, extractPdf) =>
										updateItems(staged =>
											staged.map(item =>
												item.key === key &&
												item.kind === "file"
													? { ...item, extractPdf }
													: item,
											),
										)
									}
									onImportRawPage={handleImportRawPage}
									onBrowse={() => openRef.current?.()}
									addInput={input}
								/>
							) : (
								<Stack gap="xs">
									{input}
									<ImportFilePicker
										onBrowse={() => openRef.current?.()}
									/>
								</Stack>
							)}
							{items.length > 0 && inputError && (
								<Text size="sm" c="red">
									{inputError}
								</Text>
							)}
							<ImportField label="Import into">
								<ElementSelect
									value={parent}
									onChange={setPickedParent}
									types={PARENT_TYPES}
									placeholder="Top level"
									clearable
								/>
							</ImportField>
							<ImportField
								label="Tags"
								description={
									count > 1 && tags.length > 0
										? `Applied to all ${itemsLabel(count)}`
										: undefined
								}>
								<TagsInput
									placeholder={
										tags.length > 0 ? undefined : "Add tag"
									}
									aria-label="Tags"
									value={tags}
									onChange={setTags}
								/>
							</ImportField>
							<ImportPrioritySection
								total={priority.total}
								position={priority.position}
								count={count}
								onPositionChange={priority.handlePositionChange}
							/>
							<Group justify="flex-end" gap="sm">
								<Button variant="default" onClick={handleClose}>
									Cancel
								</Button>
								<Button type="submit" disabled={count === 0}>
									{count > 1
										? `Import ${itemsLabel(count)}`
										: "Import"}
								</Button>
							</Group>
						</Stack>
					</form>
				)}

				<Dropzone.Accept>
					<Stack
						align="center"
						justify="center"
						gap="xs"
						pos="absolute"
						top={0}
						left={0}
						right={0}
						bottom={0}
						style={{
							border: "2px dashed var(--mantine-primary-color-filled)",
							borderRadius: "var(--mantine-radius-md)",
							// Opaque so the form underneath is fully covered
							// while dragging.
							backgroundColor:
								"light-dark(var(--mantine-primary-color-0), var(--mantine-primary-color-9))",
						}}>
						<ArrowsInSimpleIcon
							size={28}
							color="var(--mantine-primary-color-light-color)"
						/>
						<Text
							fw={600}
							c="var(--mantine-primary-color-light-color)">
							Drop to import
						</Text>
					</Stack>
				</Dropzone.Accept>
			</Dropzone>
		</AppModal>
	);
}

export default ImportModal;
