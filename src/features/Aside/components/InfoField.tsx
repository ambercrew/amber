import { Group, Stack, Text } from "@mantine/core";
import FieldInfoIcon from "../../../components/FieldLabel/FieldInfoIcon";

interface InfoFieldProps {
	label: string;
	/** Explains the field behind an info icon beside its label. */
	tooltip?: string;
	children: React.ReactNode;
}

function InfoField({ label, tooltip, children }: InfoFieldProps) {
	const labelText = <Text size="xs">{label}</Text>;
	return (
		<Stack gap={2}>
			{tooltip ? (
				<Group gap={4}>
					{labelText}
					<FieldInfoIcon tooltip={tooltip} />
				</Group>
			) : (
				labelText
			)}
			{children}
		</Stack>
	);
}

export default InfoField;
