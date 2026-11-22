import describeError, { errorMessage } from "../../utils/describeError";

describe("describeError", () => {
	it("Should keep the stack when given an Error", () => {
		// Arrange

		const e = new Error("Boom");

		// Act

		const actual = describeError(e);

		// Assert

		expect(actual).toContain("Error: Boom");
		expect(actual).toBe(e.stack);
	});

	it("Should stringify the value when given a non-Error", () => {
		// Arrange

		const value = 42;

		// Act

		const actual = describeError(value);

		// Assert

		expect(actual).toBe("42");
	});

	it("Should keep a plain object's fields when given an object", () => {
		// Arrange

		const value = { kind: "NotFound", message: "Missing" };

		// Act

		const actual = describeError(value);

		// Assert

		expect(actual).toBe('{"kind":"NotFound","message":"Missing"}');
	});

	it("Should show the status when given a route error response", () => {
		// Arrange

		const value = {
			status: 404,
			statusText: "Not Found",
			internal: true,
			data: null,
		};

		// Act

		const actual = describeError(value);

		// Assert

		expect(actual).toBe("404 Not Found");
	});
});

describe("errorMessage", () => {
	it("Should return the message when given an Error", () => {
		// Arrange

		const e = new Error("Boom");

		// Act

		const actual = errorMessage(e);

		// Assert

		expect(actual).toBe("Boom");
	});

	it("Should return the message field when given an object with one", () => {
		// Arrange

		const value = { kind: "NotFound", message: "Missing" };

		// Act

		const actual = errorMessage(value);

		// Assert

		expect(actual).toBe("Missing");
	});

	it("Should return the status when given a route error response", () => {
		// Arrange

		const value = {
			status: 404,
			statusText: "Not Found",
			internal: true,
			data: null,
		};

		// Act

		const actual = errorMessage(value);

		// Assert

		expect(actual).toBe("404 Not Found");
	});
});
