import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { query, withTransaction } from "../db/connection.js";
import { authLimiter } from "../auth/auth-limiter.js";
import {
  ContractorPayload,
  RegisterBody,
  LoginBody,
  RefreshBody,
  LogoutBody,
  TokenPair,
} from "../types/auth.js";
import { resolveLoginIdentifier } from "../auth/login-lookup.js";
import {
  INSERT_REFRESH_TOKEN_SQL,
  generateRefreshToken,
  hashRefreshToken,
  rotateRefreshToken,
} from "../auth/refresh.js";

export const router = Router();

const SALT_ROUNDS = 12;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── helpers ──────────────────────────────────────────────────────────────────

function generateAccessToken(payload: ContractorPayload): string {
  const secret = process.env["JWT_ACCESS_SECRET"];
  if (!secret) throw new Error("JWT_ACCESS_SECRET not set");
  return jwt.sign(payload, secret, { expiresIn: "15m" });
}

async function issueTokenPair(contractorId: string, email: string | null, phone: string | null): Promise<TokenPair> {
  const payload: ContractorPayload = { contractorId, email, phone };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);

  await query(INSERT_REFRESH_TOKEN_SQL, [contractorId, tokenHash]);

  return { accessToken, refreshToken };
}

// ── POST /register ────────────────────────────────────────────────────────────

router.post("/register", authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as RegisterBody;
    const { email, phone, password, displayName } = body;

    // Validate: password required, at least one of email or phone
    if (!password || password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }
    if (!email && !phone) {
      res.status(400).json({ error: "Email or phone is required" });
      return;
    }
    if (email && !EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: "Invalid email format" });
      return;
    }
    if (phone !== undefined && phone !== null && phone.trim() === "") {
      res.status(400).json({ error: "Phone cannot be empty" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await query(
      `INSERT INTO contractors (email, phone, password_hash, display_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, phone, display_name, trade`,
      [email ?? null, phone ?? null, passwordHash, displayName ?? null]
    );

    const contractor = result.rows[0] as {
      id: string;
      email: string | null;
      phone: string | null;
      display_name: string | null;
      trade: string | null;
    };

    const tokens = await issueTokenPair(contractor.id, contractor.email, contractor.phone);

    res.status(201).json({
      contractor: {
        id: contractor.id,
        email: contractor.email,
        phone: contractor.phone,
        displayName: contractor.display_name,
        trade: contractor.trade,
      },
      ...tokens,
    });
  } catch (err: unknown) {
    const pgError = err as { code?: string };
    if (pgError.code === "23505") {
      res.status(409).json({ error: "Account already exists" });
      return;
    }
    console.error("Register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /login ───────────────────────────────────────────────────────────────

router.post("/login", authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as LoginBody;
    const { email, phone, password } = body;

    if (!password) {
      res.status(400).json({ error: "Password is required" });
      return;
    }

    const identifier = resolveLoginIdentifier(email, phone);
    if (!identifier) {
      res.status(400).json({ error: "Email or phone is required" });
      return;
    }

    // Look up by exactly one identifier. An OR across email|phone with LIMIT 1
    // can return a different contractor when the payload mixes both fields.
    const result =
      identifier.field === "email"
        ? await query(
            `SELECT id, email, phone, display_name, trade, password_hash
             FROM contractors
             WHERE email = $1
             LIMIT 1`,
            [identifier.value]
          )
        : await query(
            `SELECT id, email, phone, display_name, trade, password_hash
             FROM contractors
             WHERE phone = $1
             LIMIT 1`,
            [identifier.value]
          );

    if (result.rows.length === 0) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const contractor = result.rows[0] as {
      id: string;
      email: string | null;
      phone: string | null;
      display_name: string | null;
      trade: string | null;
      password_hash: string;
    };

    const passwordMatch = await bcrypt.compare(password, contractor.password_hash);
    if (!passwordMatch) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const tokens = await issueTokenPair(contractor.id, contractor.email, contractor.phone);

    res.status(200).json({
      contractor: {
        id: contractor.id,
        email: contractor.email,
        phone: contractor.phone,
        displayName: contractor.display_name,
        trade: contractor.trade,
      },
      ...tokens,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /refresh ─────────────────────────────────────────────────────────────

router.post("/refresh", authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as RefreshBody;
    const { refreshToken } = body;

    if (!refreshToken) {
      res.status(400).json({ error: "refreshToken is required" });
      return;
    }

    const outcome = await withTransaction((txQuery) =>
      rotateRefreshToken(txQuery, {
        refreshToken,
        signAccessToken: generateAccessToken,
      }),
    );

    res.status(outcome.status).json(outcome.json);
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /logout ──────────────────────────────────────────────────────────────

router.post("/logout", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as LogoutBody;
    const { refreshToken } = body;

    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      await query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
        [tokenHash]
      );
    }

    // Always return 200 — no information leak about token validity
    res.status(200).json({ message: "Logged out" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
