import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chaptersFromOutline, maxOutlineLevel } from "../src/sections";
import { readOutline } from "../src/outline";

async function open(file: string) {
	const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
	return pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;
}

test("readOutline: echtes PDF mit Lesezeichen -> Kapitel", async () => {
	const doc = await open("test/fixtures/book.pdf");
	const items = await readOutline(doc);
	assert.deepEqual(items, [
		{ title: "1 Einleitung", pageIndex: 0, level: 1 },
		{ title: "1.1 Motivation", pageIndex: 2, level: 2 },
		{ title: "2 Grundlagen", pageIndex: 4, level: 1 },
		{ title: "3 Ausblick", pageIndex: 9, level: 1 },
	]);
	assert.equal(maxOutlineLevel(items), 2);
	assert.deepEqual(chaptersFromOutline(items, 1, doc.numPages), [
		{ title: "1 Einleitung", from: 0, to: 3 },
		{ title: "2 Grundlagen", from: 4, to: 8 },
		{ title: "3 Ausblick", from: 9, to: 11 },
	]);
});

test("readOutline: PDF ohne Lesezeichen -> leer", async () => {
	assert.deepEqual(await readOutline(await open("test/fixtures/flat.pdf")), []);
});
