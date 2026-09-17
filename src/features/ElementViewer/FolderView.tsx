import {
	Anchor,
	Breadcrumbs,
	Button,
	Container,
	Group,
	Paper,
	Stack,
	Text,
} from "@mantine/core";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { Link } from "react-router";
import PageTitle, {
	PAGE_TITLE_FONT_SIZE,
} from "../../components/PageTitle/PageTitle";
import { FolderElementIcon, HomeIcon } from "../../config/icons";
import { useFolderTrail } from "./hooks/useFolderTrail";
import useAppDispatch from "../../hooks/useAppDispatch";
import useAppSelector from "../../hooks/useAppSelector";
import { selectCurrentElement } from "../../stores/elements/elementsSelectors";
import { openImportModal } from "../../stores/app/appReducer";
import { paths } from "../../paths";

export default function FolderView() {
	const dispatch = useAppDispatch();
	const currentElement = useAppSelector(selectCurrentElement);

	// Nothing selected is the root of the tree, presented as "Home".
	const folder =
		currentElement?.type === "folder" ? currentElement.data : null;
	const trail = useFolderTrail(
		folder?.meta.elementId ?? null,
		folder?.meta.name ?? null,
	);

	const crumbs = [
		<Anchor
			key="home"
			component={Link}
			to={paths.root()}
			inherit
			c={trail.length === 0 ? "inherit" : "dimmed"}
			fw={trail.length === 0 ? 700 : undefined}
			underline="hover">
			Home
		</Anchor>,
		...trail.map((item, index) => {
			const isCurrent = index === trail.length - 1;
			return (
				<Anchor
					key={item.id}
					component={Link}
					to={paths.element("folder", item.id)}
					inherit
					c={isCurrent ? "inherit" : "dimmed"}
					fw={isCurrent ? 700 : undefined}
					underline="hover">
					{item.name}
				</Anchor>
			);
		}),
	];

	return (
		<Container size="md" py="lg">
			<Paper withBorder radius="md" p="md">
				<Stack gap="lg">
					<PageTitle
						icon={folder ? <FolderElementIcon /> : <HomeIcon />}
						title={
							<Breadcrumbs
								fz={PAGE_TITLE_FONT_SIZE}
								separator="/">
								{crumbs}
							</Breadcrumbs>
						}
						description={
							folder
								? "Import content into this folder, or pick one of its elements from the sidebar."
								: "The root of your collection. Import something to get started, or pick an element from the sidebar."
						}
					/>

					<Group>
						<Button
							variant="default"
							size="xl"
							h="auto"
							py="md"
							onClick={() => dispatch(openImportModal())}>
							<Stack align="center" gap={4}>
								<UploadSimpleIcon size={28} />
								<Text>Import</Text>
							</Stack>
						</Button>
					</Group>
				</Stack>
			</Paper>
		</Container>
	);
}
