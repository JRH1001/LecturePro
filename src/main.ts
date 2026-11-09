import { Notice, Plugin } from "obsidian";
import { ExportModal, PickModal } from "./modals";
import { Exporter } from "./exporter";
import { LectureSettings } from "./settings-tab";
import { KEY_ID, PASS_ID } from "./secrets";
import { Candidate, ZoteroClient } from "./zotero";
import { Conn, DEFAULT_SETTINGS, Settings, loadExport, migrateRoles, toAnn } from "./core";
import { Job } from "./sections";
import { PdfFile } from "./pdf";

const COMMAND = "Vorlesung aus Zotero importieren";
const notifyError = (e: any) => new Notice(String(e?.message ?? e), 10000);

export default class LecturePro extends Plugin {
	settings!: Settings;
	client = new ZoteroClient(() => this.conn());

	async onload() {
		await this.loadSettings();
		this.addRibbonIcon("graduation-cap", COMMAND, () => this.start());
		this.addCommand({ id: "import", name: COMMAND, callback: () => this.start() });
		this.addSettingTab(new LectureSettings(this.app, this));
	}

	save() {
		return this.saveData(this.settings);
	}

	/** Einstellungen + Geheimnisse aus dem SecretStorage (für den Zotero-Client). */
	conn(): Conn {
		const secrets = this.app.secretStorage;
		return { ...this.settings, apiKey: secrets.getSecret(KEY_ID) ?? "", davPass: secrets.getSecret(PASS_ID) ?? "" };
	}

	private async loadSettings() {
		const saved = (await this.loadData()) ?? {};
		this.settings = {
			...DEFAULT_SETTINGS,
			...saved,
			roles: migrateRoles(saved.roles), // Altbelegung (Magenta = Titel) auf die neue Standardbelegung heben
			export: loadExport(saved.export),
		};
		// Migration: API-Key aus data.json in den sicheren Speicher verschieben
		if (saved.apiKey) this.app.secretStorage.setSecret(KEY_ID, saved.apiKey);
		delete (this.settings as Partial<Record<"apiKey", string>>).apiKey;
		await this.save();
	}

	/** Ablauf: Vorlesung wählen → Export-Dialog → Notizen schreiben. */
	async start() {
		try {
			const items = await this.client.recentPdfs();
			if (!items.length) return void new Notice("Keine Zotero-Markierungen gefunden.");
			new PickModal(this.app, items, (c) => this.openExportDialog(c)).open();
		} catch (e) {
			notifyError(e);
		}
	}

	private async openExportDialog(c: Candidate) {
		try {
			const anns = (await this.client.annotationsOf(c.key)).map(toAnn);
			if (!anns.length) return void new Notice("Keine Markierungen in dieser PDF.");
			new ExportModal(
				this.app,
				this.settings,
				() => void this.save(),
				c,
				anns,
				() => this.client.pdfBytes(c.key),
				(jobs, pdf) => this.export(c, jobs, pdf)
			).open();
		} catch (e) {
			notifyError(e);
		}
	}

	private async export(c: Candidate, jobs: Job[], pdf?: PdfFile) {
		try {
			const files = await new Exporter(this.app, this.settings, this.client).run(c, jobs, pdf);
			if (!files.length) return void new Notice("Keine verwertbaren Markierungen im gewählten Bereich (alles grau/ignoriert?).");
			if (this.settings.export.open) await this.app.workspace.getLeaf(false).openFile(files[0]);
			const folder = this.settings.folder.replace(/^\/+|\/+$/g, "") || "/";
			new Notice(files.length === 1 ? `Lecture Pro: Notiz „${files[0].basename}“ erstellt.` : `Lecture Pro: ${files.length} Notizen in „${folder}“ erstellt.`);
		} catch (e) {
			notifyError(e);
		}
	}
}
