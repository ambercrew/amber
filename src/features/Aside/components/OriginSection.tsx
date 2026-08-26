import { useEffect } from "react";
import { useNavigate } from "react-router";
import {
	ActionIcon,
	Anchor,
	Box,
	Fieldset,
	Group,
	Select,
	Stack,
	Text,
} from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { TrashIcon, XIcon } from "@phosphor-icons/react";
import useApi from "../../../hooks/useApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import {
	BibliographicalSourceRequestDto,
	BibliographicalSourceResponseDto,
	BibliographicalSourceType,
} from "../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { ElementDetailsResponseDto } from "../../../api/elements/dto/elementDetailsDto";
import ElementNodeIcon from "../../App/components/ElementNodeIcon";
import { clearDerivedFromAction } from "../../../stores/elements/elementsActions";
import { loadElementDetailsAction } from "../../../stores/elementDetails/elementDetailsActions";
import {
	assignBibliographicalSourceAction,
	createBibliographicalSourceAction,
	deleteBibliographicalSourceAction,
	loadBibliographicalSourcesAction,
	updateBibliographicalSourceAction,
} from "../../../stores/bibliographicalSources/bibliographicalSourcesActions";
import { selectBibliographicalSources } from "../../../stores/bibliographicalSources/bibliographicalSourcesSelectors";
import { ElementId } from "../../../types/elements/elementId";
import { paths } from "../../../paths";
import AutosizeTextInput from "../../../components/AutosizeTextInput/AutosizeTextInput";
import InfoField from "./InfoField";
import InfoGroup from "./InfoGroup";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";

const NEW_VALUE = "__new__";

const SOURCE_TYPE_OPTIONS: {
	value: BibliographicalSourceType;
	label: string;
}[] = [
	{ value: "File", label: "File" },
	{ value: "WebPage", label: "Web page" },
];

function bibliographicalSourceRequestFrom(
	bibliographicalSource: BibliographicalSourceResponseDto,
): BibliographicalSourceRequestDto {
	return {
		title: bibliographicalSource.title,
		authors: bibliographicalSource.authors,
		publicationDate: bibliographicalSource.publicationDate,
		sourceType: bibliographicalSource.sourceType,
		location: bibliographicalSource.location,
	};
}

interface OriginSectionProps {
	elementId: ElementId;
	bibliographicalSourceId: string | null;
	derivedFrom: ElementId | null;
	details: ElementDetailsResponseDto | null;
}

