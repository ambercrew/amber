import { ReactNode, useState } from "react";
import {
	Alert,
	Button,
	Checkbox,
	Group,
	List,
	Loader,
	Paper,
	ScrollArea,
	Stack,
	Text,
} from "@mantine/core";
import {
	DownloadSimpleIcon,
	UploadSimpleIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { AnkiSyncPreviewDto } from "../../../api/ankiSync/dto/ankiSyncPreviewDto";
import AppModal from "../../../components/AppModal/AppModal";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import {
	runAnkiSync,
	startAnkiSync,
} from "../../../stores/ankiSync/ankiSyncActions";
import { setAnkiSyncReview } from "../../../stores/ankiSync/ankiSyncReducer";
import { selectAnkiSyncReview } from "../../../stores/ankiSync/ankiSyncSelectors";

/** Tall enough for a handful of decks; more scroll. */
const DECK_LIST_HEIGHT = 180;

function cardCount(count: number): string {
	return `${count} new card${count === 1 ? "" : "s"}`;
}

/** The line under a direction saying how many of its cards are updated, or nothing when none are. */
function UpdatedCards({ count, change }: { count: number; change: string }) {
	if (count === 0) return null;
	const cards = count === 1 ? "1 card" : `${count} cards`;
	return (
		<Text size="sm">
			{cards} {change}.
		</Text>
	);
}

/** The line under a direction saying how many reviews it copies, or nothing when none. */
function CopiedReviews({ count, change }: { count: number; change: string }) {
	if (count === 0) return null;
	const reviews = count === 1 ? "1 review" : `${count} reviews`;
	return (
		<Text size="sm">
			{reviews} {change}.
		</Text>
	);
}

/** The line under a direction saying how many due dates moved without a review it carries, or nothing. */
function MovedDueDates({ count, change }: { count: number; change: string }) {
	if (count === 0) return null;
	const dueDates = count === 1 ? "1 due date" : `${count} due dates`;
	return (
		<Text size="sm">
			{dueDates} {change}.
		</Text>
	);
}

interface DirectionProps {
	icon: ReactNode;
	title: string;
	children: ReactNode;
}

/** One direction of the sync: what goes from one app to the other. */
function SyncDirection({ icon, title, children }: DirectionProps) {
	return (
		<Paper withBorder p="sm">
			<Stack gap="xs">
				<Group gap="xs" wrap="nowrap">
					{icon}
					<Text size="sm" fw={500}>
						{title}
					</Text>
				</Group>
				{children}
			</Stack>
		</Paper>
	);
}

interface BodyProps {
	preview: AnkiSyncPreviewDto;
	missedCloudSync: boolean;
	onClose: () => void;
}

function AnkiSyncReviewBody({ preview, missedCloudSync, onClose }: BodyProps) {
	const dispatch = useAppDispatch();
	// A deck nobody decided on yet starts ticked: syncing is a request to bring cards over.
	const [imports, setImports] = useState<Record<string, boolean>>(() =>
		Object.fromEntries(
			preview.decks.map(deck => [deck.name, deck.import ?? true]),
		),
	);

	function handleSync() {
		const choices = preview.decks.map(deck => ({
			deck: deck.name,
			import: imports[deck.name],
		}));
		void dispatch(runAnkiSync(choices));
	}

	return (
		<Stack gap="md">
			<Text size="sm">
				Syncing with the Anki profile “{preview.profile}”.
			</Text>

			<SyncDirection
				icon={<DownloadSimpleIcon size={18} />}
				title="From Anki to Amber">
				<UpdatedCards
					count={preview.cardsEditedInAnki}
					change="edited in Anki will be updated in Amber"
				/>
				<CopiedReviews
					count={preview.reviewsToAmber}
					change="done in Anki will be added to Amber"
				/>
				<MovedDueDates
					count={preview.dueDatesToAmber}
					change="changed in Anki will be moved in Amber"
				/>
				{preview.decks.length > 0 ? (
					<>
						<Text size="xs" c="dimmed">
							Choose the decks to import. Each becomes a folder,
							and Amber remembers your choice.
						</Text>
						<ScrollArea.Autosize mah={DECK_LIST_HEIGHT}>
							<Stack gap={6}>
								{preview.decks.map(deck => (
									<Checkbox
										key={deck.name}
										label={deck.name}
										description={cardCount(deck.newCards)}
										checked={imports[deck.name]}
										onChange={event => {
											const { checked } =
												event.currentTarget;
											setImports(current => ({
												...current,
												[deck.name]: checked,
											}));
										}}
									/>
								))}
							</Stack>
						</ScrollArea.Autosize>
					</>
				) : (
					preview.cardsEditedInAnki === 0 &&
					preview.reviewsToAmber === 0 &&
					preview.dueDatesToAmber === 0 && (
						<Text size="sm" c="dimmed">
							No new cards in Anki.
						</Text>
					)
				)}
			</SyncDirection>

			<SyncDirection
				icon={<UploadSimpleIcon size={18} />}
				title="From Amber to Anki">
				<UpdatedCards
					count={preview.cardsToUpdate}
					change="changed in Amber will be updated in Anki"
				/>
				<CopiedReviews
					count={preview.reviewsToAnki}
					change="done in Amber will be added to Anki"
				/>
				<MovedDueDates
					count={preview.dueDatesToAnki}
					change="changed in Amber will be moved in Anki"
				/>
				{preview.sendingDecks.length > 0 ? (
					<>
						<Text size="xs" c="dimmed">
							Folders made in Amber go under the “Amber” deck;
							decks imported from Anki keep their place.
						</Text>
						<ScrollArea.Autosize mah={DECK_LIST_HEIGHT}>
							<List size="sm" spacing={4}>
								{preview.sendingDecks.map(deck => (
									<List.Item key={deck.name}>
										{deck.name}{" "}
										<Text span size="sm" c="dimmed">
											({cardCount(deck.newCards)})
										</Text>
									</List.Item>
								))}
							</List>
						</ScrollArea.Autosize>
					</>
				) : (
					preview.cardsToUpdate === 0 &&
					preview.reviewsToAnki === 0 &&
					preview.dueDatesToAnki === 0 && (
						<Text size="sm" c="dimmed">
							No new cards in Amber.
						</Text>
					)
				)}
			</SyncDirection>

			<Text size="xs" c="dimmed">
				Reviews, due dates and edits sync both ways for cards already in
				both apps.
			</Text>

			{missedCloudSync && Object.values(imports).some(Boolean) && (
				<Alert
					color="yellow"
					icon={<WarningIcon />}
					title="Amber couldn’t sync first">
					If another device of yours already imported these decks,
					they’ll be imported twice. Sync Amber, then sync with Anki
					again.
				</Alert>
			)}

			{(preview.cardsToTrash > 0 || preview.notesToDelete > 0) && (
				<Alert
					color="yellow"
					icon={<WarningIcon />}
					title="Deletions will carry over">
					<Stack gap={4}>
						{preview.cardsToTrash > 0 && (
							<Text size="sm">
								{preview.cardsToTrash} cards deleted in Anki
								will move to Amber’s trash.
							</Text>
						)}
						{preview.notesToDelete > 0 && (
							<Text size="sm">
								{preview.notesToDelete} notes deleted in Amber
								will be deleted from Anki for good.
							</Text>
						)}
					</Stack>
				</Alert>
			)}

			<Group justify="flex-end" gap="xs">
				<Button variant="default" onClick={onClose}>
					Cancel
				</Button>
				<Button onClick={handleSync}>Sync</Button>
			</Group>
		</Stack>
	);
}

/** Shown while both apps are read, which can take a while on a large collection. */
function LoadingPreview({ onClose }: { onClose: () => void }) {
	return (
		<Stack gap="md">
			<Stack align="center" gap="xs" py="xl">
				<Loader />
				<Text size="sm" c="dimmed">
					Comparing Amber with Anki…
				</Text>
			</Stack>
			<Group justify="flex-end">
				<Button variant="default" onClick={onClose}>
					Cancel
				</Button>
			</Group>
		</Stack>
	);
}

function FailedPreview({
	error,
	onClose,
}: {
	error: string;
	onClose: () => void;
}) {
	const dispatch = useAppDispatch();
	return (
		<Stack gap="md">
			<Alert
				color="red"
				icon={<WarningIcon />}
				title="Couldn’t read Anki">
				{error}
			</Alert>
			<Group justify="flex-end" gap="xs">
				<Button variant="default" onClick={onClose}>
					Close
				</Button>
				<Button onClick={() => void dispatch(startAnkiSync())}>
					Try again
				</Button>
			</Group>
		</Stack>
	);
}

/** Opens as soon as a sync starts, then shows what it would do in each direction and which decks to import. */
function AnkiSyncReviewModal() {
	const review = useAppSelector(selectAnkiSyncReview);
	const dispatch = useAppDispatch();
	const onClose = () => dispatch(setAnkiSyncReview(null));

	return (
		<AppModal
			opened={review !== null}
			onClose={onClose}
			title="Sync with Anki">
			{review?.status === "loading" && (
				<LoadingPreview onClose={onClose} />
			)}
			{review?.status === "failed" && (
				<FailedPreview error={review.error} onClose={onClose} />
			)}
			{review?.status === "ready" && (
				<AnkiSyncReviewBody
					preview={review.preview}
					missedCloudSync={review.missedCloudSync}
					onClose={onClose}
				/>
			)}
		</AppModal>
	);
}

export default AnkiSyncReviewModal;
