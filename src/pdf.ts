import { loadPdfJs } from "obsidian";
import { OutlineItem } from "./sections";
import { renderRegion } from "./crop";
import { readOutline } from "./outline";

/** Geöffnetes PDF: Seitenzahl, Inhaltsverzeichnis und Bildausschnitte (mit Obsidians eigenem pdf.js). */
export class PdfFile {
	private doc: any;
	constructor(private bytes: ArrayBuffer) {}

	async open() {
		const pdfjs = await loadPdfJs();
		this.doc = await pdfjs.getDocument({ data: new Uint8Array(this.bytes) }).promise;
	}

	get numPages(): number {
		return this.doc?.numPages ?? 0;
	}

	/** Inhaltsverzeichnis (Lesezeichen) als flache Liste; leer, wenn das PDF keins hat. */
	outline(): Promise<OutlineItem[]> {
		return readOutline(this.doc);
	}

	/** Bildausschnitt als PNG; scale = Pixel pro PDF-Punkt (3 ≈ 216 dpi). */
	async crop(pageIndex: number, rect: number[], scale: number): Promise<ArrayBuffer> {
		const canvas = (await renderRegion(this.doc, pageIndex, rect, scale, (w, h) => {
			const c = document.createElement("canvas");
			c.width = w;
			c.height = h;
			return c;
		})) as HTMLCanvasElement;
		const blob: Blob = await new Promise((res, rej) =>
			canvas.toBlob((b) => (b ? res(b) : rej(new Error("PNG-Erzeugung fehlgeschlagen"))), "image/png")
		);
		canvas.width = canvas.height = 0; // Speicher freigeben
		return blob.arrayBuffer();
	}

	destroy() {
		this.doc?.destroy();
	}
}
