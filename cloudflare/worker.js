/**
 * Cloudflare Worker / Pages Edge Function for HishabPati ERP
 * 
 * Free Edge Architecture:
 * - Master Database: Google Sheets (Spreadsheet with live formulas & offline operations)
 * - Edge Database: Cloudflare D1 (Serverless SQLite with 5M reads/day & 100K writes/day free)
 * - Hosting: Cloudflare Pages (Unlimited bandwidth & global CDN)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. Google Sheets Proxy Endpoint (Eliminates all browser CORS and 302 redirect issues)
    if (url.pathname === "/api/sheets/proxy") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: "Google Sheets Web App URL is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        if (request.method === "POST") {
          const body = await request.text();
          const response = await fetch(targetUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: body
          });
          const text = await response.text();
          return new Response(text, {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        } else {
          const response = await fetch(targetUrl, {
            headers: { "Accept": "application/json" }
          });
          const text = await response.text();
          return new Response(text, {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message || "Failed to reach Google Sheets" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 2. Cloudflare D1 Database Edge API
    if (url.pathname.startsWith("/api/d1")) {
      if (!env.DB) {
        return new Response(JSON.stringify({
          status: "d1_unbound",
          message: "Cloudflare D1 binding (DB) is not attached yet. Data is persisting in Google Sheets.",
          hint: "Run 'wrangler d1 create hishabpati_db' and attach the binding in wrangler.toml or Cloudflare dashboard."
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      try {
        // Query D1
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

        // Generic table select
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
      } catch (d1Err) {
        return new Response(JSON.stringify({ error: d1Err.message }), {
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
      edgeLocation: request.cf?.colo || "Edge",
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};
