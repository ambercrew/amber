import { InfoIcon } from "@phosphor-icons/react";
import AppTooltip from "../AppTooltip/AppTooltip";

interface FieldInfoIconProps {
	tooltip: string;
}

/**
 * The info icon holding a field's tooltip, beside controls that render their own label (a `Switch`)
 * and inside `FieldLabel` for the rest.
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
