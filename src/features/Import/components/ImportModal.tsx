import { ClipboardEvent, SyntheticEvent, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
	ActionIcon,
	Anchor,
	Button,
	Group,
	Loader,
	Progress,
	Stack,
	Text,
} from "@mantine/core";
import { Dropzone, PDF_MIME_TYPE } from "@mantine/dropzone";
import { ArrowsInSimpleIcon, FileIcon, XIcon } from "@phosphor-icons/react";
import AppModal from "../../../components/AppModal/AppModal";
import AutosizeTextInput from "../../../components/AutosizeTextInput/AutosizeTextInput";
import useAppSelector from "../../../hooks/useAppSelector";
import useAppDispatch from "../../../hooks/useAppDispatch";
import errorToString from "../../../utils/errorToString";
import { selectIsImportModalOpened } from "../../../stores/app/appSelectors";
import { selectCurrentElement } from "../../../stores/elements/elementsSelectors";
import { closeImportModal } from "../../../stores/app/appReducer";
import { asUrl, classifyPaste } from "../classify";
import { PastedContent, runContentImport } from "../flows/content";
import { importRawPage, runUrlImport, UrlImportError } from "../flows/url";
import { FileImportError, runFileImport } from "../flows/file";
import { PdfProgress } from "../pdf/extract";
import { ImportContext } from "../importContext";

const CLICKABLE_STYLE = { pointerEvents: "all" as const };

type Phase =
	| { kind: "idle" }
	| { kind: "importing"; label: string; progress?: PdfProgress }
	| { kind: "error"; message: string; rawHtml?: string; sourceUrl?: string };

function describeError(error: UrlImportError | FileImportError): {
	message: string;
	rawHtml?: string;
	sourceUrl?: string;
} {
	switch (error.kind) {
		case "fetch-failed":
			return { message: error.message };
		case "no-article":
			return {
				message: "Couldn't extract an article from this page.",
				rawHtml: error.rawHtml,
				sourceUrl: error.sourceUrl,
			};
		case "unsupported-file":
			return {
				message: "Only PDF, EPUB, and Markdown files are supported.",
			};
		case "no-text-layer":
			return { message: "This PDF has no selectable text." };
		case "no-content":
			return { message: "This file has no readable content." };
		case "pdf-failed":
		case "epub-failed":
		case "markdown-failed":
			return { message: error.message };
	}
}

