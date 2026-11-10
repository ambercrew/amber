import { Text } from "@mantine/core";
import ElementReference from "../../../components/ElementReference/ElementReference";
import { ElementId } from "../../../types/elements/elementId";

interface ToolCallLocationProps {
	location: ElementId;
}

/** Where a tool call's change lands, e.g. the parent a card goes in. */
function ToolCallLocation({ location }: ToolCallLocationProps) {
	return (
		<Text size="xs" c="dimmed" truncate>
			in <ElementReference elementId={location} />
		</Text>
	);
}

export default ToolCallLocation;
