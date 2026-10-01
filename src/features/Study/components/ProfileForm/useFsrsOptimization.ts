import { useState } from "react";
import { UseFormReturnType } from "@mantine/form";
import { optimizeStudyProfileFsrsParams } from "../../../../api/study/api/studyProfileApi";
import useApi from "../../../../hooks/useApi";
import { parseSteps, ProfileFormValues } from "./profileFormValues";

export type FsrsOptimization = ReturnType<typeof useFsrsOptimization>;

/**
 * Trains FSRS weights on the profile's review history and fills them into the
 * form. Owned by the form rather than its Cards tab, so a result landing after
 * a tab switch is still applied and announced.
 */
export function useFsrsOptimization(
	form: UseFormReturnType<ProfileFormValues>,
	profileId: string | null,
) {
	const { isSendingRequest, errorMessage, callApi, clearErrorMessage } =
		useApi();
	const [result, setResult] = useState<{
		fsrsParams: string;
		reviewCount: number;
	} | null>(null);

	async function optimize() {
		if (!profileId) return;
		clearErrorMessage();
		setResult(null);
		const relearningStepCount = parseSteps(
			form.getValues().relearningSteps,
		).length;
		const response = await callApi(() =>
			optimizeStudyProfileFsrsParams(profileId, relearningStepCount),
		);
		if (!response) return;
		const fsrsParams = response.fsrsParams
			.map(value => Number(value.toFixed(4)))
			.join(", ");
		form.setFieldValue("fsrsParams", fsrsParams);
		setResult({ fsrsParams, reviewCount: response.reviewCount });
	}

	// Once the weights are edited by hand, the notice no longer describes them.
	const reviewCount =
		result?.fsrsParams === form.values.fsrsParams
			? result.reviewCount
			: null;

	return {
		optimize,
		isOptimizing: isSendingRequest,
		errorMessage,
		reviewCount,
	};
}
