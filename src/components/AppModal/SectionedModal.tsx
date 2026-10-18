import { ReactNode, useEffect, useState } from "react";
import {
	Box,
	Burger,
	FloatingIndicator,
	Group,
	NavLink,
	ScrollArea,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import AppModal, { AppModalProps } from "./AppModal";
import AppDrawer from "../AppDrawer/AppDrawer";
import { useIsSmallScreen } from "../../hooks/useIsSmallScreen";
import { MOTION_EASING } from "../../config/motion";
import { useMotionDuration } from "../../hooks/useMotionDuration";

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
	const [navRef, setNavRef] = useState<HTMLDivElement | null>(null);
	const [activeLink, setActiveLink] = useState<HTMLAnchorElement | null>(
		null,
	);
	const motionDuration = useMotionDuration();

	const activeSection =
		sections.find(section => section.value === active) ?? sections[0];

	// Lags a frame behind the active section, so newly shown content starts transparent and fades in.
	const [revealedValue, setRevealedValue] = useState(activeSection.value);
	useEffect(() => {
		const frame = requestAnimationFrame(() =>
			setRevealedValue(activeSection.value),
		);
		return () => cancelAnimationFrame(frame);
	}, [activeSection.value]);
	const revealed = revealedValue === activeSection.value;
	// Snaps to transparent on switch, then only the fade-in is animated.
	const contentStyle = {
		opacity: revealed ? 1 : 0,
		transition: revealed
			? `opacity ${motionDuration}ms ${MOTION_EASING}`
			: "none",
	};

	function renderNavLinks(onSelect?: () => void) {
		return (
			<Box ref={setNavRef} style={{ position: "relative" }}>
				{/* Slides between links in place of the active link's own background. */}
				<FloatingIndicator
					target={activeLink}
					parent={navRef}
					transitionDuration={motionDuration}
					style={{
						backgroundColor: "var(--mantine-primary-color-light)",
					}}
				/>
				{sections.map(section => (
					<NavLink
						key={section.value}
						ref={
							section.value === activeSection.value
								? setActiveLink
								: undefined
						}
						active={section.value === activeSection.value}
						label={section.label}
						leftSection={section.icon}
						onClick={() => {
							setActive(section.value);
							onSelect?.();
						}}
						style={{
							position: "relative",
							zIndex: 1,
							...(section.value === activeSection.value && {
								"--nl-bg": "transparent",
								"--nl-hover": "transparent",
							}),
						}}
					/>
				))}
			</Box>
		);
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
					<Box style={contentStyle}>{activeSection.render()}</Box>
				</>
			) : (
				<Group
					align="stretch"
					gap="lg"
					wrap="nowrap"
					h={MODAL_CONTENT_HEIGHT}>
					<Box w={180}>{renderNavLinks()}</Box>
					{/* Always offset, so the content keeps its gap and doesn't shift when the bar appears on hover. */}
					<ScrollArea
						type="hover"
						scrollbars="y"
						offsetScrollbars="y"
						style={{ flex: 1, minWidth: 0 }}>
						<Box style={contentStyle}>{activeSection.render()}</Box>
					</ScrollArea>
				</Group>
			)}
		</AppModal>
	);
}

export default SectionedModal;
