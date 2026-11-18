import {
	deferSkippedElements,
	loadSkippedElements,
	recordSkippedElement,
} from "../../../stores/study/skippedElementsStorage";
import { DueElementDto } from "../../../api/study/dto/dueElementDto";
import { ElementId } from "../../../types/elements/elementId";

function due(id: string): DueElementDto {
	return { elementId: { type: "learningAsset", id } } as DueElementDto;
}

function asset(id: string): ElementId {
	return { type: "learningAsset", id };
}

describe("skippedElementsStorage", () => {
	beforeEach(() => {
		window.localStorage.clear();
		vi.useRealTimers();
	});

	it("Should move skipped elements to the end in skip order when the queue is reloaded", () => {
		// Arrange

		recordSkippedElement(asset("b"));
		recordSkippedElement(asset("a"));
		const queue = [due("a"), due("b"), due("c")];

		// Act

		const actual = deferSkippedElements(queue);

		// Assert

		expect(actual.map(item => item.elementId.id)).toEqual(["c", "b", "a"]);
	});

	it("Should keep the queue unchanged when nothing was skipped", () => {
		// Arrange

		const queue = [due("a"), due("b")];

		// Act

		const actual = deferSkippedElements(queue);

		// Assert

		expect(actual).toBe(queue);
	});

	it("Should move an element skipped again behind later skips when it is skipped twice", () => {
		// Arrange

		recordSkippedElement(asset("a"));
		recordSkippedElement(asset("b"));
		recordSkippedElement(asset("a"));

		// Act

		const actual = loadSkippedElements();

		// Assert

		expect(actual).toEqual(["learningAsset:b", "learningAsset:a"]);
	});

	it("Should forget skips when the day has changed", () => {
		// Arrange

		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date(2026, 10, 18, 23, 0));
		recordSkippedElement(asset("a"));
		vi.setSystemTime(new Date(2026, 10, 19, 1, 0));

		// Act

		const actual = loadSkippedElements();

		// Assert

		expect(actual).toEqual([]);
	});
});
