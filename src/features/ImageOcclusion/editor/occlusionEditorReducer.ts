import { OcclusionShape } from "../../../api/imageOcclusion/dto/occlusionShape";
import { isMask } from "../utils/occlusionTargets";

export type OcclusionTool = "select" | "rect" | "ellipse" | "text";

interface Snapshot {
	shapes: OcclusionShape[];
}

export interface OcclusionEditorState extends Snapshot {
	selectedIds: string[];
	past: Snapshot[];
	future: Snapshot[];
}

export type OcclusionEditorAction =
	| { type: "add"; shape: OcclusionShape }
	| { type: "update"; shapes: OcclusionShape[] }
	| { type: "select"; ids: string[] }
	| { type: "toggleSelect"; id: string }
	| { type: "deleteSelected" }
	| { type: "group"; groupId: string }
	| { type: "ungroup" }
	| { type: "setColor"; color: string }
	| { type: "undo" }
	| { type: "redo" };

export function initialEditorState(
	shapes: OcclusionShape[],
): OcclusionEditorState {
	return { shapes, selectedIds: [], past: [], future: [] };
}

/** Selecting a grouped mask selects its whole group. */
export function expandToGroups(
	shapes: OcclusionShape[],
	ids: string[],
): string[] {
	const groupIds = new Set(
		shapes
			.filter(shape => ids.includes(shape.id) && isMask(shape))
			.map(shape => (isMask(shape) ? shape.groupId : null))
			.filter(Boolean),
	);
	return shapes
		.filter(
			shape =>
				ids.includes(shape.id) ||
				(isMask(shape) && groupIds.has(shape.groupId)),
		)
		.map(shape => shape.id);
}

function commit(
	state: OcclusionEditorState,
	next: Partial<Snapshot> & { selectedIds?: string[] },
): OcclusionEditorState {
	return {
		...state,
		...next,
		past: [...state.past, { shapes: state.shapes }],
		future: [],
	};
}

function mapSelected(
	state: OcclusionEditorState,
	fn: (shape: OcclusionShape) => OcclusionShape,
): OcclusionShape[] {
	return state.shapes.map(shape =>
		state.selectedIds.includes(shape.id) ? fn(shape) : shape,
	);
}

export function occlusionEditorReducer(
	state: OcclusionEditorState,
	action: OcclusionEditorAction,
): OcclusionEditorState {
	switch (action.type) {
		case "add":
			return commit(state, {
				shapes: [...state.shapes, action.shape],
				selectedIds: [action.shape.id],
			});
		case "update": {
			const byId = new Map(action.shapes.map(shape => [shape.id, shape]));
			return commit(state, {
				shapes: state.shapes.map(shape => byId.get(shape.id) ?? shape),
			});
		}
		case "select":
			return {
				...state,
				selectedIds: expandToGroups(state.shapes, action.ids),
			};
		case "toggleSelect": {
			// A grouped mask comes and goes with its whole group.
			const toggled = expandToGroups(state.shapes, [action.id]);
			return {
				...state,
				selectedIds: state.selectedIds.includes(action.id)
					? state.selectedIds.filter(id => !toggled.includes(id))
					: expandToGroups(state.shapes, [
							...state.selectedIds,
							action.id,
						]),
			};
		}
		case "deleteSelected":
			if (state.selectedIds.length === 0) return state;
			return commit(state, {
				shapes: state.shapes.filter(
					shape => !state.selectedIds.includes(shape.id),
				),
				selectedIds: [],
			});
		case "group": {
			const masks = state.shapes.filter(
				shape => state.selectedIds.includes(shape.id) && isMask(shape),
			);
			if (masks.length < 2) return state;
			return commit(state, {
				shapes: mapSelected(state, shape =>
					isMask(shape)
						? { ...shape, groupId: action.groupId }
						: shape,
				),
			});
		}
		case "ungroup":
			return commit(state, {
				shapes: mapSelected(state, shape =>
					isMask(shape) ? { ...shape, groupId: null } : shape,
				),
			});
		case "setColor":
			if (state.selectedIds.length === 0) return state;
			return commit(state, {
				shapes: mapSelected(state, shape =>
					isMask(shape)
						? { ...shape, fill: action.color }
						: { ...shape, color: action.color },
				),
			});
		case "undo": {
			const previous = state.past[state.past.length - 1];
			if (!previous) return state;
			return {
				...state,
				...previous,
				selectedIds: [],
				past: state.past.slice(0, -1),
				future: [{ shapes: state.shapes }, ...state.future],
			};
		}
		case "redo": {
			const [next, ...future] = state.future;
			if (!next) return state;
			return {
				...state,
				...next,
				selectedIds: [],
				past: [...state.past, { shapes: state.shapes }],
				future,
			};
		}
	}
}
