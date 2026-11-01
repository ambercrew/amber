import { ActionIcon, Badge } from "@mantine/core";
import { useDebouncedCallback } from "@mantine/hooks";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { setElementNameSource } from "../../../api/elements/api/elementsApi";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import AutosizeTextInput from "../../../components/AutosizeTextInput/AutosizeTextInput";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useOptimisticField from "../../../hooks/useOptimisticField";
import { renameElementAction } from "../../../stores/elements/elementsActions";
import { setElementNameSource as setStoredNameSource } from "../../../stores/elements/elementsReducer";
import { ElementId } from "../../../types/elements/elementId";
import { NameSource } from "../../../types/elements/nameSource";
import InfoField from "./InfoField";

const NAME_TOOLTIP =
	"Automatic names follow the element's first few words. Type a name to set your own; renaming the element anywhere also does.";

const AUTO_TOOLTIP =
	"Named automatically from the element's first few words. Type to set your own name.";

const RESET_TOOLTIP =
	"Reset to an automatic name that follows the element's first few words";

interface ElementNameFieldProps {
	elementId: ElementId;
	name: string;
	nameSource: NameSource;
}

/** The element's name; while automatic, it's shown as the placeholder until one is typed. */
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
	const [name, setName] = useState(nameSource === "manual" ? storedName : "");

	useEffect(() => {
		// Renames from elsewhere (e.g. the sidebar) must land in the field, but
		// the echo of our own debounced rename must not clobber what is being
		// typed here.
		if (document.activeElement === nameRef.current) return;
		setName(source === "manual" ? storedName : "");
	}, [storedName, source]);

	function handleReset() {
		// A rename still waiting would make the name manual again.
		debouncedRename.cancel();
		setName("");
		persist("automatic", async () => {
			await setElementNameSource(elementId, "automatic");
			dispatch(
				setStoredNameSource({ elementId, nameSource: "automatic" }),
			);
			return true;
		});
	}

	const isAutomatic = source === "automatic" && name === "";

	return (
		<InfoField label="Name" tooltip={NAME_TOOLTIP}>
			<AutosizeTextInput
				ref={nameRef}
				aria-label="Name"
				size="sm"
				value={name}
				placeholder={storedName}
				error={errorMessage}
				rightSectionWidth={isAutomatic ? 52 : undefined}
				rightSectionPointerEvents="all"
				rightSection={
					isAutomatic ? (
						<AppTooltip label={AUTO_TOOLTIP} touch>
							<Badge size="sm" variant="light" tt="none">
								Auto
							</Badge>
						</AppTooltip>
					) : (
						<AppTooltip label={RESET_TOOLTIP}>
							<ActionIcon
								variant="subtle"
								color="gray"
								aria-label="Reset to automatic name"
								onClick={handleReset}>
								<ArrowCounterClockwiseIcon size={16} />
							</ActionIcon>
						</AppTooltip>
					)
				}
				onChange={e => {
					setName(e.currentTarget.value);
					debouncedRename(elementId, e.currentTarget.value);
				}}
			/>
		</InfoField>
	);
}

export default ElementNameField;
