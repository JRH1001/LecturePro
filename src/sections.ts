import { Ann, Role, buildNodes, byPosition, clean, roleFor } from "./core";

/** Ein zu erzeugendes Skript. Name: title > einzige Titel-Markierung > PDF-Name (+ suffix). */
export interface Job {
	anns: Ann[];
	title?: string;
	suffix?: string;
}

/** Wählbarer Abschnitt (aus Titel-Markierungen oder PDF-Inhaltsverzeichnis). */
export interface Section {
	title: string;
	label: string; // z. B. "S. 3–9"
	anns: Ann[];
	count: number; // Einträge, die tatsächlich in der Notiz landen
}

export function makeSection(title: string, anns: Ann[], roles: Record<string, Role>, label?: string): Section {
	const pages = anns.map((a) => a.pageIndex + 1);
	const lo = Math.min(...pages);
	const hi = Math.max(...pages);
	return {
		title,
		anns,
		label: label ?? (anns.length ? `S. ${lo}${hi > lo ? "–" + hi : ""}` : ""),
		count: buildNodes(anns, roles).nodes.length,
	};
}

// Bereichs- und Abschnittsauswahl: Seiten, Kapitel (Inhaltsverzeichnis), Titel-Markierungen. Reine Logik.

/** 0-basierte, inklusive Seitenindizes. to = Infinity bedeutet "bis Ende". */
export interface Range {
	from: number;
	to: number;
}

/** "1-5, 8, 12-" (PDF-Seitenzahlen, 1-basiert) -> Bereiche; ungültig -> null. */
export function parsePageRange(input: string): Range[] | null {
	const out: Range[] = [];
	for (const part of input.split(/[,;\s]+/).filter(Boolean)) {
		let m: RegExpMatchArray | null;
		let from: number;
		let to: number;
		if ((m = part.match(/^(\d+)$/))) from = to = Number(m[1]) - 1;
		else if ((m = part.match(/^(\d+)?[-–](\d+)?$/)) && (m[1] || m[2])) {
			from = m[1] ? Number(m[1]) - 1 : 0;
			to = m[2] ? Number(m[2]) - 1 : Infinity;
		} else return null;
		if (from < 0 || to < from) return null;
		out.push({ from, to });
	}
	return out.length ? out : null;
}

export function formatRanges(rs: Range[]): string {
	return (
		"S. " +
		rs.map((r) => (r.from === r.to ? `${r.from + 1}` : `${r.from + 1}–${r.to === Infinity ? "Ende" : r.to + 1}`)).join(", ")
	);
}

export function filterAnns(anns: Ann[], ranges: Range[] | null): Ann[] {
	return ranges ? anns.filter((a) => ranges.some((r) => a.pageIndex >= r.from && a.pageIndex <= r.to)) : anns;
}

export interface OutlineItem {
	title: string;
	pageIndex: number;
	level: number; // 1 = oberste Ebene
}
export interface Chapter extends Range {
	title: string;
}

/** Kapitel = Einträge der gewählten Gliederungsebene; endet vor dem nächsten Eintrag derselben oder höherer Ebene. */
export function chaptersFromOutline(items: OutlineItem[], level: number, numPages: number): Chapter[] {
	const out: Chapter[] = [];
	items.forEach((it, i) => {
		const title = clean(it.title);
		if (it.level !== level || !title) return;
		const next = items.slice(i + 1).find((x) => x.level <= level);
		const to = next ? Math.max(next.pageIndex - 1, it.pageIndex) : Math.max(numPages - 1, it.pageIndex);
		out.push({ title, from: it.pageIndex, to });
	});
	return out;
}

export const maxOutlineLevel = (items: OutlineItem[]) => items.reduce((m, i) => Math.max(m, i.level), 0);

// Titel-Markierungen (h0) = Haupt-Thema der Datei

const isTitle = (a: Ann, roles: Record<string, Role>) =>
	(a.type === "highlight" || a.type === "underline") && !!clean(a.text) && roleFor(a.color, roles) === "h0";

/** Texte aller Titel-Markierungen in Dokumentreihenfolge. */
export function titlesOf(anns: Ann[], roles: Record<string, Role>): string[] {
	return [...anns].sort(byPosition).filter((a) => isTitle(a, roles)).map((a) => clean(a.text));
}

/** Abschnitte = je Titel-Markierung eine Gruppe; Inhalt vor dem ersten Titel bekommt preTitle. */
export function sectionsByTitle(anns: Ann[], roles: Record<string, Role>, preTitle: string): { title: string; anns: Ann[] }[] {
	const out: { title: string; anns: Ann[] }[] = [];
	for (const a of [...anns].sort(byPosition)) {
		if (isTitle(a, roles)) out.push({ title: clean(a.text), anns: [a] });
		else if (out.length) out[out.length - 1].anns.push(a);
		else out.push({ title: preTitle, anns: [a] });
	}
	return out;
}
