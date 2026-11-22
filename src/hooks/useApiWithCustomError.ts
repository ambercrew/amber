import { useCallback, useState } from "react";
import useApi, { CallApiFn } from "./useApi";

/**
 * `useApi` with a custom error message folded into one error state;
 * the custom message clears on every API call.
 */
export default function useApiWithCustomError() {
	const [customErrorMessage, setCustomErrorMessage] = useState<string | null>(
		null,
	);
	const {
		isSendingRequest,
		errorMessage: apiErrorMessage,
		clearErrorMessage: clearApiErrorMessage,
		callApi,
	} = useApi();

	const clearErrorMessage = useCallback(() => {
		clearApiErrorMessage();
		setCustomErrorMessage(null);
	}, [clearApiErrorMessage]);

	const customCallApi: CallApiFn = useCallback(
		async (cb, ...rest) => {
			await callApi(
				async () => {
					setCustomErrorMessage(null);
					return await cb();
				},
				...rest,
			);
		},
		[callApi],
	);

	return {
		isSendingRequest,
		errorMessage: apiErrorMessage ?? customErrorMessage,
		callApi: customCallApi,
		clearErrorMessage,
		setCustomErrorMessage,
	};
}
