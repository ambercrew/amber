import { createContext, useContext } from "react";

export interface LinkOpenerContextValue {
	/** Confirms the URL with the user, then opens it in their default browser. */
	openLink: (url: string) => void;
}

export const LinkOpenerContext = createContext<LinkOpenerContextValue | null>(
	null,
);

export function useLinkOpener() {
	const context = useContext(LinkOpenerContext);
	if (!context) {
		throw new Error(
			"useLinkOpener must be used inside a LinkOpenerProvider",
		);
	}
	return context;
}
