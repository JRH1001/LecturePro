import { App, FuzzySuggestModal, Modal, Notice, Setting } from "obsidian";
import { PdfFile } from "./pdf";
import { Candidate } from "./zotero";
import { Ann, ExportOptions, Settings, fmtDate } from "./core";
import {
	Job,
	OutlineItem,
	Section,
	chaptersFromOutline,
	filterAnns,
	formatRanges,
	makeSection,
	maxOutlineLevel,
	parsePageRange,
	sectionsByTitle,
	titlesOf,
} from "./sections";

/** Auswahl der Vorlesung (zuletzt bearbeitete zuerst). */
export class PickModal extends FuzzySuggestModal<Candidate> {
	constructor(app: App, private items: Candidate[], private onPick: (c: Candidate) => void) {
		super(app);
		this.setPlaceholder("Vorlesung wählen (Enter = zuletzt bearbeitete)");
	}
	getItems() {
		return this.items;
	}
	getItemText(c: Candidate) {
		const date = c.last ? `  ·  ${fmtDate(c.last)}` : "";
		return `${c.parentTitle ?? c.title}${c.parentTitle && c.title ? " – " + c.title : ""}${date}`;
	}
	onChooseItem(c: Candidate) {
		this.onPick(c);
	}
}

/** Bildauflösung = Pixel pro PDF-Punkt (1 pt = 1/72 Zoll, also dpi = 72 × Faktor). */
const IMAGE_QUALITY: [number, string][] = [
	[2, "Niedrig (144 dpi)"],
	[3, "Standard (216 dpi)"],
	[4, "Hoch (288 dpi)"],
	[6, "Sehr hoch (432 dpi)"],
];

const HINT = "setting-item-description";

/**
 * Export-Dialog. Enter = sofort mit Standardwerten ("Alles" -> eine Notiz).
 * "Erweitert -> Bereich" entscheidet, was entsteht:
 *   Alles = eine Notiz · Seiten = eine Notiz · Abschnitte = je gewähltem Abschnitt eine Notiz.
 */
export class ExportModal extends Modal {
	private mode: "all" | "pages" | "sections" = "all";
	private source: "titles" | "toc";
	private pagesInput = "";
	private level = 1;
	private outline: OutlineItem[] = [];
	private numPages = 0;
	private tocState: "idle" | "loading" | "done" = "idle";
	private tocNote = "";
	private pdf?: PdfFile;
	private sections: Section[] = [];
	private selected = new Set<number>();
	private readonly titles: string[];
	private readonly titleSections: Section[];
	private scopeEl!: HTMLElement;

	constructor(
		app: App,
		private settings: Settings,
		private save: () => void,
		private c: Candidate,
		private anns: Ann[],
		private loadPdf: () => Promise<ArrayBuffer>,
		private onGo: (jobs: Job[], pdf?: PdfFile) => void
	) {
		super(app);
		const roles = settings.roles;
		this.titles = titlesOf(anns, roles);
		this.titleSections = sectionsByTitle(anns, roles, `${c.parentTitle ?? c.title} (Vorspann)`)
			.map((x) => makeSection(x.title, x.anns, roles))
			.filter((x) => x.count > 0 || this.titles.includes(x.title)); // leeren Vorspann ausblenden
		this.source = this.titles.length ? "titles" : "toc";
	}

	// ---------- Aufbau ----------

	onOpen() {
		const el = this.contentEl;
		el.empty();
		this.renderHeader(el);
		const details = el.createEl("details");
		details.createEl("summary", { text: "Erweitert" });
		const box = details.createDiv();
		this.renderScopePicker(box);
		this.scopeEl = box.createDiv();
		this.renderOptions(box);

		const buttons = el.createDiv({ attr: { style: "display:flex;gap:.5em;justify-content:flex-end;margin-top:1em" } });
		buttons.createEl("button", { text: "Abbrechen" }).onclick = () => this.close();
		const go = buttons.createEl("button", { text: "Erstellen", cls: "mod-cta" });
		go.onclick = () => this.submit();
		go.focus();
	}

	onClose() {
		this.pdf?.destroy();
		this.pdf = undefined;
	}

