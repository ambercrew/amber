import { useCallback, useEffect } from "react";
import { notifications } from "@mantine/notifications";
import {
	findImageOcclusionBySource,
	getImageOcclusion,
} from "../../../api/imageOcclusion/api/imageOcclusionApi";
import { ImageMenuTarget } from "../../../components/Editor/plugins/ImagePlugin/imageMenuContext";
import { FloatingMenuBarItem } from "../../../components/FloatingMenuBar/FloatingMenuBar";
import { ImageOcclusionIcon } from "../../../config/icons";
import useApi from "../../../hooks/useApi";
import useAppSelector from "../../../hooks/useAppSelector";
import { selectCurrentElement } from "../../../stores/elements/elementsSelectors";
import {
	selectStudyCardPhase,
	selectStudyStatus,
} from "../../../stores/study/studySelectors";
import { assetIdFromSrc } from "../../../utils/assetUrl";
import { openImageOcclusionEditor } from "../editor/openImageOcclusionEditor";

/**
 * Image popover items: create an occlusion from an image (not in cards, which can't
 * have children), or edit the one an image already belongs to, card images included.
 */
export function useImageOcclusionMenuItems() {
	const currentElement = useAppSelector(selectCurrentElement);
	const status = useAppSelector(selectStudyStatus);
	const cardPhase = useAppSelector(selectStudyCardPhase);
	// The mask editor shows every answer, so keep it out of reach mid-question.
	const answerHidden = status === "studying" && cardPhase === "question";
	const parent =
		currentElement && currentElement.type !== "card"
			? currentElement.data.meta.elementId
			: null;
	const parentName = currentElement?.data.meta.name ?? "";
	const { callApi, errorMessage, clearErrorMessage } = useApi();

	// A popover item has no inline spot for the error.
	useEffect(() => {
		if (!errorMessage) return;
		notifications.show({ color: "red", message: errorMessage });
		clearErrorMessage();
	}, [errorMessage, clearErrorMessage]);

	return useCallback(
		(image: ImageMenuTarget): FloatingMenuBarItem[] => {
			// An image whose binding was lost (e.g. closed before autosave) reuses its occlusion
			// rather than duplicating its cards.
			const startCreate = parent
				? async () => {
						const assetId = assetIdFromSrc(image.src);
						const existing =
							assetId === null
								? null
								: await findImageOcclusionBySource(
										parent.id,
										assetId,
									);
						if (existing) {
							image.setOcclusionId(existing.id);
							openImageOcclusionEditor({
								kind: "edit",
								occlusion: existing,
							});
							return;
						}
						openImageOcclusionEditor(
							{
								kind: "create",
								src: image.src,
								name: image.altText || parentName,
								parent,
							},
							image.setOcclusionId,
						);
					}
				: null;
			const create = startCreate ? () => callApi(startCreate) : null;
			// Only a deleted occlusion falls back to creating one: one that just hasn't synced
			// here yet would get its cards duplicated.
			const edit = (occlusionId: string) =>
				callApi(async () => {
					const lookup = await getImageOcclusion(occlusionId);
					if (lookup.status === "found")
						openImageOcclusionEditor({
							kind: "edit",
							occlusion: lookup.occlusion,
						});
					else if (lookup.status === "deleted" && startCreate)
						await startCreate();
					else
						notifications.show({
							color: "yellow",
							message:
								lookup.status === "deleted"
									? "This image occlusion was deleted."
									: "This image occlusion isn't on this device yet. Sync, then try again.",
						});
				});

			const { occlusionId } = image;
			if (occlusionId && !answerHidden)
				return [
					{
						name: "occlude",
						title: "Edit image occlusion",
						label: "Edit occlusion",
						showLabel: true,
						Icon: ImageOcclusionIcon,
						onClick: () => void edit(occlusionId),
					},
				];
			if (!occlusionId && create)
				return [
					{
						name: "occlude",
						title: "Create image occlusion cards",
						label: "Occlude",
						showLabel: true,
						Icon: ImageOcclusionIcon,
						onClick: () => void create(),
					},
				];
			return [];
		},
		[parent, parentName, answerHidden, callApi],
	);
}
