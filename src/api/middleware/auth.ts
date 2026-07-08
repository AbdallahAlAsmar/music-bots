import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";
import { env } from "../../config/env.js";

export type AuthUser = {
  id: string;
  username: string;
};

export type AuthVariables = {
  user: AuthUser;
};

const secret = () => new TextEncoder().encode(env.jwtSecret);

export async function signAuthToken(userId: string, username: string): Promise<string> {
  const { SignJWT } = await import("jose");
  return new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifyAuthToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, secret());
  const id = payload.sub;
  if (!id) {
    throw new Error("Invalid token subject");
  }
  const username = typeof payload.username === "string" ? payload.username : "user";
  return { id, username };
}

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const user = await verifyAuthToken(header.slice("Bearer ".length));
    c.set("user", user);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});