	private renderHeader(el: HTMLElement) {
		const pages = this.anns.map((a) => a.pageIndex + 1);
		const t = this.titles;
		el.createEl("h3", { text: this.c.parentTitle ?? this.c.title });
		el.createEl("p", { text: `${this.anns.length} Markierungen · Seiten ${Math.min(...pages)}–${Math.max(...pages)}`, cls: HINT });
		el.createEl("p", {
			cls: HINT,
			text:
				t.length === 0
					? "Keine Titel-Markierung (Taste 7, Orange) – die Notiz heißt wie das PDF."
					: t.length === 1
					? `Titel: ${t[0]}`
					: `${t.length} Titel-Markierungen erkannt (${t.slice(0, 3).join(" · ")}${t.length > 3 ? " …" : ""}). Unter „Erweitert → Abschnitte“ wählst du, welche als Notiz exportiert werden.`,
		});
	}

	private renderScopePicker(box: HTMLElement) {
		new Setting(box)
			.setName("Bereich")
			.setDesc("Was soll entstehen?")
			.addDropdown((d) =>
				d
					.addOption("all", "Alles → eine Notiz")
					.addOption("pages", "Seiten → eine Notiz")
					.addOption("sections", "Abschnitte → je Abschnitt eine Notiz")
					.setValue(this.mode)
					.onChange((v) => {
						this.mode = v as typeof this.mode;
						if (this.mode === "sections") this.enterSections();
						else this.renderScope();
					})
			);
	}

	private renderOptions(box: HTMLElement) {
		const o = this.settings.export;
		const toggle = (name: string, desc: string, key: "images" | "footer" | "zoteroTags" | "open") =>
			new Setting(box).setName(name).setDesc(desc).addToggle((t) => t.setValue(o[key]).onChange((v) => ((o[key] = v), this.save())));

		toggle("Bilder einbinden", "Bildmarkierungen aus dem PDF schneiden (aus = schneller, PDF wird nicht geladen).", "images");
		new Setting(box)
			.setName("Bildauflösung")
			.setDesc("Höher = schärfer, aber größere Dateien. Sehr große Ausschnitte werden automatisch begrenzt.")
			.addDropdown((d) => {
				for (const [scale, label] of IMAGE_QUALITY) d.addOption(String(scale), label);
				d.setValue(String(o.imageScale)).onChange((v) => ((o.imageScale = Number(v)), this.save()));
			});
		new Setting(box)
			.setName("Seitenverweise")
			.setDesc("Links zurück an die Stelle im PDF (Zotero öffnet die Seite).")
			.addDropdown((d) =>
				d
					.addOption("off", "Keine")
					.addOption("headings", "An Überschriften")
					.addOption("all", "An jedem Punkt")
					.setValue(o.pageLinks)
					.onChange((v) => ((o.pageLinks = v as ExportOptions["pageLinks"]), this.save()))
			);
		toggle("Quellen-Fußzeile", "Link zur PDF, Datum der Vorlesung und Seitenbereich am Ende.", "footer");
		toggle("Zotero-Tags übernehmen", "Tags des Zotero-Eintrags (z. B. Fach) werden zu #Tags.", "zoteroTags");
		new Setting(box).setName("Zielordner").addText((t) =>
			t.setValue(this.settings.folder).onChange((v) => ((this.settings.folder = v), this.save()))
		);
		toggle("Notiz nach dem Erstellen öffnen", "Bei mehreren Notizen wird die erste geöffnet.", "open");
	}

	// ---------- Bereich: Seiten / Abschnitte ----------

	private renderScope() {
		const el = this.scopeEl;
		el.empty();
		if (this.mode === "pages")
			new Setting(el)
				.setName("Seiten")
				.setDesc("PDF-Seitenzahlen, z. B. 1-5, 8, 12-  („12-“ = bis zum Ende).")
				.addText((t) => t.setPlaceholder("1-5, 8, 12-").setValue(this.pagesInput).onChange((v) => (this.pagesInput = v)));
		else if (this.mode === "sections") this.renderSections(el);
	}

	private renderSections(el: HTMLElement) {
		if (this.titles.length)
			new Setting(el).setName("Abschnitte aus").addDropdown((d) =>
				d
					.addOption("titles", `Titel-Markierungen (${this.titles.length})`)
					.addOption("toc", "Inhaltsverzeichnis des PDFs")
					.setValue(this.source)
					.onChange((v) => {
						this.source = v as typeof this.source;
						this.enterSections();
					})
			);
		if (this.source === "toc") {
			if (this.tocState !== "done") return void el.createDiv({ text: "Lade PDF und lese Inhaltsverzeichnis …", cls: HINT });
			this.renderLevelPicker(el);
		}
		if (this.tocNote && this.source === "toc") el.createDiv({ text: this.tocNote, cls: HINT });
		if (!this.sections.length) return void el.createDiv({ text: "Keine Abschnitte gefunden – nutze „Seiten“ oder markiere Titel (Taste 7).", cls: HINT });
		this.renderSectionList(el);
	}

