import { Group, Text } from "@mantine/core";
import FieldInfoIcon from "./FieldInfoIcon";

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
			<FieldInfoIcon tooltip={tooltip} />
		</Group>
	);
}

export default FieldLabel;
