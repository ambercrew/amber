import { invoke } from "@tauri-apps/api/core";
import { ElementId } from "../../../types/elements/elementId";
import {
	EffectiveProfileDto,
	StudyProfileDto,
	StudyProfileRequestDto,
} from "../dto/studyProfileDto";

export function listStudyProfiles(): Promise<StudyProfileDto[]> {
	return invoke("list_study_profiles");
}

export function createStudyProfile(
	dto: StudyProfileRequestDto,
): Promise<StudyProfileDto> {
	return invoke("create_study_profile", { dto });
}

export function updateStudyProfile(
	id: string,
	dto: StudyProfileRequestDto,
): Promise<StudyProfileDto> {
	return invoke("update_study_profile", { id, dto });
}

export function deleteStudyProfile(id: string): Promise<void> {
	return invoke("delete_study_profile", { id });
}

export function cloneStudyProfile(id: string): Promise<StudyProfileDto> {
	return invoke("clone_study_profile", { id });
}

export function setDefaultStudyProfile(id: string): Promise<StudyProfileDto> {
	return invoke("set_default_study_profile", { id });
}

export function assignStudyProfile(
	elementId: ElementId,
	profileId: string | null,
): Promise<void> {
	return invoke("assign_study_profile", { elementId, profileId });
}

export function assignStudyProfileBulk(
	elementIds: ElementId[],
	profileId: string | null,
): Promise<void> {
	return invoke("assign_study_profile_bulk", { elementIds, profileId });
}

export function getEffectiveStudyProfile(
	elementId: ElementId,
): Promise<EffectiveProfileDto> {
	return invoke("get_effective_study_profile", { elementId });
}
