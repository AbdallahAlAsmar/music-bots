import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { supabase } from "../../db/client.js";
import { authMiddleware, type AuthVariables } from "../middleware/auth.js";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function extensionFromType(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "bin";
}

export function createUploadRoutes(): Hono<{ Variables: AuthVariables }> {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use("*", authMiddleware);

  app.post("/", async (c) => {
    const user = c.get("user");
    const form = await c.req.formData();
    const file = form.get("file");
    const botId = String(form.get("bot_id") ?? "").trim();
    const kind = String(form.get("kind") ?? "asset").trim();

    if (!(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }
    if (!botId) {
      return c.json({ error: "bot_id is required" }, 400);
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return c.json({ error: "Unsupported file type" }, 400);
    }
    if (file.size > MAX_BYTES) {
      return c.json({ error: "File too large (max 8MB)" }, 400);
    }

    const ext = extensionFromType(file.type);
    const path = `${botId}/${kind}/${user.id}-${randomUUID()}.${ext}`;
    const buffer = new Uint8Array(await file.arrayBuffer());
    const { error } = await supabase.storage.from(env.supabaseStorageBucket).upload(path, buffer, {
      contentType: file.type,
      upsert: false
    });
    if (error) {
      return c.json({ error: error.message }, 400);
    }

    const { data } = supabase.storage.from(env.supabaseStorageBucket).getPublicUrl(path);
    return c.json({ url: data.publicUrl });
  });

  return app;
}
