import { useState } from "react";
import useApi from "./useApi";

export default function useOptimisticField<T>(source: T) {
	const { callApi, errorMessage } = useApi();
	const [value, setValue] = useState(source);
	const [lastSource, setLastSource] = useState(source);

	if (source !== lastSource) {
		setLastSource(source);
		setValue(source);
	}

	function persist(next: T, action: () => Promise<unknown>) {
		setValue(next);
		void callApi(action).then(result => {
			if (result === undefined) setValue(source);
		});
	}

	return { value, setValue, persist, errorMessage };
}
