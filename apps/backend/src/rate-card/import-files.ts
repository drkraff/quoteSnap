/**
 * Old-quote file extract hooks (design §5).
 * Text documents parse; images/PDFs return a calm paste-needed status.
 * No OCR / Vision in this slice — do not invent prices from pixels.
 * Keep in sync with apps/mobile/src/rate-card/import-files.ts.
 */

import { MAX_OLD_QUOTE_FILES } from "./import-parse.js";

export const IMAGE_OCR_STUB_REASON = "image_ocr_stub" as const;
export const PDF_OCR_STUB_REASON = "pdf_ocr_stub" as const;
export const UNSUPPORTED_FILE_REASON = "unsupported" as const;
export const EMPTY_DOCUMENT_REASON = "empty" as const;

export type UnreadableOldQuoteReason =
  | typeof IMAGE_OCR_STUB_REASON
  | typeof PDF_OCR_STUB_REASON
  | typeof UNSUPPORTED_FILE_REASON
  | typeof EMPTY_DOCUMENT_REASON;

export type OldQuoteFileKind = "text" | "image" | "pdf" | "unsupported";

export type OldQuoteDocumentInput = {
  filename?: string;
  mime?: string;
  text?: string;
};

export type ExtractedOldQuoteText =
  | { status: "text"; text: string; filename: string }
  | {
      status: "needs_paste";
      reason: UnreadableOldQuoteReason;
      filename: string;
    };

const TEXT_MIMES = new Set([
  "text/plain",
  "text/csv",
  "text/tab-separated-values",
]);

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function extensionOf(filename: string): string {
  const base = filename.trim().toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot) : "";
}

export function classifyOldQuoteDocument(args: {
  mime?: string;
  filename?: string;
}): OldQuoteFileKind {
  const mime = (args.mime ?? "").trim().toLowerCase();
  const ext = extensionOf(args.filename ?? "");
  if (TEXT_MIMES.has(mime) || ext === ".txt" || ext === ".csv" || ext === ".tsv") {
    return "text";
  }
  if (mime === "application/pdf" || ext === ".pdf") {
    return "pdf";
  }
  if (IMAGE_MIMES.has(mime) || [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(ext)) {
    return "image";
  }
  return "unsupported";
}

export function extractTextFromOldQuoteDocument(
  doc: OldQuoteDocumentInput,
): ExtractedOldQuoteText {
  const filename = (doc.filename ?? "document").trim() || "document";
  const provided = typeof doc.text === "string" ? doc.text.trim() : "";
  if (provided !== "") {
    return { status: "text", text: doc.text as string, filename };
  }

  const kind = classifyOldQuoteDocument({ mime: doc.mime, filename: doc.filename });
  if (kind === "image") {
    return { status: "needs_paste", reason: IMAGE_OCR_STUB_REASON, filename };
  }
  if (kind === "pdf") {
    return { status: "needs_paste", reason: PDF_OCR_STUB_REASON, filename };
  }
  if (kind === "text") {
    return { status: "needs_paste", reason: EMPTY_DOCUMENT_REASON, filename };
  }
  return { status: "needs_paste", reason: UNSUPPORTED_FILE_REASON, filename };
}

export function capOldQuoteDocuments<T>(docs: T[]): T[] {
  if (!Array.isArray(docs)) {
    return [];
  }
  return docs.slice(0, MAX_OLD_QUOTE_FILES);
}

export function joinExtractedQuoteTexts(texts: string[]): string {
  return texts
    .map((text) => text.trim())
    .filter((text) => text !== "")
    .join("\n");
}
