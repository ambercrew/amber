import { Menu } from "@mantine/core";

import { useDispatch } from "react-redux";
import {
	createCardAction,
	createExtractAction,
	createFolderAction,
	createLearningAssetAction,
} from "../../../stores/elements/elementsActions";
import { AppDispatch } from "../../../stores/store";
import { ElementId } from "../../../types/elements/elementId";
import { defaultElementName } from "./ElementTree/elementTreeUtils";
import ElementNodeIcon from "../../App/components/ElementNodeIcon";

function useCreateHandlers(
	elementId: ElementId | null,
	onAfterCreate?: () => void,
) {
	const dispatch = useDispatch<AppDispatch>();

	function run(action: (dispatch: AppDispatch) => Promise<void>) {
		void (async () => {
			await dispatch(action);
			onAfterCreate?.();
		})();
	}

	return {
		folder: () =>
			run(
				createFolderAction({
					meta: {
						name: defaultElementName("Folder"),
						parent: elementId,
						origin: { type: "custom" },
					},
				}),
			),
		learningAsset: () =>
			run(
				createLearningAssetAction({
					id: crypto.randomUUID(),
					meta: {
						name: defaultElementName("Learning Asset"),
						parent: elementId,
						origin: { type: "custom" },
					},
					type: "extracted",
					// A new learning asset is a single empty split (seq 0) so it can be
					// edited immediately.
					splits: [""],
				}),
			),
		extract: () =>
			run(
				createExtractAction({
					id: crypto.randomUUID(),
					meta: {
						name: defaultElementName("Extract"),
						parent: elementId,
						origin: { type: "custom" },
					},
					content: "",
				}),
			),
		card: () =>
			run(
				createCardAction({
					id: crypto.randomUUID(),
					meta: {
						name: defaultElementName("Card"),
						parent: elementId,
						origin: { type: "custom" },
					},
					front: "",
					back: "",
				}),
			),
	};
}

export default function CreateElementDropDown({
	elementId,
	onAfterCreate,
}: {
	elementId: ElementId | null;
	onAfterCreate?: () => void;
}) {
	const handlers = useCreateHandlers(elementId, onAfterCreate);

	return (
		<Menu.Dropdown>
			<Menu.Item
				leftSection={<ElementNodeIcon type="folder" size={16} />}
				onClick={handlers.folder}>
				Folder
			</Menu.Item>
			<Menu.Item
				leftSection={<ElementNodeIcon type="learningAsset" size={16} />}
				onClick={handlers.learningAsset}>
				Learning Asset
			</Menu.Item>
			<Menu.Item
				leftSection={<ElementNodeIcon type="extract" size={16} />}
				onClick={handlers.extract}>
				Extract
			</Menu.Item>
			<Menu.Item
				leftSection={<ElementNodeIcon type="card" size={16} />}
				onClick={handlers.card}>
				Card
			</Menu.Item>
		</Menu.Dropdown>
	);
}
