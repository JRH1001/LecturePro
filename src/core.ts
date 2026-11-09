// Reine Logik, keine Obsidian-Abhängigkeit -> vollständig testbar.

export type Role = "h0" | "h1" | "h2" | "h3" | "h4" | "fact" | "example" | "ignore";

/** Optionen im "Erweitert"-Bereich des Export-Dialogs (werden als Standardwerte gemerkt). */
export interface ExportOptions {
	images: boolean; // Bildmarkierungen aus dem PDF schneiden
	footer: boolean; // Quellen-Fußzeile (Link, Datum, Seiten)
	pageLinks: "off" | "headings" | "all"; // Seitenverweise zurück ins PDF
	zoteroTags: boolean; // Tags des Zotero-Eintrags übernehmen
	open: boolean; // Notiz nach dem Erstellen öffnen
	imageScale: number; // Auflösung der Bildausschnitte: Pixel pro PDF-Punkt (3 ≈ 216 dpi)
}
export const DEFAULT_EXPORT: ExportOptions = {
	images: true,
	footer: true,
	pageLinks: "off",
	zoteroTags: true,
	open: true,
	imageScale: 3,
};

/** Gespeicherte Exportoptionen auf bekannte Schlüssel beschränken, Fehlendes mit Standardwerten füllen. */
export function loadExport(saved: any): ExportOptions {
	const out: any = {};
	for (const [k, v] of Object.entries(DEFAULT_EXPORT)) out[k] = typeof saved?.[k] === typeof v ? saved[k] : v;
	return out;
}

export interface Settings {
	mode: "local" | "web";
	userId: string;
	webdavUrl: string;
	webdavUser: string;
	folder: string;
	tags: string;
	roles: Record<string, Role>;
	export: ExportOptions;
}

/** Zotero-Standardpalette (identisch in Reader, iOS und Android). */
export const PALETTE = [
	{ hex: "#ffd400", name: "Gelb" },
	{ hex: "#ff6666", name: "Rot" },
	{ hex: "#5fb236", name: "Grün" },
	{ hex: "#2ea8e5", name: "Blau" },
	{ hex: "#a28ae5", name: "Violett" },
	{ hex: "#e56eee", name: "Magenta" },
	{ hex: "#f19837", name: "Orange" },
	{ hex: "#aaaaaa", name: "Grau" },
];

/** Belegung passend zu den Ziffern-Hotkeys des Readers (Taste 1-8 = Palettenreihenfolge):
 *  1 Gelb=Fakt, 2-5 = Überschrift 1-4, 6 Beispiel, 7 Titel, 8 ignorieren. */
export const DEFAULT_ROLES: Record<string, Role> = {
	"#ffd400": "fact",
	"#ff6666": "h1",
	"#5fb236": "h2",
	"#2ea8e5": "h3",
	"#a28ae5": "h4",
	"#e56eee": "example",
	"#f19837": "h0",
	"#aaaaaa": "ignore",
};

/** Einstellungen + Geheimnisse (liegen in Obsidians SecretStorage, nie in data.json). */
export interface Conn extends Settings {
	apiKey: string;
	davPass: string;
}

/** Belegung der Versionen 0.1/0.2 (Magenta = Titel). Unveränderte Altbelegung wird auf die neue Standardbelegung gehoben. */
const LEGACY_ROLES: Record<string, Role> = {
	"#ffd400": "fact", "#5fb236": "example", "#ff6666": "h1", "#f19837": "h2",
	"#2ea8e5": "h3", "#a28ae5": "h4", "#e56eee": "h0", "#aaaaaa": "ignore",
};
export function migrateRoles(saved?: Record<string, Role>): Record<string, Role> {
	if (!saved || Object.keys(LEGACY_ROLES).every((k) => saved[k] === LEGACY_ROLES[k])) return { ...DEFAULT_ROLES };
	return { ...DEFAULT_ROLES, ...saved };
}

export const DEFAULT_SETTINGS: Settings = {
	mode: "local",
	userId: "",
	webdavUrl: "",
	webdavUser: "",
	folder: "Vorlesungen",
	tags: "#Zusammenfassung #Mitschrift",
	roles: { ...DEFAULT_ROLES },
	export: { ...DEFAULT_EXPORT },
};

export interface Ann {
	key: string;
	type: string;
	text: string;
	comment: string;
	color: string;
	sortIndex: string;
	pageIndex: number;
	pageLabel: string;
	rect: number[] | null;
	dateAdded: string;
}

