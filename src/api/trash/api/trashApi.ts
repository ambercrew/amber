import { invoke } from "@tauri-apps/api/core";
import { ElementId } from "../../../types/elements/elementId";
import { TrashedElementDto } from "../dto/trashedElementDto";

export function getTrash(): Promise<TrashedElementDto[]> {
	return invoke("get_trash");
}

export function trashElement(elementId: ElementId): Promise<void> {
	return invoke("trash_element", { elementId });
}

export function trashElementsBulk(elementIds: ElementId[]): Promise<void> {
	return invoke("trash_elements_bulk", { elementIds });
}

export function restoreElement(elementId: ElementId): Promise<void> {
	return invoke("restore_element", { elementId });
}

export function deleteElementPermanently(elementId: ElementId): Promise<void> {
	return invoke("delete_element_permanently", { elementId });
}

export function emptyTrash(): Promise<void> {
	return invoke("empty_trash");
}
