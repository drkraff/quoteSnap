import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CLIENT_SENTENCE_MAX_LENGTH } from "../quotes/client-sentence.js";
import { joinAssumptionsToClientSentence } from "./assumptions.js";

describe("joinAssumptionsToClientSentence", () => {
  it("joins extract assumptions into one editable quote-level string", () => {
    assert.equal(
      joinAssumptionsToClientSentence(["appliances not included"]),
      "appliances not included",
    );
    assert.equal(
      joinAssumptionsToClientSentence([
        "Appliances not included.",
        "Decorative lighting not included.",
      ]),
      "Appliances not included.\nDecorative lighting not included.",
    );
  });

  it("accepts a single string the same way as a one-item array", () => {
    assert.equal(
      joinAssumptionsToClientSentence("  appliances not included  "),
      "appliances not included",
    );
  });

  it("returns null when the extract has no assumptions (does not invent copy)", () => {
    assert.equal(joinAssumptionsToClientSentence(undefined), null);
    assert.equal(joinAssumptionsToClientSentence(null), null);
    assert.equal(joinAssumptionsToClientSentence([]), null);
    assert.equal(joinAssumptionsToClientSentence(["  ", ""]), null);
    assert.equal(joinAssumptionsToClientSentence(12), null);
    assert.equal(joinAssumptionsToClientSentence([{ text: "nope" }]), null);
  });

  it("caps length so a transcript cannot dump into the column", () => {
    const tooLong = "x".repeat(CLIENT_SENTENCE_MAX_LENGTH + 8);
    expectLength(joinAssumptionsToClientSentence([tooLong]), CLIENT_SENTENCE_MAX_LENGTH);
  });
});

function expectLength(value: string | null, expected: number): void {
  assert.equal(value?.length, expected);
}
