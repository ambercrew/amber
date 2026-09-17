import { Group, Stack, Text, Title } from "@mantine/core";
import { IconProps } from "@phosphor-icons/react";
import { cloneElement, ReactElement, ReactNode } from "react";

const ICON_SIZE = 26;

interface PageTitleProps {
	icon: ReactElement<IconProps>;
	/** A plain name is rendered as the heading; a node (e.g. a breadcrumb
	 * trail) is rendered as given. */
	title: string | ReactNode;
	description?: string;
}

/** Heading of a top-level view (Home, a folder, the Browser), sized so the
 * icon matches the title's cap height. */
function PageTitle({ icon, title, description }: PageTitleProps) {
	return (
		<Stack gap={4}>
			<Group gap="sm" align="center" wrap="nowrap">
				{cloneElement(icon, { size: ICON_SIZE })}
				{typeof title === "string" ? (
					<Title order={2}>{title}</Title>
				) : (
					title
				)}
			</Group>
			{description && (
				<Text c="dimmed" size="sm">
					{description}
				</Text>
			)}
		</Stack>
	);
}

export default PageTitle;
