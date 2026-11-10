import { useEffect, useState } from "react";
import { isCardSyncedFromAnki } from "../../../api/ankiSync/api/ankiSyncApi";
import useApi from "../../../hooks/useApi";

/** Whether the card came from Anki and the sync replaces its content when the note changes there. */
export function useIsCardSyncedFromAnki(cardId: string): boolean {
	const { callApi } = useApi();
	const [fromAnki, setFromAnki] = useState(false);

	useEffect(() => {
		let current = true;
		void callApi(() => isCardSyncedFromAnki(cardId)).then(linked => {
			if (current) setFromAnki(linked === true);
		});
		return () => {
			current = false;
		};
	}, [cardId, callApi]);

	return fromAnki;
}
