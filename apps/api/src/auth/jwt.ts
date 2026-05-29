import jwt from "jsonwebtoken";

export class SessionExpiredError extends Error {}
export interface SessionClaims { userId: string; }

export function signSession(claims: SessionClaims, secret: string, opts: { ttlSec: number; nowSec?: number }): string {
  const iat = opts.nowSec ?? Math.floor(Date.now() / 1000);
  return jwt.sign({ userId: claims.userId, iat, exp: iat + opts.ttlSec }, secret, { algorithm: "HS256" });
}

export function verifySession(token: string, secret: string, opts?: { nowSec?: number }): SessionClaims {
  try {
    const now = opts?.nowSec;
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      clockTimestamp: now, // deterministic in tests
    }) as { userId: string };
    return { userId: decoded.userId };
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) throw new SessionExpiredError("session expired");
    throw e;
  }
}
