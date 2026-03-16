"use strict";

var identity = require("../../../../src/utils/base-parts/identity");

describe("identity utilities", function () {
  test("generateThreadingID includes client id and expected envelope", function () {
    var id = identity.generateThreadingID("clientabc");
    expect(id).toMatch(/^<\d+:\d+-clientabc@mail\.projektitan\.com>$/);
  });

  test("generateOfflineThreadingID returns decimal numeric string", function () {
    var id = identity.generateOfflineThreadingID();
    expect(id).toMatch(/^\d+$/);
  });

  test("getGUID returns uuid-like id", function () {
    var guid = identity.getGUID();
    expect(guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test("getSignatureID returns hex string", function () {
    expect(identity.getSignatureID()).toMatch(/^[0-9a-f]+$/);
  });

  test("generateTimestampRelative returns hh:mm", function () {
    expect(identity.generateTimestampRelative()).toMatch(/^\d{1,2}:\d{2}$/);
  });

  test("generatePresence returns encoded payload prefix E", function () {
    var p = identity.generatePresence("12345");
    expect(typeof p).toBe("string");
    expect(p.startsWith("E")).toBe(true);
    expect(p.length).toBeGreaterThan(20);
  });

  test("generateAccessiblityCookie returns URI-encoded JSON", function () {
    var encoded = identity.generateAccessiblityCookie();
    var decoded = JSON.parse(decodeURIComponent(encoded));
    expect(decoded).toHaveProperty("sr");
    expect(decoded).toHaveProperty("sr-ts");
    expect(decoded).toHaveProperty("hcm-ts");
  });
});
