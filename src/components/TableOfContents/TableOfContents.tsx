import {
	memo,
	useCallback,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import {
	ActionIcon,
	Box,
	getTreeExpandedState,
	Group,
	RenderTreeNodePayload,
	Stack,
	Text,
	Tree,
	TreeNodeData,
	useTree,
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import {
	ArrowsInLineVerticalIcon,
	ArrowsOutLineVerticalIcon,
} from "@phosphor-icons/react";
import AppTooltip from "../AppTooltip/AppTooltip";
import DisclosureCaret from "../DisclosureCaret/DisclosureCaret";
import { useScrollToCurrentOnShow } from "./useScrollToCurrentOnShow";
import { TableOfContentsEntry } from "../../types/elements/tableOfContentsEntry";

const EXPANDED_STORAGE_KEY = "table-of-contents-expanded";
// Bounds the stored map without tracking deletes; the tables changed longest ago are forgotten.
const MAX_REMEMBERED_TABLES = 50;
const NOTHING_EXPANDED: Record<string, boolean> = {};
const CARET_SIZE = 16;

interface TableOfContentsProps {
	entries: TableOfContentsEntry[];
	/** Names the table, e.g. by the element showing it, so each table remembers its own expanded headings. */
	storageKey: string;
	/** The entry the reader is in now; it and the headings above it are highlighted. */
	activeEntryId?: string | null;
	onSelect: (entry: TableOfContentsEntry) => void;
}

/** The ids from the top level down to `id`, or `null` when it isn't in `entries`. */
function findPath(
	entries: TableOfContentsEntry[],
	id: string,
): string[] | null {
	for (const entry of entries) {
		if (entry.id === id) return [entry.id];
		const below = entry.children && findPath(entry.children, id);
		if (below) return [entry.id, ...below];
	}
	return null;
}

function collectById(
	entries: TableOfContentsEntry[],
	byId = new Map<string, TableOfContentsEntry>(),
) {
	for (const entry of entries) {
		byId.set(entry.id, entry);
		if (entry.children) collectById(entry.children, byId);
	}
	return byId;
}

function toTreeData(entries: TableOfContentsEntry[]): TreeNodeData[] {
	return entries.map(entry => ({
		value: entry.id,
		label: entry.title,
		nodeProps: { entry },
		children: entry.children && toTreeData(entry.children),
	}));
}

interface ActiveEntry {
	current: string | null;
	/** The ids of the current entry and the headings above it. */
	path: Set<string>;
}

/** The current entry, read by each row on its own so a change re-renders only the rows it touches. */
function createActiveEntryStore() {
	let active: ActiveEntry = { current: null, path: new Set() };
	const listeners = new Set<() => void>();
	return {
		get: () => active,
		set: (next: ActiveEntry) => {
			active = next;
			listeners.forEach(listener => listener());
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

type ActiveEntryStore = ReturnType<typeof createActiveEntryStore>;

interface EntryNodeProps {
	payload: RenderTreeNodePayload;
	activeEntry: ActiveEntryStore;
	onSelect: (entry: TableOfContentsEntry) => void;
}

function EntryNode({ payload, activeEntry, onSelect }: EntryNodeProps) {
	const { node, expanded, hasChildren, elementProps, tree } = payload;
	const { entry } = node.nodeProps as { entry: TableOfContentsEntry };
	// Mantine's own click only focuses the row here, since `expandOnClick` is off.
	const { onClick: focusRow, ...restElementProps } = elementProps;
	const [hovered, setHovered] = useState(false);
	// The current entry is highlighted as the place the reader is, the headings above it in the primary color.
	const current = useSyncExternalStore(
		activeEntry.subscribe,
		() => activeEntry.get().current === entry.id,
	);
	const onActivePath = useSyncExternalStore(activeEntry.subscribe, () =>
		activeEntry.get().path.has(entry.id),
	);

	return (
		<Group
			gap={4}
			py={4}
			pr="xs"
			wrap="nowrap"
			align="flex-start"
			{...restElementProps}
			// Selecting jumps there; a heading with nowhere to go opens instead.
			onClick={event => {
				focusRow(event);
				if (entry.selectable) onSelect(entry);
				else tree.toggleExpanded(node.value);
			}}
			data-active={current || onActivePath || undefined}
			aria-current={current ? "location" : undefined}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			bg={
				current
					? "var(--mantine-primary-color-light)"
					: hovered
						? "var(--sidebar-hover-bg)"
						: undefined
			}
			c={
				current
					? "var(--mantine-primary-color-light-color)"
					: onActivePath
						? "var(--mantine-primary-color-filled)"
						: undefined
			}
			style={{
				...restElementProps.style,
				borderRadius: "var(--mantine-radius-default)",
				cursor: "pointer",
			}}>
			{hasChildren ? (
				<ActionIcon
					variant="transparent"
					size="sm"
					c="inherit"
					aria-label={expanded ? "Collapse" : "Expand"}
					onClick={event => {
						event.stopPropagation();
						focusRow(event);
						tree.toggleExpanded(node.value);
					}}>
					<DisclosureCaret opened={expanded} size={CARET_SIZE} />
				</ActionIcon>
			) : (
				// Keeps leaf titles aligned with their siblings' beside the caret.
				<Box w="var(--ai-size-sm)" style={{ flexShrink: 0 }} />
			)}
			<Text
				size="sm"
				flex={1}
				pt={2}
				style={{ overflowWrap: "anywhere" }}>
				{entry.title}
			</Text>
		</Group>
	);
}

interface EntryTreeProps {
	entries: TableOfContentsEntry[];
	storageKey: string;
	activeEntry: ActiveEntryStore;
	onSelect: (entry: TableOfContentsEntry) => void;
}

// Memoized with stable props, so a change of the current entry re-renders only the rows it touches.
function EntryTreeView({
	entries,
	storageKey,
	activeEntry,
	onSelect,
}: EntryTreeProps) {
	const [expandedByTable, setExpandedByTable] = useLocalStorage<
		Record<string, Record<string, boolean>>
	>({
		key: EXPANDED_STORAGE_KEY,
		defaultValue: {},
		getInitialValueInEffect: false,
	});
	const rememberOwn = (
		update: (own: Record<string, boolean>) => Record<string, boolean>,
	) =>
		setExpandedByTable(previous => {
			const own = previous[storageKey] ?? NOTHING_EXPANDED;
			// Re-inserted last, so the oldest-changed tables come first and are dropped first.
			const others = Object.entries(previous)
				.filter(([key]) => key !== storageKey)
				.slice(-(MAX_REMEMBERED_TABLES - 1));
			return { ...Object.fromEntries(others), [storageKey]: update(own) };
		});
	// Read once: the table remounts per owner, and from then on the tree holds the state.
	const tree = useTree({
		initialExpandedState: expandedByTable[storageKey] ?? NOTHING_EXPANDED,
		onNodeExpand: id => rememberOwn(own => ({ ...own, [id]: true })),
		onNodeCollapse: id => rememberOwn(own => ({ ...own, [id]: false })),
	});

	const data = useMemo(() => toTreeData(entries), [entries]);
	const entriesById = useMemo(() => collectById(entries), [entries]);
	const nested = entries.some(entry => entry.children?.length);
	// Saved too, unlike Mantine's own expand/collapse all, which skip `onNodeExpand`/`onNodeCollapse`.
	const setAllExpanded = (expanded: boolean) => {
		const next = getTreeExpandedState(data, expanded ? "*" : []);
		tree.setExpandedState(next);
		rememberOwn(() => next);
	};

	return (
		<Stack gap={4}>
			{nested && (
				<Group gap={4} justify="flex-end">
					<AppTooltip label="Expand all">
						<ActionIcon
							variant="subtle"
							aria-label="Expand all"
							onClick={() => setAllExpanded(true)}>
							<ArrowsOutLineVerticalIcon size={CARET_SIZE} />
						</ActionIcon>
					</AppTooltip>
					<AppTooltip label="Collapse all">
						<ActionIcon
							variant="subtle"
							aria-label="Collapse all"
							onClick={() => setAllExpanded(false)}>
							<ArrowsInLineVerticalIcon size={CARET_SIZE} />
						</ActionIcon>
					</AppTooltip>
				</Group>
			)}
			<Tree
				data={data}
				tree={tree}
				withLines
				expandOnClick={false}
				renderNode={payload => (
					<EntryNode
						payload={payload}
						activeEntry={activeEntry}
						onSelect={onSelect}
					/>
				)}
				onKeyDown={event => {
					// Arrows move and open headings (Mantine's); Enter jumps to the focused one.
					const target = event.target as HTMLElement;
					if (
						event.key !== "Enter" ||
						target.getAttribute("role") !== "treeitem"
					)
						return;
					const found = entriesById.get(target.dataset.value ?? "");
					if (found?.selectable) {
						event.preventDefault();
						onSelect(found);
					}
				}}
			/>
		</Stack>
	);
}

const EntryTree = memo(EntryTreeView);

/** A collapsible tree of headings; selecting one hands it back to the view it came from. */
export default function TableOfContents({
	entries,
	storageKey,
	activeEntryId,
	onSelect,
}: TableOfContentsProps) {
	const [activeEntry] = useState(createActiveEntryStore);
	useLayoutEffect(() => {
		activeEntry.set({
			current: activeEntryId ?? null,
			path: new Set(
				activeEntryId ? (findPath(entries, activeEntryId) ?? []) : [],
			),
		});
	}, [activeEntry, entries, activeEntryId]);

	// The latest `onSelect` through a ref, so a new one from the parent doesn't re-render the tree.
	const onSelectRef = useRef(onSelect);
	useLayoutEffect(() => {
		onSelectRef.current = onSelect;
	}, [onSelect]);
	const select = useCallback(
		(entry: TableOfContentsEntry) => onSelectRef.current(entry),
		[],
	);

	const containerRef = useRef<HTMLDivElement>(null);
	useScrollToCurrentOnShow(containerRef, activeEntryId);

	return (
		<Box ref={containerRef}>
			<EntryTree
				entries={entries}
				storageKey={storageKey}
				activeEntry={activeEntry}
				onSelect={select}
			/>
		</Box>
	);
}
