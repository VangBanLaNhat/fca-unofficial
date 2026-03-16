"use strict";

var fmt = require("../../../../src/utils/base-parts/formatters");
var shareFixture = require("../../../data/shareAttach");

describe("formatter utilities", function () {
  test("formatID strips facebook prefixes", function () {
    expect(fmt.formatID("fbid:12345")).toBe("12345");
    expect(fmt.formatID("id.12345")).toBe("12345");
    expect(fmt.formatID("12345")).toBe("12345");
  });

  test("formatProxyPresence returns null for incomplete payload", function () {
    expect(fmt.formatProxyPresence({ lat: 1 }, "u1")).toBeNull();
  });

  test("formatProxyPresence and formatPresence normalize shape", function () {
    expect(fmt.formatProxyPresence({ lat: 123, p: { x: 1 } }, "u1")).toEqual({
      type: "presence",
      timestamp: 123000,
      userID: "u1",
      statuses: { x: 1 }
    });

    expect(fmt.formatPresence({ la: 456, a: { y: 2 } }, "u2")).toEqual({
      type: "presence",
      timestamp: 456000,
      userID: "u2",
      statuses: { y: 2 }
    });
  });

  test("formatDate renders GMT date string", function () {
    var d = new Date(Date.UTC(2024, 0, 2, 3, 4, 5));
    expect(fmt.formatDate(d)).toBe("Tue, 02 Jan 2024 03:04:05 GMT");
  });

  test("formatDeltaMessage parses share fixture", function () {
    var out = fmt.formatDeltaMessage(shareFixture);

    expect(out).toHaveProperty("type", "message");
    expect(out).toHaveProperty("threadID");
    expect(out).toHaveProperty("messageID");
    expect(Array.isArray(out.attachments)).toBe(true);
    expect(out.attachments.length).toBeGreaterThan(0);
    expect(out.attachments[0]).toHaveProperty("type");
  });

  test("admin text message type mapping works", function () {
    expect(fmt.getAdminTextMessageType("change_thread_theme")).toBe("log:thread-color");
    expect(fmt.getAdminTextMessageType("other_type")).toBe("other_type");
  });
});