function ImportModal() {
	const opened = useAppSelector(selectIsImportModalOpened);
	const currentElement = useAppSelector(selectCurrentElement);
	const dispatch = useAppDispatch();
	const navigate = useNavigate();

	const [value, setValue] = useState("");
	const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
	const [phase, setPhase] = useState<Phase>({ kind: "idle" });
	const openRef = useRef<() => void>(null);
	const cancelledRef = useRef(false);

	function context(): ImportContext {
		return {
			dispatch,
			navigate,
			parent: currentElement?.data.meta.elementId ?? null,
		};
	}

	function reset() {
		setValue("");
		setPendingFiles(null);
		setPhase({ kind: "idle" });
	}

	function handleClose() {
		cancelledRef.current = true;
		reset();
		dispatch(closeImportModal());
	}

	function handleSuccess() {
		reset();
		dispatch(closeImportModal());
	}

	async function startUrlImport(url: string) {
		cancelledRef.current = false;
		setPhase({ kind: "importing", label: "Fetching…" });

		const error = await runUrlImport(url, context());
		if (cancelledRef.current) return;

		if (error) {
			setPhase({ kind: "error", ...describeError(error) });
			return;
		}

		handleSuccess();
	}

	async function startContentImport(input: PastedContent) {
		cancelledRef.current = false;
		setPhase({ kind: "importing", label: "Importing…" });

		try {
			await runContentImport(input, context());
			if (cancelledRef.current) return;
			handleSuccess();
		} catch (err) {
			if (cancelledRef.current) return;
			setPhase({ kind: "error", message: errorToString(err) });
		}
	}

	async function startFileImport(files: File[]) {
		cancelledRef.current = false;
		setPhase({ kind: "importing", label: "Extracting…" });

		const error = await runFileImport(files, context(), progress => {
			if (cancelledRef.current) return;
			setPhase({ kind: "importing", label: "Extracting…", progress });
		});
		if (cancelledRef.current) return;

		if (error) {
			setPhase({ kind: "error", ...describeError(error) });
			return;
		}

		handleSuccess();
	}

	async function startRawImport(rawHtml: string, sourceUrl: string) {
		cancelledRef.current = false;
		setPhase({ kind: "importing", label: "Importing…" });

		try {
			await importRawPage(rawHtml, sourceUrl, context());
			if (cancelledRef.current) return;
			handleSuccess();
		} catch (err) {
			if (cancelledRef.current) return;
			setPhase({ kind: "error", message: errorToString(err) });
		}
	}

	function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
		e.preventDefault();

		if (pendingFiles) {
			void startFileImport(pendingFiles);
			return;
		}

		const trimmed = value.trim();
		if (!trimmed) return;

		const url = asUrl(trimmed);
		if (url === null) {
			setPhase({ kind: "error", message: "Enter a link." });
			return;
		}

		void startUrlImport(url);
	}

	function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
		const input = classifyPaste(e.clipboardData);
		switch (input.kind) {
			case "url":
			case "ambiguous":
				return;
			case "file":
				e.preventDefault();
				setPendingFiles(input.files);
				return;
			case "content":
				e.preventDefault();
				void startContentImport(input);
		}
	}

	const isImporting = phase.kind === "importing";

	return (
		<AppModal
			opened={opened}
			onClose={handleClose}
			title="Import"
			size="md"
			withCloseButton={!isImporting}
			closeOnClickOutside={!isImporting}
			closeOnEscape={!isImporting}>
			<Dropzone
				accept={[
					...PDF_MIME_TYPE,
					"application/epub+zip",
					"text/markdown",
				]}
				activateOnClick={false}
				disabled={isImporting}
				openRef={openRef}
				onDrop={files => setPendingFiles(files)}
				onReject={() =>
					setPhase({
						kind: "error",
						message:
							"Only PDF, EPUB, and Markdown files are supported.",
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
					<form onSubmit={handleSubmit}>
						<Stack gap="xs">
							{pendingFiles ? (
								<Stack gap={4}>
									{pendingFiles.map((file, index) => (
										<Group
											key={`${file.name}-${index}`}
											justify="space-between"
											wrap="nowrap"
											px="sm"
											py="xs"
											gap="xs"
											bd="1px solid var(--mantine-color-default-border)"
											style={{
												...CLICKABLE_STYLE,
												borderRadius:
													"var(--mantine-radius-sm)",
											}}>
											<Group
												gap="xs"
												wrap="nowrap"
												miw={0}>
												<FileIcon size={16} />
												<Text size="sm" truncate>
													{file.name}
												</Text>
											</Group>
											<ActionIcon
												variant="subtle"
												color="gray"
												size="sm"
												aria-label={`Remove ${file.name}`}
												onClick={() =>
													setPendingFiles(prev =>
														prev && prev.length > 1
															? prev.filter(
																	(_, i) =>
																		i !==
																		index,
																)
															: null,
													)
												}>
												<XIcon size={14} />
											</ActionIcon>
										</Group>
									))}
								</Stack>
							) : (
								<AutosizeTextInput
									placeholder="Paste a link or content"
									data-autofocus
									value={value}
									onKeyDown={e => {
										// The field is a textarea, so Enter does
										// not submit implicitly.
										if (e.key === "Enter")
											e.currentTarget.form?.requestSubmit();
									}}
									error={
										phase.kind === "error"
											? phase.message
											: null
									}
									style={CLICKABLE_STYLE}
									onPaste={handlePaste}
									onChange={e => {
										setValue(e.currentTarget.value);
										setPhase({ kind: "idle" });
									}}
								/>
							)}
							{phase.kind === "error" &&
								phase.rawHtml &&
								phase.sourceUrl && (
									<Anchor
										size="sm"
										component="button"
										type="button"
										style={CLICKABLE_STYLE}
										onClick={() =>
											void startRawImport(
												phase.rawHtml!,
												phase.sourceUrl!,
											)
										}>
										Import raw page
									</Anchor>
								)}
							{!pendingFiles && (
								<Text size="sm" c="dimmed">
									or drop a PDF, EPUB, or Markdown file
									anywhere here —{" "}
									<Anchor
										size="sm"
										component="button"
										type="button"
										style={CLICKABLE_STYLE}
										onClick={() => openRef.current?.()}>
										browse
									</Anchor>
								</Text>
							)}
							<Group justify="flex-end">
								<Button
									type="submit"
									disabled={!pendingFiles && !value.trim()}
									style={CLICKABLE_STYLE}>
									Import
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
