import { Alert, Divider, NavLink, Stack, Tooltip } from "@mantine/core";
import {
	HouseIcon,
	ListMagnifyingGlassIcon,
	PlusSquareIcon,
} from "@phosphor-icons/react";
import { useLocation, useNavigate } from "react-router";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { clearTreeError } from "../../../stores/elements/elementsReducer";
import CreateElementDropDown from "./CreateElementMenuDropDown";
import {
	selectElementTree,
	selectElementTreeError,
} from "../../../stores/elements/elementsSelectors";
import ElementTree from "./ElementTree/ElementTree";
import { paths } from "../../../paths";
import PanelHeader from "./PanelHeader";

const NAV_ICON_SIZE = 18;

function NavigatorPanel() {
	const dispatch = useAppDispatch();
	const navigate = useNavigate();
	const location = useLocation();
	const tree = useAppSelector(selectElementTree);
	const error = useAppSelector(selectElementTreeError);

	return (
		<Stack gap="md">
			{error && (
				<Alert
					color="red"
					title={error}
					withCloseButton
					onClose={() => dispatch(clearTreeError())}
					m="xs"
				/>
			)}
			<Stack gap={0}>
				<Tooltip label="Open your root folder" openDelay={300}>
					<NavLink
						label="Home"
						leftSection={<HouseIcon size={NAV_ICON_SIZE} />}
						active={location.pathname === paths.root()}
						onClick={() => void navigate(paths.root())}
					/>
				</Tooltip>
				<Tooltip
					label="Search and filter every element in your collection. Save the queries you use often, and act on the results in bulk."
					openDelay={300}>
					<NavLink
						label="Browser"
						leftSection={
							<ListMagnifyingGlassIcon size={NAV_ICON_SIZE} />
						}
						active={location.pathname === paths.browser()}
						onClick={() => void navigate(paths.browser())}
					/>
				</Tooltip>
			</Stack>

			<Divider />

			<Stack gap={4} px="sm">
				<PanelHeader
					title="Elements"
					actions={[
						{
							icon: <PlusSquareIcon />,
							label: "New element",
							menu: <CreateElementDropDown elementId={null} />,
						},
					]}
				/>
				<ElementTree tree={tree} />
			</Stack>
		</Stack>
	);
}

export default NavigatorPanel;
