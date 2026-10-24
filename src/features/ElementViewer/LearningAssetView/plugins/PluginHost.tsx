import { ComponentType, Fragment, PropsWithChildren, ReactNode } from "react";
import { Menu } from "@mantine/core";
import { LearningAssetPlugin } from "./types";

type PluginPart = "SplitPlugin" | "Overlay";

/** Nests each plugin's `Provider`, first plugin outermost, so later plugins can read earlier ones' contexts. */
export function PluginProviders({
	plugins,
	children,
}: PropsWithChildren<{ plugins: LearningAssetPlugin[] }>) {
	return plugins.reduceRight<ReactNode>(
		(inner, { id, Provider }) =>
			Provider ? <Provider key={id}>{inner}</Provider> : inner,
		children,
	);
}

/** Renders one part of every plugin that has it, in list order. */
export function PluginParts({
	plugins,
	part,
}: {
	plugins: LearningAssetPlugin[];
	part: PluginPart;
}) {
	return plugins.map(plugin => {
		const Part: ComponentType | undefined = plugin[part];
		return Part ? <Part key={plugin.id} /> : null;
	});
}

/** Every plugin's context menu section, ordered by `contextMenuOrder`, with dividers between them. */
export function PluginContextMenuItems({
	plugins,
}: {
	plugins: LearningAssetPlugin[];
}) {
	const sections = plugins
		.flatMap(({ id, ContextMenuItems, contextMenuOrder = 0 }) =>
			ContextMenuItems
				? [{ id, Items: ContextMenuItems, contextMenuOrder }]
				: [],
		)
		.sort((a, b) => a.contextMenuOrder - b.contextMenuOrder);
	return sections.map(({ id, Items }, index) => (
		<Fragment key={id}>
			{index > 0 && <Menu.Divider />}
			<Items />
		</Fragment>
	));
}
