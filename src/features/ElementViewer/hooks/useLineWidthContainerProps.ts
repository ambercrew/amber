import { ContainerProps } from "@mantine/core";
import useAppSelector from "../../../hooks/useAppSelector";
import { LineWidth } from "../../../api/settings/dto/settingsDto";
import { selectSettings } from "../../../stores/settings/settingsSelector";

const LINE_WIDTH_CONTAINER_PROPS: Record<LineWidth, ContainerProps> = {
	Narrow: { size: "sm" },
	Medium: { size: "md" },
	Wide: { size: "lg" },
};

/** `Container` props sizing the element editors to the user's line width setting. */
export function useLineWidthContainerProps(): ContainerProps {
	const lineWidth = useAppSelector(selectSettings)?.lineWidth ?? "Narrow";
	return LINE_WIDTH_CONTAINER_PROPS[lineWidth];
}
