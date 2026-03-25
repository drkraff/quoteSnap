import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ContractorPayload } from "../types/auth.js";

declare global {
  namespace Express {
    interface Request {
      contractor?: ContractorPayload;
    }
  }
}

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const secret = process.env["JWT_ACCESS_SECRET"];
  if (!secret) {
    res.status(500).json({ error: "Internal server error" });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as ContractorPayload;
    req.contractor = {
      contractorId: payload.contractorId,
      email: payload.email,
      phone: payload.phone,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
