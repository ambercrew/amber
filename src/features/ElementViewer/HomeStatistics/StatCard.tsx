import { Group, Paper, Skeleton, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconProps } from "@phosphor-icons/react";
import { ComponentType } from "react";

interface StatCardProps {
	icon: ComponentType<IconProps>;
	label: string;
	/** Nullish while the statistics are loading. */
	value: string | null | undefined;
}

export default function StatCard({ icon: Icon, label, value }: StatCardProps) {
	return (
		<Paper withBorder radius="md" p="md">
			<Group gap="sm" wrap="nowrap">
				<ThemeIcon variant="light" size="lg" radius="md">
					<Icon size={20} />
				</ThemeIcon>
				<Stack gap={0} miw={0}>
					<Text size="xs" c="dimmed" truncate>
						{label}
					</Text>
					{value == null ? (
						<Skeleton h={24} w={48} mt={2} />
					) : (
						<Text fw={700} size="lg">
							{value}
						</Text>
					)}
				</Stack>
			</Group>
		</Paper>
	);
}
