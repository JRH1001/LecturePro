import { App, PluginSettingTab, Setting, TextComponent } from "obsidian";
import type LecturePro from "./main";
import { DEFAULT_ROLES, PALETTE, Role, Settings } from "./core";
import { KEY_ID, PASS_ID } from "./secrets";

const ROLE_LABELS: Record<Role, string> = {
	h0: "Titel der Zusammenfassung (h0)",
	h1: "Überschrift 1",
	h2: "Überschrift 2",
	h3: "Überschrift 3",
	h4: "Überschrift 4",
	fact: "Fakt (Stichpunkt)",
	example: "Beispiel (Stichpunkt mit „Bsp.:“)",
	ignore: "Ignorieren",
};

export class LectureSettings extends PluginSettingTab {
	constructor(app: App, private p: LecturePro) {
		super(app, p);
	}

	display() {
		const el = this.containerEl;
		el.empty();
		this.connection(el);
		this.general(el);
		this.colors(el);
	}

	private get s(): Settings {
		return this.p.settings;
	}

	/** Eintrag speichern, sobald sich das Feld ändert. */
	private persist(apply: () => void) {
		return () => {
			apply();
			void this.p.save();
		};
	}

	/** Passwortfeld, dessen Wert im SecretStorage liegt statt in data.json. */
	private secretField(setting: Setting, id: string, trim = false) {
		setting.addText((t) => {
			t.inputEl.type = "password";
			t.setValue(this.app.secretStorage.getSecret(id) ?? "").onChange((v) => this.app.secretStorage.setSecret(id, trim ? v.trim() : v));
		});
	}

	// ---------- Verbindung ----------

	private connection(el: HTMLElement) {
		const s = this.s;
		let userIdField: TextComponent | undefined;

		new Setting(el)
			.setName("Zotero-Verbindung")
			.setDesc(
				"Lokal: Zotero am PC muss laufen (Einstellungen → Erweitert → andere Anwendungen erlauben). Web: funktioniert auch am Handy und ist die richtige Wahl, wenn du mit Zotflow markierst (liest die Zotero-Cloud, sobald Zotflow gesynct hat)."
			)
			.addDropdown((d) =>
				d.addOption("local", "Lokal (PC)").addOption("web", "Web (API-Key)").setValue(s.mode).onChange(async (v) => {
					s.mode = v as Settings["mode"];
					await this.p.save();
					this.display();
				})
			);

		if (s.mode === "web") {
			this.secretField(
				new Setting(el).setName("Zotero API-Key (nur Lesen reicht)").setDesc("Wird sicher in Obsidians SecretStorage abgelegt (pro Gerät, nicht im Vault)."),
				KEY_ID,
				true
			);
			new Setting(el).setName("Zotero User-ID").setDesc("Wird beim Verbindungstest automatisch aus dem Key ermittelt.").addText((t) => {
				userIdField = t;
				t.setValue(s.userId).onChange(this.persist(() => (s.userId = t.getValue().trim())));
			});
			new Setting(el)
				.setName("WebDAV-URL (optional)")
				.setDesc("Nur wenn Zotero Dateien per WebDAV synchronisiert – dieselbe URL wie in Zotero (ohne /zotero). Nötig für Bilder und Kapitel im Web-Modus.")
				.addText((t) => t.setPlaceholder("https://…").setValue(s.webdavUrl).onChange(this.persist(() => (s.webdavUrl = t.getValue()))));
			new Setting(el).setName("WebDAV-Benutzer").addText((t) => t.setValue(s.webdavUser).onChange(this.persist(() => (s.webdavUser = t.getValue()))));
			this.secretField(new Setting(el).setName("WebDAV-Passwort"), PASS_ID);
		}

		const result = createDiv();
		new Setting(el)
			.setName("Verbindung testen")
			.setDesc("Prüft Zotero, Markierungen und Dateizugriff (inkl. WebDAV) in einem Schritt.")
			.addButton((b) =>
				b.setButtonText("Testen").setCta().onClick(async () => {
					b.setDisabled(true).setButtonText("Teste …");
					result.empty();
					const checks = await this.p.client.test((id) => {
						s.userId = id;
						userIdField?.setValue(id);
						void this.p.save();
					});
					for (const c of checks)
						result.createDiv({ text: `${c.ok ? "✓" : "✗"} ${c.text}`, attr: { style: `color:var(--text-${c.ok ? "success" : "error"});margin:.2em 0` } });
					b.setDisabled(false).setButtonText("Testen");
				})
			);
		el.appendChild(result);
	}

	// ---------- Allgemeines ----------

	private general(el: HTMLElement) {
		const s = this.s;
		new Setting(el).setName("Zielordner").addText((t) => t.setValue(s.folder).onChange(this.persist(() => (s.folder = t.getValue()))));
		new Setting(el)
			.setName("Standard-Tags")
			.setDesc("Zusätzlich werden Tags des Zotero-Eintrags übernommen. Weitere Optionen (Bereich, Bilder, Bildauflösung, Seitenverweise …) stehen im Export-Dialog unter „Erweitert“.")
			.addText((t) => t.setValue(s.tags).onChange(this.persist(() => (s.tags = t.getValue()))));
	}

	// ---------- Farben ----------

	private colors(el: HTMLElement) {
		const s = this.s;
		new Setting(el).setName("Farben").setHeading();
		PALETTE.forEach((c, i) => {
			const row = new Setting(el).setName(`Taste ${i + 1} · ${c.name}`);
			row.nameEl.prepend(createSpan({ attr: { style: `display:inline-block;width:.8em;height:.8em;border-radius:50%;margin-right:.5em;background:${c.hex}` } }));
			row.addDropdown((d) => {
				for (const r of Object.keys(ROLE_LABELS) as Role[]) d.addOption(r, ROLE_LABELS[r]);
				d.setValue(s.roles[c.hex] ?? "fact").onChange(this.persist(() => (s.roles[c.hex] = d.getValue() as Role)));
			});
		});
		new Setting(el)
			.setDesc("„Taste“ = Ziffer im Reader bei aktivem Markieren-Werkzeug (Zotflow-Reader).")
			.addButton((b) =>
				b.setButtonText("Farben zurücksetzen").onClick(async () => {
					s.roles = { ...DEFAULT_ROLES };
					await this.p.save();
					this.display();
				})
			);
	}
}
