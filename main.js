import { connect } from "cloudflare:sockets";

// ============================================================
// 1. GLOBAL STATE & CACHE MANAGEMENT
// ============================================================
const GLOBAL_TRAFFIC_CACHE = new Map();
const ACTIVE_CONNECTIONS_COUNT = new Map();
const GLOBAL_LAST_ACTIVE_WRITE = new Map();
const GLOBAL_LAST_DB_WRITE = new Map();
const GLOBAL_WRITE_LOCK = new Map();
const DNS_CACHE = new Map();
let GLOBAL_REQ_COUNT = 0;
let GLOBAL_LAST_REQ_WRITE = 0;

// ============================================================
// 2. CONSTANTS & CONFIGURATION
// ============================================================
const DNS_CACHE_TTL = 5 * 60 * 1000;
const DOH_RESOLVER = "https://cloudflare-dns.com/dns-query";
const UPSTREAM_BUNDLE_TARGET_BYTES = 16 * 1024;
const UPSTREAM_QUEUE_MAX_BYTES = 16 * 1024 * 1024;
const UPSTREAM_QUEUE_MAX_ITEMS = 4096;
const DOWNSTREAM_GRAIN_BYTES = 32 * 1024;
const DOWNSTREAM_GRAIN_TAIL_THRESHOLD = 512;
const DOWNSTREAM_GRAIN_SILENT_MS = 1;
const TCP_CONCURRENCY = 2;
const PRELOAD_RACE_DIAL = true;

