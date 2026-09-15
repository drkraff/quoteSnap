import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  capOldQuoteDocuments,
  classifyOldQuoteDocument,
  extractTextFromOldQuoteDocument,
  IMAGE_OCR_STUB_REASON,
  PDF_OCR_STUB_REASON,
} from "./import-files.js";
import { MAX_OLD_QUOTE_FILES } from "./import-parse.js";

describe("classifyOldQuoteDocument", () => {
  it("classifies text, image, and pdf from mime or filename", () => {
    assert.equal(classifyOldQuoteDocument({ mime: "text/plain" }), "text");
    assert.equal(classifyOldQuoteDocument({ filename: "old.txt" }), "text");
    assert.equal(classifyOldQuoteDocument({ mime: "image/jpeg" }), "image");
    assert.equal(classifyOldQuoteDocument({ filename: "scan.png" }), "image");
    assert.equal(classifyOldQuoteDocument({ mime: "application/pdf" }), "pdf");
    assert.equal(classifyOldQuoteDocument({ filename: "quote.pdf" }), "pdf");
    assert.equal(classifyOldQuoteDocument({ filename: "notes.docx" }), "unsupported");
  });
});

describe("extractTextFromOldQuoteDocument", () => {
  it("uses provided text and stubs image/pdf OCR as paste-needed", () => {
    assert.deepEqual(
      extractTextFromOldQuoteDocument({
        filename: "lines.txt",
        mime: "text/plain",
        text: "Replace outlet each $85",
      }),
      {
        status: "text",
        text: "Replace outlet each $85",
        filename: "lines.txt",
      },
    );
    assert.deepEqual(
      extractTextFromOldQuoteDocument({ filename: "scan.jpg", mime: "image/jpeg" }),
      { status: "needs_paste", reason: IMAGE_OCR_STUB_REASON, filename: "scan.jpg" },
    );
    assert.deepEqual(
      extractTextFromOldQuoteDocument({ filename: "old.pdf", mime: "application/pdf" }),
      { status: "needs_paste", reason: PDF_OCR_STUB_REASON, filename: "old.pdf" },
    );
  });
});

describe("capOldQuoteDocuments", () => {
  it("keeps at most three files", () => {
    assert.equal(MAX_OLD_QUOTE_FILES, 3);
    assert.deepEqual(capOldQuoteDocuments(["a", "b", "c", "d"]), ["a", "b", "c"]);
  });
});
