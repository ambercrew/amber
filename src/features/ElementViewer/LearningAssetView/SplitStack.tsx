import { PropsWithChildren } from "react";
import { Container } from "@mantine/core";
import { FloatingMenuItem } from "../../../components/Editor/plugins/FloatingMenuPlugin";
import { useLineWidthContainerProps } from "../hooks/useLineWidthContainerProps";
import { useReaderCore } from "./core/readerCoreContext";
import { useSplitStackWiring } from "./core/splitStackContext";
import { LearningAssetPlugin } from "./plugins/types";
import SplitSlot from "./SplitSlot";

interface SplitStackProps extends PropsWithChildren {
	buttons: FloatingMenuItem[];
	plugins: LearningAssetPlugin[];
}

/** Every split in order, followed by `children`. Waits for the content width, which sizes the placeholders. */
export default function SplitStack({
	buttons,
	plugins,
	children,
}: SplitStackProps) {
	const { splits } = useReaderCore();
	const { contentWidth, containerRef } = useSplitStackWiring();
	const containerProps = useLineWidthContainerProps();

	return (
		<Container ref={containerRef} {...containerProps} py="lg">
			{contentWidth > 0 &&
				splits.map((split, index) => (
					<SplitSlot
						key={split.seq}
						split={split}
						index={index}
						buttons={buttons}
						plugins={plugins}
					/>
				))}
			{children}
		</Container>
	);
}
