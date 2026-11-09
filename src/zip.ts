import { unzipSync } from "fflate";

/** Zotero-WebDAV: KEY.zip enthält die Datei mit base64-kodiertem Namen -> am PDF-Header erkennen. */
export function extractPdf(zip: Uint8Array): Uint8Array | null {
	let best: Uint8Array | null = null;
	for (const data of Object.values(unzipSync(zip))) {
		const isPdf = data.length > 4 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46;
		if (isPdf && (!best || data.length > best.length)) best = data;
	}
	return best;
}
