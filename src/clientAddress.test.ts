import assert from "node:assert/strict";
import test from "node:test";
import { resolveClientAddress } from "./clientAddress.js";

test("ignores the Cloudflare header unless it is explicitly trusted", () => {
  assert.equal(
    resolveClientAddress({ "cf-connecting-ip": "203.0.113.7" }, "10.0.0.5", false),
    "10.0.0.5"
  );
});

test("uses a valid Cloudflare address when it is trusted", () => {
  assert.equal(
    resolveClientAddress({ "cf-connecting-ip": "203.0.113.7" }, "10.0.0.5", true),
    "203.0.113.7"
  );
  assert.equal(
    resolveClientAddress({ "cf-connecting-ip": "2001:db8::1" }, "10.0.0.5", true),
    "2001:db8::1"
  );
});

test("falls back to the socket address for junk header values", () => {
  for (const value of ["not-an-ip", "", "x".repeat(100), "1.2.3.4, 5.6.7.8"]) {
    assert.equal(
      resolveClientAddress({ "cf-connecting-ip": value }, "10.0.0.5", true),
      "10.0.0.5"
    );
  }
  assert.equal(resolveClientAddress({}, "10.0.0.5", true), "10.0.0.5");
});
