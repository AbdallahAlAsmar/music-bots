import { Hono } from "hono";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getConnInfo } from "@hono/node-server/conninfo";
import { env } from "../../config/env.js";
import { logger } from "../../core/logger.js";
import { supabase as mainSupabase } from "../../db/client.js";

/**
 * PX License validation endpoints, absorbed from the standalone PX-Licence
 * Express app so both systems can share the single public port on the host.
 * Route paths and response shapes are kept identical to the original API,
 * since deployed FiveM resources call them verbatim.
 */

type LicenseRow = {
  license_key: string;
  discord_user_id: string;
  server_ip: string;
  is_active: boolean;
  created_at: string;
};

// The licenses table may live in a different Supabase project than the bot
// system. If LICENSE_SUPABASE_* vars are set, use them; otherwise reuse the
// main client.
const licenseDb: SupabaseClient =
  env.licenseSupabaseUrl && env.licenseSupabaseKey
    ? createClient(env.licenseSupabaseUrl, env.licenseSupabaseKey, {
        auth: { persistSession: false }
      })
    : mainSupabase;

/** Strip a port suffix from "1.2.3.4:30120" style endpoints. */
function extractIp(endpoint: string | undefined | null): string | null {
  if (!endpoint) {
    return null;
  }
  return endpoint.split(":")[0];
}

export function createLicenseRoutes(): Hono {
  const app = new Hono();

  app.get("/", (c) =>
    c.json({
      name: "PX License API",
      version: "1.0.0",
      endpoints: {
        validate: "GET /validate?license=KEY&server_ip=IP",
        check: "GET /check?license=KEY",
        health: "GET /health"
      }
    })
  );

  app.get("/health", (c) =>
    c.json({
      success: true,
      message: "PX License API is running",
      timestamp: new Date().toISOString()
    })
  );

  app.get("/validate", async (c) => {
    const licenseKey = c.req.query("license") ?? c.req.header("license");
    let serverIp = c.req.query("server_ip") ?? c.req.header("server_ip");

    logger.info("License validation request", { licenseKey, serverIp });

    if (!licenseKey) {
      return c.json({ success: false, message: "License key is required" }, 400);
    }

    if (!serverIp || serverIp === "unknown") {
      serverIp = getConnInfo(c).remote.address ?? undefined;
    }
    const ip = extractIp(serverIp);

    const { data: license, error } = await licenseDb
      .from("licenses")
      .select("*")
      .eq("license_key", licenseKey)
      .eq("is_active", true)
      .single<LicenseRow>();

    if (error || !license) {
      logger.info("License invalid", { licenseKey, reason: "not found" });
      return c.json({ success: false, message: "License not found" });
    }

    if (license.server_ip !== ip) {
      logger.info("License invalid", { licenseKey, reason: "ip mismatch", ip });
      return c.json({
        success: false,
        message: "IP mismatch. License is registered to a different IP."
      });
    }

    logger.info("License valid", { licenseKey });
    return c.json({
      success: true,
      message: "License is valid",
      data: {
        license_key: license.license_key,
        server_ip: license.server_ip,
        created_at: license.created_at
      }
    });
  });

  app.get("/check", async (c) => {
    const licenseKey = c.req.query("license") ?? c.req.header("license");

    if (!licenseKey) {
      return c.json({ success: false, message: "License key is required" }, 400);
    }

    const { data: license } = await licenseDb
      .from("licenses")
      .select("*")
      .eq("license_key", licenseKey)
      .single<LicenseRow>();

    if (license && license.is_active) {
      return c.json({
        success: true,
        exists: true,
        data: {
          server_ip: license.server_ip,
          created_at: license.created_at
        }
      });
    }

    return c.json({
      success: false,
      exists: false,
      message: "License not found or inactive"
    });
  });

  return app;
}
