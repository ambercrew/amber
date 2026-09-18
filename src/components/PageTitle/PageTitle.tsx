import { Box, Group, Stack, Text, Title } from "@mantine/core";
import { IconProps } from "@phosphor-icons/react";
import { cloneElement, ReactElement, ReactNode } from "react";

const ICON_SIZE = 22;

/** Font size of a page heading, exported so a custom title (e.g. a breadcrumb
 * trail) matches the plain one instead of guessing at it. */
export const PAGE_TITLE_FONT_SIZE = "h3";

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
				<Box style={{ flexShrink: 0, display: "flex" }}>
					{cloneElement(icon, { size: ICON_SIZE })}
				</Box>
				{typeof title === "string" ? (
					<Title order={2} fz={PAGE_TITLE_FONT_SIZE}>
						{title}
					</Title>
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
