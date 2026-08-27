import { useEffect, useState } from "react";
import useApi from "./useApi";

export default function useOptimisticField<T>(source: T) {
	const { callApi, errorMessage } = useApi();
	const [value, setValue] = useState(source);

	useEffect(() => {
		setValue(source);
	}, [source]);

	function persist(next: T, action: () => Promise<unknown>) {
		setValue(next);
		void callApi(action).then(result => {
			if (result === undefined) setValue(source);
		});
	}

	return { value, setValue, persist, errorMessage };
}
