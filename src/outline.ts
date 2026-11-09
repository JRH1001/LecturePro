import { OutlineItem } from "./sections";

/** Flache Liste der PDF-Lesezeichen (pdf.js-Dokument). Einträge ohne auflösbares Ziel werden übersprungen. */
export async function readOutline(doc: any): Promise<OutlineItem[]> {
	const out: OutlineItem[] = [];
	const walk = async (items: any[] | null, level: number) => {
		for (const it of items ?? []) {
			let pageIndex = -1;
			try {
				let dest = it.dest;
				if (typeof dest === "string") dest = await doc.getDestination(dest);
				if (Array.isArray(dest)) {
					const ref = dest[0];
					pageIndex = typeof ref === "number" ? ref : await doc.getPageIndex(ref);
				}
			} catch {
				/* Eintrag überspringen */
			}
			if (pageIndex >= 0 && it.title) out.push({ title: String(it.title), pageIndex, level });
			await walk(it.items, level + 1);
		}
	};
	await walk(await doc.getOutline(), 1);
	return out;
}
