import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EXPORT, DEFAULT_ROLES, buildNodes, loadExport, migrateRoles, parseLines, renderNote, roleFor, toAnn } from "../src/core";
import { chaptersFromOutline, filterAnns, formatRanges, parsePageRange, sectionsByTitle, titlesOf } from "../src/sections";

let n = 0;
const ann = (type: string, color: string, sortIndex: string, text = "", comment = "", page = 0) =>
	toAnn({
		key: "K" + ++n, annotationType: type, annotationText: text, annotationComment: comment,
		annotationColor: color, annotationSortIndex: sortIndex, dateAdded: `2026-11-04T10:${String(n).padStart(2, "0")}:00Z`,
		annotationPosition: JSON.stringify({ pageIndex: page, rects: [[10, 20, 110, 70]] }),
	});

const col = (role: string) => Object.entries(DEFAULT_ROLES).find(([, r]) => r === role)![0];
const Y = col("fact"), R = col("h1"), O = col("h2"), B = col("h3"), M = col("h0"), G = col("example"), GR = col("ignore");

test("parseLines: '- ' = Stichpunkt, '->' bleibt Text, Einrückung = Tiefe", () => {
	assert.deepEqual(parseLines("- a\n  - b\n\t- c\n-> d\n\n-", 0), [
		{ depth: 0, text: "a" }, { depth: 1, text: "b" }, { depth: 1, text: "c" }, { depth: 0, text: "-> d" },
	]);
});

test("roleFor: exakte und nächstliegende Farbe", () => {
	assert.equal(roleFor("#FFD400", DEFAULT_ROLES), "fact");
	assert.equal(roleFor("#ff6a6a", DEFAULT_ROLES), "h1");
	assert.deepEqual(Object.values(DEFAULT_ROLES).slice(0, 5), ["fact", "h1", "h2", "h3", "h4"]); // Tasten 1-5
});

test("Vorlesung 'Elektrische Quelle': Struktur, Sortierung, Sticky, Kommentare", () => {
	const anns = [
		// absichtlich unsortiert + später erstellt
		ann("highlight", Y, "00001|000300|00100", "Leerlauf: offene Verbindung", "Prof: bei Messung beachten", 1),
		ann("highlight", M, "00000|000001|00010", "Elektrische Quelle"),
		ann("highlight", R, "00000|000100|00100", "Unabhängige Quelle"),
		ann("highlight", Y, "00000|000200|00100", "Quellenspannung  unabhängig\nv. anderen Komponenten"),
		ann("highlight", GR, "00000|000250|00100", "Nur für mich"),
		ann("highlight", O, "00001|000100|00050", "Ideale Quelle", "", 1),
		ann("image", Y, "00001|000200|00080", "", "Bsp. Schaltbild", 1),
		ann("highlight", G, "00001|000250|00100", "Akku als passive Quelle", "", 1),
		ann("note", "#ffd400", "00001|000260|00100", "", "!Abschweifung Solarzellen\n\n- nichtlineare Kennlinie\n- Pfeile -> kein Problem", 1),
		ann("note", "#ffd400", "00001|000270|00100", "", "nur eine lose Notiz", 1),
		ann("ink", Y, "00001|000280|00100", ""),
		ann("highlight", B, "00002|000100|00100", "Verschaltungen", "", 2),
		ann("highlight", Y, "00002|000200|00100", "Reihenschaltung: Addition", "", 2),
	];
	const b = buildNodes(anns, DEFAULT_ROLES);
	assert.equal(b.title, "Elektrische Quelle");
	assert.deepEqual(b.pages, [1, 3]);
	const md = renderNote(b, { tags: ["#Zusammenfassung", "BMT", "E Technik"], attachmentKey: "ABCD1234", sourceLabel: "Folien 3.pdf" }, new Map([[anns[6].key, "![[bild.png]]"]]));
	console.log("\n" + md);
	assert.equal(md, `#Zusammenfassung #BMT #E-Technik

# Unabhängige Quelle
- Quellenspannung unabhängig v. anderen Komponenten
- ## Ideale Quelle
\t- ![[bild.png]]
\t\t- Bsp. Schaltbild
\t- **Bsp.:** Akku als passive Quelle
\t- ### Abschweifung Solarzellen
\t\t- nichtlineare Kennlinie
\t\t- Pfeile -> kein Problem
\t\t- nur eine lose Notiz
\t\t- Leerlauf: offene Verbindung
\t\t\t- Prof: bei Messung beachten
\t- ### Verschaltungen
\t\t- Reihenschaltung: Addition

---
**Quelle:** [Folien 3.pdf](zotero://open-pdf/library/items/ABCD1234) · Vorlesung vom 04.11.2026 · S. 1–3
`);
});

