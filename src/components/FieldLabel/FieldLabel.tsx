import { Group, Text } from "@mantine/core";
import { InfoIcon } from "@phosphor-icons/react";
import AppTooltip from "../AppTooltip/AppTooltip";

interface FieldLabelProps {
	label: string;
	tooltip: string;
}

/**
 * A form field label with an info icon that carries the explanatory
 * tooltip, instead of the tooltip covering the whole input.
 */
function FieldLabel({ label, tooltip }: FieldLabelProps) {
	return (
		<Group gap={4}>
			<Text size="sm">{label}</Text>
			<AppTooltip
				label={tooltip}
				multiline
				w={260}
				touch
				events={{ focus: true }}>
				<InfoIcon />
			</AppTooltip>
		</Group>
	);
}

export default FieldLabel;
