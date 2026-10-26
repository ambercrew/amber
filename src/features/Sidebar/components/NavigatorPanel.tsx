import { useState } from "react";
import {
	Alert,
	Box,
	Divider,
	FloatingIndicator,
	NavLink,
	Stack,
} from "@mantine/core";
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
import { useMotionDuration } from "../../../hooks/useMotionDuration";

const NAV_ICON_SIZE = 18;

interface NavigatorPanelProps {
	treeState: ElementTreeState;
}

function NavigatorPanel({ treeState }: NavigatorPanelProps) {
	const dispatch = useAppDispatch();
	const navigate = useNavigate();
	const location = useLocation();
	const error = useAppSelector(selectElementTreeError);
	const [navRef, setNavRef] = useState<HTMLDivElement | null>(null);
	const [activeLink, setActiveLink] = useState<HTMLAnchorElement | null>(
		null,
	);
	const motionDuration = useMotionDuration();

	const navLinks = [
		{
			label: "Home",
			tooltip: "Open your root folder",
			icon: <HomeIcon size={NAV_ICON_SIZE} />,
			path: paths.root(),
		},
		{
			label: "Browser",
			tooltip:
				"Search and filter every element in your collection. Save the queries you use often, and act on the results in bulk.",
			icon: <BrowserIcon size={NAV_ICON_SIZE} />,
			path: paths.browser(),
		},
	];

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
			{/* Isolated so the indicator's and rows' z-index stay under the panel's scrollbar. */}
			<Box
				ref={setNavRef}
				style={{ position: "relative", isolation: "isolate" }}>
				{/* Slides between rows in place of the active row's own background; hidden when neither is active. */}
				{/* Remounts on reappearing so it lands on the row instead of sliding from the top. */}
				<FloatingIndicator
					key={activeLink ? "shown" : "hidden"}
					target={activeLink}
					parent={navRef}
					transitionDuration={motionDuration}
					style={{
						backgroundColor: "var(--mantine-primary-color-light)",
					}}
				/>
				{navLinks.map(link => {
					const active = location.pathname === link.path;
					return (
						<AppTooltip key={link.path} label={link.tooltip}>
							<NavLink
								ref={active ? setActiveLink : undefined}
								label={link.label}
								leftSection={link.icon}
								active={active}
								onClick={() => void navigate(link.path)}
								style={{
									position: "relative",
									zIndex: 1,
									...(active && {
										"--nl-bg": "transparent",
										"--nl-hover": "transparent",
									}),
								}}
							/>
						</AppTooltip>
					);
				})}
			</Box>

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
