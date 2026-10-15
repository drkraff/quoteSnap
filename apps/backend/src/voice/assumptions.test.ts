import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CLIENT_SENTENCE_MAX_LENGTH } from "../quotes/client-sentence.js";
import { joinAssumptionsToClientSentence, splitVoiceCustomerCopy } from "./assumptions.js";

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
    assert.equal(
      joinAssumptionsToClientSentence([
        "Sockets are 80 shekels each, plus 150 for cable and materials.",
      ]),
      null,
    );
    assert.equal(
      joinAssumptionsToClientSentence([
        "Sockets are 80 shekels each, plus 150 for cable and materials.",
        "Appliances not included.",
      ]),
      "Appliances not included.",
    );
    assert.equal(joinAssumptionsToClientSentence([{ text: "nope" }]), null);
  });

  it("caps length so a transcript cannot dump into the column", () => {
    const tooLong = "x".repeat(CLIENT_SENTENCE_MAX_LENGTH + 8);
    expectLength(joinAssumptionsToClientSentence([tooLong]), CLIENT_SENTENCE_MAX_LENGTH);
  });
});

describe("splitVoiceCustomerCopy", () => {
  it("keeps the sentence as the note and puts spoken exclusions in Not included", () => {
    const both = splitVoiceCustomerCopy(
      {
        clientSentence: "Replace the kitchen outlet.",
        assumptions: ["permit not included"],
      },
      "Replace the kitchen outlet. Permit not included.",
    );
    assert.equal(both.clientSentence, "Replace the kitchen outlet.");
    assert.equal(both.exclusions, "permit not included");

    const spokenOnly = splitVoiceCustomerCopy(
      { clientSentence: null, assumptions: [] },
      "outlet install, permit not included",
    );
    assert.equal(spokenOnly.clientSentence, null);
    assert.equal(spokenOnly.exclusions, "permit not included");

    const none = splitVoiceCustomerCopy(
      { clientSentence: "Replace the outlet.", assumptions: [] },
      "Replace the outlet.",
    );
    assert.equal(none.clientSentence, "Replace the outlet.");
    assert.equal(none.exclusions, null);
  });
});

function expectLength(value: string | null, expected: number): void {
  assert.equal(value?.length, expected);
}
