/** Minimale Canvas-Schnittstelle (Browser-Canvas in Obsidian, @napi-rs/canvas in den Tests). */
export interface CanvasLike {
	width: number;
	height: number;
	getContext(type: "2d"): any;
}

const PAD = 4; // Rand um den Ausschnitt in PDF-Punkten
const MAX_PIXELS = 16_000_000; // Schutz vor zu großen Canvas (v. a. mobil)

type Matrix = number[]; // pdf.js-Viewport-Matrix [a, b, c, d, e, f]

/** Umschließendes Rechteck der Ausschnittsecken im Viewport (rotationssicher; ohne versionsabhängige pdf.js-Helfer). */
function viewportBounds(t: Matrix, rect: number[]) {
	const [x1, y1, x2, y2] = rect;
	const pts = [[x1, y1], [x1, y2], [x2, y1], [x2, y2]].map(([x, y]) => [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]]);
	const xs = pts.map((p) => p[0]);
	const ys = pts.map((p) => p[1]);
	return { minX: Math.min(...xs), minY: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/**
 * Rendert nur den Ausschnitt `rect` (PDF-Koordinaten) mit `scale` Pixeln pro PDF-Punkt (72 dpi × scale).
 * Wird die Pixelzahl zu groß, sinkt die Auflösung automatisch.
 */
export async function renderRegion(
	doc: any,
	pageIndex: number,
	rect: number[],
	scale: number,
	makeCanvas: (w: number, h: number) => CanvasLike
): Promise<CanvasLike> {
	const page = await doc.getPage(pageIndex + 1);
	try {
		const base = viewportBounds(page.getViewport({ scale: 1 }).transform, rect);
		const w1 = base.w + 2 * PAD;
		const h1 = base.h + 2 * PAD;
		const s = Math.min(scale, Math.sqrt(MAX_PIXELS / (w1 * h1)));
		const vp = page.getViewport({ scale: s });
		const b = viewportBounds(vp.transform, rect);

		const canvas = makeCanvas(Math.ceil(w1 * s), Math.ceil(h1 * s));
		await page.render({
			canvas,
			canvasContext: canvas.getContext("2d"),
			viewport: vp,
			transform: [1, 0, 0, 1, -(b.minX - PAD * s), -(b.minY - PAD * s)], // Ausschnitt in die Canvas-Ecke schieben
			background: "#ffffff",
		}).promise;
		return canvas;
	} finally {
		page.cleanup();
	}
}
