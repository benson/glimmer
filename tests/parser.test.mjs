import test from "node:test";
import assert from "node:assert/strict";
import { captureFromText, inferType, parseTimecode } from "../parser.js";

test("recognizes a site and uses its host as a useful fallback title", () => {
  const capture = captureFromText("i love this site https://www.igochi.studio/?to=menu");
  assert.equal(capture.type, "site");
  assert.equal(capture.title, "igochi.studio");
  assert.equal(capture.url, "https://www.igochi.studio/?to=menu");
});

test("recognizes a time range as a sound moment", () => {
  const capture = captureFromText("1:15 - 1:25 in this song is so nice");
  assert.equal(capture.type, "sound");
  assert.deepEqual(capture.timecode, { start: "1:15", end: "1:25", label: "1:15–1:25" });
});

test("recognizes image URLs", () => {
  assert.equal(inferType("https://example.com/thing.webp"), "image");
});

test("accepts an em-dash in time ranges", () => {
  assert.equal(parseTimecode("03:08—03:44")?.label, "03:08–03:44");
});

