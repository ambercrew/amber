/**
 * Local cache of the last successfully fetched UserInformationDto, so that a
 * signed-in user who opens the app offline can still be shown their profile
 * (as stale/offline) instead of looking indistinguishable from someone who
 * never signed in.
 */

import { UserInformationDto } from "../../api/backend/dto/userInformationDto";

const KEY = "cachedUserInformation";

export function loadCachedUserInformation(): UserInformationDto | null {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		return JSON.parse(raw) as UserInformationDto;
	} catch {
		return null;
	}
}

export function saveCachedUserInformation(
	userInformation: UserInformationDto,
): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(userInformation));
	} catch {
		// Ignore quota / serialization failures — this is a best-effort cache.
	}
}

export function clearCachedUserInformation(): void {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// Ignore.
	}
}
