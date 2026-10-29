import { act, renderHook } from "@testing-library/react";
import {
	isSameQuery,
	useRecentCustomQueries,
} from "../../../../features/Study/hooks/useRecentCustomQueries";
import { ElementFilter } from "../../../../api/savedSearches/dto/elementFilter";

function nameQuery(value: string): ElementFilter[] {
	return [
		{ id: crypto.randomUUID(), field: "name", operator: "contains", value },
	];
}

async function rememberAll(queries: ElementFilter[][]) {
	const { result } = renderHook(() => useRecentCustomQueries());
	for (const query of queries) {
		act(() => result.current.remember(query));
	}
	// useLocalStorage syncs across instances a microtask later.
	await act(async () => {});
	return result;
}

describe("useRecentCustomQueries", () => {
	beforeEach(() => window.localStorage.clear());

	it("Should list the newest query first when several are remembered", async () => {
		// Arrange

		const rust = nameQuery("Rust");
		const french = nameQuery("French");

		// Act

		const result = await rememberAll([rust, french]);

		// Assert

		expect(result.current.recents).toEqual([french, rust]);
	});

	it("Should move a query to the top instead of repeating it when it is remembered again", async () => {
		// Arrange

		const rust = nameQuery("Rust");
		const french = nameQuery("French");

		// Act

		const result = await rememberAll([rust, french, nameQuery("Rust")]);

		// Assert

		expect(result.current.recents).toHaveLength(2);
		expect(isSameQuery(result.current.recents[0], rust)).toBe(true);
	});

	it("Should keep only the five newest queries when more are remembered", async () => {
		// Arrange

		const queries = ["a", "b", "c", "d", "e", "f"].map(nameQuery);

		// Act

		const result = await rememberAll(queries);

		// Assert

		expect(result.current.recents).toEqual(queries.slice(1).reverse());
	});

	it("Should not remember a query when it has no filters", async () => {
		// Arrange, Act

		const result = await rememberAll([[]]);

		// Assert

		expect(result.current.recents).toEqual([]);
	});
});
