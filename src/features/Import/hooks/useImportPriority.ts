import { useEffect, useRef, useState } from "react";
import { getPriorityPositionForNewElement } from "../../../api/elements/api/elementsApi";
import { NewElementPriorityDto } from "../../../api/elements/dto/newElementPriorityDto";
import { ElementId } from "../../../types/elements/elementId";

/** Falls back to the front of the queue if the lookup fails, rather than
 * letting a priority-placement hiccup block the import itself. */
const FALLBACK: NewElementPriorityDto = { position: 1, total: 1 };

function keyOf(parent: ElementId | null): string {
	return parent ? `${parent.type}:${parent.id}` : "";
}

/** Queue size (including the element about to be created) and the position
 * within it new imports will take. Defaults to the spot the element would get
 * on its own under the effective profile's placement policy, fetched once per
 * time the import modal opens so it's ready before the user ever touches the
 * collapsible priority section. */
export function useImportPriority(opened: boolean, parent: ElementId | null) {
	const [total, setTotal] = useState<number | null>(null);
	const [position, setPosition] = useState<number | null>(null);
	const customizedRef = useRef(false);
	const defaultRef = useRef<{
		key: string;
		value: Promise<NewElementPriorityDto>;
	} | null>(null);

	function fetchDefault(): Promise<NewElementPriorityDto> {
		const key = keyOf(parent);
		if (defaultRef.current?.key !== key) {
			defaultRef.current = {
				key,
				value: getPriorityPositionForNewElement(parent).catch(
					() => FALLBACK,
				),
			};
		}
		return defaultRef.current.value;
	}

	useEffect(() => {
		if (!opened) return;
		void fetchDefault().then(fetched => {
			setTotal(fetched.total);
			if (!customizedRef.current) setPosition(fetched.position);
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [opened, keyOf(parent)]);

	function handlePositionChange(newPosition: number) {
		customizedRef.current = true;
		setPosition(newPosition);
	}

	async function resolvePosition(): Promise<number> {
		if (position !== null) return position;
		return (await fetchDefault()).position;
	}

	function reset() {
		setTotal(null);
		setPosition(null);
		customizedRef.current = false;
		defaultRef.current = null;
	}

	return { total, position, handlePositionChange, resolvePosition, reset };
}
