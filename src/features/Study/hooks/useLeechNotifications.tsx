import { useEffect } from "react";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router";
import { getElementById } from "../../../api/elements/api/elementsApi";
import {
	CARD_LEECHED_EVENT,
	CardLeechedEventDto,
} from "../../../api/study/events/cardLeechedEvent";
import { lexicalJsonToText } from "../../../components/Editor/lexicalJsonConversion";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { requestFocus } from "../../../hooks/useFocusRequest";
import { useTauriEvent } from "../../../hooks/useTauriEvent";
import { paths } from "../../../paths";
import {
	addAiContextSnippet,
	requestAiPrompt,
} from "../../../stores/aiContext/aiContextReducer";
import { selectSettings } from "../../../stores/settings/settingsSelectors";
import useApi from "../../../hooks/useApi";
import { REWRITE_LEECH_CARD_PROMPT } from "../../Ai/utils/aiPrompts";
import LeechNotificationMessage from "../components/LeechNotificationMessage";

const LEECH_AUTO_CLOSE_IN_MILLISECONDS = 12000;

// Tells the user when a grade makes a card a leech, and offers to rewrite or open it.
export function useLeechNotifications() {
	const dispatch = useAppDispatch();
	const navigate = useNavigate();
	const aiEnabled = useAppSelector(selectSettings)?.enableAi ?? false;
	const { callApi, errorMessage, clearErrorMessage } = useApi();
	// The notification that offered the rewrite has closed, so errors report in one of their own.
	useEffect(() => {
		if (!errorMessage) return;
		notifications.show({ message: errorMessage, color: "red" });
		clearErrorMessage();
	}, [errorMessage, clearErrorMessage]);

	// Opens the card, so the AI can rewrite it in place; cards it adds for a split land beside it.
	function rewrite(cardId: string) {
		return callApi(async () => {
			const element = await getElementById({ type: "card", id: cardId });
			if (element.type !== "card") return;
			const { front, back } = element.data;
			void navigate(paths.element("card", cardId));
			// A cloze card keeps everything on its front.
			const backText = lexicalJsonToText(back);
			dispatch(
				addAiContextSnippet(
					backText
						? `Front: ${lexicalJsonToText(front)}\n\nBack: ${backText}`
						: `Front: ${lexicalJsonToText(front)}`,
				),
			);
			// Tied to the leech, as the open element is still the queue's next card until the leech loads.
			dispatch(
				requestAiPrompt(REWRITE_LEECH_CARD_PROMPT, {
					type: "card",
					id: cardId,
				}),
			);
			dispatch(requestFocus("aiChat"));
		});
	}

	useTauriEvent<CardLeechedEventDto>(
		CARD_LEECHED_EVENT,
		({ cardId, lapses, suspended, rewritable }) => {
			const id = `leech-${cardId}`;
			notifications.show({
				id,
				title: "Leech",
				autoClose: LEECH_AUTO_CLOSE_IN_MILLISECONDS,
				message: (
					<LeechNotificationMessage
						lapses={lapses}
						suspended={suspended}
						onRewrite={
							aiEnabled && rewritable
								? () => {
										notifications.hide(id);
										void rewrite(cardId);
									}
								: null
						}
						onOpen={() => {
							notifications.hide(id);
							void navigate(paths.element("card", cardId));
						}}
					/>
				),
			});
		},
	);
}
