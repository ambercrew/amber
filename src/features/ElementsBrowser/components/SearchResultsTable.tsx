import { Anchor, Badge, Box, Group, Table, Text } from "@mantine/core";
import { Link } from "react-router";
import { SearchElementResultDto } from "../../../api/search/dto/searchElementResultDto";
import { paths } from "../../../paths";
import ElementNodeIcon from "../../App/components/ElementNodeIcon";
import { elementTypeOptions } from "../utils/elementTypeOptions";

function elementTypeLabel(type: SearchElementResultDto["type"]): string {
	return (
		elementTypeOptions.find(option => option.value === type)?.label ?? type
	);
}

function formatDateTime(value: string | null): string {
	return value ? new Date(value).toLocaleString() : "—";
}

interface SearchResultsTableProps {
	results: SearchElementResultDto[];
}

export default function SearchResultsTable({
	results,
}: SearchResultsTableProps) {
	if (results.length === 0) {
		return (
			<Text c="dimmed" size="sm" ta="center" py="md">
				No elements match the current filters.
			</Text>
		);
	}

	return (
		<Table.ScrollContainer minWidth={550}>
			<Table striped highlightOnHover verticalSpacing="xs">
				<Table.Thead>
					<Table.Tr>
						<Table.Th>Name</Table.Th>
						<Table.Th>Type</Table.Th>
						<Table.Th>Priority</Table.Th>
						<Table.Th>Due</Table.Th>
						<Table.Th>Tags</Table.Th>
					</Table.Tr>
				</Table.Thead>
				<Table.Tbody>
					{results.map(result => (
						<Table.Tr key={result.id}>
							<Table.Td>
								<Group gap="xs" wrap="nowrap">
									<Box flex="0 0 auto">
										<ElementNodeIcon
											type={result.type}
											size={16}
										/>
									</Box>
									<Anchor
										component={Link}
										to={paths.element(
											result.type,
											result.id,
										)}
										size="sm"
										c="inherit"
										underline="hover">
										{result.name}
									</Anchor>
								</Group>
							</Table.Td>
							<Table.Td>{elementTypeLabel(result.type)}</Table.Td>
							<Table.Td>
								{result.priority.percentage.toFixed(1)}%
							</Table.Td>
							<Table.Td>{formatDateTime(result.due)}</Table.Td>
							<Table.Td>
								<Group gap={4} wrap="wrap">
									{result.tags.map(tag => (
										<Badge
											key={tag.name}
											variant="light"
											size="sm">
											{tag.name}
										</Badge>
									))}
								</Group>
							</Table.Td>
						</Table.Tr>
					))}
				</Table.Tbody>
			</Table>
		</Table.ScrollContainer>
	);
}
