import {deflateSync} from "node:zlib";
import type {PickedFile} from "./attachments.ts";

/**
 * The paper images a spec picks (step 4 contract § 8.4), by name, type and bytes, never by path (attachments contract § 3). Written out here, with no library: real images a browser decodes.
 * The two proportions tell a stretched picture from a true one (TPL-662). `corruptPng` passes the server (the signature is all it reads) and fails in the browser (TPL-718).
 */

const CRC_TABLE = Array.from({length: 256}, (_, n) => {
    let c = n;
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

const crc32 = (bytes: Buffer) => {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer) => {
    const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A real 8-bit RGB PNG of this size, one color. */
export const solidPng = (width: number, height: number, [red, green, blue]: [number, number, number] = [250, 240, 200]) => {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header.writeUInt8(8, 8);
    header.writeUInt8(2, 9);
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) row.set([red, green, blue], 1 + x * 3);
    const pixels = Buffer.concat(Array.from({length: height}, () => row));
    return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
};

/** A real 74 x 105 JPEG, the proportions of A5 (a 2 px navy frame on a cream ground). */
export const PAPER_JPEG = Buffer.from(
    "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",
    "base64",
);

/** A PNG picture with A5's proportions. */
export const paperPng = (name = "paper.png"): PickedFile => ({name, mimeType: "image/png", buffer: solidPng(148, 210)});
/** A PNG with other proportions: twice as wide as high (TPL-662). */
export const widePaperPng = (name = "wide.png"): PickedFile => ({name, mimeType: "image/png", buffer: solidPng(200, 100, [200, 220, 250])});
export const paperJpeg = (name = "paper.jpg"): PickedFile => ({name, mimeType: "image/jpeg", buffer: PAPER_JPEG});
/** A PNG's signature with a broken body: the server stores it, the browser can't decode it. */
export const corruptPng = (name = "broken.png"): PickedFile =>
    ({name, mimeType: "image/png", buffer: Buffer.concat([PNG_SIGNATURE, Buffer.from("this is not a picture")])});
/** Refused by the type (TPL-652): a PDF, a WebP, and a PNG's name on other bytes. */
export const paperPdf = (name = "paper.pdf"): PickedFile => ({name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n%%EOF\n")});
export const paperWebp = (name = "paper.webp"): PickedFile =>
    ({name, mimeType: "image/webp", buffer: Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")])});
/** A PNG's bytes named `.jpg`: the extension's type isn't proved. */
export const pngNamedJpg = (name = "paper.jpg"): PickedFile => ({name, mimeType: "image/jpeg", buffer: solidPng(8, 8)});
