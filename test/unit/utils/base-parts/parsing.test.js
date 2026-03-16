"use strict";

var parsing = require("../../../../src/utils/base-parts/parsing");

describe("parsing utilities", function () {
  test("getFrom returns extracted token content", function () {
    var html = "prefix [TOKEN]value123[/TOKEN] suffix";
    expect(parsing.getFrom(html, "[TOKEN]", "[/TOKEN]")).toBe("value123");
  });

  test("getFrom returns empty when start token missing", function () {
    expect(parsing.getFrom("abc", "<x>", "</x>")).toBe("");
  });

  test("getFrom throws when end token missing", function () {
    expect(function () {
      parsing.getFrom("<x>abc", "<x>", "</x>");
    }).toThrow("Could not find endTime");
  });

  test("makeParsable strips for(;;) and merges concatenated objects", function () {
    var raw = "for (;;);{\"a\":1}\r\n {\"b\":2}";
    expect(parsing.makeParsable(raw)).toBe("[{\"a\":1},{\"b\":2}]");
  });

  test("arrToForm converts list into object", function () {
    var out = parsing.arrToForm([
      { name: "foo", val: "bar" },
      { name: "count", val: 3 }
    ]);
    expect(out).toEqual({ foo: "bar", count: 3 });
  });

  test("decodeClientPayload decodes byte array JSON payload", function () {
    var bytes = [123, 34, 97, 34, 58, 49, 125]; // {"a":1}
    expect(parsing.decodeClientPayload(bytes)).toEqual({ a: 1 });
  });
});
