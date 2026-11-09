import { App, Notice, TFile } from "obsidian";
import { PdfFile } from "./pdf";
import { Candidate, ZoteroClient } from "./zotero";
import { Built, Settings, buildNodes, renderNote, safeName } from "./core";
import { Job, titlesOf } from "./sections";

/** Öffnet das PDF höchstens einmal (nur wenn Bilder gebraucht werden) und meldet einen Fehler nur einmal. */
class LazyPdf {
	private failed = false;
	constructor(private load: () => Promise<ArrayBuffer>, private pdf?: PdfFile) {}

	async get(): Promise<PdfFile | undefined> {
		if (this.pdf || this.failed) return this.pdf;
		try {
			this.pdf = new PdfFile(await this.load());
			await this.pdf.open();
		} catch (e: any) {
			this.failed = true;
			this.pdf = undefined;
			new Notice("Bilder konnten nicht erzeugt werden: " + (e.message ?? e), 8000);
		}
		return this.pdf;
	}

	destroy() {
		this.pdf?.destroy();
	}
}

/** Schreibt die Notizen (und Bilder) eines Exports ins Vault. */
export class Exporter {
	constructor(private app: App, private settings: Settings, private client: ZoteroClient) {}

	/** `pdf`: bereits geöffnetes PDF aus dem Dialog (z. B. für das Inhaltsverzeichnis); wird hier freigegeben. */
	async run(c: Candidate, jobs: Job[], pdf?: PdfFile): Promise<TFile[]> {
		const source = new LazyPdf(() => this.client.pdfBytes(c.key), pdf);
		const files: TFile[] = [];
		try {
			for (const job of jobs) {
				const built = buildNodes(job.anns, this.settings.roles);
				if (!built.nodes.length) continue;
				const title = safeName(this.noteName(c, job));
				const path = await this.freePath(title);
				const images = this.settings.export.images ? await this.saveImages(built, title, path, source) : new Map<string, string>();
				files.push(await this.app.vault.create(path, this.markdown(c, built, images)));
			}
		} finally {
			source.destroy();
		}
		return files;
	}

	/** Name: Abschnittstitel > einzige Titel-Markierung (h0) > PDF-Name (+ Zusatz). */
	private noteName(c: Candidate, job: Job): string {
		const fallback = c.parentTitle ?? c.title;
		const titles = titlesOf(job.anns, this.settings.roles);
		return job.title ?? (titles.length === 1 ? titles[0] : undefined) ?? (job.suffix ? `${fallback} (${job.suffix})` : fallback);
	}

	/** Zielpfad im Zielordner; existiert die Notiz schon, wird nummeriert (nie überschrieben). */
	private async freePath(title: string): Promise<string> {
		const { vault } = this.app;
		const folder = this.settings.folder.replace(/^\/+|\/+$/g, "");
		if (folder && !vault.getAbstractFileByPath(folder)) await vault.createFolder(folder);
		const dir = folder ? folder + "/" : "";
		let path = `${dir}${title}.md`;
		for (let i = 2; vault.getAbstractFileByPath(path); i++) path = `${dir}${title} ${i}.md`;
		return path;
	}

	/** Schneidet die Bildmarkierungen aus dem PDF; liefert Annotation-Key -> Embed-Link. */
	private async saveImages(built: Built, title: string, notePath: string, source: LazyPdf): Promise<Map<string, string>> {
		const links = new Map<string, string>();
		const images = built.nodes.flatMap((n) => (n.t === "image" && n.rect ? [n] : []));
		const pdf = images.length ? await source.get() : undefined;
		if (!pdf) return links;
		let n = 0;
		for (const im of images) {
			try {
				const png = await pdf.crop(im.pageIndex, im.rect!, this.settings.export.imageScale);
				const path = await this.app.fileManager.getAvailablePathForAttachment(`${title} S${im.pageIndex + 1}-${++n}.png`, notePath);
				links.set(im.key, `![[${(await this.app.vault.createBinary(path, png)).name}]]`);
			} catch (e) {
				console.error("Lecture Pro: Bild", e);
			}
		}
		return links;
	}

	private markdown(c: Candidate, built: Built, images: Map<string, string>): string {
		const o = this.settings.export;
		return renderNote(
			built,
			{
				tags: [...this.settings.tags.split(/\s+/), ...(o.zoteroTags ? c.tags : [])],
				attachmentKey: c.key,
				sourceLabel: c.title,
				footer: o.footer,
				pageLinks: o.pageLinks,
			},
			images
		);
	}
}
