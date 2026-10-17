import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { types } from "pg";
import { installPgNumericParser, parsePgNumeric, PG_NUMERIC_OID } from "./pg-numeric.js";

describe("pg numeric parser", () => {
  it("turns numeric text into a finite number", () => {
    assert.equal(parsePgNumeric("10.00"), 10);
    assert.equal(typeof parsePgNumeric("10.00"), "number");
    assert.equal(parsePgNumeric("0.50"), 0.5);
    assert.equal(parsePgNumeric("8.250"), 8.25);
    assert.equal(parsePgNumeric("0.10"), 0.1);
    assert.throws(() => parsePgNumeric("nope"), /Invalid numeric value/);
    assert.throws(() => parsePgNumeric(""), /Invalid numeric value/);
  });

  it("replaces node-pg's string parser for numeric and decimal", () => {
    assert.equal(types.builtins.NUMERIC, PG_NUMERIC_OID);
    const previous = types.getTypeParser(PG_NUMERIC_OID);
    types.setTypeParser(PG_NUMERIC_OID, (value: string) => value);
    try {
      assert.equal(types.getTypeParser(PG_NUMERIC_OID)("10.00"), "10.00");
      installPgNumericParser();
      const parse = types.getTypeParser(PG_NUMERIC_OID);
      assert.equal(parse("10.00"), 10);
      assert.equal(typeof parse("10.00"), "number");
      assert.equal(parse("8.250"), 8.25);
      assert.equal(parse("0.50"), 0.5);
    } finally {
      types.setTypeParser(PG_NUMERIC_OID, previous);
    }
  });
});
