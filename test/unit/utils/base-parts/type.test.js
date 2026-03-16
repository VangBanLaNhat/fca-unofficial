"use strict";

var getType = require("../../../../src/utils/base-parts/type").getType;

describe("type.getType", function () {
  test("detects primitives and objects", function () {
    expect(getType(null)).toBe("Null");
    expect(getType(undefined)).toBe("Undefined");
    expect(getType("x")).toBe("String");
    expect(getType(1)).toBe("Number");
    expect(getType({})).toBe("Object");
    expect(getType([])).toBe("Array");
    expect(getType(new Date())).toBe("Date");
  });

  test("detects function variants", async function () {
    function fn() {}
    async function afn() {}

    expect(getType(fn)).toBe("Function");
    expect(getType(afn)).toBe("AsyncFunction");
  });
});