export function toAnn(d: any): Ann {
	let pos: any = {};
	try {
		pos = typeof d.annotationPosition === "string" ? JSON.parse(d.annotationPosition) : d.annotationPosition ?? {};
	} catch {
		/* kaputte Position -> Seite 0 */
	}
	const pageIndex = Number(pos.pageIndex ?? 0);
	return {
		key: d.key,
		type: d.annotationType,
		text: d.annotationText ?? "",
		comment: d.annotationComment ?? "",
		color: (d.annotationColor ?? "").toLowerCase(),
		sortIndex: d.annotationSortIndex ?? "",
		pageIndex,
		pageLabel: String(d.annotationPageLabel || pageIndex + 1),
		rect: Array.isArray(pos.rects) && pos.rects[0] ? pos.rects[0] : null,
		dateAdded: d.dateAdded ?? "",
	};
}

function rgb(hex: string): [number, number, number] {
	const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Exakte Farbe, sonst nächstliegende Palettenfarbe (robust gegen fremde Reader). */
export function roleFor(color: string, map: Record<string, Role>): Role {
	const c = color.toLowerCase();
	if (map[c]) return map[c];
	const [r, g, b] = rgb(c);
	let best = PALETTE[0].hex;
	let bestD = Infinity;
	for (const p of PALETTE) {
		const [pr, pg, pb] = rgb(p.hex);
		const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
		if (d < bestD) {
			bestD = d;
			best = p.hex;
		}
	}
	return map[best] ?? "fact";
}

export const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Dokumentreihenfolge: Position im PDF, bei Gleichstand Erstellzeit. */
export const byPosition = (a: Ann, b: Ann) => a.sortIndex.localeCompare(b.sortIndex) || a.dateAdded.localeCompare(b.dateAdded);

export interface Line {
	depth: number;
	text: string;
}

/** "- " am Zeilenanfang = Stichpunkt (Einrückung = Tiefe). "->" o.ä. bleibt Text. */
export function parseLines(text: string, baseDepth: number): Line[] {
	const out: Line[] = [];
	for (const raw of text.split(/\r?\n/)) {
		if (!raw.trim()) continue;
		const m = raw.match(/^([ \t]*)-[ \t]+(.*)$/);
		let depth = 0;
		let body = raw;
		if (m) {
			const tabs = (m[1].match(/\t/g) ?? []).length;
			const spaces = (m[1].match(/ /g) ?? []).length;
			depth = tabs + Math.floor(spaces / 2);
			body = m[2];
		}
		body = clean(body);
		if (!body || body === "-") continue;
		out.push({ depth: Math.min(baseDepth + depth, 6), text: body });
	}
	return out;
}

export type Node =
	| { t: "heading"; level: number; text: string; page?: string }
	| { t: "bullet"; depth: number; text: string; page?: string }
	| { t: "image"; key: string; pageIndex: number; rect: number[] | null };

export interface Built {
	title?: string;
	nodes: Node[];
	firstDate?: string;
	pages?: [number, number];
}

const MAX_LEVEL = 4;

export function buildNodes(anns: Ann[], roles: Record<string, Role>): Built {
	const sorted = [...anns].sort(byPosition);
	const nodes: Node[] = [];
	let title: string | undefined;
	let level = 0;
	let min = Infinity;
	let max = -Infinity;
	let firstDate: string | undefined;

	const used = (a: Ann) => {
		min = Math.min(min, a.pageIndex + 1);
		max = Math.max(max, a.pageIndex + 1);
		if (a.dateAdded && (!firstDate || a.dateAdded < firstDate)) firstDate = a.dateAdded;
	};
	const comment = (a: Ann) => {
		for (const l of parseLines(a.comment, 1)) nodes.push({ t: "bullet", ...l });
	};

	for (const a of sorted) {
		if (a.type === "highlight" || a.type === "underline") {
			const text = clean(a.text);
			if (!text) continue;
			const role = roleFor(a.color, roles);
			if (role === "ignore") continue;
			used(a);
			if (role === "h0") {
				title ??= text;
			} else if (role.startsWith("h")) {
				level = Number(role[1]);
				nodes.push({ t: "heading", level, text, page: a.pageLabel });
			} else {
				nodes.push({ t: "bullet", depth: 0, text: role === "example" ? `**Bsp.:** ${text}` : text, page: a.pageLabel });
			}
			comment(a);
		} else if (a.type === "image") {
			used(a);
			nodes.push({ t: "image", key: a.key, pageIndex: a.pageIndex, rect: a.rect });
			comment(a);
		} else if (a.type === "note" || a.type === "text") {
			let body = a.comment.trim();
			if (!body) continue;
			used(a);
			const bang = body.match(/^!\s*([^\r\n]*)/);
			if (bang && clean(bang[1])) {
				level = Math.min(Math.max(level + 1, 1), MAX_LEVEL);
				nodes.push({ t: "heading", level, text: clean(bang[1]), page: a.pageLabel });
				body = body.slice(bang[0].length);
			}
			for (const l of parseLines(body, 0)) nodes.push({ t: "bullet", ...l });
		}
	}
	return {
		title,
		nodes,
		firstDate,
		pages: Number.isFinite(min) ? [min, max] : undefined,
	};
}

const pad = (n: number) => String(n).padStart(2, "0");
export function fmtDate(iso: string): string {
	const d = new Date(iso);
	return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export const toTag = (t: string) => "#" + t.replace(/^#/, "").trim().replace(/\s+/g, "-");

export interface Meta {
	tags: string[];
	attachmentKey: string;
	sourceLabel: string;
	footer?: boolean; // Standard: an
	pageLinks?: "off" | "headings" | "all"; // Standard: aus
}

/** imageLinks: Annotation-Key -> fertiger Markdown-Embed (fehlt -> Hinweis). */
export function renderNote(b: Built, meta: Meta, imageLinks: Map<string, string>): string {
	const out: string[] = [];
	const tags = [...new Set(meta.tags.map(toTag).filter((t) => t.length > 1))];
	if (tags.length) out.push(tags.join(" "), "");
	// Obsidian-Outliner-Stil wie in den Mitschriften: "# " (Ebene 1) ist eine echte Überschrift,
	// Ebene 2-4 sind Listenpunkte ("- ## ", "\t- ### ", ...), Inhalt rückt eine Stufe unter die Überschrift.
	// Einrückung wächst nie um mehr als 1 Stufe (sonst würde Markdown einen Codeblock daraus machen).
	const mode = meta.pageLinks ?? "off";
	const pl = (page?: string) =>
		page ? ` [S. ${page}](zotero://open-pdf/library/items/${meta.attachmentKey}?page=${encodeURIComponent(page)})` : "";
	let last = -1; // Einrückung der letzten Listenzeile, -1 = keine
	let hBase = 0; // Einrückung für Inhalt unter der aktuellen Überschrift
	const stack: { level: number; indent: number }[] = []; // aktive Überschriften (h1 = -1, keine Listenzeile)
	const li = (want: number, text: string) => {
		const d = Math.max(0, Math.min(want, last + 1));
		last = d;
		out.push("\t".repeat(d) + "- " + text);
		return d;
	};
	for (const n of b.nodes) {
		if (n.t === "heading") {
			while (stack.length && stack[stack.length - 1].level >= n.level) stack.pop();
			const parent = stack.length ? stack[stack.length - 1].indent : -1;
			if (n.level === 1) {
				out.push("", "# " + n.text + (mode !== "off" ? pl(n.page) : ""));
				last = -1;
				stack.push({ level: 1, indent: -1 });
				hBase = 0;
			} else {
				const d = li(parent + 1, "#".repeat(n.level) + " " + n.text + (mode !== "off" ? pl(n.page) : ""));
				stack.push({ level: n.level, indent: d });
				hBase = d + 1;
			}
		} else if (n.t === "bullet") li(hBase + n.depth, n.text + (mode === "all" ? pl(n.page) : ""));
		else li(hBase, imageLinks.get(n.key) ?? `*(Bild S. ${n.pageIndex + 1} konnte nicht erzeugt werden)*`);
	}
	if (meta.footer === false) return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\n*$/, "\n");
	const parts = [`**Quelle:** [${meta.sourceLabel}](zotero://open-pdf/library/items/${meta.attachmentKey})`];
	if (b.firstDate) parts.push(`Vorlesung vom ${fmtDate(b.firstDate)}`);
	if (b.pages) parts.push(b.pages[0] === b.pages[1] ? `S. ${b.pages[0]}` : `S. ${b.pages[0]}–${b.pages[1]}`);
	out.push("", "---", parts.join(" · "), "");
	return out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
}

export const safeName = (s: string) =>
	clean(s.replace(/[\\/:*?"<>|#^\[\]]/g, " ")).slice(0, 100) || "Vorlesung";
