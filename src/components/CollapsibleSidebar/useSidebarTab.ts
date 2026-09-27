import { useLocalStorage } from "@mantine/hooks";

/** The sidebar's open tab, shared with anything that needs to switch it from outside. */
export function useSidebarTab(localStorageKey: string, defaultValue: string) {
	return useLocalStorage({
		defaultValue,
		key: `${localStorageKey}.open-tab`,
	});
}
