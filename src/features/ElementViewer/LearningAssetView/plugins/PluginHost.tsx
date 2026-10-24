import { ComponentType, PropsWithChildren, ReactNode } from "react";
import { LearningAssetPlugin } from "./types";

type PluginPart = "SplitPlugin" | "ContextMenuItems" | "Overlay";

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
