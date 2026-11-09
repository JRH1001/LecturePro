import { requestUrl } from "obsidian";
import { Conn } from "./core";
import { extractPdf } from "./zip";

export interface Candidate {
	key: string; // Attachment-Key
	title: string;
	parentTitle?: string;
	tags: string[];
	last: string;
}
export interface Check {
	ok: boolean;
	text: string;
}

const LOCAL = "http://127.0.0.1:23119/api/users/0";
const API = "https://api.zotero.org";

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
// Node-Module nur bei Bedarf laden (auf dem Handy gibt es sie nicht).
const nodeFs = () => require("fs") as typeof import("fs");
const nodeUrl = () => require("url") as typeof import("url");
const toBuf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

export class ZoteroClient {
	constructor(private s: () => Conn) {}

	private base() {
		const s = this.s();
		if (s.mode === "local") return LOCAL;
		if (!s.apiKey) throw new Error("Lecture Pro: Zotero API-Key fehlt (Einstellungen).");
		if (!s.userId) throw new Error("Lecture Pro: Zotero User-ID fehlt – 'Verbindung testen' trägt sie automatisch ein.");
		return `${API}/users/${s.userId.trim()}`;
	}

	private headers(): Record<string, string> {
		const s = this.s();
		const h: Record<string, string> = { "Zotero-API-Version": "3", "Zotero-Allowed-Request": "1" };
		if (s.mode === "web") h["Zotero-API-Key"] = s.apiKey.trim();
		return h;
	}

	private async raw(path: string, params: Record<string, string | number> = {}) {
		const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
		const url = this.base() + path + (q ? "?" + q : "");
		let res;
		try {
			res = await requestUrl({ url, headers: this.headers(), throw: false });
		} catch {
			throw new Error(
				this.s().mode === "local"
					? "Zotero nicht erreichbar. Läuft Zotero am PC? (Am Handy: Modus 'Web' nutzen.)"
					: "Zotero-Server nicht erreichbar (Internet?)."
			);
		}
		if (res.status === 403)
			throw new Error(
				this.s().mode === "local"
					? "Zotero blockiert die lokale API: Zotero → Einstellungen → Erweitert → 'Andere Anwendungen auf diesem Computer dürfen mit Zotero kommunizieren' aktivieren."
					: "Zotero-API-Key ungültig oder ohne Leserechte."
			);
		if (res.status === 429) throw new Error("Zotero-API: zu viele Anfragen (429) – kurz warten und erneut versuchen.");
		if (res.status >= 400) throw new Error(`Zotero-API Fehler ${res.status}`);
		return res;
	}

	private async get(path: string, params: Record<string, string | number> = {}): Promise<any[]> {
		return (await this.raw(path, params)).json;
	}

	private async getAll(path: string, params: Record<string, string | number> = {}): Promise<any[]> {
		const out: any[] = [];
		for (let start = 0; start < 5000; start += 100) {
			const page = await this.get(path, { ...params, limit: 100, start });
			out.push(...page);
			if (page.length < 100) break;
		}
		return out;
	}

	/** Zuletzt bearbeitete PDFs mit Markierungen, neueste zuerst. */
	async recentPdfs(): Promise<Candidate[]> {
		const anns = await this.get("/items", { itemType: "annotation", sort: "dateModified", direction: "desc", limit: 100 });
		const last = new Map<string, string>();
		for (const a of anns) {
			const p = a.data?.parentItem;
			if (p && !last.has(p)) last.set(p, a.data.dateModified ?? "");
		}
		const keys = [...last.keys()].slice(0, 20);
		if (!keys.length) return [];
		const atts = (await this.get("/items", { itemKey: keys.join(",") })).filter(
			(a) => a.data?.contentType === "application/pdf"
		);
		const pKeys = [...new Set(atts.map((a) => a.data.parentItem).filter(Boolean))] as string[];
		const parents = new Map<string, any>();
		if (pKeys.length) for (const p of await this.get("/items", { itemKey: pKeys.join(",") })) parents.set(p.key, p.data);
		return atts
			.map((a) => {
				const p = parents.get(a.data.parentItem);
				return {
					key: a.key as string,
					title: (a.data.title || a.data.filename || "Vorlesung") as string,
					parentTitle: p?.title as string | undefined,
					tags: [...(a.data.tags ?? []), ...(p?.tags ?? [])].map((t: any) => t.tag as string),
					last: last.get(a.key) ?? "",
				};
			})
			.sort((x, y) => y.last.localeCompare(x.last));
	}