test("Sticky '!' ohne Überschrift davor -> Ebene 1; ohne Inhalt -> nichts", () => {
	const b = buildNodes([ann("note", Y, "1", "", "!Start\n- x"), ann("note", Y, "2", "", "   ")], DEFAULT_ROLES);
	assert.deepEqual(b.nodes, [{ t: "heading", level: 1, text: "Start", page: "1" }, { t: "bullet", depth: 0, text: "x" }]);
});

test("Einrückung springt nie um mehr als eine Stufe (kein Codeblock) und h4 liegt tief", () => {
	const H = (r: string, t: string, i: string) => ann("highlight", col(r), i, t);
	const b = buildNodes([H("h1", "A", "1"), H("h3", "C", "2"), H("fact", "x", "3"), H("h4", "D", "4"), H("fact", "y", "5"), H("h2", "B", "6"), H("fact", "z", "7")], DEFAULT_ROLES);
	const md = renderNote(b, { tags: [], attachmentKey: "K", sourceLabel: "s" }, new Map());
	assert.equal(md.split("\n---")[0], "# A\n- ### C\n\t- x\n\t- #### D\n\t\t- y\n- ## B\n\t- z\n");
});

test("parsePageRange / formatRanges", () => {
	assert.deepEqual(parsePageRange("1-5, 8, 12-"), [{ from: 0, to: 4 }, { from: 7, to: 7 }, { from: 11, to: Infinity }]);
	assert.deepEqual(parsePageRange("-3"), [{ from: 0, to: 2 }]);
	for (const bad of ["", "abc", "0", "5-3", "-", "1-2-3"]) assert.equal(parsePageRange(bad), null, bad);
	assert.equal(formatRanges(parsePageRange("1-5,8,12-")!), "S. 1–5, 8, 12–Ende");
});

test("filterAnns: nur gewählte Seiten", () => {
	const a = [0, 1, 2, 3].map((p) => ann("highlight", Y, "x" + p, "t" + p, "", p));
	assert.deepEqual(filterAnns(a, parsePageRange("2-3")).map((x) => x.pageIndex), [1, 2]);
	assert.equal(filterAnns(a, null).length, 4);
});

test("chaptersFromOutline: Ebenen, Seitenenden, gleiche Startseite", () => {
	const items = [
		{ title: "Vorwort", pageIndex: 0, level: 1 },
		{ title: "1 Einleitung", pageIndex: 2, level: 1 },
		{ title: "1.1 Motivation", pageIndex: 2, level: 2 },
		{ title: "1.2 Ziele", pageIndex: 5, level: 2 },
		{ title: "2 Grundlagen", pageIndex: 9, level: 1 },
		{ title: "Anhang", pageIndex: 9, level: 1 },
	];
	assert.deepEqual(chaptersFromOutline(items, 1, 20), [
		{ title: "Vorwort", from: 0, to: 1 }, { title: "1 Einleitung", from: 2, to: 8 },
		{ title: "2 Grundlagen", from: 9, to: 9 }, { title: "Anhang", from: 9, to: 19 },
	]);
	assert.deepEqual(chaptersFromOutline(items, 2, 20), [
		{ title: "1.1 Motivation", from: 2, to: 4 }, { title: "1.2 Ziele", from: 5, to: 8 },
	]);
});

