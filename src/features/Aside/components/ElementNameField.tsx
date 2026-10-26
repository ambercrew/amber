import { Select, Stack } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import { setElementNameSource } from "../../../api/elements/api/elementsApi";
import AutosizeTextInput from "../../../components/AutosizeTextInput/AutosizeTextInput";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useOptimisticField from "../../../hooks/useOptimisticField";
import { renameElementAction } from "../../../stores/elements/elementsActions";
import { setElementNameSource as setStoredNameSource } from "../../../stores/elements/elementsReducer";
import { ElementId } from "../../../types/elements/elementId";
import { NameSource } from "../../../types/elements/nameSource";
import InfoField from "./InfoField";

const NAME_SOURCE_OPTIONS: { value: NameSource; label: string }[] = [
	{ value: "automatic", label: "Automatic" },
	{ value: "manual", label: "Manual" },
];

const NAME_SOURCE_TOOLTIP =
	"Automatic names follow the element's first few words. Choose Manual to type your own; renaming the element anywhere also makes it manual.";

interface ElementNameFieldProps {
	elementId: ElementId;
	name: string;
	nameSource: NameSource;
}

/** The element's name source, and its name while that's manual. */
function ElementNameField({
	elementId,
	name: storedName,
	nameSource,
}: ElementNameFieldProps) {
	const dispatch = useAppDispatch();
	const {
		value: source,
		persist,
		errorMessage,
	} = useOptimisticField(nameSource);

	const debouncedRename = useDebouncedCallback(
		async (id: ElementId, name: string) => {
			if (!name) return;
			await dispatch(renameElementAction(id, name));
		},
		500,
	);

	const nameRef = useRef<HTMLTextAreaElement>(null);
	const [name, setName] = useState(storedName);

	useEffect(() => {
		// Renames from elsewhere (e.g. the sidebar) must land in the field, but
		// the echo of our own debounced rename must not clobber what is being
		// typed here.
		if (document.activeElement === nameRef.current) return;
		setName(storedName);
	}, [storedName]);

	function handleSourceChange(next: NameSource) {
		// A rename still waiting would make the name manual again.
		if (next === "automatic") debouncedRename.cancel();
		persist(next, async () => {
			await setElementNameSource(elementId, next);
			dispatch(setStoredNameSource({ elementId, nameSource: next }));
			return true;
		});
	}

	return (
		<InfoField label="Name" tooltip={NAME_SOURCE_TOOLTIP}>
			<Stack gap="xs">
				<Select
					aria-label="Name source"
					size="sm"
					data={NAME_SOURCE_OPTIONS}
					value={source}
					allowDeselect={false}
					withAlignedLabels
					onChange={value => {
						if (value) handleSourceChange(value as NameSource);
					}}
					error={errorMessage}
				/>
				{source === "manual" && (
					<AutosizeTextInput
						ref={nameRef}
						aria-label="Name"
						size="sm"
						value={name}
						onChange={e => {
							setName(e.currentTarget.value);
							debouncedRename(elementId, e.currentTarget.value);
						}}
					/>
				)}
			</Stack>
		</InfoField>
	);
}

export default ElementNameField;
