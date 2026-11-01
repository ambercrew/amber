import { useEffect, useMemo, useState } from "react";
import { StudyScopeDto } from "../../../api/study/dto/studyScopeDto";
import { SavedSearchResponseDto } from "../../../api/savedSearches/dto/savedSearchResponseDto";
import { ElementFilter } from "../../../api/savedSearches/dto/elementFilter";
import { BibliographicalSourceResponseDto } from "../../../api/bibliographicalSources/dto/bibliographicalSourceDto";
import { StudyProfileDto } from "../../../api/study/dto/studyProfileDto";
import { listStudyProfiles } from "../../../api/study/api/studyProfileApi";
import { getElementName } from "../../../api/elements/api/elementsApi";
import { formatFilter } from "../../../components/ElementFilters/utils/filterDisplay";
import { getFilterFieldMeta } from "../../../components/ElementFilters/utils/filterFieldMeta";
import useApi from "../../../hooks/useApi";
import useAppDispatch from "../../../hooks/useAppDispatch";
import useAppSelector from "../../../hooks/useAppSelector";
import { loadBibliographicalSourcesAction } from "../../../stores/bibliographicalSources/bibliographicalSourcesActions";
import { selectBibliographicalSources } from "../../../stores/bibliographicalSources/bibliographicalSourcesSelectors";
import { findTreeNode } from "../../../utils/elementTree";
import { selectElementTree } from "../../../stores/elements/elementsSelectors";

export const CUSTOM_QUERY_LABEL = "Custom query";

interface FilterLookups {
	sources: BibliographicalSourceResponseDto[];
	profiles: StudyProfileDto[];
	/** Ancestor names by filter id. */
	ancestorNames: Record<string, string>;
}

/** Loads only what the filters' descriptions need: sources, profiles, ancestor names. */
function useFilterLookups(filters: ElementFilter[]): FilterLookups {
	const dispatch = useAppDispatch();
	const { callApi } = useApi();
	const tree = useAppSelector(selectElementTree);
	const sources = useAppSelector(selectBibliographicalSources);
	const [profiles, setProfiles] = useState<StudyProfileDto[]>([]);
	// Names of ancestors missing from the tree (e.g. trashed), by element id.
	const [fetchedNames, setFetchedNames] = useState<Record<string, string>>(
		{},
	);

	const needsSources = filters.some(f => f.field === "bibliographicalSource");
	const needsProfiles = filters.some(f => f.field === "studyProfile");
	const ancestors = useMemo(
		() =>
			filters.flatMap(f =>
				f.field === "descendantOf" && f.ancestor
					? [{ filterId: f.id, ancestor: f.ancestor }]
					: [],
			),
		[filters],
	);

	// Cached in the store, so this only hits the backend once.
	useEffect(() => {
		if (needsSources) {
			void callApi(() => dispatch(loadBibliographicalSourcesAction()));
		}
	}, [needsSources, callApi, dispatch]);

	useEffect(() => {
		if (!needsProfiles) return;
		void callApi(listStudyProfiles).then(result => {
			if (result) setProfiles(result);
		});
	}, [needsProfiles, callApi]);

	// Read from the tree, so a rename shows up without another backend call.
	const treeNames = useMemo(
		() =>
			Object.fromEntries(
				ancestors.flatMap(({ ancestor }) => {
					const node = findTreeNode(tree, ancestor.id);
					return node ? [[ancestor.id, node.meta.name]] : [];
				}),
			),
		[ancestors, tree],
	);
	const missing = useMemo(
		() =>
			ancestors
				.map(({ ancestor }) => ancestor)
				.filter(ancestor => !(ancestor.id in treeNames)),
		[ancestors, treeNames],
	);
	const missingKey = missing.map(ancestor => ancestor.id).join(",");

	useEffect(() => {
		if (missing.length === 0) return;
		let cancelled = false;
		void callApi(() => Promise.all(missing.map(getElementName))).then(
			names => {
				if (!names || cancelled) return;
				setFetchedNames(current => ({
					...current,
					...Object.fromEntries(
						missing.map((ancestor, index) => [
							ancestor.id,
							names[index],
						]),
					),
				}));
			},
		);
		return () => {
			cancelled = true;
		};
		// Keyed by ids, so unrelated tree edits don't refetch.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [missingKey, callApi]);

	const ancestorNames = Object.fromEntries(
		ancestors.flatMap(({ filterId, ancestor }) => {
			const name = treeNames[ancestor.id] ?? fetchedNames[ancestor.id];
			return name === undefined ? [] : [[filterId, name]];
		}),
	);

	return { sources, profiles, ancestorNames };
}

function describeCustomQuery(
	filters: ElementFilter[],
	{ sources, profiles, ancestorNames }: FilterLookups,
): string {
	if (filters.length === 0) return CUSTOM_QUERY_LABEL;
	const description = filters
		.map(filter =>
			formatFilter(
				filter,
				getFilterFieldMeta(filter.field).label,
				sources,
				profiles,
				{ name: ancestorNames[filter.id] ?? null, errorMessage: null },
			),
		)
		.join(" and ");
	return `${CUSTOM_QUERY_LABEL}: ${description}`;
}

/** Labels for several custom queries, sharing one round of lookups. Pass a stable array. */
export function useCustomQueryLabels(queries: ElementFilter[][]): string[] {
	const allFilters = useMemo(() => queries.flat(), [queries]);
	const lookups = useFilterLookups(allFilters);
	return queries.map(query => describeCustomQuery(query, lookups));
}

/**
 * A scope's display name, or `null` when it studies everything — including a
 * deleted saved search or a filterless query, which the backend treats the same way.
 */
export function useStudyScopeLabel(
	scope: StudyScopeDto | null,
	savedSearches: SavedSearchResponseDto[],
): string | null {
	const queries = useMemo(
		() => (scope?.type === "custom" ? [scope.filters] : []),
		[scope],
	);
	const [customLabel] = useCustomQueryLabels(queries);

	if (!scope) return null;
	if (scope.type === "custom") {
		return scope.filters.length > 0 ? customLabel : null;
	}
	return (
		savedSearches.find(search => search.id === scope.savedSearchId)?.name ??
		null
	);
}
