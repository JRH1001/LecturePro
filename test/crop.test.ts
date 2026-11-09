import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { renderRegion } from "../src/crop";

async function open() {
	const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
	return pdfjs.getDocument({ data: new Uint8Array(readFileSync("test/fixtures/crop.pdf")), verbosity: 0 }).promise;
}
const px = (cv: any, x: number, y: number) => Array.from(cv.getContext("2d").getImageData(x, y, 1, 1).data);
const RECT = [100, 150, 220, 210]; // rotes Rechteck, 120 x 60 pt

test("renderRegion: Größe = Ausschnitt + Rand, Inhalt liegt richtig", async () => {
	const cv: any = await renderRegion(await open(), 0, RECT, 2, createCanvas);
	assert.equal(cv.width, (120 + 8) * 2); // 256
	assert.equal(cv.height, (60 + 8) * 2); // 136
	assert.deepEqual(px(cv, 128, 68), [255, 0, 0, 255]); // Mitte = rot
	assert.deepEqual(px(cv, 10, 10), [255, 0, 0, 255]); // knapp innerhalb der roten Fläche
	assert.deepEqual(px(cv, 3, 3), [255, 255, 255, 255]); // Rand = weiß
	assert.deepEqual(px(cv, cv.width - 3, cv.height - 3), [255, 255, 255, 255]);
});

test("renderRegion: Auflösung skaliert linear (dpi-Einstellung)", async () => {
	const doc = await open();
	const [a, b]: any[] = [await renderRegion(doc, 0, RECT, 2, createCanvas), await renderRegion(doc, 0, RECT, 4, createCanvas)];
	assert.equal(b.width, a.width * 2);
	assert.equal(b.height, a.height * 2);
});

test("renderRegion: absurd hohe Auflösung wird begrenzt", async () => {
	const cv: any = await renderRegion(await open(), 0, [0, 0, 400, 300], 100, createCanvas);
	assert.ok(cv.width * cv.height <= 16_100_000, `${cv.width}x${cv.height}`);
	assert.ok(cv.width > 1000);
});
