import { ReactNode } from "react";
import { Group, Stack } from "@mantine/core";
import { useIsSmallScreen } from "../../hooks/useIsSmallScreen";

interface ModalActionsProps {
	/** The modal's closing buttons, the primary one last. */
	children: ReactNode;
	/** Buttons kept apart on the left, e.g. Delete. */
	start?: ReactNode;
}

/** Ends a `fullScreenOnSmallScreen` {@link AppModal}: right-aligned, or full width at the bottom on a
 * small screen, where its parents need `flex={1}`. */
function ModalActions({ children, start }: ModalActionsProps) {
	const isSmallScreen = useIsSmallScreen();

	if (isSmallScreen)
		return (
			<Stack gap="xs" mt="auto">
				{start && (
					<Group gap={4} justify="center">
						{start}
					</Group>
				)}
				{children}
			</Stack>
		);

	return (
		<Group justify={start ? "space-between" : "flex-end"} gap="xs">
			{start && <Group gap={4}>{start}</Group>}
			<Group gap="xs">{children}</Group>
		</Group>
	);
}

export default ModalActions;
