import { Alert, Divider, NavLink, Stack } from "@mantine/core";
import { PlusSquareIcon } from "@phosphor-icons/react";
import { BrowserIcon, HomeIcon } from "../../../config/icons";
import { useLocation, useNavigate } from "react-router";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { clearTreeError } from "../../../stores/elements/elementsReducer";
import CreateElementDropDown from "./CreateElementMenuDropDown";
import { selectElementTreeError } from "../../../stores/elements/elementsSelectors";
import ElementTree from "./ElementTree/ElementTree";
import { paths } from "../../../paths";
import PanelHeader from "./PanelHeader";
import AppTooltip from "../../../components/AppTooltip/AppTooltip";
import { ElementTreeState } from "../hooks/useElementTreeState";

const NAV_ICON_SIZE = 18;

interface NavigatorPanelProps {
	treeState: ElementTreeState;
}

function NavigatorPanel({ treeState }: NavigatorPanelProps) {
	const dispatch = useAppDispatch();
	const navigate = useNavigate();
	const location = useLocation();
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
				<AppTooltip label="Open your root folder" openDelay={300}>
					<NavLink
						label="Home"
						leftSection={<HomeIcon size={NAV_ICON_SIZE} />}
						active={location.pathname === paths.root()}
						onClick={() => void navigate(paths.root())}
					/>
				</AppTooltip>
				<AppTooltip
					label="Search and filter every element in your collection. Save the queries you use often, and act on the results in bulk."
					openDelay={300}>
					<NavLink
						label="Browser"
						leftSection={<BrowserIcon size={NAV_ICON_SIZE} />}
						active={location.pathname === paths.browser()}
						onClick={() => void navigate(paths.browser())}
					/>
				</AppTooltip>
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
				<ElementTree state={treeState} />
			</Stack>
		</Stack>
	);
}

export default NavigatorPanel;
