import { useRef, useState } from "react";
import { ActionIcon, Group, Paper, Text, Transition } from "@mantine/core";
import { useDebouncedCallback, useHotkeys } from "@mantine/hooks";
import {
	CaretDownIcon,
	CaretUpIcon,
	MagnifyingGlassIcon,
	TextAaIcon,
	XIcon,
} from "@phosphor-icons/react";
import AutosizeTextInput from "../../components/AutosizeTextInput/AutosizeTextInput";
import { FIND_IN_PAGE_SHORTCUT } from "../../commands/commands";
import useAppDispatch from "../../hooks/useAppDispatch";
import useAppSelector from "../../hooks/useAppSelector";
import {
	closeSearch,
	goToNextMatch,
	goToPreviousMatch,
	setSearchCaseSensitive,
	setSearchQuery,
} from "../../stores/search/searchReducer";
import {
	selectSearchCaseSensitive,
	selectSearchCurrentIndex,
	selectSearchOpened,
	selectSearchQuery,
	selectSearchTotalMatches,
} from "../../stores/search/searchSelectors";
import { HEADROOM_FIXED_AT } from "../App/components/App";
import { useMainScrollElement } from "../App/context/mainScrollContext";
import { useElementHeadroom } from "../../hooks/useElementHeadroom";

const QUERY_DEBOUNCE_IN_MILLISECONDS = 400;

/**
 * Find-in-page search bar. Owns all of its opened/query/case-sensitivity/
 * match-count/navigation state via the `search` Redux slice.
 */
export default function FindInPageBar() {
	const dispatch = useAppDispatch();
	const opened = useAppSelector(selectSearchOpened);
	const query = useAppSelector(selectSearchQuery);
	const caseSensitive = useAppSelector(selectSearchCaseSensitive);
	const currentIndex = useAppSelector(selectSearchCurrentIndex);
	const totalMatches = useAppSelector(selectSearchTotalMatches);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const onNext = () => dispatch(goToNextMatch());
	const onPrevious = () => dispatch(goToPreviousMatch());
	// Mirrors App.tsx's headroom: collapsing the header doesn't change
	// --app-shell-header-height, so this needs the same pinned state.
	const headerPinned = useElementHeadroom({
		element: useMainScrollElement(),
		fixedAt: HEADROOM_FIXED_AT,
	});

	// Mirrors the query locally so typing feels instant; only the debounced
	// value is dispatched. Resynced from Redux on open (adjusted during
	// render, since `closeSearch` always resets `query` to "").
	const [inputValue, setInputValue] = useState(query);
	const [prevOpened, setPrevOpened] = useState(opened);
	if (opened !== prevOpened) {
		setPrevOpened(opened);
		if (opened) setInputValue(query);
	}

	// GlobalHotkeys already opens the bar on mod+F; this only refocuses the
	// input when the bar is already open, since opening it doesn't remount it.
	useHotkeys(
		[
			[
				FIND_IN_PAGE_SHORTCUT,
				() => {
					if (opened) inputRef.current?.focus();
				},
			],
		],
		[],
		true,
	);

	const dispatchQuery = useDebouncedCallback((value: string) => {
		dispatch(setSearchQuery(value));
	}, QUERY_DEBOUNCE_IN_MILLISECONDS);

	const handleQueryChange = (value: string) => {
		setInputValue(value);
		dispatchQuery(value);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		switch (event.key) {
			case "Enter":
				event.preventDefault();
				if (event.shiftKey) onPrevious();
				else onNext();
				break;
			case "ArrowDown":
				event.preventDefault();
				onNext();
				break;
			case "ArrowUp":
				event.preventDefault();
				onPrevious();
				break;
			case "Escape":
				event.preventDefault();
				dispatch(closeSearch());
				break;
		}
	};

	return (
		<Transition transition="fade-down" mounted={opened}>
			{style => (
				<Paper
					style={{
						...style,
						zIndex: 190,
						transitionProperty: `${style.transitionProperty}, right, top`,
						transitionDuration: `${style.transitionDuration}, var(--app-shell-transition-duration), var(--app-shell-transition-duration)`,
						transitionTimingFunction: `${style.transitionTimingFunction}, var(--app-shell-transition-timing-function), var(--app-shell-transition-timing-function)`,
					}}
					shadow="xl"
					withBorder
					p="xs"
					pos="fixed"
					top={
						headerPinned
							? "calc(var(--app-shell-header-height) + 4px)"
							: "4px"
					}
					left={{ base: 8, sm: "auto" }}
					right={{
						base: 8,
						sm: "calc(var(--app-shell-aside-offset, 0rem) + 16px)",
					}}
					w={{ base: "auto", sm: 440 }}>
					<Group gap={6} wrap="nowrap">
						<AutosizeTextInput
							ref={inputRef}
							flex={1}
							leftSection={<MagnifyingGlassIcon size={18} />}
							placeholder="Find in page..."
							value={inputValue}
							onChange={event =>
								handleQueryChange(event.currentTarget.value)
							}
							onKeyDown={handleKeyDown}
							autoFocus
						/>
						<Text size="sm" c="dimmed" miw={70}>
							{totalMatches === 0
								? "No results"
								: `${currentIndex + 1} / ${totalMatches}`}
						</Text>
						<ActionIcon
							variant="subtle"
							onClick={onPrevious}
							disabled={totalMatches === 0}
							aria-label="Previous match">
							<CaretUpIcon size={18} />
						</ActionIcon>
						<ActionIcon
							variant="subtle"
							onClick={onNext}
							disabled={totalMatches === 0}
							aria-label="Next match">
							<CaretDownIcon size={18} />
						</ActionIcon>
						<ActionIcon
							variant={caseSensitive ? "filled" : "subtle"}
							onClick={() =>
								dispatch(setSearchCaseSensitive(!caseSensitive))
							}
							aria-label="Toggle case sensitivity">
							<TextAaIcon size={18} />
						</ActionIcon>
						<ActionIcon
							variant="subtle"
							onClick={() => dispatch(closeSearch())}
							aria-label="Close search">
							<XIcon size={18} />
						</ActionIcon>
					</Group>
				</Paper>
			)}
		</Transition>
	);
}
