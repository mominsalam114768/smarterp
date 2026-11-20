/**
 * Cloudflare Worker / Pages Edge Function for HishabPati ERP
 *
 * Security Hardened Edge Architecture:
 * - Master Database: Google Sheets (Spreadsheet with live formulas & offline operations)
 * - Edge Database: Cloudflare D1 (Serverless SQLite)
 * - Hosting: Cloudflare Pages
 */

function isAllowedAppsScriptUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return host === "script.google.com" || host === "script.googleusercontent.com";
  } catch {
    return false;
  }
}

function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

function getCorsHeaders(request, env, url) {
  const origin = request.headers.get("Origin");
  const allowedList = (env.ALLOWED_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let allowOrigin = "";
  if (allowedList.length > 0) {
    if (origin && allowedList.includes(origin)) {
      allowOrigin = origin;
    }
  } else if (origin && origin === url.origin) {
    allowOrigin = origin;
  }

  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };

  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
  }
  return headers;
}

function requireWorkerAuth(request, env, corsHeaders) {
  const expectedSecret = env.WORKER_API_SECRET;
  if (!expectedSecret || typeof expectedSecret !== "string" || expectedSecret.length < 16) {
    return new Response(JSON.stringify({ error: "Worker authentication secret is not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const token = authHeader.slice(7).trim();
  if (!constantTimeEqual(token, expectedSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders(request, env, url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 1. Google Sheets Proxy Endpoint (Eliminates CORS/302 redirect issues, strict SSRF + auth protected)
    if (url.pathname === "/api/sheets/proxy") {
      const authError = requireWorkerAuth(request, env, corsHeaders);
      if (authError) return authError;

      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: "Google Sheets Web App URL is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (!isAllowedAppsScriptUrl(targetUrl)) {
        return new Response(JSON.stringify({ error: "Only official Google Apps Script HTTPS URLs are permitted" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        if (request.method === "POST") {
          const body = await request.text();
          const response = await fetch(targetUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body
          });
          const text = await response.text();
          return new Response(text, {
            status: response.ok ? 200 : 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        } else {
          const response = await fetch(targetUrl, {
            headers: { "Accept": "application/json" }
          });
          const text = await response.text();
          return new Response(text, {
            status: response.ok ? 200 : 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      } catch {
        return new Response(JSON.stringify({ error: "Failed to reach Google Sheets upstream service" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 2. Cloudflare D1 Database Edge API (Auth required)
    if (url.pathname.startsWith("/api/d1")) {
      const authError = requireWorkerAuth(request, env, corsHeaders);
      if (authError) return authError;

      if (!env.DB) {
        return new Response(JSON.stringify({
          status: "d1_unbound",
          message: "Cloudflare D1 binding (DB) is not attached yet. Data is persisting in Google Sheets."
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        if (url.pathname === "/api/d1/stats" && request.method === "GET") {
          const productCount = await env.DB.prepare("SELECT count(*) as count FROM products").first();
          const customerCount = await env.DB.prepare("SELECT count(*) as count FROM customers").first();
          const salesTotal = await env.DB.prepare("SELECT sum(final_amount) as total FROM sales").first();

          return new Response(JSON.stringify({
            status: "active",
            products: productCount?.count || 0,
            customers: customerCount?.count || 0,
            salesTotal: salesTotal?.total || 0,
            edgeLocation: request.cf?.colo || "Global Edge"
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        if (url.pathname === "/api/d1/table" && request.method === "GET") {
          const table = url.searchParams.get("name") || "products";
          const allowed = ["products", "customers", "sales", "suppliers", "expenses", "business_config"];
          if (!allowed.includes(table)) {
            return new Response(JSON.stringify({ error: "Invalid table name" }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

          const { results } = await env.DB.prepare(`SELECT * FROM ${table} LIMIT 100`).all();
          return new Response(JSON.stringify({ results }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch {
        return new Response(JSON.stringify({ error: "Database query failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 3. Health & Status
    return new Response(JSON.stringify({
      status: "online",
      name: "HishabPati ERP Cloudflare Edge",
      architecture: "Cloudflare Pages + Cloudflare D1 + Google Sheets Master",
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};
