import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync } from "fflate";
import { extractPdf } from "../src/zip";

const pdf = new TextEncoder().encode("%PDF-1.7 fake pdf content");

test("extractPdf findet das PDF trotz base64-Dateiname", () => {
	const zip = zipSync({ "bGVjdHVyZS5wZGY=": pdf, "bm90ZXMudHh0": new TextEncoder().encode("kein pdf") });
	assert.deepEqual(extractPdf(zip), pdf);
});
test("extractPdf: kein PDF -> null", () => {
	assert.equal(extractPdf(zipSync({ a: new Uint8Array([1, 2, 3, 4, 5]) })), null);
});