function OriginSection({
	elementId,
	bibliographicalSourceId,
	derivedFrom,
	details,
}: OriginSectionProps) {
	const navigate = useNavigate();
	const dispatch = useAppDispatch();
	const { callApi } = useApi();
	const bibliographicalSources = useAppSelector(selectBibliographicalSources);
	const selectedBibliographicalSource =
		details?.bibliographicalSource ?? null;
	const derivedFromName = details?.derivedFromName ?? null;

	useEffect(() => {
		void dispatch(loadBibliographicalSourcesAction());
	}, [dispatch]);

	function refreshDetails() {
		return dispatch(loadElementDetailsAction(elementId));
	}

	function handleSourceChange(value: string | null) {
		void callApi(async () => {
			if (value === null) {
				await dispatch(
					assignBibliographicalSourceAction(elementId, null),
				);
				await refreshDetails();
				return;
			}
			if (value === NEW_VALUE) {
				const created = await dispatch(
					createBibliographicalSourceAction({
						title: "New source",
						authors: null,
						publicationDate: null,
						sourceType: "File",
						location: null,
					}),
				);
				await dispatch(
					assignBibliographicalSourceAction(elementId, created.id),
				);
				await refreshDetails();
				return;
			}
			await dispatch(assignBibliographicalSourceAction(elementId, value));
			await refreshDetails();
		});
	}

	const debouncedUpdateSource = useDebouncedCallback(
		(id: string, dto: BibliographicalSourceRequestDto) => {
			void callApi(async () => {
				await dispatch(updateBibliographicalSourceAction(id, dto));
				await refreshDetails();
			});
		},
		500,
	);

	function handleFieldChange<K extends keyof BibliographicalSourceRequestDto>(
		field: K,
		value: BibliographicalSourceRequestDto[K],
	) {
		if (!selectedBibliographicalSource) return;
		const dto: BibliographicalSourceRequestDto = {
			...bibliographicalSourceRequestFrom(selectedBibliographicalSource),
			[field]: value,
		};
		debouncedUpdateSource(selectedBibliographicalSource.id, dto);
	}

	function handleDeleteSource() {
		if (!selectedBibliographicalSource) return;
		modals.openConfirmModal({
			title: "Delete source",
			children: (
				<Text>
					Are you sure you want to delete &quot;
					{selectedBibliographicalSource.title}
					&quot;? This cannot be undone
					{selectedBibliographicalSource.elementCount > 0
						? ` and will unassign it from ${selectedBibliographicalSource.elementCount} element${selectedBibliographicalSource.elementCount === 1 ? "" : "s"}`
						: ""}
					.
				</Text>
			),
			labels: { confirm: "Delete", cancel: "Cancel" },
			confirmProps: { color: "red" },
			centered: true,
			onConfirm: () => {
				void callApi(async () => {
					await dispatch(
						deleteBibliographicalSourceAction(
							selectedBibliographicalSource.id,
						),
					);
					await refreshDetails();
				});
			},
		});
	}

	function handleClearDerivedFrom() {
		void callApi(async () => {
			await dispatch(clearDerivedFromAction(elementId));
			await refreshDetails();
		});
	}

	return (
		<InfoGroup title="Origin" storageKey="origin" defaultOpened={false}>
			<Fieldset legend="Derived from" p="xs">
				<InfoField label="Element">
					{derivedFrom ? (
						<Group justify="space-between" wrap="nowrap">
							<Group gap={6} wrap="nowrap">
								<Box style={{ flexShrink: 0, display: "flex" }}>
									<ElementNodeIcon
										type={derivedFrom.type}
										size={18}
									/>
								</Box>
								<Anchor
									size="sm"
									onClick={() => {
										void navigate(
											paths.element(
												derivedFrom.type,
												derivedFrom.id,
											),
										);
									}}>
									{derivedFromName ?? "…"}
								</Anchor>
							</Group>
							<AppTooltip label="Clear derived from">
								<ActionIcon
									variant="subtle"
									onClick={handleClearDerivedFrom}>
									<XIcon size={18} />
								</ActionIcon>
							</AppTooltip>
						</Group>
					) : (
						<Text size="sm" c="dimmed">
							—
						</Text>
					)}
				</InfoField>
			</Fieldset>

			<Fieldset legend="Bibliographical source" p="xs">
				<Stack gap="sm">
					<InfoField label="Source">
						<Group gap={4} wrap="nowrap">
							<Select
								size="sm"
								style={{ flex: 1 }}
								value={bibliographicalSourceId}
								clearable={bibliographicalSourceId !== null}
								searchable
								withAlignedLabels
								placeholder="None"
								data={[
									...bibliographicalSources.map(s => ({
										value: s.id,
										label: s.title || "Untitled source",
									})),
									{
										value: NEW_VALUE,
										label: "+ Create new source",
									},
								]}
								comboboxProps={{ floatingStrategy: "fixed" }}
								allowDeselect={false}
								onChange={handleSourceChange}
							/>
							<AppTooltip label="Delete source">
								<ActionIcon
									variant="subtle"
									color="red"
									onClick={handleDeleteSource}>
									<TrashIcon size={16} />
								</ActionIcon>
							</AppTooltip>
						</Group>
					</InfoField>

					{selectedBibliographicalSource && (
						<InfoField label="Used by">
							<Text size="sm">
								{selectedBibliographicalSource.elementCount}{" "}
								element
								{selectedBibliographicalSource.elementCount ===
								1
									? ""
									: "s"}
							</Text>
						</InfoField>
					)}

					{selectedBibliographicalSource && (
						<>
							<InfoField label="Title">
								<AutosizeTextInput
									key={`bibliographicalSource-title-${selectedBibliographicalSource.id}`}
									size="sm"
									defaultValue={
										selectedBibliographicalSource.title
									}
									onChange={e =>
										handleFieldChange(
											"title",
											e.currentTarget.value,
										)
									}
								/>
							</InfoField>
							<InfoField label="Authors">
								<AutosizeTextInput
									key={`bibliographicalSource-authors-${selectedBibliographicalSource.id}`}
									size="sm"
									defaultValue={
										selectedBibliographicalSource.authors ??
										""
									}
									onChange={e =>
										handleFieldChange(
											"authors",
											e.currentTarget.value || null,
										)
									}
								/>
							</InfoField>
							<InfoField label="Publication date">
								<AutosizeTextInput
									key={`bibliographicalSource-date-${selectedBibliographicalSource.id}`}
									size="sm"
									defaultValue={
										selectedBibliographicalSource.publicationDate ??
										""
									}
									onChange={e =>
										handleFieldChange(
											"publicationDate",
											e.currentTarget.value || null,
										)
									}
								/>
							</InfoField>
							<InfoField label="Type">
								<Select
									size="sm"
									allowDeselect={false}
									withAlignedLabels
									data={SOURCE_TYPE_OPTIONS}
									comboboxProps={{
										floatingStrategy: "fixed",
									}}
									value={
										selectedBibliographicalSource.sourceType
									}
									onChange={value =>
										value &&
										handleFieldChange(
											"sourceType",
											value as BibliographicalSourceType,
										)
									}
								/>
							</InfoField>
							<InfoField label="Location">
								<AutosizeTextInput
									key={`bibliographicalSource-location-${selectedBibliographicalSource.id}`}
									size="sm"
									defaultValue={
										selectedBibliographicalSource.location ??
										""
									}
									onChange={e =>
										handleFieldChange(
											"location",
											e.currentTarget.value || null,
										)
									}
								/>
							</InfoField>
						</>
					)}
				</Stack>
			</Fieldset>
		</InfoGroup>
	);
}

export default OriginSection;
