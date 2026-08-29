import { InfoIcon } from "@phosphor-icons/react";
import AppTooltip from "../AppTooltip/AppTooltip";

interface FieldInfoIconProps {
	tooltip: string;
}

/**
 * The info icon carrying a field's explanatory tooltip. Used on its own next
 * to controls that already render their own label (such as a `Switch`), and
 * by `FieldLabel` for fields whose label we render ourselves.
 */
function FieldInfoIcon({ tooltip }: FieldInfoIconProps) {
	return (
		<AppTooltip
			label={tooltip}
			multiline
			w={260}
			touch
			events={{ focus: true }}>
			<InfoIcon />
		</AppTooltip>
	);
}

export default FieldInfoIcon;