test("Seitenverweise + Fußzeile aus", () => {
	const b = buildNodes([ann("highlight", R, "1", "Kap", "", 4), ann("highlight", Y, "2", "Fakt", "", 4)], DEFAULT_ROLES);
	const m = { tags: [], attachmentKey: "KEY1", sourceLabel: "x" };
	const link = "[S. 5](zotero://open-pdf/library/items/KEY1?page=5)";
	assert.equal(renderNote(b, { ...m, pageLinks: "headings", footer: false }, new Map()), `# Kap ${link}\n- Fakt\n`);
	assert.equal(renderNote(b, { ...m, pageLinks: "all", footer: false }, new Map()), `# Kap ${link}\n- Fakt ${link}\n`);
	assert.equal(renderNote(b, { ...m, footer: false }, new Map()), "# Kap\n- Fakt\n");
});

test("migrateRoles: Altbelegung wird gehoben, eigene Anpassungen bleiben", () => {
	const legacy = { "#ffd400": "fact", "#5fb236": "example", "#ff6666": "h1", "#f19837": "h2", "#2ea8e5": "h3", "#a28ae5": "h4", "#e56eee": "h0", "#aaaaaa": "ignore" } as const;
	assert.equal(migrateRoles({ ...legacy })["#f19837"], "h0"); // Orange = Titel (neu)
	assert.equal(migrateRoles(undefined)["#f19837"], "h0");
	const custom = migrateRoles({ ...legacy, "#aaaaaa": "fact" });
	assert.equal(custom["#e56eee"], "h0"); // eigene Anpassung -> nichts überschrieben
	assert.equal(custom["#aaaaaa"], "fact");
});

test("Titel-Markierungen: Abschnitte zur Auswahl (Buch)", () => {
	const O = col("h0");
	const a = [
		ann("highlight", Y, "00000|1|1", "Vorwort-Fakt", "", 0),
		ann("highlight", O, "00001|1|1", "Kapitel Mechanik", "", 1), ann("highlight", Y, "00002|1|1", "F1", "", 2),
		ann("highlight", O, "00005|1|1", "Kapitel Thermik", "", 5), ann("highlight", Y, "00006|1|1", "F2", "", 6),
		ann("highlight", O, "00009|1|1", "Kapitel ohne Inhalt", "", 9),
	];
	assert.deepEqual(titlesOf(a, DEFAULT_ROLES), ["Kapitel Mechanik", "Kapitel Thermik", "Kapitel ohne Inhalt"]);
	const s = sectionsByTitle(a, DEFAULT_ROLES, "Buch (Vorspann)");
	assert.deepEqual(s.map((x) => [x.title, buildNodes(x.anns, DEFAULT_ROLES).nodes.length]), [
		["Buch (Vorspann)", 1], ["Kapitel Mechanik", 1], ["Kapitel Thermik", 1], ["Kapitel ohne Inhalt", 0],
	]);
	// ein Titel am Anfang -> kein Vorspann
	assert.deepEqual(sectionsByTitle(a.slice(1, 3), DEFAULT_ROLES, "V").map((x) => x.title), ["Kapitel Mechanik"]);
});

test("loadExport: bekannte Schlüssel, falsche Typen und Altlasten werden bereinigt", () => {
	assert.deepEqual(loadExport(undefined), DEFAULT_EXPORT);
	const e = loadExport({ images: false, imageScale: 6, footer: "ja", perChapter: true, splitByTitle: true });
	assert.equal(e.images, false);
	assert.equal(e.imageScale, 6);
	assert.equal(e.footer, DEFAULT_EXPORT.footer); // falscher Typ -> Standard
	assert.ok(!("perChapter" in e) && !("splitByTitle" in e)); // Altlasten weg
});
