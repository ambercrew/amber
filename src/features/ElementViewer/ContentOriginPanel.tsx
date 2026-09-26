import { useNavigate } from "react-router";
import {
	Anchor,
	Collapse,
	Divider,
	Fieldset,
	Group,
	Stack,
	Text,
	UnstyledButton,
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { MetaResponseDto } from "../../api/elements/dto/anyElementDto";
import useAppSelector from "../../hooks/useAppSelector";
import { selectCurrentElementDetails } from "../../stores/elementDetails/elementDetailsSelectors";
import { paths } from "../../paths";
import ElementNodeIcon from "../../components/ElementNodeIcon/ElementNodeIcon";

interface ContentOriginPanelProps {
	meta: MetaResponseDto;
}

function OriginField({ label, value }: { label: string; value: string }) {
	return (
		<Stack gap={2}>
			<Text size="xs" c="dimmed" fw={500}>
				{label}
			</Text>
			<Text size="sm" style={{ overflowWrap: "anywhere" }}>
				{value}
			</Text>
		</Stack>
	);
}

export default function ContentOriginPanel({ meta }: ContentOriginPanelProps) {
	const { derivedFrom } = meta;
	const navigate = useNavigate();
	const [opened, setOpened] = useLocalStorage({
		key: "content-origin-panel.opened",
		defaultValue: false,
	});
	const details = useAppSelector(selectCurrentElementDetails);
	const bibliographicalSource = details?.bibliographicalSource ?? null;
	const derivedFromName = details?.derivedFromName ?? null;

	return (
		<Stack gap="lg" py="lg">
			<Divider variant="dashed" c="dimmed" />
			<Stack gap="sm">
				<UnstyledButton onClick={() => setOpened(o => !o)}>
					<Group gap={6}>
						{opened ? (
							<CaretDownIcon size={12} />
						) : (
							<CaretRightIcon size={12} />
						)}
						<Text size="xs" c="dimmed" tt="uppercase">
							Origin
						</Text>
					</Group>
				</UnstyledButton>
				<Collapse expanded={opened}>
					<Stack gap="md" pl="lg">
						<Fieldset legend="Derived from">
							<Stack gap={2}>
								<Text size="xs" c="dimmed" fw={500}>
									Element
								</Text>
								{derivedFrom ? (
									<Group gap={6} wrap="nowrap">
										<ElementNodeIcon
											type={derivedFrom.type}
											size={18}
										/>
										<Anchor
											size="sm"
											style={{ overflowWrap: "anywhere" }}
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
								) : (
									<Text size="sm">—</Text>
								)}
							</Stack>
						</Fieldset>
						<Fieldset legend="Bibliographical source">
							<Stack gap="md">
								<OriginField
									label="Title"
									value={bibliographicalSource?.title ?? "—"}
								/>
								<OriginField
									label="Authors"
									value={
										bibliographicalSource?.authors ?? "—"
									}
								/>
								<OriginField
									label="Publication date"
									value={
										bibliographicalSource?.publicationDate ??
										"—"
									}
								/>
								<OriginField
									label="Type"
									value={
										bibliographicalSource?.sourceType ?? "—"
									}
								/>
								<OriginField
									label="Location"
									value={
										bibliographicalSource?.location ?? "—"
									}
								/>
							</Stack>
						</Fieldset>
					</Stack>
				</Collapse>
			</Stack>
		</Stack>
	);
}
