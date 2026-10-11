import { useReducer, useState } from "react";
import {
	ActionIcon,
	Alert,
	Button,
	Center,
	ColorPicker,
	ColorSwatch,
	Divider,
	Group,
	Loader,
	Popover,
	Stack,
	Text,
	TextInput,
} from "@mantine/core";
import {
	ArrowClockwiseIcon,
	ArrowCounterClockwiseIcon,
	BoundingBoxIcon,
	CircleIcon,
	CursorIcon,
	RectangleIcon,
	SelectionSlashIcon,
	TextTIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import {
	createImageOcclusion,
	updateImageOcclusion,
} from "../../../api/imageOcclusion/api/imageOcclusionApi";
import { ImageOcclusionResponseDto } from "../../../api/imageOcclusion/dto/imageOcclusionResponseDto";
import { OcclusionMode } from "../../../api/imageOcclusion/dto/occlusionShape";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import { useAppHotkeys } from "../../../commands/useAppHotkeys";
import {
	OCCLUSION_BACKSPACE_DELETE_SHORTCUT,
	OCCLUSION_DELETE_SHORTCUT,
	OCCLUSION_REDO_SHORTCUT,
	OCCLUSION_UNDO_SHORTCUT,
	OCCLUSION_ELLIPSE_TOOL_SHORTCUT,
	OCCLUSION_GROUP_SHORTCUT,
	OCCLUSION_RECT_TOOL_SHORTCUT,
	OCCLUSION_SELECT_TOOL_SHORTCUT,
	OCCLUSION_TEXT_TOOL_SHORTCUT,
	OCCLUSION_UNGROUP_SHORTCUT,
} from "../../../config/shortcuts";
import useApi from "../../../hooks/useApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import { loadElementTree } from "../../../stores/elements/elementsActions";
import { ElementId } from "../../../types/elements/elementId";
import { invalidateImageOcclusion } from "../hooks/useImageOcclusion";
import { useLoadedImage } from "../hooks/useLoadedImage";
import { isMask, targetKeys } from "../utils/occlusionTargets";
import { toImageAssetId } from "../utils/toImageAssetId";
import { assetUrl, resolveImageSrc } from "../../../utils/assetUrl";
import OcclusionCanvas from "./OcclusionCanvas";
import {
	initialEditorState,
	occlusionEditorReducer,
	OcclusionTool,
} from "./occlusionEditorReducer";

export const DEFAULT_MASK_COLOR = "#ffeba2";

const COLOR_SWATCHES = [
	DEFAULT_MASK_COLOR,
	"#ff8787",
	"#ffa94d",
	"#8ce99a",
	"#74c0fc",
	"#b197fc",
	"#ffffff",
	"#212529",
];

const MODES: { label: string; value: OcclusionMode }[] = [
	{ label: "Hide all, guess one", value: "hideAllGuessOne" },
	{ label: "Hide one, guess one", value: "hideOneGuessOne" },
];

const TOOLS: {
	tool: OcclusionTool;
	label: string;
	shortcut: string;
	Icon: typeof CursorIcon;
}[] = [
	{
		tool: "select",
		label: "Select",
		shortcut: OCCLUSION_SELECT_TOOL_SHORTCUT,
		Icon: CursorIcon,
	},
	{
		tool: "rect",
		label: "Rectangle",
		shortcut: OCCLUSION_RECT_TOOL_SHORTCUT,
		Icon: RectangleIcon,
	},
	{
		tool: "ellipse",
		label: "Ellipse",
		shortcut: OCCLUSION_ELLIPSE_TOOL_SHORTCUT,
		Icon: CircleIcon,
	},
	{
		tool: "text",
		label: "Text label",
		shortcut: OCCLUSION_TEXT_TOOL_SHORTCUT,
		Icon: TextTIcon,
	},
];

export type OcclusionEditorTarget =
	| { kind: "create"; src: string; name: string; parent: ElementId }
	| { kind: "edit"; occlusion: ImageOcclusionResponseDto };

interface ImageOcclusionEditorProps {
	target: OcclusionEditorTarget;
	/** CSS height of the whole editor, matching the modal it fills. */
	height: string;
	onClose: () => void;
	onSaved?: (occlusionId: string) => void;
}

export default function ImageOcclusionEditor({
	target,
	height,
	onClose,
	onSaved,
}: ImageOcclusionEditorProps) {
	const dispatch = useAppDispatch();
	const { callApi, isSendingRequest, errorMessage } = useApi();
	const src =
		target.kind === "create"
			? resolveImageSrc(target.src)
			: assetUrl(target.occlusion.imageAssetId);
	const { image, failed } = useLoadedImage(src);

	const [state, dispatchEditor] = useReducer(
		occlusionEditorReducer,
		target,
		t => initialEditorState(t.kind === "edit" ? t.occlusion.shapes : []),
	);
	const [tool, setTool] = useState<OcclusionTool>("rect");
	const [color, setColor] = useState(DEFAULT_MASK_COLOR);
	const [savingMode, setSavingMode] = useState<OcclusionMode | null>(null);
	const [name, setName] = useState(
		target.kind === "create" ? target.name : target.occlusion.name,
	);

	const keys = targetKeys(state.shapes);
	const selected = state.shapes.filter(shape =>
		state.selectedIds.includes(shape.id),
	);
	const currentColor = selected[0] ? colorOf(selected[0]) : color;

	const [colorOpened, setColorOpened] = useState(false);

	const canGroup = selected.filter(isMask).length >= 2;
	const canUngroup = selected.some(shape => isMask(shape) && shape.groupId);

	const group = () =>
		canGroup &&
		dispatchEditor({ type: "group", groupId: crypto.randomUUID() });
	const ungroup = () => canUngroup && dispatchEditor({ type: "ungroup" });
	const deleteSelected = () => dispatchEditor({ type: "deleteSelected" });
	const undo = () =>
		state.past.length > 0 && dispatchEditor({ type: "undo" });
	const redo = () =>
		state.future.length > 0 && dispatchEditor({ type: "redo" });

	useAppHotkeys([
		[OCCLUSION_SELECT_TOOL_SHORTCUT, () => setTool("select")],
		[OCCLUSION_RECT_TOOL_SHORTCUT, () => setTool("rect")],
		[OCCLUSION_ELLIPSE_TOOL_SHORTCUT, () => setTool("ellipse")],
		[OCCLUSION_TEXT_TOOL_SHORTCUT, () => setTool("text")],
		[OCCLUSION_GROUP_SHORTCUT, group],
		[OCCLUSION_UNGROUP_SHORTCUT, ungroup],
		[OCCLUSION_DELETE_SHORTCUT, deleteSelected],
		[OCCLUSION_BACKSPACE_DELETE_SHORTCUT, deleteSelected],
		[OCCLUSION_UNDO_SHORTCUT, undo],
		[OCCLUSION_REDO_SHORTCUT, redo],
	]);

	const changeColor = (value: string) => {
		setColor(value);
		dispatchEditor({ type: "setColor", color: value });
	};

	// Editing down to no masks removes the occlusion, so there's no mode to pick.
	const removing = target.kind === "edit" && keys.length === 0;

	// Like Anki, the mode is picked by which button saves.
	const save = (mode: OcclusionMode) => {
		setSavingMode(mode);
		return callApi(async () => {
			if (!image) return;
			const occlusionId =
				target.kind === "create"
					? crypto.randomUUID()
					: target.occlusion.id;
			if (target.kind === "create") {
				await createImageOcclusion({
					id: occlusionId,
					meta: {
						name: name.trim() || "Image occlusion",
						parent: target.parent,
						origin: { type: "inherited" },
					},
					imageAssetId: await toImageAssetId(target.src),
					imageWidth: image.naturalWidth,
					imageHeight: image.naturalHeight,
					shapes: state.shapes,
					mode,
				});
			} else {
				await updateImageOcclusion({
					id: occlusionId,
					shapes: state.shapes,
					mode,
				});
				invalidateImageOcclusion(occlusionId);
			}
			// Bound before reloading the tree, which can remount the source editor and strand its node key.
			if (!removing) onSaved?.(occlusionId);
			await dispatch(loadElementTree());
			onClose();
		});
	};

	return (
		<Stack h={height} gap={0}>
			<Group px="sm" py="xs" gap="sm" wrap="nowrap">
				<AppTooltip label="Cards are named after it, numbered">
					<TextInput
						aria-label="Name"
						placeholder="Image occlusion"
						w={280}
						value={name}
						onChange={event => setName(event.currentTarget.value)}
						disabled={target.kind === "edit"}
					/>
				</AppTooltip>
				{keys.length === 0 && (
					<Text size="sm" c="dimmed" ml="auto" ta="right">
						{removing
							? "No masks left: removing trashes this occlusion's cards"
							: "Draw a rectangle or ellipse over each part to hide"}
					</Text>
				)}
			</Group>
			<Divider />
			<Group flex={1} gap={0} align="stretch" wrap="nowrap" mih={0}>
				<Stack p="xs" gap="sm">
					<ActionIcon.Group orientation="vertical">
						{TOOLS.map(({ tool: value, label, shortcut, Icon }) => (
							<AppTooltip
								key={value}
								label={label}
								shortcut={shortcut}
								position="right">
								<ActionIcon
									size="lg"
									variant={
										tool === value ? "filled" : "default"
									}
									aria-label={label}
									onClick={() => setTool(value)}>
									<Icon size={18} />
								</ActionIcon>
							</AppTooltip>
						))}
					</ActionIcon.Group>
					<ActionIcon.Group orientation="vertical">
						<AppTooltip
							label="Group into one card"
							shortcut={OCCLUSION_GROUP_SHORTCUT}
							position="right">
							<ActionIcon
								size="lg"
								variant="default"
								aria-label="Group"
								disabled={!canGroup}
								onClick={group}>
								<BoundingBoxIcon size={18} />
							</ActionIcon>
						</AppTooltip>
						<AppTooltip
							label="Ungroup"
							shortcut={OCCLUSION_UNGROUP_SHORTCUT}
							position="right">
							<ActionIcon
								size="lg"
								variant="default"
								aria-label="Ungroup"
								disabled={!canUngroup}
								onClick={ungroup}>
								<SelectionSlashIcon size={18} />
							</ActionIcon>
						</AppTooltip>
						<AppTooltip
							label="Delete"
							shortcut={OCCLUSION_DELETE_SHORTCUT}
							position="right">
							<ActionIcon
								size="lg"
								variant="default"
								aria-label="Delete"
								disabled={selected.length === 0}
								onClick={deleteSelected}>
								<TrashIcon size={18} />
							</ActionIcon>
						</AppTooltip>
					</ActionIcon.Group>
					<ActionIcon.Group orientation="vertical">
						<AppTooltip
							label="Undo"
							shortcut={OCCLUSION_UNDO_SHORTCUT}
							position="right">
							<ActionIcon
								size="lg"
								variant="default"
								aria-label="Undo"
								disabled={state.past.length === 0}
								onClick={undo}>
								<ArrowCounterClockwiseIcon size={18} />
							</ActionIcon>
						</AppTooltip>
						<AppTooltip
							label="Redo"
							shortcut={OCCLUSION_REDO_SHORTCUT}
							position="right">
							<ActionIcon
								size="lg"
								variant="default"
								aria-label="Redo"
								disabled={state.future.length === 0}
								onClick={redo}>
								<ArrowClockwiseIcon size={18} />
							</ActionIcon>
						</AppTooltip>
					</ActionIcon.Group>
					<Popover
						opened={colorOpened}
						onChange={setColorOpened}
						position="right-start"
						shadow="md"
						withArrow>
						<Popover.Target>
							<AppTooltip label="Color" position="right">
								<ActionIcon
									size="lg"
									variant={colorOpened ? "light" : "default"}
									aria-label="Color"
									onClick={() => setColorOpened(o => !o)}>
									<ColorSwatch
										color={currentColor}
										size={18}
									/>
								</ActionIcon>
							</AppTooltip>
						</Popover.Target>
						<Popover.Dropdown>
							<Stack gap="sm" w={240}>
								<ColorPicker
									// Remounted per selection so it shows the selected shape's color.
									key={selected[0]?.id ?? "default"}
									format="hex"
									fullWidth
									defaultValue={currentColor}
									onChangeEnd={changeColor}
									swatches={COLOR_SWATCHES}
									swatchesPerRow={8}
								/>
							</Stack>
						</Popover.Dropdown>
					</Popover>
				</Stack>
				<Divider orientation="vertical" />
				<Center
					flex={1}
					p="sm"
					miw={0}
					bg="var(--mantine-color-default-hover)">
					{failed ? (
						<Text c="red">Couldn&apos;t load the image.</Text>
					) : image ? (
						<OcclusionCanvas
							image={image}
							shapes={state.shapes}
							selectedIds={state.selectedIds}
							tool={tool}
							color={color}
							dispatch={dispatchEditor}
						/>
					) : (
						<Loader />
					)}
				</Center>
			</Group>
			<Divider />
			<Stack p="sm" gap="xs">
				{errorMessage && <Alert color="red" title={errorMessage} />}
				<Group gap="sm" justify="flex-end">
					<Button variant="default" onClick={onClose}>
						Cancel
					</Button>
					{removing ? (
						<Button
							color="red"
							onClick={() => void save(target.occlusion.mode)}
							loading={isSendingRequest}>
							Remove occlusion
						</Button>
					) : (
						MODES.map(({ label, value }) => (
							<Button
								key={value}
								// When editing, the occlusion's current mode is the primary action.
								variant={
									target.kind === "edit" &&
									target.occlusion.mode !== value
										? "default"
										: "filled"
								}
								onClick={() => void save(value)}
								loading={
									isSendingRequest && savingMode === value
								}
								disabled={
									!image ||
									keys.length === 0 ||
									isSendingRequest
								}>
								{label}
							</Button>
						))
					)}
				</Group>
			</Stack>
		</Stack>
	);
}

function colorOf(shape: ImageOcclusionResponseDto["shapes"][number]) {
	return isMask(shape) ? shape.fill : shape.color;
}
