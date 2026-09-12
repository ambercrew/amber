import { useEffect, useState } from "react";
import {
	ActionIcon,
	Box,
	Collapse,
	NavLink,
	ScrollArea,
	Text,
} from "@mantine/core";
import { CaretRightIcon } from "@phosphor-icons/react";
import { PdfActionType, PdfBookmarkObject } from "@embedpdf/models";
import { useBookmarkCapability } from "@embedpdf/plugin-bookmark/react";
import { useScroll } from "@embedpdf/plugin-scroll/react";

interface PdfOutlineProps {
	documentId: string;
	onNavigate: () => void;
}

function getBookmarkPageIndex(bookmark: PdfBookmarkObject): number | undefined {
	const target = bookmark.target;
	if (!target) return undefined;
	if (target.type === "destination") return target.destination.pageIndex;
	if (target.type === "action" && target.action.type === PdfActionType.Goto) {
		return target.action.destination.pageIndex;
	}
	return undefined;
}

function BookmarkRow({
	bookmark,
	onNavigate,
}: {
	bookmark: PdfBookmarkObject;
	onNavigate: (pageIndex: number) => void;
}) {
	const hasChildren = !!bookmark.children?.length;
	const [opened, setOpened] = useState(false);
	const pageIndex = getBookmarkPageIndex(bookmark);

	return (
		<Box>
			<NavLink
				label={bookmark.title}
				styles={{ label: { whiteSpace: "normal" } }}
				leftSection={
					hasChildren ? (
						<ActionIcon
							component="span"
							variant="subtle"
							onClick={event => {
								event.preventDefault();
								event.stopPropagation();
								setOpened(o => !o);
							}}>
							<CaretRightIcon
								style={{
									transform: opened
										? "rotate(90deg)"
										: undefined,
									transition: "transform 100ms ease",
								}}
							/>
						</ActionIcon>
					) : undefined
				}
				onClick={
					pageIndex !== undefined
						? () => onNavigate(pageIndex)
						: undefined
				}
			/>
			{hasChildren && (
				<Collapse expanded={opened}>
					<Box pl={16}>
						<BookmarkNavLinks
							bookmarks={bookmark.children!}
							onNavigate={onNavigate}
						/>
					</Box>
				</Collapse>
			)}
		</Box>
	);
}

function BookmarkNavLinks({
	bookmarks,
	onNavigate,
}: {
	bookmarks: PdfBookmarkObject[];
	onNavigate: (pageIndex: number) => void;
}) {
	return (
		<>
			{bookmarks.map((bookmark, index) => (
				<BookmarkRow
					key={index}
					bookmark={bookmark}
					onNavigate={onNavigate}
				/>
			))}
		</>
	);
}

export default function PdfOutline({
	documentId,
	onNavigate,
}: PdfOutlineProps) {
	const { provides: bookmark } = useBookmarkCapability();
	const { provides: scroll } = useScroll(documentId);
	const [bookmarks, setBookmarks] = useState<PdfBookmarkObject[] | null>(
		null,
	);

	useEffect(() => {
		if (!bookmark) return;
		let cancelled = false;
		bookmark
			.forDocument(documentId)
			.getBookmarks()
			.toPromise()
			.then(result => {
				if (!cancelled) setBookmarks(result.bookmarks);
			})
			.catch(() => {
				if (!cancelled) setBookmarks([]);
			});
		return () => {
			cancelled = true;
		};
	}, [bookmark, documentId]);

	function handleNavigate(pageIndex: number) {
		scroll?.scrollToPage({
			pageNumber: pageIndex + 1,
			behavior: "instant",
		});
		onNavigate();
	}

	if (!bookmarks || bookmarks.length === 0) {
		return (
			<Box p="sm" w={280}>
				<Text size="sm" c="dimmed">
					No table of contents in this document.
				</Text>
			</Box>
		);
	}

	return (
		<ScrollArea.Autosize mah={400} maw={360} p={4}>
			<BookmarkNavLinks
				bookmarks={bookmarks}
				onNavigate={handleNavigate}
			/>
		</ScrollArea.Autosize>
	);
}
