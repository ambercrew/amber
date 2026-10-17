import { Anchor, Text } from "@mantine/core";
import { Link } from "react-router";
import useElementName from "../../hooks/useElementName";
import { paths } from "../../paths";
import { ElementId } from "../../types/elements/elementId";

interface ElementReferenceProps {
	elementId: ElementId;
}

/** An inline link to an element, labelled with its current name. */
function ElementReference({ elementId }: ElementReferenceProps) {
	const { name, errorMessage } = useElementName(elementId);

	if (errorMessage) {
		return (
			<Text span inherit c="dimmed" fs="italic">
				Missing element
			</Text>
		);
	}

	return (
		<Anchor
			component={Link}
			to={paths.element(elementId.type, elementId.id)}
			inherit>
			{name ?? "…"}
		</Anchor>
	);
}

export default ElementReference;
