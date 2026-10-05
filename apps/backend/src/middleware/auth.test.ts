import { describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { authenticateToken } from "./auth.js";

const SECRET = "test-secret-at-least-32-characters-long";
const CONTRACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function run(token: string | null): { status: number | null; body: unknown; next: boolean } {
  const prev = process.env["JWT_ACCESS_SECRET"];
  process.env["JWT_ACCESS_SECRET"] = SECRET;
  const result = { status: null as number | null, body: undefined as unknown, next: false };
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as Request;
  const res = {
    status(code: number) {
      result.status = code;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  } as Response;
  const next: NextFunction = () => {
    result.next = true;
  };
  try {
    authenticateToken(req, res, next);
  } finally {
    if (prev === undefined) delete process.env["JWT_ACCESS_SECRET"];
    else process.env["JWT_ACCESS_SECRET"] = prev;
  }
  return result;
}

describe("authenticateToken", () => {
  it("rejects an HS512 token signed with the same secret", () => {
    const token = jwt.sign(
      { contractorId: CONTRACTOR_ID, email: "a@example.com", phone: null },
      SECRET,
      { algorithm: "HS512", expiresIn: "15m" },
    );
    const result = run(token);
    assert.equal(result.next, false);
    assert.equal(result.status, 401);
    assert.deepEqual(result.body, { error: "Invalid or expired token" });
  });

  it("rejects an HS256 token whose contractorId is not a UUID", () => {
    const token = jwt.sign(
      { contractorId: "../x", email: null, phone: null },
      SECRET,
      { algorithm: "HS256", expiresIn: "15m" },
    );
    const result = run(token);
    assert.equal(result.next, false);
    assert.equal(result.status, 401);
  });

  it("accepts an HS256 token with a UUID contractorId", () => {
    const token = jwt.sign(
      { contractorId: CONTRACTOR_ID, email: "a@example.com", phone: null },
      SECRET,
      { algorithm: "HS256", expiresIn: "15m" },
    );
    const result = run(token);
    assert.equal(result.next, true);
    assert.equal(result.status, null);
  });
});