	private renderLevelPicker(el: HTMLElement) {
		const max = Math.min(maxOutlineLevel(this.outline), 3);
		if (max <= 1) return;
		new Setting(el).setName("Gliederungsebene").setDesc("1 = Hauptüberschriften").addDropdown((d) => {
			for (let i = 1; i <= max; i++) d.addOption(String(i), `Ebene ${i}`);
			d.setValue(String(this.level)).onChange((v) => {
				this.level = Number(v);
				this.computeSections();
				this.renderScope();
			});
		});
	}

	private renderSectionList(el: HTMLElement) {
		const bar = el.createDiv({ attr: { style: "display:flex;gap:.5em;margin:.4em 0" } });
		bar.createEl("button", { text: "Alle" }).onclick = () => {
			this.sections.forEach((x, i) => x.count && this.selected.add(i));
			this.renderScope();
		};
		bar.createEl("button", { text: "Keine" }).onclick = () => {
			this.selected.clear();
			this.renderScope();
		};
		const list = el.createDiv({
			attr: { style: "max-height:220px;overflow:auto;border:1px solid var(--background-modifier-border);border-radius:6px;padding:.3em .6em" },
		});
		this.sections.forEach((sec, i) => {
			const row = list.createEl("label", { attr: { style: `display:flex;gap:.5em;align-items:baseline;padding:.15em 0;${sec.count ? "" : "opacity:.5"}` } });
			const cb = row.createEl("input", { type: "checkbox" });
			cb.checked = this.selected.has(i);
			cb.disabled = !sec.count;
			cb.onchange = () => (cb.checked ? this.selected.add(i) : this.selected.delete(i));
			row.createSpan({ text: sec.title });
			row.createSpan({ text: `${sec.label} · ${sec.count} Einträge`, cls: HINT, attr: { style: "margin-left:auto;white-space:nowrap" } });
		});
	}

	/** Beim Wechsel in "Abschnitte" bzw. Quellenwechsel: Liste aufbauen (Inhaltsverzeichnis lädt das PDF). */
	private enterSections() {
		if (this.source === "toc" && this.tocState === "idle") void this.loadToc();
		else this.computeSections();
		this.renderScope();
	}

	private computeSections() {
		const roles = this.settings.roles;
		this.sections =
			this.source === "titles"
				? this.titleSections
				: chaptersFromOutline(this.outline, this.level, this.numPages).map((ch) =>
						makeSection(ch.title, filterAnns(this.anns, [ch]), roles, `S. ${ch.from + 1}–${ch.to + 1}`)
				  );
		// Nichts vorwählen – außer es gibt genau einen Abschnitt mit Inhalt.
		const withContent = this.sections.flatMap((x, i) => (x.count ? [i] : []));
		this.selected = new Set(withContent.length === 1 ? withContent : []);
	}

	private async loadToc() {
		this.tocState = "loading";
		this.renderScope();
		try {
			this.pdf = new PdfFile(await this.loadPdf());
			await this.pdf.open();
			this.numPages = this.pdf.numPages;
			this.outline = await this.pdf.outline();
			this.tocNote = this.outline.length ? "" : "Das PDF hat kein Inhaltsverzeichnis.";
		} catch (e: any) {
			this.tocNote = `PDF konnte nicht gelesen werden: ${e.message ?? e}`;
		}
		this.computeSections();
		this.tocState = "done";
		this.renderScope();
	}

	// ---------- Erstellen ----------

	private submit() {
		let jobs: Job[] = [{ anns: this.anns }];
		if (this.mode === "pages") {
			const ranges = parsePageRange(this.pagesInput);
			if (!ranges) return void new Notice("Seitenangabe nicht verständlich – z. B. 1-5, 8, 12-");
			jobs = [{ anns: filterAnns(this.anns, ranges), suffix: formatRanges(ranges) }];
		} else if (this.mode === "sections") {
			const picked = [...this.selected].sort((a, b) => a - b).map((i) => this.sections[i]);
			if (!picked.length) return void new Notice("Bitte mindestens einen Abschnitt wählen.");
			jobs = picked.map((x) => ({ anns: x.anns, title: x.title }));
		}
		const pdf = this.pdf;
		this.pdf = undefined; // Besitz geht an den Exporter
		this.close();
		this.onGo(jobs, pdf);
	}
}
