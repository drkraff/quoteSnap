import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TRADE_TEMPLATES } from "../data/trade-templates.js";
import {
  CATALOG_UNIT_ALIASES,
  VALID_UNITS,
  parseCatalogUnit,
} from "./units.js";

describe("parseCatalogUnit", () => {
  it("accepts the five canonical units used by POST/PUT /catalog", () => {
    for (const unit of VALID_UNITS) {
      assert.equal(parseCatalogUnit(unit), unit);
    }
  });

  it("maps seeded template aliases onto canonical units (edit/save path)", () => {
    assert.equal(parseCatalogUnit("per foot"), "foot");
    assert.equal(parseCatalogUnit("per light"), "each");
    assert.equal(parseCatalogUnit("per vent"), "each");
    assert.equal(parseCatalogUnit("  per foot  "), "foot");
  });

  it("rejects unknown units so they cannot be persisted", () => {
    assert.equal(parseCatalogUnit("ea"), null);
    assert.equal(parseCatalogUnit("per hour"), null);
    assert.equal(parseCatalogUnit(""), null);
    assert.equal(parseCatalogUnit("FOOT"), null);
    assert.equal(parseCatalogUnit(undefined), null);
    assert.equal(parseCatalogUnit(1), null);
  });

  it("only aliases onto members of VALID_UNITS", () => {
    for (const canonical of Object.values(CATALOG_UNIT_ALIASES)) {
      assert.ok((VALID_UNITS as readonly string[]).includes(canonical));
    }
  });
});

describe("TRADE_TEMPLATES units", () => {
  it("uses only canonical units so seed INSERT matches the catalog allow-list", () => {
    for (const items of Object.values(TRADE_TEMPLATES)) {
      for (const item of items) {
        assert.equal(
          parseCatalogUnit(item.unit),
          item.unit,
          `${item.name} unit "${item.unit}" is not a canonical catalog unit`
        );
      }
    }
  });
});
