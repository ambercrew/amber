import { ReactNode, useState } from "react";
import { Box, Burger, Group, NavLink } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import AppModal, { AppModalProps } from "./AppModal";
import AppDrawer from "../AppDrawer/AppDrawer";
import { useIsSmallScreen } from "../../hooks/useIsSmallScreen";

export interface ModalSection {
	value: string;
	label: string;
	icon: ReactNode;
	render: () => ReactNode;
}

interface SectionedModalProps {
	opened: boolean;
	onClose: () => void;
	title: string;
	navAriaLabel: string;
	sections: ModalSection[];
	size?: AppModalProps["size"];
}

/** Fixed height of the modal body on desktop so it stays constant across
 * sections instead of resizing to fit each one's content. */
const MODAL_CONTENT_HEIGHT = 500;

/**
 * An {@link AppModal} split into sections navigable from a side list of links
 * (a drawer on small screens). Used for modals with more content than fits
 * comfortably in a single scroll, e.g. Settings or Manage account.
 */
function SectionedModal({
	opened,
	onClose,
	title,
	navAriaLabel,
	sections,
	size = "lg",
}: SectionedModalProps) {
	const isSmallScreen = useIsSmallScreen();
	const [active, setActive] = useState(sections[0].value);
	const [navOpened, { open: openNav, close: closeNav }] =
		useDisclosure(false);

	const activeSection =
		sections.find(section => section.value === active) ?? sections[0];

	function renderNavLinks(onSelect?: () => void) {
		return sections.map(section => (
			<NavLink
				key={section.value}
				active={section.value === active}
				label={section.label}
				leftSection={section.icon}
				onClick={() => {
					setActive(section.value);
					onSelect?.();
				}}
			/>
		));
	}

	return (
		<AppModal
			opened={opened}
			onClose={onClose}
			fullScreenOnSmallScreen
			title={
				<Group gap="xs">
					{isSmallScreen && (
						<Burger
							opened={navOpened}
							onClick={openNav}
							size="sm"
							aria-label={navAriaLabel}
						/>
					)}
					{title}
				</Group>
			}
			size={size}>
			{isSmallScreen ? (
				<>
					<AppDrawer
						opened={navOpened}
						onClose={closeNav}
						title={title}
						size="70%">
						{renderNavLinks(closeNav)}
					</AppDrawer>
					<Box>{activeSection.render()}</Box>
				</>
			) : (
				<Group
					align="stretch"
					gap="lg"
					wrap="nowrap"
					h={MODAL_CONTENT_HEIGHT}>
					<Box w={180}>{renderNavLinks()}</Box>
					<Box
						style={{
							flex: 1,
							minWidth: 0,
							overflowY: "auto",
							overflowX: "hidden",
						}}>
						{activeSection.render()}
					</Box>
				</Group>
			)}
		</AppModal>
	);
}

export default SectionedModal;