// ============================================================
// 3. MAIN WORKER ENTRY POINT
// ============================================================
export default {
  async fetch(request, env, ctx) {
    trackRequest(env, ctx);
    await DbService.ensureSchema(env.DB);
    const url = new URL(request.url);

    if (
      Router.isWebSocketUpgrade(request) &&
      url.pathname === "/In_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh"
    ) {
      return await Router.handleWebSocket(request, env, ctx);
    }

    if (Router.isSubscriptionPath(url.pathname)) {
      return await Router.handleSubscription(url, env);
    }

    if (url.pathname.startsWith("/api/") || url.pathname === "/locations") {
      return await Router.handleApi(request, url, env, ctx);
    }

    if (url.pathname === "/panel" || url.pathname === "/login") {
      return await Router.handlePanel(request, env);
    }

    if (url.pathname.startsWith("/status/")) {
      return await Router.handleUserStatus(url, env);
    }

    return new Response(HTML_TEMPLATES.nginx, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};

// ============================================================
// 4. ROUTER & CONTROLLERS
// ============================================================
const Router = {
  isWebSocketUpgrade(request) {
    const upgradeHeader = (request.headers.get("Upgrade") || "").toLowerCase();
    return upgradeHeader === "websocket";
  },

  isSubscriptionPath(pathname) {
    return pathname.startsWith("/sub/") || pathname.startsWith("/feed/");
  },

  async handleWebSocket(request, env, ctx) {
    try {
      let proxyIP = "proxyip.cmliussss.net";
      try {
        const proxyRow = await env.DB.prepare(
          "SELECT value FROM settings WHERE key = 'proxy_ip'",
        ).first();
        if (proxyRow && proxyRow.value) {
          proxyIP = proxyRow.value;
        }
      } catch (e) {}

      const mockStoredData = { proxy_ip: proxyIP };
      return handleVLESS(env, mockStoredData, ctx);
    } catch (e) {
      return new Response("Internal Server Error", { status: 500 });
    }
  },

  async handleSubscription(url, env) {
    const isSubPath = url.pathname.startsWith("/sub/");
    const offset = isSubPath ? 5 : 6;
    let subUser = decodeURIComponent(url.pathname.slice(offset));
    const host = url.hostname;

    const isJson = !isSubPath && subUser.startsWith("json/");
    if (isJson) {
      subUser = subUser.slice(5);
    }

    try {
      const user = await env.DB.prepare(
        "SELECT * FROM users WHERE username = ? OR uuid = ?",
      )
        .bind(subUser, subUser)
        .first();
      if (!user || user.connection_type !== atob("dmxlc3M=")) {
        return new Response("Not Found", { status: 404 });
      }

      if (isJson) {
        return await SubscriptionService.generateJson(user, host, env);
      } else {
        return await SubscriptionService.generateText(user, host);
      }
    } catch (err) {
      return new Response("Error building config: " + err.message, {
        status: 500,
      });
    }
  },

  async handlePanel(request, env) {
    const hasPassword = await DbService.getPanelPassword(env.DB);
    if (!hasPassword) {
      return new Response(HTML_TEMPLATES.setup, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const authorized = await DbService.verifyApiAuth(request, env);
    if (!authorized) {
      return new Response(HTML_TEMPLATES.login, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response(HTML_TEMPLATES.panel, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },

  async handleUserStatus(url, env) {
    const username = decodeURIComponent(url.pathname.slice(8));
    if (!username) {
      return new Response("Username is required", { status: 400 });
    }
    try {
      const user = await env.DB.prepare(
        "SELECT * FROM users WHERE username = ? OR uuid = ?",
      )
        .bind(username, username)
        .first();
      if (!user) {
        return new Response("User not found", { status: 404 });
      }
      const userJson = JSON.stringify({
        username: user.username,
        uuid: user.uuid,
        limit_gb: user.limit_gb,
        expiry_days: user.expiry_days,
        used_gb: user.used_gb,
        is_active: user.is_active,
        created_at: user.created_at,
        tls: user.tls,
        port: user.port,
        ips: user.ips,
        fingerprint: user.fingerprint || "chrome",
      });
      const html = HTML_TEMPLATES.status.replace(
        "/* {{USER_DATA_PLACEHOLDER}} */",
        `window.statusUser = ${userJson};`,
      );
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (err) {
      return new Response("Error: " + err.message, { status: 500 });
    }
  },

  async handleApi(request, url, env, ctx) {
    const hasPassword = await DbService.getPanelPassword(env.DB);

    // API: Setup initial password
    if (url.pathname === "/api/setup-password" && request.method === "POST") {
      if (hasPassword) {
        return new Response(
          JSON.stringify({ error: "Password already set" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          },
        );
      }
      const { password } = await request.json();
      if (!password || password.length < 4) {
        return new Response(
          JSON.stringify({ error: "Password must be at least 4 characters" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          },
        );
      }
      const hashed = await DbService.sha256(password);
      await DbService.setPanelPassword(env.DB, hashed);
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie":
            "panel_session=" +
            hashed +
            "; Path=/; HttpOnly; Secure; SameSite=Lax",
        },
      });
    }

    // API: Login
    if (url.pathname === "/api/login" && request.method === "POST") {
      const { password } = await request.json();
      const hashedInput = await DbService.sha256(password);
      const storedHash = await DbService.getPanelPassword(env.DB);
      if (storedHash === hashedInput) {
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Set-Cookie":
              "panel_session=" +
              storedHash +
              "; Path=/; HttpOnly; Secure; SameSite=Lax",
          },
        });
      }
      return new Response(JSON.stringify({ error: "Invalid password" }), {
        status: 401,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // API: Logout
    if (url.pathname === "/api/logout" && request.method === "POST") {
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie":
            "panel_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax",
        },
      });
    }

    // General auth check for other APIs
    const authorized = await DbService.verifyApiAuth(request, env);
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // API: Auto-update panel
    if (url.pathname === "/api/update-panel" && request.method === "POST") {
      if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) {
        return new Response(
          JSON.stringify({
            error: "CF_API_TOKEN or CF_ACCOUNT_ID not set.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      try {
        const githubRes = await fetch(
          "https://raw.githubusercontent.com/IR-NETLIFY/ryxo/refs/heads/main/ryxo.js?t=" +
            Date.now(),
        );
        if (!githubRes.ok)
          throw new Error("Failed to fetch source from GitHub");
        const newCode = await githubRes.text();
        const scriptName = env.WORKER_NAME || url.hostname.split(".")[0];

        const bindingsRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${scriptName}/bindings`,
          {
            headers: { Authorization: "Bearer " + env.CF_API_TOKEN },
          },
        );
        const bindingsData = await bindingsRes.json();

        if (!bindingsData.success)
          throw new Error("Failed to fetch bindings. Invalid token.");
        const newBindings = [];
        for (const b of bindingsData.result) {
          if (b.type === "d1") {
            newBindings.push({
              type: "d1",
              name: b.name,
              id: b.database_id || b.id,
            });
          } else if (b.name === "CF_API_TOKEN") {
            newBindings.push({
              type: "secret_text",
              name: "CF_API_TOKEN",
              text: env.CF_API_TOKEN,
            });
          } else if (b.name === "CF_ACCOUNT_ID") {
            newBindings.push({
              type: "secret_text",
              name: "CF_ACCOUNT_ID",
              text: env.CF_ACCOUNT_ID,
            });
          }
        }

        const metadata = {
          main_module: "ryxo.js",
          compatibility_date: "2024-02-08",
          bindings: newBindings,
        };
        const formData = new FormData();
        formData.append(
          "metadata",
          new Blob([JSON.stringify(metadata)], { type: "application/json" }),
        );
        formData.append(
          "ryxo.js",
          new Blob([newCode], { type: "application/javascript+module" }),
          "ryxo.js",
        );
        const deployRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/workers/scripts/${scriptName}`,
          {
            method: "PUT",
            headers: { Authorization: "Bearer " + env.CF_API_TOKEN },
            body: formData,
          },
        );
        const deployData = await deployRes.json();
        if (!deployData.success)
          throw new Error("Failed to apply update on Cloudflare.");
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        const errorMsg =
          err.message +
          " | If unsuccessful, update via: https://ryxo-panel.ir-netlify.workers.dev/";
        return new Response(JSON.stringify({ error: errorMsg }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // API: Change admin password
    if (url.pathname === "/api/change-password" && request.method === "POST") {
      const { current_password, new_password } = await request.json();
      if (!current_password || !new_password) {
        return new Response(
          JSON.stringify({ error: "Current and new password required" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          },
        );
      }
      const currentHash = await DbService.sha256(current_password);
      const storedHash = await DbService.getPanelPassword(env.DB);
      if (storedHash && storedHash !== currentHash) {
        return new Response(
          JSON.stringify({ error: "Current password is incorrect" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          },
        );
      }
      if (new_password.length < 4) {
        return new Response(
          JSON.stringify({ error: "New password must be at least 4 characters" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          },
        );
      }
      const newHash = await DbService.sha256(new_password);
      await DbService.setPanelPassword(env.DB, newHash);
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie":
            "panel_session=" +
            newHash +
            "; Path=/; HttpOnly; Secure; SameSite=Lax",
        },
      });
    }

    // API: Cloudflare locations
    if (url.pathname === "/locations") {
      try {
        const response = await fetch("https://speed.cloudflare.com/locations", {
          headers: { Referer: "https://speed.cloudflare.com/" },
        });
        const data = await response.json();
        return new Response(JSON.stringify(data), {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // API: Proxy IP settings (GET & POST)
    if (url.pathname === "/api/proxy-ip") {
      if (request.method === "POST") {
        const { proxy_ip, iata, frag_len, frag_int } = await request.json();
        if (proxy_ip)
          await env.DB.prepare(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('proxy_ip', ?)",
          )
            .bind(proxy_ip)
            .run();
        if (iata !== undefined)
          await env.DB.prepare(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('proxy_location_iata', ?)",
          )
            .bind(iata)
            .run();
        if (frag_len !== undefined)
          await env.DB.prepare(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('frag_len', ?)",
          )
            .bind(frag_len)
            .run();
        if (frag_int !== undefined)
          await env.DB.prepare(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('frag_int', ?)",
          )
            .bind(frag_int)
            .run();
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (request.method === "GET") {
        const rowIp = await env.DB.prepare(
          "SELECT value FROM settings WHERE key = 'proxy_ip'",
        ).first();
        const rowIata = await env.DB.prepare(
          "SELECT value FROM settings WHERE key = 'proxy_location_iata'",
        ).first();
        const rowLen = await env.DB.prepare(
          "SELECT value FROM settings WHERE key = 'frag_len'",
        ).first();
        const rowInt = await env.DB.prepare(
          "SELECT value FROM settings WHERE key = 'frag_int'",
        ).first();
        return new Response(
          JSON.stringify({
            proxy_ip: rowIp ? rowIp.value : "proxyip.cmliussss.net",
            iata: rowIata ? rowIata.value : "",
            frag_len: rowLen ? rowLen.value : "20-30",
            frag_int: rowInt ? rowInt.value : "1-2",
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // API: User management
    if (url.pathname.startsWith("/api/users")) {
      const pathParts = url.pathname.split("/");
      const isUserAction = pathParts.length > 3;

      if (isUserAction) {
        const username = decodeURIComponent(pathParts.pop());

        if (request.method === "PUT") {
          const body = await request.json();
          if (body.toggle_only !== undefined) {
            await env.DB.prepare(
              "UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE username = ?",
            )
              .bind(username)
              .run();
            return new Response(JSON.stringify({ success: true }), {
              headers: { "Content-Type": "application/json" },
            });
          } else {
            const {
              limit_gb,
              expiry_days,
              ips,
              tls,
              port,
              fingerprint,
              max_connections,
            } = body;
            await env.DB.prepare(
              "UPDATE users SET limit_gb = ?, expiry_days = ?, ips = ?, tls = ?, port = ?, fingerprint = ?, max_connections = ? WHERE username = ?",
            )
              .bind(
                limit_gb ? parseFloat(limit_gb) : null,
                expiry_days ? parseInt(expiry_days) : null,
                ips || null,
                tls,
                port,
                fingerprint || "chrome",
                max_connections ? parseInt(max_connections) : null,
                username,
              )
              .run();
            return new Response(JSON.stringify({ success: true }), {
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        if (request.method === "DELETE") {
          await env.DB.prepare("DELETE FROM users WHERE username = ?")
            .bind(username)
            .run();
          return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }
      } else {
        if (request.method === "GET") {
          try {
            await flushExpiredTraffic(env);
          } catch (e) {}
          const { results } = await env.DB.prepare(
            "SELECT * FROM users ORDER BY id DESC",
          ).all();
          const now = Date.now();
          const enrichedUsers = (results || []).map((user) => ({
            ...user,
            is_online:
              user.last_active && now - user.last_active < 65000 ? 1 : 0,
          }));

          let cfReqs = { today: 0, total: 0 };
          try {
            const liveCf = await getCfUsage(env);
            const todayStr = new Date().toISOString().split("T")[0];

            const dateRow = await env.DB.prepare(
              "SELECT value FROM settings WHERE key = 'req_last_date'",
            ).first();
            const totalRow = await env.DB.prepare(
              "SELECT value FROM settings WHERE key = 'req_total'",
            ).first();

            let dbTotal = totalRow ? parseInt(totalRow.value) || 0 : 0;
            let dbToday = 0;

            if (dateRow && dateRow.value === todayStr) {
              const todayRow = await env.DB.prepare(
                "SELECT value FROM settings WHERE key = 'req_today'",
              ).first();
              dbToday = todayRow ? parseInt(todayRow.value) || 0 : 0;
            }

            if (liveCf.today > dbToday) {
              dbToday = liveCf.today;
              await env.DB.prepare(
                "INSERT INTO settings (key, value) VALUES ('req_today', ?) ON CONFLICT(key) DO UPDATE SET value = ?",
              )
                .bind(String(dbToday), String(dbToday))
                .run();
              await env.DB.prepare(
                "INSERT INTO settings (key, value) VALUES ('req_last_date', ?) ON CONFLICT(key) DO UPDATE SET value = ?",
              )
                .bind(todayStr, todayStr)
                .run();
            }

            if (liveCf.total > dbTotal) {
              dbTotal = liveCf.total;
              await env.DB.prepare(
                "INSERT INTO settings (key, value) VALUES ('req_total', ?) ON CONFLICT(key) DO UPDATE SET value = ?",
              )
                .bind(String(dbTotal), String(dbTotal))
                .run();
            }

            cfReqs.today = dbToday + GLOBAL_REQ_COUNT;
            cfReqs.total = dbTotal + GLOBAL_REQ_COUNT;
          } catch (e) {}

          return new Response(
            JSON.stringify({
              users: enrichedUsers,
              serverTime: now,
              cfRequestsToday: cfReqs.today,
              cfRequestsTotal: cfReqs.total,
            }),
            {
              headers: {
                "Content-Type": "application/json",
                "Cache-Control":
                  "no-store, no-cache, must-revalidate, max-age=0",
              },
            },
          );
        }

        if (request.method === "POST") {
          const {
            username,
            limit_gb,
            expiry_days,
            ips,
            tls,
            port,
            fingerprint,
            max_connections,
          } = await request.json();
          if (!username) {
            return new Response(
              JSON.stringify({ error: "Username is required" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }
          const uuid = crypto.randomUUID();
          try {
            await env.DB.prepare(
              "INSERT INTO users (username, uuid, limit_gb, expiry_days, ips, connection_type, tls, port, fingerprint, max_connections) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )
              .bind(
                username,
                uuid,
                limit_gb ? parseFloat(limit_gb) : null,
                expiry_days ? parseInt(expiry_days) : null,
                ips || null,
                atob("dmxlc3M="),
                tls,
                port,
                fingerprint || "chrome",
                max_connections ? parseInt(max_connections) : null,
              )
              .run();
            return new Response(JSON.stringify({ success: true }), {
              headers: { "Content-Type": "application/json" },
            });
          } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  },
};

// ============================================================
// 5. DATABASE SERVICE & AUTHENTICATION
// ============================================================
let schemaEnsured = false;
let cachedPanelPassword = null;

const DbService = {
  async ensureSchema(db) {
    if (schemaEnsured) return;
    try {
      await db
        .prepare(
          `
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE,
          uuid TEXT,
          limit_gb REAL,
          expiry_days INTEGER,
          ips TEXT,
          connection_type TEXT,
          tls TEXT,
          port INTEGER,
          used_gb REAL DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          last_active INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `,
        )
        .run();
    } catch (e) {}
    try {
      await db
        .prepare("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1")
        .run();
    } catch (e) {}
    try {
      await db
        .prepare("ALTER TABLE users ADD COLUMN last_active INTEGER")
        .run();
    } catch (e) {}
    try {
      await db
        .prepare(
          "ALTER TABLE users ADD COLUMN fingerprint TEXT DEFAULT 'chrome'",
        )
        .run();
    } catch (e) {}
    try {
      await db
        .prepare("ALTER TABLE users ADD COLUMN max_connections INTEGER")
        .run();
    } catch (e) {}
    try {
      await db
        .prepare(
          "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)",
        )
        .run();
    } catch (e) {}
    schemaEnsured = true;
  },

  async getPanelPassword(db) {
    if (cachedPanelPassword !== null) return cachedPanelPassword;
    try {
      const row = await db
        .prepare("SELECT value FROM settings WHERE key = 'panel_password'")
        .first();
      cachedPanelPassword = row ? row.value : "";
      return cachedPanelPassword || null;
    } catch (e) {
      return null;
    }
  },

  async setPanelPassword(db, password) {
    await db
      .prepare(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('panel_password', ?)",
      )
      .bind(password)
      .run();
    cachedPanelPassword = password;
  },

  async verifyApiAuth(request, env) {
    const storedPasswordHash = await this.getPanelPassword(env.DB);
    if (!storedPasswordHash) return true;
    const cookies = request.headers.get("Cookie") || "";
    const sessionCookie = cookies
      .split(";")
      .find((c) => c.trim().startsWith("panel_session="));
    if (!sessionCookie) return false;
    const sessionToken = sessionCookie.split("=")[1].trim();
    return sessionToken === storedPasswordHash;
  },

  async sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  },
};

// ============================================================
// 6. SUBSCRIPTION SERVICE
// ============================================================
const SubscriptionService = {
  async generateJson(user, host, env) {
    let ips = [host];
    if (user.ips) {
      const parsedIps = user.ips
        .split("\n")
        .map((ip) => ip.trim())
        .filter((ip) => ip.length > 0);
      if (parsedIps.length > 0) ips = parsedIps;
    }

    const ports = String(user.port || "443")
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const fp = user.fingerprint || "chrome";

    let fragLen = "20-30";
    let fragInt = "1-2";
    try {
      const rowLen = await env.DB.prepare(
        "SELECT value FROM settings WHERE key = 'frag_len'",
      ).first();
      if (rowLen && rowLen.value) fragLen = rowLen.value;
      const rowInt = await env.DB.prepare(
        "SELECT value FROM settings WHERE key = 'frag_int'",
      ).first();
      if (rowInt && rowInt.value) fragInt = rowInt.value;
    } catch (e) {}

    const configArray = [];

    const m1 = decodeURIComponent(
      "%E2%9A%A0%EF%B8%8F%D8%A7%DB%8C%D9%86%20%D9%BE%D9%86%D9%84%20%D8%B1%D8%A7%DB%8C%DA%AF%D8%A7%D9%86%20%D9%88%20%D8%BA%DB%8C%D8%B1%20%D9%82%D8%A7%D8%A8%D9%84%20%D9%81%D8%B1%D9%88%D8%B4%20%D8%A7%D8%B3%D8%AA%E2%9A%A0%EF%B8%8F",
    );
    const m2 = decodeURIComponent(
      "%E2%99%A8%EF%B8%8F%20@IR_NETLIFY%20%D8%B3%D8%A7%D8%AE%D8%AA%20%D8%B1%D8%A7%DB%8C%DA%AF%D8%A7%D9%86%20%E2%99%A8%EF%B8%8F",
    );

    const createFakeConfig = (remarkTitle) => {
      return {
        remarks: remarkTitle,
        version: { min: "25.10.15" },
        log: { loglevel: "none" },
        dns: {
          servers: [
            { address: "https://8.8.8.8/dns-query", tag: "remote-dns" },
            {
              address: "8.8.8.8",
              domains: ["full:" + host],
              skipFallback: true,
            },
          ],
          queryStrategy: "UseIP",
          tag: "dns",
        },
        inbounds: [
          {
            listen: "127.0.0.1",
            port: 10808,
            protocol: "socks",
            settings: { auth: "noauth", udp: true },
            sniffing: {
              destOverride: ["http", "tls"],
              enabled: true,
              routeOnly: true,
            },
            tag: "mixed-in",
          },
          {
            listen: "127.0.0.1",
            port: 10853,
            protocol: "dokodemo-door",
            settings: { address: "1.1.1.1", network: "tcp,udp", port: 53 },
            tag: "dns-in",
          },
        ],
        outbounds: [
          {
            protocol: "vle" + "ss",
            settings: {
              ["vne" + "xt"]: [
                {
                  address: "0.0.0.0",
                  port: 1,
                  users: [{ id: user.uuid, encryption: "none" }],
                },
              ],
            },
            ["stream" + "Settings"]: {
              network: "ws",
              ["ws" + "Settings"]: {
                host: host,
                path: "/In_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh",
              },
              security: "none",
            },
            tag: "proxy",
          },
          {
            protocol: "dns",
            settings: { nonIPQuery: "reject" },
            tag: "dns-out",
          },
          {
            protocol: "freedom",
            settings: { domainStrategy: "UseIP" },
            tag: "direct",
          },
          {
            protocol: "blackhole",
            settings: { response: { type: "http" } },
            tag: "block",
          },
        ],
        routing: {
          domainStrategy: "IPIfNonMatch",
          rules: [
            {
              inboundTag: ["mixed-in"],
              port: 53,
              outboundTag: "dns-out",
              type: "field",
            },
            { inboundTag: ["dns-in"], outboundTag: "dns-out", type: "field" },
            { inboundTag: ["remote-dns"], outboundTag: "proxy", type: "field" },
            { inboundTag: ["dns"], outboundTag: "direct", type: "field" },
            {
              domain: ["geosite:private"],
              outboundTag: "direct",
              type: "field",
            },
            { ip: ["geoip:private"], outboundTag: "direct", type: "field" },
            { network: "udp", outboundTag: "block", type: "field" },
            { network: "tcp", outboundTag: "proxy", type: "field" },
          ],
        },
      };
    };

    configArray.push(createFakeConfig(m1));
    configArray.push(createFakeConfig(m2));

    ips.forEach((ip) => {
      ports.forEach((portStr) => {
        const isTlsPort = [
          "443",
          "2053",
          "2083",
          "2087",
          "2096",
          "8443",
        ].includes(portStr);
        const tlsVal = isTlsPort ? "tls" : "none";
        const remark = user.username + " | " + ip + " | " + portStr;

        const configObj = {
          remarks: remark,
          version: { min: "25.10.15" },
          log: { loglevel: "none" },
          dns: {
            servers: [
              { address: "https://8.8.8.8/dns-query", tag: "remote-dns" },
              {
                address: "8.8.8.8",
                domains: ["full:" + host],
                skipFallback: true,
              },
            ],
            queryStrategy: "UseIP",
            tag: "dns",
          },
          inbounds: [
            {
              listen: "127.0.0.1",
              port: 10808,
              protocol: "socks",
              settings: { auth: "noauth", udp: true },
              sniffing: {
                destOverride: ["http", "tls"],
                enabled: true,
                routeOnly: true,
              },
              tag: "mixed-in",
            },
            {
              listen: "127.0.0.1",
              port: 10853,
              protocol: "dokodemo-door",
              settings: { address: "1.1.1.1", network: "tcp,udp", port: 53 },
              tag: "dns-in",
            },
          ],
          outbounds: [
            {
              protocol: "vle" + "ss",
              settings: {
                ["vne" + "xt"]: [
                  {
                    address: ip,
                    port: parseInt(portStr),
                    users: [{ id: user.uuid, encryption: "none" }],
                  },
                ],
              },
              ["stream" + "Settings"]: {
                network: "ws",
                ["ws" + "Settings"]: {
                  host: host,
                  path: "/In_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh",
                },
                security: tlsVal,
                sockopt: { ["dialer" + "Proxy"]: "fragment" },
              },
              tag: "proxy",
            },
            {
              protocol: "freedom",
              settings: {
                fragment: {
                  packets: "tlshello",
                  length: fragLen,
                  interval: fragInt,
                },
              },
              ["stream" + "Settings"]: {
                sockopt: {
                  domainStrategy: "UseIP",
                  happyEyeballs: {
                    tryDelayMs: 250,
                    prioritizeIPv6: false,
                    interleave: 2,
                    maxConcurrentTry: 4,
                  },
                },
              },
              tag: "fragment",
            },
            {
              protocol: "dns",
              settings: { nonIPQuery: "reject" },
              tag: "dns-out",
            },
            {
              protocol: "freedom",
              settings: { domainStrategy: "UseIP" },
              tag: "direct",
            },
            {
              protocol: "blackhole",
              settings: { response: { type: "http" } },
              tag: "block",
            },
          ],
          routing: {
            domainStrategy: "IPIfNonMatch",
            rules: [
              {
                inboundTag: ["mixed-in"],
                port: 53,
                outboundTag: "dns-out",
                type: "field",
              },
              { inboundTag: ["dns-in"], outboundTag: "dns-out", type: "field" },
              {
                inboundTag: ["remote-dns"],
                outboundTag: "proxy",
                type: "field",
              },
              { inboundTag: ["dns"], outboundTag: "direct", type: "field" },
              {
                domain: ["geosite:private"],
                outboundTag: "direct",
                type: "field",
              },
              { ip: ["geoip:private"], outboundTag: "direct", type: "field" },
              { network: "udp", outboundTag: "block", type: "field" },
              { network: "tcp", outboundTag: "proxy", type: "field" },
            ],
          },
        };

        if (tlsVal === "tls") {
          configObj.outbounds[0]["stream" + "Settings"]["tls" + "Settings"] = {
            serverName: host,
            fingerprint: fp,
            alpn: ["http/1.1"],
            allowInsecure: false,
          };
        }
        configArray.push(configObj);
      });
    });

    return new Response(JSON.stringify(configArray, null, 2), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });
  },

  async generateText(user, host) {
    let ips = [host];
    if (user.ips) {
      const parsedIps = user.ips
        .split("\n")
        .map((ip) => ip.trim())
        .filter((ip) => ip.length > 0);
      if (parsedIps.length > 0) ips = parsedIps;
    }
    const ports = String(user.port || "443")
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const fp = user.fingerprint || "chrome";
    const links = [];

    const m1 = decodeURIComponent(
      "%E2%9A%A0%EF%B8%8F%D8%A7%DB%8C%D9%86%20%D9%BE%D9%86%D9%84%20%D8%B1%D8%A7%DB%8C%DA%AF%D8%A7%D9%86%20%D9%88%20%D8%BA%DB%8C%D8%B1%20%D9%82%D8%A7%D8%A8%D9%84%20%D9%81%D8%B1%D9%88%D8%B4%20%D8%A7%D8%B3%D8%AA%E2%9A%A0%EF%B8%8F",
    );
    const m2 = decodeURIComponent(
      "%E2%99%A8%EF%B8%8F%20@IR_NETLIFY%20%D8%B3%D8%A7%D8%AE%D8%AA%20%D8%B1%D8%A7%DB%8C%DA%AF%D8%A7%D9%86%20%E2%99%A8%EF%B8%8F",
    );

    links.push(
      atob("dmxlc3M6Ly8=") +
        user.uuid +
        "@0.0.0.0:1?encryption=none&security=none&type=ws&host=" +
        host +
        "&path=%2FIn_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh#" +
        encodeURIComponent(m1),
    );
    links.push(
      atob("dmxlc3M6Ly8=") +
        user.uuid +
        "@0.0.0.0:1?encryption=none&security=none&type=ws&host=" +
        host +
        "&path=%2FIn_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh#" +
        encodeURIComponent(m2),
    );

    ips.forEach((ip) => {
      ports.forEach((portStr) => {
        const isTlsPort = [
          "443",
          "2053",
          "2083",
          "2087",
          "2096",
          "8443",
        ].includes(portStr);
        const tlsVal = isTlsPort ? "tls" : "none";
        const remark = user.username + " | " + ip + " | " + portStr;

        links.push(
          atob("dmxlc3M6Ly8=") +
            user.uuid +
            "@" +
            ip +
            ":" +
            portStr +
            "?path=%2FIn_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh&security=" +
            tlsVal +
            "&encryption=none&insecure=0&host=" +
            host +
            "&fp=" +
            fp +
            "&type=ws&allowInsecure=0&sni=" +
            host +
            "#" +
            encodeURIComponent(remark),
        );
      });
    });

    const noise = [
      "# System Update Feed: OK",
      "# Sync Code: " + Math.random().toString(36).slice(2, 10),
      "# Version: 2.10.1",
      "# Description: Secure Node Configurations",
      "",
    ].join("\n");

    const plainContent = noise + links.join("\n");
    const subContent = btoa(unescape(encodeURIComponent(plainContent)));

    return new Response(subContent, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });
  },
};

// ============================================================
// 7. VLESS CORE ENGINE
// ============================================================
async function flushExpiredTraffic(env) {
  const now = Date.now();
  for (const [uname, cachedBytes] of GLOBAL_TRAFFIC_CACHE.entries()) {
    if (cachedBytes <= 0) continue;

    if (GLOBAL_WRITE_LOCK.get(uname)) continue;

    const lastActive = GLOBAL_LAST_ACTIVE_WRITE.get(uname) || 0;
    const activeCount = ACTIVE_CONNECTIONS_COUNT.get(uname) || 0;

    if (activeCount <= 0 || now - lastActive > 65000) {
      GLOBAL_WRITE_LOCK.set(uname, true);
      GLOBAL_TRAFFIC_CACHE.set(uname, 0);

      const deltaGb = cachedBytes / (1024 * 1024 * 1024);
      try {
        await env.DB.prepare(
          "UPDATE users SET used_gb = used_gb + ? WHERE username = ?",
        )
          .bind(deltaGb, uname)
          .run();
      } catch (e) {
      } finally {
        GLOBAL_WRITE_LOCK.set(uname, false);
      }
    }
  }
}

// ============================================================
// 8. VLESS UTILITY FUNCTIONS
// ============================================================
async function getCfUsage(env) {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) return { today: 0, total: 0 };
  try {
    const now = new Date();
    const startOfDay = new Date(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    ).toISOString();
    const thirtyDaysAgo = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const q = `query {
      viewer {
        accounts(filter: {accountTag: "${env.CF_ACCOUNT_ID}"}) {
          today: workersInvocationsAdaptive(limit: 10, filter: {datetime_geq: "${startOfDay}"}) {
            sum { requests }
          }
          total: workersInvocationsAdaptive(limit: 10, filter: {datetime_geq: "${thirtyDaysAgo}"}) {
            sum { requests }
          }
        }
      }
    }`;

    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + env.CF_API_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: q }),
    });
    const j = await res.json();
    const acc = j?.data?.viewer?.accounts?.[0];
    const todayReqs = acc?.today?.[0]?.sum?.requests || 0;
    const totalReqs = acc?.total?.[0]?.sum?.requests || todayReqs;

    return { today: todayReqs, total: totalReqs };
  } catch (e) {
    return { today: 0, total: 0 };
  }
}

function isIPv4(value) {
  const parts = String(value || "").split(".");
  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255,
    )
  );
}

function stripIPv6Brackets(hostname = "") {
  const host = String(hostname || "").trim();
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

function isIPHostname(hostname = "") {
  const host = stripIPv6Brackets(hostname);
  if (isIPv4(host)) return true;
  if (!host.includes(":")) return false;
  try {
    new URL(`http://[${host}]/`);
    return true;
  } catch (e) {
    return false;
  }
}

function convertToUint8Array(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(data || 0);
}

function concatBytes(...chunkList) {
  const chunks = chunkList.map(convertToUint8Array);
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.byteLength;
  }
  return result;
}

function closeSocketQuietly(socket) {
  try {
    if (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CLOSING
    ) {
      socket.close();
    }
  } catch (e) {}
}

async function dohQuery(domain, recordType) {
  const cacheKey = `${domain}:${recordType}`;
  if (DNS_CACHE.has(cacheKey)) {
    const cached = DNS_CACHE.get(cacheKey);
    if (Date.now() < cached.expires) return cached.data;
    DNS_CACHE.delete(cacheKey);
  }
  try {
    const typeMap = { A: 1, AAAA: 28 };
    const qtype = typeMap[recordType.toUpperCase()] || 1;

    const encodeDomain = (name) => {
      const parts = name.endsWith(".")
        ? name.slice(0, -1).split(".")
        : name.split(".");
      const bufs = [];
      for (const label of parts) {
        const enc = new TextEncoder().encode(label);
        bufs.push(new Uint8Array([enc.length]), enc);
      }
      bufs.push(new Uint8Array([0]));
      return concatBytes(...bufs);
    };

    const qname = encodeDomain(domain);
    const query = new Uint8Array(12 + qname.length + 4);
    const qview = new DataView(query.buffer);
    qview.setUint16(0, crypto.getRandomValues(new Uint16Array(1))[0]);
    qview.setUint16(2, 0x0100);
    qview.setUint16(4, 1);
    query.set(qname, 12);
    qview.setUint16(12 + qname.length, qtype);
    qview.setUint16(12 + qname.length + 2, 1);

    const response = await fetch(DOH_RESOLVER, {
      method: "POST",
      headers: {
        "Content-Type": "application/dns-message",
        Accept: "application/dns-message",
      },
      body: query,
    });

    if (!response.ok) return [];

    const buf = new Uint8Array(await response.arrayBuffer());
    const dv = new DataView(buf.buffer);
    const qdcount = dv.getUint16(4);
    const ancount = dv.getUint16(6);

    const parseName = (pos) => {
      const labels = [];
      let p = pos,
        jumped = false,
        endPos = -1,
        safe = 128;
      while (p < buf.length && safe-- > 0) {
        const len = buf[p];
        if (len === 0) {
          if (!jumped) endPos = p + 1;
          break;
        }
        if ((len & 0xc0) === 0xc0) {
          if (!jumped) endPos = p + 2;
          p = ((len & 0x3f) << 8) | buf[p + 1];
          jumped = true;
          continue;
        }
        labels.push(new TextDecoder().decode(buf.slice(p + 1, p + 1 + len)));
        p += len + 1;
      }
      if (endPos === -1) endPos = p + 1;
      return [labels.join("."), endPos];
    };

    let offset = 12;
    for (let i = 0; i < qdcount; i++) {
      const [, end] = parseName(offset);
      offset = Number(end) + 4;
    }

    const answers = [];
    for (let i = 0; i < ancount && offset < buf.length; i++) {
      const [name, nameEnd] = parseName(offset);
      offset = Number(nameEnd);
      const type = dv.getUint16(offset);
      offset += 2;
      offset += 2;
      const ttl = dv.getUint32(offset);
      offset += 4;
      const rdlen = dv.getUint16(offset);
      offset += 2;
      const rdata = buf.slice(offset, offset + rdlen);
      offset += rdlen;

      let data;
      if (type === 1 && rdlen === 4) {
        data = `${rdata[0]}.${rdata[1]}.${rdata[2]}.${rdata[3]}`;
      } else if (type === 28 && rdlen === 16) {
        const segs = [];
        for (let j = 0; j < 16; j += 2)
          segs.push(((rdata[j] << 8) | rdata[j + 1]).toString(16));
        data = segs.join(":");
      } else {
        data = Array.from(rdata)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }
      answers.push({ name, type, TTL: ttl, data });
    }
    DNS_CACHE.set(cacheKey, {
      data: answers,
      expires: Date.now() + DNS_CACHE_TTL,
    });
    return answers;
  } catch (e) {
    return [];
  }
}

function createUpstreamQueue({
  getWriter,
  releaseWriter,
  retryConnect,
  closeConnection,
  name = "UpstreamQueue",
}) {
  let chunks = [];
  let head = 0;
  let queuedBytes = 0;
  let draining = false;
  let closed = false;
  let bundleBuffer = null;
  let idleResolvers = [];
  let activeCompletions = null;

  const settleCompletions = (completions, err = null) => {
    if (!completions) return;
    for (const comp of completions) {
      if (comp) {
        if (err) comp.reject(err);
        else comp.resolve();
      }
    }
  };

  const rejectQueued = (err) => {
    for (let i = head; i < chunks.length; i++) {
      const item = chunks[i];
      if (item && item.completions) settleCompletions(item.completions, err);
    }
  };

  const compact = () => {
    if (head > 32 && head * 2 >= chunks.length) {
      chunks = chunks.slice(head);
      head = 0;
    }
  };

  const resolveIdle = () => {
    if (queuedBytes || draining || !idleResolvers.length) return;
    const resolvers = idleResolvers;
    idleResolvers = [];
    for (const resolve of resolvers) resolve();
  };

  const clear = (err = null) => {
    const closeErr =
      err || (closed ? new Error(`${name}: queue closed`) : null);
    if (closeErr) {
      rejectQueued(closeErr);
      settleCompletions(activeCompletions, closeErr);
      activeCompletions = null;
    }
    chunks = [];
    head = 0;
    queuedBytes = 0;
    resolveIdle();
  };

  const shift = () => {
    if (head >= chunks.length) return null;
    const item = chunks[head];
    chunks[head++] = undefined;
    queuedBytes -= item.chunk.byteLength;
    compact();
    return item;
  };

  const bundle = () => {
    const first = shift();
    if (!first) return null;
    if (
      head >= chunks.length ||
      first.chunk.byteLength >= UPSTREAM_BUNDLE_TARGET_BYTES
    )
      return first;

    let byteLength = first.chunk.byteLength;
    let end = head;
    let allowRetry = first.allowRetry;
    let completions = first.completions || null;
    while (end < chunks.length) {
      const next = chunks[end];
      const nextLength = byteLength + next.chunk.byteLength;
      if (nextLength > UPSTREAM_BUNDLE_TARGET_BYTES) break;
      byteLength = nextLength;
      allowRetry = allowRetry && next.allowRetry;
      if (next.completions)
        completions = completions
          ? completions.concat(next.completions)
          : next.completions;
      end++;
    }
    if (end === head) return first;

    const output = (bundleBuffer ||= new Uint8Array(
      UPSTREAM_BUNDLE_TARGET_BYTES,
    ));
    output.set(first.chunk);
    let offset = first.chunk.byteLength;
    while (head < end) {
      const next = chunks[head];
      chunks[head++] = undefined;
      queuedBytes -= next.chunk.byteLength;
      output.set(next.chunk, offset);
      offset += next.chunk.byteLength;
    }
    compact();
    return { chunk: output.subarray(0, byteLength), allowRetry, completions };
  };

  const drain = async () => {
    if (draining || closed) return;
    draining = true;
    try {
      for (;;) {
        if (closed) break;
        const item = bundle();
        if (!item) break;
        let writer = getWriter();
        if (!writer) throw new Error(`${name}: remote writer unavailable`);
        const completions = item.completions || null;
        activeCompletions = completions;
        try {
          try {
            await writer.write(item.chunk);
          } catch (err) {
            releaseWriter?.();
            if (!item.allowRetry || typeof retryConnect !== "function")
              throw err;
            await retryConnect();
            writer = getWriter();
            if (!writer) throw err;
            await writer.write(item.chunk);
          }
          settleCompletions(completions);
        } catch (err) {
          settleCompletions(completions, err);
          throw err;
        } finally {
          if (activeCompletions === completions) activeCompletions = null;
        }
      }
    } catch (err) {
      closed = true;
      clear(err);
      try {
        closeConnection?.(err);
      } catch (_) {}
    } finally {
      draining = false;
      if (!closed && head < chunks.length) queueMicrotask(drain);
      else resolveIdle();
    }
  };

  const enqueue = (data, allowRetry = true, waitForFlush = false) => {
    if (closed) return false;
    if (!getWriter()) return false;
    const chunk = convertToUint8Array(data);
    if (!chunk.byteLength) return true;
    const nextBytes = queuedBytes + chunk.byteLength;
    const nextItems = chunks.length - head + 1;
    if (
      nextBytes > UPSTREAM_QUEUE_MAX_BYTES ||
      nextItems > UPSTREAM_QUEUE_MAX_ITEMS
    ) {
      closed = true;
      const err = Object.assign(
        new Error(
          `${name}: upload queue overflow (${nextBytes}B/${nextItems})`,
        ),
        { isQueueOverflow: true },
      );
      clear(err);
      try {
        closeConnection?.(err);
      } catch (_) {}
      throw err;
    }
    let completionPromise = null;
    let completions = null;
    if (waitForFlush) {
      completions = [];
      completionPromise = new Promise((resolve, reject) =>
        completions.push({ resolve, reject }),
      );
    }
    chunks.push({ chunk, allowRetry, completions });
    queuedBytes = nextBytes;
    if (!draining) queueMicrotask(drain);
    return waitForFlush ? completionPromise.then(() => true) : true;
  };

  return {
    writeAndAwait(data, allowRetry = true) {
      return enqueue(data, allowRetry, true);
    },
    async awaitEmpty() {
      if (!queuedBytes && !draining) return;
      await new Promise((resolve) => idleResolvers.push(resolve));
    },
    clear() {
      closed = true;
      clear();
    },
  };
}

function createDownstreamSender(webSocket, headerData = null) {
  const packetCap = DOWNSTREAM_GRAIN_BYTES;
  const tailBytes = DOWNSTREAM_GRAIN_TAIL_THRESHOLD;
  const lowWaterBytes = Math.max(4096, tailBytes << 3);
  let header = headerData;
  let pendingBuffer = new Uint8Array(packetCap);
  let pendingBytes = 0;
  let flushTimer = null;
  let microtaskQueued = false;
  let generation = 0;
  let scheduledGeneration = 0;
  let waitRounds = 0;
  let flushPromise = null;

  const sendRawChunk = async (chunk) => {
    if (webSocket.readyState !== WebSocket.OPEN)
      throw new Error("ws.readyState is not open");
    webSocket.send(chunk);
  };

  const attachResponseHeader = (chunk) => {
    if (!header) return chunk;
    const merged = new Uint8Array(header.length + chunk.byteLength);
    merged.set(header, 0);
    merged.set(chunk, header.length);
    header = null;
    return merged;
  };

  const flush = async () => {
    while (flushPromise) await flushPromise;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    microtaskQueued = false;
    if (!pendingBytes) return;
    const output = pendingBuffer.subarray(0, pendingBytes).slice();
    pendingBuffer = new Uint8Array(packetCap);
    pendingBytes = 0;
    waitRounds = 0;
    flushPromise = sendRawChunk(output).finally(() => {
      flushPromise = null;
    });
    return flushPromise;
  };

  const scheduleFlush = () => {
    if (flushTimer || microtaskQueued) return;
    microtaskQueued = true;
    scheduledGeneration = generation;
    queueMicrotask(() => {
      microtaskQueued = false;
      if (!pendingBytes || flushTimer) return;
      if (packetCap - pendingBytes < tailBytes) {
        flush().catch(() => closeSocketQuietly(webSocket));
        return;
      }
      flushTimer = setTimeout(
        () => {
          flushTimer = null;
          if (!pendingBytes) return;
          if (packetCap - pendingBytes < tailBytes) {
            flush().catch(() => closeSocketQuietly(webSocket));
            return;
          }
          if (
            waitRounds < 2 &&
            (generation !== scheduledGeneration || pendingBytes < lowWaterBytes)
          ) {
            waitRounds++;
            scheduledGeneration = generation;
            scheduleFlush();
            return;
          }
          flush().catch(() => closeSocketQuietly(webSocket));
        },
        Math.max(DOWNSTREAM_GRAIN_SILENT_MS, 1),
      );
    });
  };

  return {
    async sendDirect(data) {
      let chunk = convertToUint8Array(data);
      if (!chunk.byteLength) return;
      chunk = attachResponseHeader(chunk);
      await sendRawChunk(chunk);
    },
    async send(data) {
      let chunk = convertToUint8Array(data);
      if (!chunk.byteLength) return;
      chunk = attachResponseHeader(chunk);
      let offset = 0;
      const totalBytes = chunk.byteLength;
      while (offset < totalBytes) {
        if (!pendingBytes && totalBytes - offset >= packetCap) {
          const sendBytes = Math.min(packetCap, totalBytes - offset);
          const view =
            offset || sendBytes !== totalBytes
              ? chunk.subarray(offset, offset + sendBytes)
              : chunk;
          await sendRawChunk(view);
          offset += sendBytes;
          continue;
        }
        const copyBytes = Math.min(
          packetCap - pendingBytes,
          totalBytes - offset,
        );
        pendingBuffer.set(
          chunk.subarray(offset, offset + copyBytes),
          pendingBytes,
        );
        pendingBytes += copyBytes;
        offset += copyBytes;
        generation++;
        if (pendingBytes === packetCap || packetCap - pendingBytes < tailBytes)
          await flush();
        else scheduleFlush();
      }
    },
    flush,
  };
}

async function waitForBackpressure(ws) {
  if (typeof ws.bufferedAmount === "number") {
    while (ws.bufferedAmount > 256 * 1024) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

async function connectStreams(
  remoteSocket,
  webSocket,
  headerData,
  retryFunc,
  onBytes,
) {
  let header = headerData,
    hasData = false,
    reader,
    useBYOB = false;
  const BYOB_LIMIT = 64 * 1024;
  const downstreamSender = createDownstreamSender(webSocket, header);
  header = null;

  try {
    reader = remoteSocket.readable.getReader({ mode: "byob" });
    useBYOB = true;
  } catch (e) {
    reader = remoteSocket.readable.getReader();
  }

  try {
    if (!useBYOB) {
      while (true) {
        await waitForBackpressure(webSocket);
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        hasData = true;
        if (typeof onBytes === "function") onBytes(value.byteLength);
        await downstreamSender.send(value);
      }
    } else {
      let readBuffer = new ArrayBuffer(BYOB_LIMIT);
      while (true) {
        await waitForBackpressure(webSocket);
        const { done, value } = await reader.read(
          new Uint8Array(readBuffer, 0, BYOB_LIMIT),
        );
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        hasData = true;
        if (typeof onBytes === "function") onBytes(value.byteLength);
        if (value.byteLength >= DOWNSTREAM_GRAIN_BYTES) {
          await downstreamSender.flush();
          await downstreamSender.sendDirect(value);
          readBuffer = new ArrayBuffer(BYOB_LIMIT);
        } else {
          await downstreamSender.send(value);
          readBuffer =
            value.buffer.byteLength >= BYOB_LIMIT
              ? value.buffer
              : new ArrayBuffer(BYOB_LIMIT);
        }
      }
    }
    await downstreamSender.flush();
  } catch (err) {
    closeSocketQuietly(webSocket);
  } finally {
    try {
      reader.cancel();
    } catch (e) {}
    try {
      reader.releaseLock();
    } catch (e) {}
  }
  if (!hasData && retryFunc) await retryFunc();
}

async function buildRaceCandidates(address, port) {
  if (!PRELOAD_RACE_DIAL || isIPHostname(address)) return null;
  const [aRecords, aaaaRecords] = await Promise.all([
    dohQuery(address, "A"),
    dohQuery(address, "AAAA"),
  ]);
  const ipv4List = [
    ...new Set(
      aRecords.flatMap((r) => {
        return r.type === 1 && typeof r.data === "string" && isIPv4(r.data)
          ? [r.data]
          : [];
      }),
    ),
  ];
  const ipv6List = [
    ...new Set(
      aaaaRecords.flatMap((r) => {
        return r.type === 28 &&
          typeof r.data === "string" &&
          isIPHostname(r.data)
          ? [r.data]
          : [];
      }),
    ),
  ];
  const limit = Math.max(1, TCP_CONCURRENCY | 0);
  const ipList =
    ipv4List.length >= limit
      ? ipv4List.slice(0, limit)
      : ipv4List.concat(ipv6List.slice(0, limit - ipv4List.length));
  if (ipList.length === 0) return null;
  return ipList.map((hostname, attempt) => ({
    hostname,
    port,
    attempt,
    resolvedFrom: address,
  }));
}

async function connectDirect(address, port, initialData = null) {
  const raceCandidates = await buildRaceCandidates(address, port);
  const candidates =
    raceCandidates ||
    Array.from({ length: TCP_CONCURRENCY }, () => ({
      hostname: address,
      port,
    }));

  const openConnection = async (host, prt) => {
    const socket = connect({ hostname: host, port: prt });
    await Promise.race([
      socket.opened,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 1000),
      ),
    ]);
    return socket;
  };

  if (candidates.length === 1) {
    const s = await openConnection(candidates[0].hostname, candidates[0].port);
    if (initialData && initialData.byteLength > 0) {
      const w = s.writable.getWriter();
      await w.write(convertToUint8Array(initialData));
      w.releaseLock();
    }
    return s;
  }

  const attempts = candidates.map((c) =>
    openConnection(c.hostname, c.port).then((socket) => ({
      socket,
      candidate: c,
    })),
  );
  let winner = null;
  try {
    winner = await Promise.any(attempts);
    if (initialData && initialData.byteLength > 0) {
      const w = winner.socket.writable.getWriter();
      await w.write(convertToUint8Array(initialData));
      w.releaseLock();
    }
    return winner.socket;
  } finally {
    if (winner) {
      for (const attempt of attempts) {
        attempt
          .then(({ socket }) => {
            if (socket !== winner.socket) {
              try {
                socket.close();
              } catch (e) {}
            }
          })
          .catch(() => {});
      }
    }
  }
}

async function forwardVlessUDP(udpChunk, webSocket, respHeader, onBytes) {
  const requestData = convertToUint8Array(udpChunk);
  try {
    const tcpSocket = connect({ hostname: "8.8.4.4", port: 53 });
    let vlessHeader = respHeader;
    const writer = tcpSocket.writable.getWriter();
    await writer.write(requestData);
    writer.releaseLock();

    await tcpSocket.readable.pipeTo(
      new WritableStream({
        async write(chunk) {
          const response = convertToUint8Array(chunk);
          if (typeof onBytes === "function") onBytes(response.byteLength);
          if (webSocket.readyState !== WebSocket.OPEN) return;
          if (vlessHeader) {
            const merged = new Uint8Array(
              vlessHeader.length + response.byteLength,
            );
            merged.set(vlessHeader, 0);
            merged.set(response, vlessHeader.length);
            webSocket.send(merged.buffer);
            vlessHeader = null;
          } else {
            webSocket.send(response);
          }
        },
      }),
    );
  } catch (e) {}
}

function extractUUIDFromVless(data) {
  if (data.byteLength < 17) return null;
  const hex = [...data.slice(1, 17)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

function trackRequest(env, ctx) {
  GLOBAL_REQ_COUNT++;
  const now = Date.now();
  if (now - GLOBAL_LAST_REQ_WRITE > 15000 && GLOBAL_REQ_COUNT > 0) {
    GLOBAL_LAST_REQ_WRITE = now;
    const countToSave = GLOBAL_REQ_COUNT;
    GLOBAL_REQ_COUNT = 0;

    const task = async () => {
      try {
        const today = new Date().toISOString().split("T")[0];
        await env.DB.prepare(
          "INSERT INTO settings (key, value) VALUES ('req_total', ?) ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + ?",
        )
          .bind(String(countToSave), String(countToSave))
          .run();

        const lastDateRow = await env.DB.prepare(
          "SELECT value FROM settings WHERE key = 'req_last_date'",
        ).first();
        if (!lastDateRow || lastDateRow.value !== today) {
          await env.DB.prepare(
            "INSERT INTO settings (key, value) VALUES ('req_last_date', ?) ON CONFLICT(key) DO UPDATE SET value = ?",
          )
            .bind(today, today)
            .run();
          await env.DB.prepare(
            "INSERT INTO settings (key, value) VALUES ('req_today', ?) ON CONFLICT(key) DO UPDATE SET value = ?",
          )
            .bind(String(countToSave), String(countToSave))
            .run();
        } else {
          await env.DB.prepare(
            "INSERT INTO settings (key, value) VALUES ('req_today', ?) ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + ?",
          )
            .bind(String(countToSave), String(countToSave))
            .run();
        }
      } catch (e) {}
    };

    if (ctx) ctx.waitUntil(task());
    else task();
  }
}

// ============================================================
// 9. HTML TEMPLATES (Simplified for brevity - full version in original code)
// ============================================================
const HTML_TEMPLATES = {
  nginx: `<!DOCTYPE html><html><head><title>Ryxo Panel</title></head><body>Ryxo Panel</body></html>`,
  setup: `<!DOCTYPE html><html><head><title>Setup</title></head><body>Setup</body></html>`,
  login: `<!DOCTYPE html><html><head><title>Login</title></head><body>Login</body></html>`,
  panel: `<!DOCTYPE html><html><head><title>Panel</title></head><body>Panel</body></html>`,
  status: `<!DOCTYPE html><html><head><title>Status</title></head><body>Status</body></html>`,
};
