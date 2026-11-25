import {
	ClipboardEvent,
	KeyboardEvent,
	SyntheticEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { useNavigate } from "react-router";
import { useStore } from "react-redux";
import { notifications } from "@mantine/notifications";
import { Button, Loader, Progress, Stack, Text } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { ArrowsInSimpleIcon } from "@phosphor-icons/react";
import AppModal from "../../../components/AppModal/AppModal";
import AutosizeTextInput from "../../../components/AutosizeTextInput/AutosizeTextInput";
import ElementSelect from "../../../components/ElementSelect/ElementSelect";
import TagInput from "../../../components/TagInput/TagInput";
import useAppSelector from "../../../hooks/useAppSelector";
import useAppDispatch from "../../../hooks/useAppDispatch";
import { selectIsImportModalOpened } from "../../../stores/app/appSelectors";
import { selectCurrentElement } from "../../../stores/elements/elementsSelectors";
import {
	closeImportModal,
	openImportModal,
} from "../../../stores/app/appReducer";
import { RootState } from "../../../stores/store";
import { countNoun } from "../../../utils/countNoun";
import { ElementId } from "../../../types/elements/elementId";
import { ElementNodeType } from "../../../types/elements/elementNodeType";
import { asUrl, classifyPaste } from "../utils/classify";
import {
	FILE_FORMATS_ACCEPT,
	SUPPORTED_FORMATS_ALL,
} from "../utils/fileFormats";
import { PdfProgress } from "../pdf/extract";
import { ImportContext } from "../utils/importContext";
import { openImportedElement } from "../utils/openImportedElement";
import {
	addContent,
	addFiles,
	addUrl,
	ImportItem,
	ImportItemError,
	runImportItem,
} from "../utils/importItems";
import ImportPrioritySection from "./ImportPrioritySection";
import ImportItemList from "./ImportItemList";
import ImportFilePicker from "./ImportFilePicker";
import ImportField from "./ImportField";
import { useImportPriority } from "../hooks/useImportPriority";
import { useParentTags } from "../hooks/useParentTags";
import {
	applyTagEdits,
	NO_TAG_EDITS,
	TagEdits,
	tagEditsBetween,
} from "../utils/tagEdits";
import ModalActions from "../../../components/AppModal/ModalActions";
import ImportNotificationMessage from "./ImportNotificationMessage";

// Dropzone turns off pointer events on its contents, so the form turns them back on. It and the
// Dropzone fill the body, so a full-screen modal's buttons reach its bottom.
const FORM_STYLE = {
	pointerEvents: "all" as const,
	flex: 1,
	display: "flex",
	flexDirection: "column" as const,
};
const DROPZONE_STYLES = {
	root: {
		border: "none",
		flex: 1,
		display: "flex",
		flexDirection: "column" as const,
	},
	inner: { flex: 1, display: "flex", flexDirection: "column" as const },
};

const PARENT_TYPES: ElementNodeType[] = ["folder", "learningAsset", "extract"];

const PROGRESS_NOTIFICATION_ID = "import-progress";

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

function progressText(label: string, progress?: PdfProgress): string {
	return progress ? `${label} ${progress.done}/${progress.total}` : label;
}

function ImportModal() {
	const opened = useAppSelector(selectIsImportModalOpened);
	const currentElement = useAppSelector(selectCurrentElement);
	const dispatch = useAppDispatch();
	const navigate = useNavigate();
	const store = useStore<RootState>();

	const [value, setValue] = useState("");
	const [items, setItems] = useState<ImportItem[]>([]);
	// The user's edits to the parent's tags, kept when the parent changes.
	const [tagEdits, setTagEdits] = useState<TagEdits>(NO_TAG_EDITS);
	// `undefined` until the user picks, so it follows the open element.
	const [pickedParent, setPickedParent] = useState<ElementId | null>();
	const [phase, setPhase] = useState<Phase>({ kind: "idle" });
	const parent =
		pickedParent === undefined
			? defaultParent(currentElement?.data.meta.elementId ?? null)
			: pickedParent;
	const priority = useImportPriority(opened, parent);
	const parentTags = useParentTags(opened ? parent : null);
	// `null` while the parent's tags load, so an import then lets the backend copy them.
	const tags = parentTags.tags && applyTagEdits(parentTags.tags, tagEdits);
	const openRef = useRef<() => void>(null);
	const cancelledRef = useRef(false);

	function reset() {
		setValue("");
		setItems([]);
		setTagEdits(NO_TAG_EDITS);
		setPickedParent(undefined);
		setPhase({ kind: "idle" });
		priority.reset();
	}

	// Read when the import ends, as the user may have closed or reopened the modal since it started.
	function isModalClosed() {
		return !selectIsImportModalOpened(store.getState());
	}

	function handleClose() {
		// Closing mid-import only hides the modal: the import goes on and reports in a notification.
		if (phase.kind !== "importing") {
			cancelledRef.current = true;
			reset();
		}
		dispatch(closeImportModal());
	}

	const showModal = () => dispatch(openImportModal());

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
			tags: tags ?? undefined,
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
				if (isModalClosed()) {
					notifications.show({
						color: "red",
						autoClose: false,
						message: (
							<ImportNotificationMessage
								text={`Import stopped: ${result.error.message}`}
								actionLabel="Show"
								onAction={showModal}
							/>
						),
					});
				} else if (lastCreated)
					await openImportedElement(dispatch, navigate, lastCreated);
				return;
			}
		}

		// A user who moved on isn't taken away from what they're doing; the notification offers the element.
		if (isModalClosed()) {
			const text = `Imported ${countNoun(toImport.length, "item")}.`;
			const opened = lastCreated;
			notifications.show({
				message: opened ? (
					<ImportNotificationMessage
						text={text}
						actionLabel="Open"
						onAction={() =>
							void openImportedElement(dispatch, navigate, opened)
						}
					/>
				) : (
					text
				),
			});
		} else if (lastCreated)
			await openImportedElement(dispatch, navigate, lastCreated);
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
	const backgroundProgress =
		!opened && phase.kind === "importing"
			? progressText(phase.label, phase.progress)
			: null;
	const isImportingInBackground = backgroundProgress !== null;

	// While the modal is closed, a notification stands in for its progress view.
	useEffect(() => {
		if (!isImportingInBackground) return;
		notifications.show({
			id: PROGRESS_NOTIFICATION_ID,
			loading: true,
			autoClose: false,
			withCloseButton: false,
			message: "",
		});
		return () => {
			notifications.hide(PROGRESS_NOTIFICATION_ID);
		};
	}, [isImportingInBackground]);

	useEffect(() => {
		if (backgroundProgress === null) return;
		notifications.update({
			id: PROGRESS_NOTIFICATION_ID,
			message: (
				<ImportNotificationMessage
					text={backgroundProgress}
					actionLabel="Show"
					onAction={() => dispatch(openImportModal())}
				/>
			),
		});
	}, [backgroundProgress, dispatch]);
	const inputError =
		phase.kind === "error" && phase.key === null
			? phase.error.message
			: null;
	const itemError =
		phase.kind === "error" && phase.key !== null
			? { key: phase.key, ...phase.error }
			: null;
	const count = items.length + (value.trim() ? 1 : 0);
	const tagCount = tags?.length ?? 0;

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
			fullScreenOnSmallScreen>
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
				styles={DROPZONE_STYLES}>
				{phase.kind === "importing" ? (
					<Stack align="center" gap="sm" py="md">
						<Loader size="sm" />
						<Text size="sm" c="dimmed">
							{progressText(phase.label, phase.progress)}
						</Text>
						<Text size="xs" c="dimmed" ta="center">
							You can close this and keep working; the import
							carries on.
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
					<form onSubmit={handleSubmit} style={FORM_STYLE}>
						<Stack gap="md" flex={1}>
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
									count > 1 && tagCount > 0
										? `Applied to all ${itemsLabel(count)}`
										: undefined
								}>
								<TagInput
									placeholder={
										tagCount > 0 ? undefined : "Add tag"
									}
									aria-label="Tags"
									value={tags ?? []}
									disabled={tags === null}
									error={parentTags.errorMessage}
									onChange={value =>
										setTagEdits(
											tagEditsBetween(
												parentTags.tags ?? [],
												value,
											),
										)
									}
								/>
							</ImportField>
							<ImportPrioritySection
								total={priority.total}
								position={priority.position}
								count={count}
								onPositionChange={priority.handlePositionChange}
							/>
							<ModalActions>
								<Button variant="default" onClick={handleClose}>
									Cancel
								</Button>
								<Button type="submit" disabled={count === 0}>
									{count > 1
										? `Import ${itemsLabel(count)}`
										: "Import"}
								</Button>
							</ModalActions>
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
