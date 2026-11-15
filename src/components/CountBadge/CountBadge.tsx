import { Badge, BadgeProps } from "@mantine/core";

/** A small count beside a row's label, as the sidebar's tree and search results show it. */
function CountBadge({ count, ...props }: BadgeProps & { count: number }) {
	return (
		<Badge size="sm" radius="sm" variant="default" {...props}>
			{count}
		</Badge>
	);
}

export default CountBadge;