	async annotationsOf(attKey: string): Promise<any[]> {
		return (await this.getAll(`/items/${attKey}/children`)).map((i) => i.data).filter((d) => d.itemType === "annotation");
	}

	private davBase(key: string) {
		return `${this.s().webdavUrl.trim().replace(/\/+$/, "")}/zotero/${key}`;
	}

	private async dav(key: string, ext: "zip" | "prop") {
		const s = this.s();
		try {
			return await requestUrl({
				url: `${this.davBase(key)}.${ext}`,
				headers: { Authorization: "Basic " + b64(`${s.webdavUser}:${s.davPass}`) },
				throw: false,
			});
		} catch {
			throw new Error("WebDAV-Server nicht erreichbar (URL/Internet prüfen).");
		}
	}

	private davError(status: number) {
		if (status === 401 || status === 403) return "WebDAV: Benutzername/Passwort falsch.";
		if (status === 404) return "Datei nicht auf dem WebDAV-Server (hat Zotero sie schon hochgeladen?).";
		return `WebDAV-Fehler ${status}`;
	}

	/** PDF-Bytes: lokal von der Platte; Web-Modus per WebDAV (Zip) oder Zotero-Speicher. */
	async pdfBytes(attKey: string): Promise<ArrayBuffer> {
		const s = this.s();
		if (s.mode === "local") return toBuf(nodeFs().readFileSync(await this.localFile(attKey)));
		if (!s.webdavUrl.trim()) return (await this.raw(`/items/${attKey}/file`)).arrayBuffer;
		const res = await this.dav(attKey, "zip");
		if (res.status >= 400) throw new Error(this.davError(res.status));
		const pdf = extractPdf(new Uint8Array(res.arrayBuffer));
		if (!pdf) throw new Error("Kein PDF im WebDAV-Archiv gefunden.");
		return toBuf(pdf);
	}

	private async localFile(attKey: string): Promise<string> {
		const url = (await this.raw(`/items/${attKey}/file/view/url`)).text.trim();
		return nodeUrl().fileURLToPath(url);
	}

	/** Ende-zu-Ende-Prüfung: Zotero → Markierungen → Dateizugriff. */
	async test(setUserId: (id: string) => void): Promise<Check[]> {
		const out: Check[] = [];
		const s = this.s();
		const fail = (e: any) => {
			out.push({ ok: false, text: String(e?.message ?? e) });
			return out;
		};
		try {
			if (s.mode === "web") {
				if (!s.apiKey) return fail(new Error("API-Key fehlt."));
				let res;
				try {
					res = await requestUrl({ url: `${API}/keys/${s.apiKey.trim()}`, headers: this.headers(), throw: false });
				} catch {
					return fail(new Error("Zotero-Server nicht erreichbar (Internet?)."));
				}
				if (res.status >= 400) return fail(new Error("API-Key ungültig."));
				const k = res.json;
				if (!k.access?.user?.library) return fail(new Error("Key hat keinen Lesezugriff auf deine Bibliothek."));
				if (!s.userId || s.userId.trim() !== String(k.userID)) setUserId(String(k.userID));
				out.push({ ok: true, text: `Key gültig (User ${k.userID}${k.username ? ", " + k.username : ""}, Lesezugriff)` });
			} else {
				await this.raw("/items", { limit: 1 });
				out.push({ ok: true, text: "Zotero lokal erreichbar" });
			}

			const recent = await this.recentPdfs();
			if (!recent.length) {
				out.push({ ok: false, text: "Verbunden, aber keine PDFs mit Markierungen gefunden (Sync abgeschlossen?)." });
				return out;
			}
			const c = recent[0];
			out.push({ ok: true, text: `${recent.length} PDF(s) mit Markierungen, zuletzt: ${c.parentTitle ?? c.title}` });

			if (s.mode === "local") {
				const exists = nodeFs().existsSync(await this.localFile(c.key));
				out.push({
					ok: exists,
					text: exists ? "PDF-Datei lokal gefunden (Bilder möglich)" : "PDF-Datei fehlt lokal – in Zotero einmal öffnen, dann klappen Bilder.",
				});
			} else if (s.webdavUrl.trim()) {
				const r = await this.dav(c.key, "prop");
				out.push({
					ok: r.status < 400,
					text: r.status < 400 ? "WebDAV erreichbar, Datei gefunden (Bilder möglich)" : this.davError(r.status),
				});
			} else {
				out.push({ ok: true, text: "Dateien: Zotero-Speicher (kein WebDAV eingetragen) – nur für Bilder nötig." });
			}
		} catch (e) {
			fail(e);
		}
		return out;
	}
}
