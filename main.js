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
// 4. ROUTER & CONTROLLERS (بخش کامل)
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
        return new Response(JSON.stringify({ error: "Password already set" }), {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
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
          JSON.stringify({
            error: "New password must be at least 4 characters",
          }),
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
// 7. VLESS CORE ENGINE (توابع اصلی VLESS)
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

// ============================================================
// 9. HTML TEMPLATES (مهمترین بخش - پنل کامل)
// ============================================================
const HTML_TEMPLATES = {
  nginx: `<!DOCTYPE html>
<html lang="fa" dir="rtl" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ryxo Panel - Access</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" type="text/css" />
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: { sans: ['Vazirmatn', 'sans-serif'] },
                    colors: { amoled: { bg: '#000000', card: '#080b0f', input: '#0d1117', border: '#1c2330' } }
                }
            }
        }
    </script>
</head>
<body class="bg-gray-50 text-gray-900 dark:bg-amoled-bg dark:text-zinc-100 min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-md bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl shadow-xl p-8 text-center flex flex-col items-center gap-4">
        <div class="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-full mb-2">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        </div>
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">Ryxo Panel - Admin Access</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mt-2">
            To access the panel, add 
            <span class="inline-block px-2 py-1 bg-gray-100 dark:bg-amoled-input border border-gray-200 dark:border-zinc-800 rounded-md font-mono text-blue-500 font-bold mx-1 shadow-sm" dir="ltr">/panel</span> 
            to the end of your browser address.
        </p>
        <button onclick="window.location.href='/panel'" class="mt-4 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-sm transition-colors duration-200 shadow-lg shadow-blue-600/20 font-bold">
            Enter Panel
        </button>
    </div>
</body>
</html>`,

  setup: `<!DOCTYPE html>
<html lang="fa" dir="rtl" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ryxo Panel - Setup</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" type="text/css" />
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: { sans: ['Vazirmatn', 'sans-serif'] },
                    colors: { amoled: { bg: '#000000', card: '#080b0f', input: '#0d1117', border: '#1c2330' } }
                }
            }
        }
    </script>
</head>
<body class="bg-gray-50 text-gray-900 dark:bg-amoled-bg dark:text-zinc-100 min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-md bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl shadow-xl p-6">
        <h2 class="text-xl font-bold mb-2 text-center text-blue-600 dark:text-blue-400">Set New Password</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">This is your first login. Please set your admin password.</p>
        <form onsubmit="handleSetup(event)" class="space-y-4">
            <div>
                <label class="block text-sm font-medium mb-1.5">Password</label>
                <input type="password" id="password" class="w-full px-3 py-2 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-center font-mono" required minlength="4">
            </div>
            <div>
                <label class="block text-sm font-medium mb-1.5">Confirm Password</label>
                <input type="password" id="confirm-password" class="w-full px-3 py-2 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-center font-mono" required minlength="4">
            </div>
            <button type="submit" id="submit-btn" class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition font-bold">Set & Login</button>
        </form>
    </div>
    <script>
        async function handleSetup(event) {
            event.preventDefault();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm-password').value;
            const btn = document.getElementById('submit-btn');
            if (password !== confirmPassword) {
                alert('⚠️ Passwords do not match!');
                return;
            }
            btn.disabled = true;
            btn.innerText = 'Saving...';
            try {
                const res = await fetch('/api/setup-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    alert('✅ Password set successfully. Logging in...');
                    window.location.reload();
                } else {
                    alert('Error: ' + (data.error || 'Operation failed'));
                }
            } catch (err) {
                alert('Server communication error');
            } finally {
                btn.disabled = false;
                btn.innerText = 'Set & Login';
            }
        }
    </script>
</body>
</html>`,

  login: `<!DOCTYPE html>
<html lang="fa" dir="rtl" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ryxo Panel - Login</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" type="text/css" />
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: { sans: ['Vazirmatn', 'sans-serif'] },
                    colors: { amoled: { bg: '#000000', card: '#080b0f', input: '#0d1117', border: '#1c2330' } }
                }
            }
        }
    </script>
</head>
<body class="bg-gray-50 text-gray-900 dark:bg-amoled-bg dark:text-zinc-100 min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-md bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl shadow-xl p-6">
        <h2 class="text-xl font-bold mb-2 text-center text-blue-600 dark:text-blue-400">Admin Login</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">Enter your password to access the panel.</p>
        <form onsubmit="handleLogin(event)" class="space-y-4">
            <div>
                <label class="block text-sm font-medium mb-1.5">Password</label>
                <input type="password" id="password" class="w-full px-3 py-2 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-center font-mono" required>
            </div>
            <button type="submit" id="submit-btn" class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition font-bold">Login</button>
        </form>
    </div>
    <script>
        async function handleLogin(event) {
            event.preventDefault();
            const password = document.getElementById('password').value;
            const btn = document.getElementById('submit-btn');
            btn.disabled = true;
            btn.innerText = 'Checking...';
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    window.location.reload();
                } else {
                    alert('❌ Incorrect password!');
                }
            } catch (err) {
                alert('Server communication error');
            } finally {
                btn.disabled = false;
                btn.innerText = 'Login';
            }
        }
    </script>
</body>
</html>`,

  panel: `<!DOCTYPE html>
<html lang="fa" dir="rtl" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ryxo Panel</title>
    <script>
        const originalWarn = console.warn;
        console.warn = (...args) => {
            if (typeof args[0] === 'string' && args[0].includes('cdn.tailwindcss.com')) return;
            originalWarn(...args);
        };
    </script>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" type="text/css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: { sans: ['Vazirmatn', 'sans-serif'] },
                    colors: { amoled: { bg: '#000000', card: '#080b0f', input: '#0d1117', border: '#1c2330' } }
                }
            }
        }
    </script>
    <style>
        body { font-family: 'Vazirmatn', sans-serif; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #f3f4f6; border-radius: 4px; }
        ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
        .dark ::-webkit-scrollbar-track { background: #080b0f; }
        .dark ::-webkit-scrollbar-thumb { background: #1c2330; }
        .dark ::-webkit-scrollbar-thumb:hover { background: #2d3748; }
        * { scrollbar-width: thin; scrollbar-color: #d1d5db #f3f4f6; }
        .dark * { scrollbar-color: #1c2330 #080b0f; }
        .gradient-text {
            background: linear-gradient(135deg, #818cf8, #a78bfa, #34d399);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
    </style>
</head>
<body class="bg-gray-50 text-gray-900 dark:bg-amoled-bg dark:text-zinc-100 min-h-screen transition-colors duration-200">
    
    <!-- Header -->
    <header class="border-b border-gray-200 dark:border-amoled-border bg-white dark:bg-amoled-card px-4 py-4">
        <div class="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div class="flex flex-row flex-wrap justify-center items-center gap-3 w-full md:w-auto">
                <h1 class="text-lg font-bold flex items-center gap-2" dir="ltr">
                    Ryxo Panel 
                    <span id="panel-version" class="text-xs px-2 py-0.5 font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">v1.3.9</span>
                </h1>
                <div class="flex items-center gap-3 bg-gray-100 dark:bg-zinc-800/60 px-3 py-1.5 rounded-full border border-gray-200 dark:border-zinc-800/80 shadow-sm flex-shrink-0 w-fit">
                    <a href="https://github.com/itzsepanta/ryxopanel" target="_blank" rel="noopener noreferrer" class="text-gray-700 dark:text-zinc-300 hover:text-black dark:hover:text-white transition-all transform hover:scale-125 duration-200 flex-shrink-0" title="Github">
                        <svg class="w-[22px] h-[22px] flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"/>
                        </svg>
                    </a>
                    <span class="w-px h-4 bg-gray-300 dark:bg-zinc-700 flex-shrink-0"></span>
                    <a href="https://t.me/RyxoStudio" target="_blank" rel="noopener noreferrer" class="text-sky-500 hover:text-sky-600 dark:hover:text-sky-400 transition-all transform hover:scale-125 duration-200 flex-shrink-0" title="Telegram">
                        <svg class="w-[22px] h-[22px] flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.94-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.37.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .24z"/>
                        </svg>
                    </a>
                </div>
            </div>
            <div class="flex items-center justify-center gap-3 w-full md:w-auto mt-2 md:mt-0">
                <button id="theme-toggle" class="p-2 rounded-lg bg-gray-100 dark:bg-amoled-input border border-gray-200 dark:border-amoled-border hover:bg-gray-200 dark:hover:bg-zinc-800 transition">
                    <svg id="sun-icon" class="w-5 h-5 hidden dark:block text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M14 12a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    <svg id="moon-icon" class="w-5 h-5 block dark:hidden text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
                </button>
                <button onclick="toggleSettingsModal(true)" class="p-2 rounded-lg bg-gray-100 dark:bg-amoled-input border border-gray-200 dark:border-amoled-border hover:bg-gray-200 dark:hover:bg-zinc-800 transition text-gray-600 dark:text-gray-300 shadow-sm" title="Settings">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                </button>
                <button onclick="logoutAdmin()" class="p-2 rounded-lg bg-gray-100 dark:bg-amoled-input border border-gray-200 dark:border-amoled-border hover:bg-red-50 dark:hover:bg-red-950/20 transition text-red-600 dark:text-red-400 shadow-sm" title="Logout">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                </button>
            </div>
        </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-6xl mx-auto px-4 py-8">
        <!-- Dashboard Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 mb-8">
            <div class="bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-indigo-400 dark:hover:border-indigo-500/50 transition duration-300 relative overflow-hidden group">
                <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl group-hover:scale-150 transition duration-500"></div>
                <div class="flex items-center justify-between relative z-10 mb-2">
                    <span class="text-sm font-semibold text-gray-500 dark:text-zinc-400 whitespace-nowrap">Total Users</span>
                    <div class="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex-shrink-0">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    </div>
                </div>
                <div class="space-y-1.5 relative z-10 min-w-0 flex-1">
                    <div class="text-2xl font-black text-gray-900 dark:text-zinc-100 transition-all" id="stat-total-users">0</div>
                    <span class="text-[11px] text-indigo-500 dark:text-indigo-400 flex items-center gap-1 font-medium whitespace-nowrap">
                        <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping"></span>
                        Total Users
                    </span>
                </div>
            </div>

            <div class="bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-emerald-400 dark:hover:border-emerald-500/50 transition duration-300 relative overflow-hidden group">
                <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:scale-150 transition duration-500"></div>
                <div class="flex items-center justify-between relative z-10 mb-2">
                    <span class="text-sm font-semibold text-gray-500 dark:text-zinc-400 whitespace-nowrap">Online Users</span>
                    <div class="p-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-xl flex-shrink-0">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    </div>
                </div>
                <div class="space-y-1.5 relative z-10 min-w-0 flex-1">
                    <div class="text-2xl font-black text-emerald-600 dark:text-emerald-400 transition-all" id="stat-active-users">0</div>
                    <span class="text-[11px] text-emerald-500 dark:text-emerald-400 flex items-center gap-1 font-medium whitespace-nowrap">
                        <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                        Currently Connected
                    </span>
                </div>
            </div>

            <div id="card-cf-requests" class="bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-orange-400 dark:hover:border-orange-500/50 transition duration-300 relative overflow-hidden group">
                <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-orange-500/10 rounded-full blur-xl group-hover:scale-150 transition duration-500"></div>
                <div class="flex items-center justify-between relative z-10 mb-2">
                    <span class="text-sm font-semibold text-gray-500 dark:text-zinc-400 whitespace-nowrap">Daily Requests</span>
                    <div class="p-2 bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 rounded-xl flex-shrink-0">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path></svg>
                    </div>
                </div>
                <div class="space-y-2 relative z-10 min-w-0 flex-1">
                    <div class="flex items-center gap-1">
                        <span class="text-2xl font-black text-orange-600 dark:text-orange-400 transition-all" id="stat-cf-requests">0</span>
                        <span class="text-xs font-bold text-gray-400 mr-1">/ 100k</span>
                        <button id="cf-warning-btn" onclick="openUsageWarning()" class="hidden flex items-center justify-center w-5 h-5 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-full font-bold text-xs animate-bounce shadow-sm border border-red-300 dark:border-red-700 mr-2">!</button>
                    </div>
                    <div class="w-full bg-gray-100 dark:bg-zinc-800 rounded-full h-1.5 mt-1">
                        <div id="stat-cf-progress" class="bg-orange-500 h-1.5 rounded-full transition-all duration-500" style="width: 0%"></div>
                    </div>
                    <span class="text-[11px] text-orange-500 dark:text-orange-400 flex items-center justify-between font-medium whitespace-nowrap mt-1">
                        <span>Total: <span id="stat-cf-total">0</span></span>
                        <span dir="ltr">Cloudflare</span>
                    </span>
                </div>
            </div>

            <div class="bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500/50 transition duration-300 relative overflow-hidden group">
                <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/10 rounded-full blur-xl group-hover:scale-150 transition duration-500"></div>
                <div class="flex items-center justify-between relative z-10 mb-2">
                    <span class="text-sm font-semibold text-gray-500 dark:text-zinc-400 whitespace-nowrap">Total Usage (30d)</span>
                    <div class="p-2 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-xl flex-shrink-0">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                    </div>
                </div>
                <div class="space-y-1.5 relative z-10 min-w-0 flex-1">
                    <div class="text-2xl font-black text-blue-600 dark:text-blue-400 transition-all whitespace-nowrap" id="stat-total-usage">0 GB</div>
                    <span class="text-[11px] text-blue-500 dark:text-blue-400 flex items-center gap-1 font-medium whitespace-nowrap">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path></svg>
                        Total User Usage
                    </span>
                </div>
            </div>

            <div class="bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-amber-400 dark:hover:border-amber-500/50 transition duration-300 relative overflow-hidden group">
                <div class="absolute -right-4 -bottom-4 w-24 h-24 bg-amber-500/10 rounded-full blur-xl group-hover:scale-150 transition duration-500"></div>
                <div class="flex items-center justify-between relative z-10 mb-2">
                    <span class="text-sm font-semibold text-gray-500 dark:text-zinc-400 whitespace-nowrap">Top User</span>
                    <div class="p-2 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-xl flex-shrink-0">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                    </div>
                </div>
                <div class="space-y-1.5 relative z-10 min-w-0 flex-1">
                    <div class="text-xl font-black text-amber-600 dark:text-amber-400 transition-all truncate max-w-[150px]" id="stat-top-user">-</div>
                    <span class="text-[11px] text-amber-500 dark:text-amber-400 flex items-center gap-1 font-medium whitespace-nowrap" id="stat-top-user-usage">0 GB used</span>
                </div>
            </div>
        </div>

        <!-- Loading State -->
        <div id="loading-state" class="text-center py-12">
            <span class="text-gray-500 dark:text-gray-400">Loading users...</span>
        </div>

        <!-- Search & Filter -->
        <div class="mb-6 flex flex-col md:flex-row gap-4 justify-between items-center bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl p-4 shadow-sm">
            <div class="relative w-full md:w-80">
                <input type="text" id="search-input" oninput="filterAndRenderUsers()" placeholder="Search username or UUID..." class="w-full pl-3 pr-9 py-2.5 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                </div>
            </div>
            <div class="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <select id="filter-status" onchange="filterAndRenderUsers()" class="px-3 py-2.5 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 dark:text-zinc-300 cursor-pointer">
                    <option value="all">🔍 All Status</option>
                    <option value="active">✅ Active</option>
                    <option value="inactive">❌ Inactive</option>
                    <option value="online">⚡ Online</option>
                    <option value="offline">💤 Offline</option>
                    <option value="expired">⏳ Expired / Used Up</option>
                </select>
                <select id="sort-users" onchange="filterAndRenderUsers()" class="px-3 py-2.5 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 dark:text-zinc-300 cursor-pointer">
                    <option value="newest">📅 Newest</option>
                    <option value="name">🔤 Username</option>
                    <option value="usage-desc">📊 Most Usage</option>
                    <option value="usage-asc">📈 Least Usage</option>
                    <option value="expiry-asc">⏳ Least Time Left</option>
                </select>
            </div>
        </div>

        <!-- User List Header -->
        <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-gray-800 dark:text-zinc-200">User List</h2>
            <button onclick="openCreateModal()" class="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-full shadow-md hover:shadow-lg hover:scale-110 transition-all duration-300">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path></svg>
            </button>
        </div>
        
        <!-- Users Table -->
        <div id="users-table-container" class="hidden overflow-x-auto border border-gray-200 dark:border-amoled-border rounded-xl bg-white dark:bg-amoled-card">
            <table class="w-full text-right border-collapse">
                <thead>
                    <tr class="bg-gray-100 dark:bg-zinc-900/50 border-b border-gray-200 dark:border-amoled-border text-xs text-gray-500 dark:text-gray-400">
                        <th class="p-4">User & Actions</th>
                        <th class="p-4">Subscription Link</th>
                        <th class="p-4">Protocol</th>
                        <th class="p-4">Port (TLS)</th>
                        <th class="p-4">Usage Status</th>
                        <th class="p-4">Expiry Status</th>
                        <th class="p-4">Created</th>
                    </tr>
                </thead>
                <tbody id="users-tbody" class="divide-y divide-gray-150 dark:divide-amoled-border text-sm"></tbody>
            </table>
        </div>

        <!-- Empty State -->
        <div id="empty-state" class="hidden p-8 border border-dashed border-gray-300 dark:border-amoled-border rounded-2xl text-center">
            <p class="text-gray-500 dark:text-gray-400">No users found. Click the "Add User" button to create your first user.</p>
        </div>
    </main>

    <!-- Modals -->
    <div id="user-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 opacity-0 pointer-events-none transition-opacity duration-200 ease-out">
        <div id="user-modal-card" class="w-full max-w-xl bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-850 rounded-2xl shadow-xl overflow-hidden transition-[opacity,transform] duration-200 opacity-0 scale-95 ease-out flex flex-col max-h-[90vh] transform-gpu">
            <div class="px-6 py-4 border-b border-gray-150 dark:border-zinc-800/80 flex justify-between items-center bg-gray-50/50 dark:bg-zinc-900/30">
                <div class="flex items-center gap-2">
                    <div class="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                    <h3 id="modal-title" class="font-bold text-gray-900 dark:text-zinc-100 text-base">Create New User</h3>
                </div>
                <button onclick="toggleModal(false)" class="p-1 rounded-lg hover:bg-gray-150 dark:hover:bg-zinc-800/60 text-gray-400 hover:text-gray-650 dark:hover:text-zinc-200 transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <form id="create-user-form" class="p-6 space-y-5 overflow-y-auto flex-1 overscroll-contain" onsubmit="handleFormSubmit(event)">
                <!-- Form fields -->
                <div class="space-y-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-zinc-400 mb-2 uppercase tracking-wider">Username</label>
                        <div class="relative">
                            <span class="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-gray-400">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                            </span>
                            <input type="text" id="input-name" placeholder="ali" class="w-full pl-3 pr-10 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-semibold text-gray-800 dark:text-zinc-100 placeholder-gray-400/80 transition" required>
                        </div>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <div>
                            <label class="block text-[10px] sm:text-xs font-bold text-gray-500 dark:text-zinc-400 mb-2 uppercase tracking-wider">Limit (GB)</label>
                            <div class="relative">
                                <span class="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-gray-400">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                                </span>
                                <input type="number" id="input-limit" min="0" step="any" placeholder="Unlimited" class="w-full pl-3 pr-10 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-semibold text-gray-800 dark:text-zinc-100 placeholder-gray-400/80 transition">
                            </div>
                        </div>
                        <div>
                            <label class="block text-[10px] sm:text-xs font-bold text-gray-500 dark:text-zinc-400 mb-2 uppercase tracking-wider">Expiry (Days)</label>
                            <div class="relative">
                                <span class="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-gray-400">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                </span>
                                <input type="number" id="input-expiry" min="0" placeholder="Unlimited" class="w-full pl-3 pr-10 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-semibold text-gray-800 dark:text-zinc-100 placeholder-gray-400/80 transition">
                            </div>
                        </div>
                        <div>
                            <label class="block text-[10px] sm:text-xs font-bold text-gray-500 dark:text-zinc-400 mb-2 uppercase tracking-wider">Max Connections</label>
                            <div class="relative">
                                <span class="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-gray-400">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                                </span>
                                <input type="number" id="input-max-connections" min="0" placeholder="Unlimited" class="w-full pl-3 pr-10 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-semibold text-gray-800 dark:text-zinc-100 placeholder-gray-400/80 transition">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Ports -->
                <div class="pt-2 border-t border-gray-100 dark:border-zinc-900">
                    <label class="block text-xs font-bold text-gray-500 dark:text-zinc-400 mb-3 uppercase tracking-wider">Ports (Multiple Selection)</label>
                    <div class="space-y-4">
                        <div class="p-4 bg-gray-50/50 dark:bg-zinc-900/20 border border-gray-200/60 dark:border-zinc-850 rounded-2xl shadow-sm">
                            <div class="flex items-center gap-1.5 mb-3">
                                <span class="flex h-2 w-2 rounded-full bg-blue-500 shadow-sm"></span>
                                <span class="text-xs font-bold text-blue-600 dark:text-blue-400">🔒 TLS Ports</span>
                            </div>
                            <div class="grid grid-cols-3 sm:grid-cols-4 gap-2" id="tls-ports-list"></div>
                        </div>
                        <div class="p-4 bg-gray-50/50 dark:bg-zinc-900/20 border border-gray-200/60 dark:border-zinc-850 rounded-2xl shadow-sm">
                            <div class="flex items-center gap-1.5 mb-3">
                                <span class="flex h-2 w-2 rounded-full bg-amber-500 shadow-sm"></span>
                                <span class="text-xs font-bold text-amber-600 dark:text-amber-400">🔓 Non-TLS Ports</span>
                            </div>
                            <div class="grid grid-cols-3 sm:grid-cols-4 gap-2" id="nontls-ports-list"></div>
                        </div>
                    </div>
                </div>

                <!-- IPs and Fingerprint -->
                <div class="pt-4 border-t border-gray-100 dark:border-zinc-900 space-y-4">
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <label class="block text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Clean IPs (Optional)</label>
                            <button type="button" onclick="openIpSelectorModal()" class="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg text-xs font-bold transition border border-indigo-200 dark:border-indigo-800">IP Repository</button>
                        </div>
                        <textarea id="input-ips" rows="2" placeholder="104.16.0.1" class="w-full px-3 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-xs font-mono text-gray-800 dark:text-zinc-100 placeholder-gray-400/80 transition resize-none"></textarea>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 dark:text-zinc-400 mb-2 uppercase tracking-wider">Browser Fingerprint</label>
                        <div class="relative">
                            <select id="fingerprint-select" class="w-full px-3 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-xs font-semibold text-gray-700 dark:text-zinc-300 cursor-pointer appearance-none">
                                <option value="chrome">🌐 Chrome</option>
                                <option value="firefox">🦊 Firefox</option>
                                <option value="safari">🧭 Safari</option>
                                <option value="ios" selected>📱 iOS Device</option>
                                <option value="android">🤖 Android Device</option>
                                <option value="edge">🌀 Microsoft Edge</option>
                                <option value="360">🔒 360 Browser</option>
                                <option value="qq">💬 QQ Browser</option>
                                <option value="random">🎲 Random</option>
                                <option value="randomized">🎭 Randomized</option>
                            </select>
                            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-zinc-400">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="pt-4 flex gap-3">
                    <button type="button" onclick="toggleModal(false)" class="flex-1 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 text-gray-700 dark:text-zinc-300 font-bold rounded-xl text-sm transition duration-200">Cancel</button>
                    <button type="submit" id="submit-btn" class="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-xl text-sm transition duration-200 shadow-md shadow-blue-500/10 hover:shadow-lg">Create User</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Settings Modal -->
    <div id="settings-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm opacity-0 pointer-events-none transition-all duration-300 ease-out">
        <div class="w-full max-w-md bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl shadow-xl overflow-hidden transition-all transform duration-300 opacity-0 scale-95 ease-out">
            <div class="px-6 py-4 border-b border-gray-150 dark:border-amoled-border flex justify-between items-center bg-gray-50 dark:bg-zinc-900/50">
                <h3 class="font-bold text-gray-900 dark:text-zinc-100">Panel Settings</h3>
                <button onclick="toggleSettingsModal(false)" class="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div class="p-6 space-y-4">
                <div>
                    <label class="block text-sm font-medium mb-1.5 text-gray-700 dark:text-zinc-300">Proxy Location (Cloudflare)</label>
                    <div class="relative">
                        <select id="location-select" class="w-full pl-8 pr-3 py-2.5 bg-white dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 dark:text-zinc-200 cursor-pointer appearance-none">
                            <option value="">Loading...</option>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 dark:text-zinc-400">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-zinc-800">
                    <div>
                        <label class="block text-sm font-medium mb-1.5 text-gray-700 dark:text-zinc-300">Fragment Length</label>
                        <input type="text" id="frag-length" placeholder="20-30" class="w-full px-3 py-2.5 bg-white dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-center font-mono" dir="ltr">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1.5 text-gray-700 dark:text-zinc-300">Fragment Interval</label>
                        <input type="text" id="frag-interval" placeholder="1-2" class="w-full px-3 py-2.5 bg-white dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-center font-mono" dir="ltr">
                    </div>
                </div>
                <div class="pt-4 border-t border-gray-100 dark:border-zinc-800">
                    <h4 class="text-sm font-bold mb-3 text-gray-800 dark:text-zinc-200">🔒 Change Admin Password</h4>
                    <div class="space-y-3">
                        <div>
                            <label class="block text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">Current Password</label>
                            <input type="password" id="change-pwd-current" class="w-full px-3 py-2 bg-white dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono text-center">
                        </div>
                        <div>
                            <label class="block text-[11px] text-gray-500 dark:text-gray-400 font-medium mb-1">New Password</label>
                            <input type="password" id="change-pwd-new" class="w-full px-3 py-2 bg-white dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono text-center">
                        </div>
                        <button type="button" onclick="changeAdminPassword()" id="change-pwd-btn" class="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-lg text-xs transition-all shadow-sm">Change Password</button>
                    </div>
                </div>
                <div class="pt-4 flex gap-3">
                    <button type="button" onclick="toggleSettingsModal(false)" class="flex-1 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-medium rounded-lg text-sm transition">Cancel</button>
                    <button type="button" onclick="saveSettings()" id="save-settings-btn" class="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition">Save Settings</button>
                </div>
            </div>
        </div>
    </div>

    <!-- QR Modal -->
    <div id="qr-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm opacity-0 pointer-events-none transition-all duration-300 ease-out">
        <div class="w-full max-w-sm bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl shadow-xl overflow-hidden p-6 text-center transition-all transform duration-300 opacity-0 scale-95 ease-out">
            <h3 id="qr-modal-title" class="font-bold text-gray-900 dark:text-zinc-100 mb-4">Scan QR Code</h3>
            <div class="bg-white p-3 rounded-xl inline-block mb-4 border border-gray-100">
                <div id="qrcode-box" class="flex justify-center items-center w-48 h-48 mx-auto"></div>
            </div>
            <button onclick="toggleQRModal(false)" class="w-full py-2 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-medium rounded-lg text-sm transition text-gray-900 dark:text-zinc-100">Close</button>
        </div>
    </div>

    <!-- IP Selector Modal -->
    <div id="ip-selector-modal" class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm opacity-0 pointer-events-none transition-all duration-300 ease-out">
        <div class="w-full max-w-sm bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl shadow-xl overflow-hidden transition-all transform duration-300 opacity-0 scale-95 ease-out">
            <div class="px-6 py-4 border-b border-gray-150 dark:border-amoled-border flex justify-between items-center bg-gray-50 dark:bg-zinc-900/50">
                <h3 class="font-bold text-gray-900 dark:text-zinc-100 text-sm">Clean IP Repository</h3>
                <button type="button" onclick="toggleIpSelectorModal(false)" class="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div class="p-6 space-y-4">
                <div id="ip-loading-state" class="text-center text-sm text-gray-500 dark:text-zinc-400 hidden">Loading IPs...</div>
                <div id="ip-selection-form" class="space-y-4">
                    <div>
                        <label class="block text-xs font-medium mb-1.5 text-gray-700 dark:text-zinc-300">Operator</label>
                        <select id="ip-operator-select" class="w-full px-3 py-2.5 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 dark:text-zinc-300 cursor-pointer">
                            <option value="all">All</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-medium mb-1.5 text-gray-700 dark:text-zinc-300">Count</label>
                        <input type="number" id="ip-count-input" min="1" value="10" class="w-full px-3 py-2.5 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono text-center">
                    </div>
                </div>
                <div class="pt-4 flex gap-3">
                    <button type="button" onclick="toggleIpSelectorModal(false)" class="flex-1 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-medium rounded-xl text-xs transition">Cancel</button>
                    <button type="button" onclick="applySelectedIps()" class="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-xs transition">Get IPs</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        window.globalFragLen = "20-30";
        window.globalFragInt = "1-2";
        const tlsPorts = ['443', '2053', '2083', '2087', '2096', '8443'];
        const nonTlsPorts = ['80', '8080', '8880', '2052', '2082', '2086', '2095'];
        let isEditMode = false;
        let editingUsername = '';
        let cachedIpsData = {};
        const CURRENT_VERSION = '1.3.9';

        // Render port checkboxes
        function renderPortCheckboxes() {
            const tlsContainer = document.getElementById('tls-ports-list');
            const nonTlsContainer = document.getElementById('nontls-ports-list');
            tlsContainer.innerHTML = tlsPorts.map(function(port) {
                const isCheckedDefault = port === '443' ? 'checked' : '';
                return '<label class="relative cursor-pointer">' +
                    '<input type="checkbox" name="ports" value="' + port + '" ' + isCheckedDefault + ' class="peer sr-only">' +
                    '<div class="flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 dark:border-zinc-800/80 rounded-xl text-xs font-semibold select-none transition-all duration-200 hover:bg-gray-50 dark:hover:bg-zinc-800/40 text-gray-700 dark:text-zinc-300 peer-checked:bg-blue-50 dark:peer-checked:bg-blue-950/25 peer-checked:border-blue-500 dark:peer-checked:border-blue-500/70 peer-checked:text-blue-600 dark:peer-checked:text-blue-400 shadow-sm">' +
                        '<span>' + port + '</span>' +
                        '<svg class="w-4 h-4 hidden peer-checked:block text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>' +
                    '</div>' +
                '</label>';
            }).join('');
            nonTlsContainer.innerHTML = nonTlsPorts.map(function(port) {
                const isCheckedDefault = port === '80' ? 'checked' : '';
                return '<label class="relative cursor-pointer">' +
                    '<input type="checkbox" name="ports" value="' + port + '" ' + isCheckedDefault + ' class="peer sr-only">' +
                    '<div class="flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 dark:border-zinc-800/80 rounded-xl text-xs font-semibold select-none transition-all duration-200 hover:bg-gray-50 dark:hover:bg-zinc-800/40 text-gray-700 dark:text-zinc-300 peer-checked:bg-amber-50 dark:peer-checked:bg-amber-950/25 peer-checked:border-amber-500 dark:peer-checked:border-amber-500/70 peer-checked:text-amber-600 dark:peer-checked:text-amber-400 shadow-sm">' +
                        '<span>' + port + '</span>' +
                        '<svg class="w-4 h-4 hidden peer-checked:block text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>' +
                    '</div>' +
                '</label>';
            }).join('');
        }

        // Theme toggle
        const themeToggleBtn = document.getElementById('theme-toggle');
        if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        themeToggleBtn.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            localStorage.setItem('color-theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
        });

        // Modal functions
        function toggleModal(show) {
            const modal = document.getElementById('user-modal');
            const card = document.getElementById('user-modal-card');
            if (show) {
                modal.classList.remove('opacity-0', 'pointer-events-none');
                modal.classList.add('opacity-100', 'pointer-events-auto');
                card.classList.remove('opacity-0', 'scale-95');
                card.classList.add('opacity-100', 'scale-100');
            } else {
                modal.classList.remove('opacity-100', 'pointer-events-auto');
                modal.classList.add('opacity-0', 'pointer-events-none');
                card.classList.remove('opacity-100', 'scale-100');
                card.classList.add('opacity-0', 'scale-95');
                isEditMode = false;
                editingUsername = '';
                document.getElementById('modal-title').innerText = 'Create New User';
                document.getElementById('submit-btn').innerText = 'Create User';
                document.getElementById('input-name').disabled = false;
                document.getElementById('create-user-form').reset();
                const cb443 = document.querySelector('input[name="ports"][value="443"]');
                if (cb443) cb443.checked = true;
                const cb80 = document.querySelector('input[name="ports"][value="80"]');
                if (cb80) cb80.checked = true;
                const fpSelect = document.getElementById('fingerprint-select');
                if (fpSelect) fpSelect.value = 'ios';
            }
        }

        function openCreateModal() {
            isEditMode = false;
            editingUsername = '';
            document.getElementById('modal-title').innerText = 'Create New User';
            document.getElementById('submit-btn').innerText = 'Create User';
            document.getElementById('input-name').disabled = false;
            document.getElementById('create-user-form').reset();
            const cb443 = document.querySelector('input[name="ports"][value="443"]');
            if (cb443) cb443.checked = true;
            const cb80 = document.querySelector('input[name="ports"][value="80"]');
            if (cb80) cb80.checked = true;
            const fpSelect = document.getElementById('fingerprint-select');
            if (fpSelect) fpSelect.value = 'ios';
            toggleModal(true);
        }

        function toggleSettingsModal(show) {
            const modal = document.getElementById('settings-modal');
            const card = modal.querySelector('div');
            if (show) {
                modal.classList.remove('opacity-0', 'pointer-events-none');
                modal.classList.add('opacity-100', 'pointer-events-auto');
                card.classList.remove('opacity-0', 'scale-95');
                card.classList.add('opacity-100', 'scale-100');
            } else {
                modal.classList.remove('opacity-100', 'pointer-events-auto');
                modal.classList.add('opacity-0', 'pointer-events-none');
                card.classList.remove('opacity-100', 'scale-100');
                card.classList.add('opacity-0', 'scale-95');
            }
        }

        function toggleQRModal(show, link = '', title = 'Scan QR Code') {
            const modal = document.getElementById('qr-modal');
            const card = modal.querySelector('div');
            const qrBox = document.getElementById('qrcode-box');
            const titleEl = document.getElementById('qr-modal-title');
            if (show) {
                titleEl.innerText = title;
                qrBox.innerHTML = '';
                new QRCode(qrBox, {
                    text: link,
                    width: 192,
                    height: 192,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                });
                modal.classList.remove('opacity-0', 'pointer-events-none');
                modal.classList.add('opacity-100', 'pointer-events-auto');
                card.classList.remove('opacity-0', 'scale-95');
                card.classList.add('opacity-100', 'scale-100');
            } else {
                modal.classList.remove('opacity-100', 'pointer-events-auto');
                modal.classList.add('opacity-0', 'pointer-events-none');
                card.classList.remove('opacity-100', 'scale-100');
                card.classList.add('opacity-0', 'scale-95');
            }
        }

        // Load users
        async function loadUsers(silent = false) {
            const loadingState = document.getElementById('loading-state');
            const tableContainer = document.getElementById('users-table-container');
            const emptyState = document.getElementById('empty-state');
            if (!silent) {
                loadingState.classList.remove('hidden');
                tableContainer.classList.add('hidden');
                emptyState.classList.add('hidden');
            }
            try {
                const res = await fetch('/api/users?t=' + Date.now());
                if (!res.ok) throw new Error();
                const data = await res.json();
                renderUsersUI(data);
            } catch (err) {
                if (!silent) {
                    loadingState.innerHTML = '<span class="text-red-500">Error fetching user data</span>';
                }
            }
        }

        function renderUsersUI(data) {
            try {
                const users = data.users || [];
                window.allUsers = users;
                const serverTime = data.serverTime || Date.now();
                window.lastServerTime = serverTime;
                const totalUsersCount = users.length;
                const activeUsersCount = users.filter(u => u.is_online === 1).length;
                const totalGbUsage = users.reduce((sum, u) => sum + (u.used_gb || 0), 0);
                document.getElementById('stat-total-users').innerText = totalUsersCount;
                document.getElementById('stat-active-users').innerText = activeUsersCount;
                document.getElementById('stat-total-usage').innerText = totalGbUsage < 1 ? (totalGbUsage * 1024).toFixed(0) + ' MB' : totalGbUsage.toFixed(2) + ' GB';
                const cfRequests = data.cfRequestsToday || 0;
                const reqCard = document.getElementById('card-cf-requests');
                const warningBtn = document.getElementById('cf-warning-btn');
                if (cfRequests >= 90000) {
                    if (reqCard) {
                        reqCard.className = "bg-red-50 dark:bg-red-950/20 border border-red-500 rounded-2xl p-5 shadow-[0_0_15px_rgba(239,68,68,0.4)] flex flex-col justify-between hover:shadow-md transition duration-300 relative overflow-hidden group animate-pulse";
                    }
                    if (warningBtn) {
                        warningBtn.classList.remove('hidden');
                    }
                    const today = new Date().toISOString().split('T')[0];
                    if (localStorage.getItem('ryxo_usage_warned_date') !== today) {
                        openUsageWarning();
                    }
                } else {
                    if (reqCard) {
                        reqCard.className = "bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-orange-400 dark:hover:border-orange-500/50 transition duration-300 relative overflow-hidden group";
                    }
                    if (warningBtn) {
                        warningBtn.classList.add('hidden');
                    }
                }
                const cfTotal = data.cfRequestsTotal || 0;
                document.getElementById('stat-cf-requests').innerText = cfRequests >= 1000 ? (cfRequests / 1000).toFixed(1) + 'k' : cfRequests;
                document.getElementById('stat-cf-total').innerText = cfTotal >= 1000000 ? (cfTotal / 1000000).toFixed(2) + 'M' : (cfTotal >= 1000 ? (cfTotal / 1000).toFixed(1) + 'k' : cfTotal);
                const progressPercent = Math.min((cfRequests / 100000) * 100, 100);
                document.getElementById('stat-cf-progress').style.width = progressPercent + '%';
                const topUser = users.reduce((max, u) => (u.used_gb || 0) > (max.used_gb || 0) ? u : max, { username: 'None', used_gb: 0 });
                document.getElementById('stat-top-user').innerText = topUser.username;
                const topUsage = topUser.used_gb || 0;
                document.getElementById('stat-top-user-usage').innerText = topUsage < 1 ? (topUsage * 1024).toFixed(0) + ' MB used' : topUsage.toFixed(2) + ' GB used';
                filterAndRenderUsers();
            } catch (err) {
                document.getElementById('loading-state').innerHTML = '<span class="text-red-500">Error processing user data</span>';
            }
        }

        function filterAndRenderUsers() {
            if (!window.allUsers) return;
            const searchQuery = (document.getElementById('search-input').value || '').toLowerCase().trim();
            const filterStatus = document.getElementById('filter-status').value;
            const sortVal = document.getElementById('sort-users').value;
            const serverTime = window.lastServerTime || Date.now();
            let filtered = [...window.allUsers];
            if (searchQuery) {
                filtered = filtered.filter(u => (u.username || '').toLowerCase().includes(searchQuery) || (u.uuid || '').toLowerCase().includes(searchQuery));
            }
            if (filterStatus !== 'all') {
                filtered = filtered.filter(u => {
                    const isOnline = u.is_online === 1;
                    const isActive = u.is_active === 1;
                    let isExpired = false;
                    if (u.limit_gb && u.used_gb >= u.limit_gb) isExpired = true;
                    if (u.expiry_days && u.created_at) {
                        const created = new Date(u.created_at);
                        const expiryDate = new Date(created.getTime() + (u.expiry_days * 24 * 60 * 60 * 1000));
                        if (new Date(serverTime) > expiryDate) isExpired = true;
                    }
                    if (filterStatus === 'active') return isActive && !isExpired;
                    if (filterStatus === 'inactive') return !isActive;
                    if (filterStatus === 'online') return isOnline;
                    if (filterStatus === 'offline') return !isOnline;
                    if (filterStatus === 'expired') return isExpired || !isActive;
                    return true;
                });
            }
            filtered.sort((a, b) => {
                if (sortVal === 'newest') return b.id - a.id;
                if (sortVal === 'name') return (a.username || '').localeCompare(b.username || '');
                if (sortVal === 'usage-desc') return (b.used_gb || 0) - (a.used_gb || 0);
                if (sortVal === 'usage-asc') return (a.used_gb || 0) - (b.used_gb || 0);
                if (sortVal === 'expiry-asc') {
                    const getRemaining = (u) => {
                        if (!u.expiry_days) return Infinity;
                        if (!u.created_at) return Infinity;
                        const created = new Date(u.created_at);
                        const expiryDate = new Date(created.getTime() + (u.expiry_days * 24 * 60 * 60 * 1000));
                        return expiryDate - new Date(serverTime);
                    };
                    return getRemaining(a) - getRemaining(b);
                }
                return 0;
            });
            renderFilteredUsers(filtered, serverTime);
        }

        function renderFilteredUsers(users, serverTime) {
            const loadingState = document.getElementById('loading-state');
            const tableContainer = document.getElementById('users-table-container');
            const emptyState = document.getElementById('empty-state');
            const tbody = document.getElementById('users-tbody');
            if (users.length === 0) {
                loadingState.classList.add('hidden');
                emptyState.classList.remove('hidden');
                tableContainer.classList.add('hidden');
                if (window.allUsers && window.allUsers.length > 0) {
                    emptyState.querySelector('p').innerText = 'No users match your search.';
                } else {
                    emptyState.querySelector('p').innerText = 'No users found. Click the "Add User" button to create your first user.';
                }
            } else {
                loadingState.classList.add('hidden');
                emptyState.classList.add('hidden');
                tableContainer.classList.remove('hidden');
                tbody.innerHTML = users.map(user => {
                    const createdDate = user.created_at ? new Date(user.created_at).toLocaleDateString('fa-IR') : '-';
                    let daysRemaining = 'Unlimited';
                    let daysPercent = 100;
                    if (user.expiry_days) {
                        if (user.created_at) {
                            const created = new Date(user.created_at);
                            const expiryDate = new Date(created.getTime() + (user.expiry_days * 24 * 60 * 60 * 1000));
                            const diffDays = Math.ceil((expiryDate - new Date(serverTime)) / (1000 * 60 * 60 * 24));
                            daysRemaining = diffDays > 0 ? diffDays : 0;
                            daysPercent = Math.max(0, Math.min(100, (daysRemaining / user.expiry_days) * 100));
                        } else {
                            daysRemaining = user.expiry_days;
                        }
                    }
                    const usedGb = user.used_gb || 0;
                    const formattedUsed = usedGb < 1 ? (usedGb * 1024).toFixed(0) + ' MB' : usedGb.toFixed(2) + ' GB';
                    let volumeHtml = '';
                    if (user.limit_gb) {
                        const limitPercent = Math.min((usedGb / user.limit_gb) * 100, 100);
                        const limitHue = 120 - (limitPercent * 1.2);
                        const formattedLimit = user.limit_gb < 1 ? (user.limit_gb * 1024).toFixed(0) + ' MB' : user.limit_gb + ' GB';
                        volumeHtml = '<div class="flex flex-col gap-1.5 w-full min-w-[130px]">' +
                            '<div class="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 font-medium">' +
                            '<span>Used: ' + formattedUsed + '</span>' +
                            '<span>Total: ' + formattedLimit + '</span>' +
                            '</div>' +
                            '<div class="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-1.5 overflow-hidden">' +
                            '<div class="h-1.5 rounded-full transition-all duration-500" style="width: ' + limitPercent + '%; background-color: hsl(' + limitHue + ', 80%, 45%)"></div>' +
                            '</div>' +
                        '</div>';
                    } else {
                        volumeHtml = '<div class="flex flex-col gap-1.5 w-full min-w-[130px]">' +
                            '<div class="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 font-medium">' +
                            '<span>Used: ' + formattedUsed + '</span>' +
                            '<span>Total: Unlimited</span>' +
                            '</div>' +
                            '<div class="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-1.5 overflow-hidden">' +
                            '<div class="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style="width: 100%"></div>' +
                            '</div>' +
                        '</div>';
                    }
                    let expiryHtml = '';
                    if (user.expiry_days) {
                        const expiryHue = daysPercent * 1.2;
                        expiryHtml = '<div class="flex flex-col gap-1.5 w-full min-w-[130px]">' +
                            '<div class="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 font-medium">' +
                            '<span>Remaining: ' + daysRemaining + ' days</span>' +
                            '<span>Total: ' + user.expiry_days + ' days</span>' +
                            '</div>' +
                            '<div class="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-1.5 overflow-hidden flex justify-end">' +
                            '<div class="h-1.5 rounded-full transition-all duration-500" style="width: ' + daysPercent + '%; background-color: hsl(' + expiryHue + ', 80%, 45%)"></div>' +
                            '</div>' +
                        '</div>';
                    } else {
                        expiryHtml = '<div class="flex flex-col gap-1.5 w-full min-w-[130px]">' +
                            '<div class="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 font-medium">' +
                            '<span>Remaining: Unlimited</span>' +
                            '<span>Total: Unlimited</span>' +
                            '</div>' +
                            '<div class="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-1.5 overflow-hidden flex justify-end">' +
                            '<div class="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style="width: 100%"></div>' +
                            '</div>' +
                        '</div>';
                    }
                    const statusBtnColor = user.is_active === 0 ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30' : 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30';
                    const statusBtnTitle = user.is_active === 0 ? 'Activate User' : 'Deactivate User';
                    const statusBtnIcon = user.is_active === 0 ? '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>' : '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
                    return '<tr class="hover:bg-gray-50 dark:hover:bg-zinc-900/40 border-b border-gray-100 dark:border-zinc-800 last:border-0">' +
                        '<td class="p-4">' +
                        '<div class="flex flex-col gap-3">' +
                        '<div class="flex items-center gap-2">' +
                        '<span class="font-bold text-gray-900 dark:text-zinc-100">' + user.username + '</span>' +
                        (user.is_active === 0 ? '<span class="px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 rounded-md">Disabled</span>' : '<span class="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-md">Active</span>') +
                        (user.is_online === 1 ? '<span class="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500 text-white rounded-md animate-pulse">● Online</span>' : '<span class="px-1.5 py-0.5 text-[10px] font-medium bg-gray-200 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400 rounded-md">Offline</span>') +
                        '</div>' +
                        '<div class="flex gap-1.5">' +
                        '<button onclick="copyConfig(\'' + encodeURIComponent(user.username) + '\')" title="Copy Config" class="p-1.5 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-md transition shadow-sm"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></button>' +
                        '<button onclick="copyJsonConfig(\'' + encodeURIComponent(user.username) + '\')" title="Copy JSON" class="p-1.5 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 hover:bg-purple-50 dark:hover:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-md transition shadow-sm"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg></button>' +
                        '<button onclick="showQR(\'' + encodeURIComponent(user.username) + '\')" title="QR Code" class="p-1.5 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 hover:bg-green-50 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 rounded-md transition shadow-sm"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg></button>' +
                        '<button onclick="toggleUserStatus(\'' + encodeURIComponent(user.username) + '\')" title="' + statusBtnTitle + '" class="p-1.5 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 ' + statusBtnColor + ' rounded-md transition shadow-sm">' + statusBtnIcon + '</button>' +
                        '<button onclick="editUser(\'' + encodeURIComponent(user.username) + '\')" title="Edit" class="p-1.5 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 hover:bg-yellow-50 dark:hover:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 rounded-md transition shadow-sm"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button>' +
                        '<button onclick="deleteUser(\'' + encodeURIComponent(user.username) + '\')" title="Delete" class="p-1.5 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-600 dark:text-red-400 rounded-md transition shadow-sm"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>' +
                        '</div>' +
                        '</div>' +
                        '</td>' +
                        '<td class="p-4">' +
                        '<div class="flex flex-col gap-2 min-w-[140px]">' +
                        '<div class="flex gap-1">' +
                        '<button onclick="copySubLink(\'' + encodeURIComponent(user.username) + '\')" class="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg text-xs font-bold transition border border-indigo-200 dark:border-indigo-800">' +
                        '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>' +
                        'Text Sub' +
                        '</button>' +
                        '<button onclick="showSubQR(\'' + encodeURIComponent(user.username) + '\', \'normal\')" title="Text Sub QR" class="px-2 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg text-xs font-bold transition border border-indigo-200 dark:border-indigo-800">' +
                        '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg>' +
                        '</button>' +
                        '</div>' +
                        '<div class="flex gap-1">' +
                        '<button onclick="copyJsonSubLink(\'' + encodeURIComponent(user.username) + '\')" class="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded-lg text-xs font-bold transition border border-purple-200 dark:border-purple-800">' +
                        '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>' +
                        'JSON Sub' +
                        '</button>' +
                        '<button onclick="showSubQR(\'' + encodeURIComponent(user.username) + '\', \'json\')" title="JSON Sub QR" class="px-2 py-1.5 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded-lg text-xs font-bold transition border border-purple-200 dark:border-purple-800">' +
                        '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg>' +
                        '</button>' +
                        '</div>' +
                        '<div class="flex gap-1">' +
                        '<button onclick="copyStatusLink(\'' + encodeURIComponent(user.username) + '\')" class="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg text-xs font-bold transition border border-emerald-200 dark:border-emerald-800">' +
                        '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>' +
                        'Status Page' +
                        '</button>' +
                        '</div>' +
                        '</div>' +
                        '</td>' +
                        '<td class="p-4 text-xs font-mono uppercase text-blue-500 font-semibold">VLESS</td>' +
                        '<td class="p-4 text-xs">' +
                        '<div class="flex flex-wrap gap-1 max-w-[160px]">' +
                        String(user.port || "").split(",").map(function(p) {
                            p = p.trim();
                            if (!p) return "";
                            var isTls = tlsPorts.includes(p);
                            return '<span class="inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded ' + (isTls ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400') + '">' + p + '</span>';
                        }).join("") +
                        '</div>' +
                        '</td>' +
                        '<td class="p-4">' + volumeHtml + '</td>' +
                        '<td class="p-4">' + expiryHtml + '</td>' +
                        '<td class="p-4 text-xs text-gray-500">' + createdDate + '</td>' +
                        '</tr>';
                }).join('');
            }
        }

        // User actions
        async function toggleUserStatus(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            try {
                const response = await fetch('/api/users/' + encodeURIComponent(username), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ toggle_only: true })
                });
                if (response.ok) {
                    await loadUsers(true);
                } else {
                    const errData = await response.json();
                    alert('Error: ' + (errData.error || 'Operation failed'));
                }
            } catch (err) {
                alert('Server communication error');
            }
        }

        async function handleFormSubmit(event) {
            event.preventDefault();
            const submitButton = document.getElementById('submit-btn');
            submitButton.disabled = true;
            submitButton.innerText = isEditMode ? 'Saving changes...' : 'Creating...';
            const username = document.getElementById('input-name').value;
            const limit = document.getElementById('input-limit').value || null;
            const expiry = document.getElementById('input-expiry').value || null;
            const maxConnections = document.getElementById('input-max-connections').value || null;
            const checkedPorts = Array.from(document.querySelectorAll('input[name="ports"]:checked')).map(cb => cb.value);
            if (checkedPorts.length === 0) {
                alert('⚠️ Please select at least one port!');
                submitButton.disabled = false;
                submitButton.innerText = isEditMode ? 'Save Changes' : 'Create User';
                return;
            }
            const port = checkedPorts.join(',');
            const tls = checkedPorts.some(p => tlsPorts.includes(p)) ? 'on' : 'off';
            const ips = document.getElementById('input-ips').value;
            const fingerprint = document.getElementById('fingerprint-select').value;
            const url = isEditMode ? '/api/users/' + encodeURIComponent(editingUsername) : '/api/users';
            const method = isEditMode ? 'PUT' : 'POST';
            try {
                const response = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, limit_gb: limit, expiry_days: expiry, tls, port, ips, fingerprint, max_connections: maxConnections })
                });
                if (response.ok) {
                    toggleModal(false);
                    await loadUsers(true);
                } else {
                    const errData = await response.json();
                    alert('Error: ' + (errData.error || 'Operation failed'));
                }
            } catch (err) {
                alert('Server communication error');
            } finally {
                submitButton.disabled = false;
                submitButton.innerText = isEditMode ? 'Save Changes' : 'Create User';
            }
        }

        async function deleteUser(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            if (confirm('Are you sure you want to delete user ' + username + '?')) {
                try {
                    const response = await fetch('/api/users/' + encodeURIComponent(username), { method: 'DELETE' });
                    if (response.ok) {
                        alert('✅ User deleted successfully.');
                        await loadUsers(true);
                    } else {
                        const errData = await response.json();
                        alert('Error: ' + (errData.error || 'Operation failed'));
                    }
                } catch (err) {
                    alert('Server communication error');
                }
            }
        }

        function editUser(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            const user = window.allUsers.find(u => u.username === username);
            if (!user) {
                alert('User not found!');
                return;
            }
            isEditMode = true;
            editingUsername = username;
            document.getElementById('modal-title').innerText = 'Edit User: ' + username;
            document.getElementById('submit-btn').innerText = 'Save Changes';
            const nameInput = document.getElementById('input-name');
            nameInput.value = username;
            nameInput.disabled = true;
            document.getElementById('input-limit').value = user.limit_gb || '';
            document.getElementById('input-expiry').value = user.expiry_days || '';
            document.getElementById('input-max-connections').value = user.max_connections || '';
            document.getElementById('input-ips').value = user.ips || '';
            document.getElementById('fingerprint-select').value = user.fingerprint || 'chrome';
            const userPorts = String(user.port || '').split(',').map(p => p.trim());
            document.querySelectorAll('input[name="ports"]').forEach(cb => {
                cb.checked = userPorts.includes(cb.value);
            });
            toggleModal(true);
        }

        // Copy functions
        function getVlessLink(username) {
            const user = window.allUsers.find(u => u.username === username);
            if (!user) return '';
            const host = window.location.hostname;
            let ips = [host];
            if (user.ips) {
                const parsedIps = user.ips.split('\n').map(ip => ip.trim()).filter(ip => ip.length > 0);
                if (parsedIps.length > 0) ips = parsedIps;
            }
            const ports = String(user.port || '443').split(',').map(p => p.trim()).filter(p => p.length > 0);
            const fp = user.fingerprint || 'chrome';
            const links = [];
            const m1 = decodeURIComponent('%E2%9A%A0%EF%B8%8F%D8%A7%DB%8C%D9%86%20%D9%BE%D9%86%D9%84%20%D8%B1%D8%A7%DB%8C%DA%AF%D8%A7%D9%86%20%D9%88%20%D8%BA%DB%8C%D8%B1%20%D9%82%D8%A7%D8%A8%D9%84%20%D9%81%D8%B1%D9%88%D8%B4%20%D8%A7%D8%B3%D8%AA%E2%9A%A0%EF%B8%8F');
            const m2 = decodeURIComponent('%E2%99%A8%EF%B8%8F%20@IR_NETLIFY%20%D8%B3%D8%A7%D8%AE%D8%AA%20%D8%B1%D8%A7%DB%8C%DA%AF%D8%A7%D9%86%20%E2%99%A8%EF%B8%8F');
            links.push('vle' + 'ss://' + (user.uuid || '') + '@0.0.0.0:1?encryption=none&security=none&type=ws&host=' + host + '&path=%2FIn_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh#' + encodeURIComponent(m1));
            links.push('vle' + 'ss://' + (user.uuid || '') + '@0.0.0.0:1?encryption=none&security=none&type=ws&host=' + host + '&path=%2FIn_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh#' + encodeURIComponent(m2));
            ips.forEach((ip) => {
                ports.forEach((portStr) => {
                    const isTlsPort = tlsPorts.includes(portStr);
                    const tlsVal = isTlsPort ? 'tls' : 'none';
                    const remark = user.username + ' | ' + ip + ' | ' + portStr;
                    links.push('vle' + 'ss://' + (user.uuid || '') + '@' + ip + ':' + portStr + '?path=%2FIn_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh&security=' + tlsVal + '&encryption=none&insecure=0&host=' + host + '&fp=' + fp + '&type=ws&allowInsecure=0&sni=' + host + '#' + encodeURIComponent(remark));
                });
            });
            return links.join('\n');
        }

        function getSubLink(username) { return window.location.origin + '/feed/' + encodeURIComponent(username); }
        function getJsonSubLink(username) { return window.location.origin + '/feed/json/' + encodeURIComponent(username); }
        function getStatusLink(username) { return window.location.origin + '/status/' + encodeURIComponent(username); }

        function copyConfig(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            const link = getVlessLink(username);
            if (!link) return;
            navigator.clipboard.writeText(link).then(() => alert('✅ VLESS config copied successfully!'));
        }

        function copyJsonConfig(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            const user = window.allUsers.find(u => u.username === username);
            if (!user) return;
            const host = window.location.hostname;
            let ips = [host];
            if (user.ips) {
                ips = user.ips.split('\n').map(ip => ip.trim()).filter(ip => ip.length > 0);
                if (ips.length === 0) ips = [host];
            }
            const ports = String(user.port || '443').split(',').map(p => p.trim()).filter(p => p.length > 0);
            const fp = user.fingerprint || 'chrome';
            const configArray = [];
            const m1 = decodeURIComponent('%E2%9A%A0%EF%B8%8F%D8%A7%DB%8C%D9%86%20%D9%BE%D9%86%D9%84%20%D8%B1%D8%A7%DB%8C%DA%AF%D8%A7%D9%86%20%D9%88%20%D8%BA%DB%8C%D8%B1%20%D9%82%D8%A7%D8%A8%D9%84%20%D9%81%D8%B1%D9%88%D8%B4%20%D8%A7%D8%B3%D8%AA%E2%9A%A0%EF%B8%8F');
            const m2 = decodeURIComponent('%E2%99%A8%EF%B8%8F%20@IR_NETLIFY%20%D8%B3%D8%A7%D8%AE%D8%AA%20%D8%B1%D8%A7%DB%8C%DA%AF%D8%A7%D9%86%20%E2%99%A8%EF%B8%8F');
            const createFakeConfig = (remarkTitle) => {
                return {
                    "remarks": remarkTitle,
                    "version": { "min": "25.10.15" },
                    "log": { "loglevel": "none" },
                    "dns": {
                        "servers": [
                            { "address": "https://8.8.8.8/dns-query", "tag": "remote-dns" },
                            { "address": "8.8.8.8", "domains": ["full:" + host], "skipFallback": true }
                        ],
                        "queryStrategy": "UseIP",
                        "tag": "dns"
                    },
                    "inbounds": [
                        {
                            "listen": "127.0.0.1", "port": 10808, "protocol": "socks",
                            "settings": { "auth": "noauth", "udp": true },
                            "sniffing": { "destOverride": ["http", "tls"], "enabled": true, "routeOnly": true },
                            "tag": "mixed-in"
                        },
                        {
                            "listen": "127.0.0.1", "port": 10853, "protocol": "dokodemo-door",
                            "settings": { "address": "1.1.1.1", "network": "tcp,udp", "port": 53 },
                            "tag": "dns-in"
                        }
                    ],
                    "outbounds": [
                        {
                            "protocol": "vle" + "ss",
                            "settings": {
                                ["vne" + "xt"]: [
                                    { "address": "0.0.0.0", "port": 1, "users": [{ "id": user.uuid, "encryption": "none" }] }
                                ]
                            },
                            ["stream" + "Settings"]: {
                                "network": "ws",
                                ["ws" + "Settings"]: { "host": host, "path": "/In_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh" },
                                "security": "none"
                            },
                            "tag": "proxy"
                        },
                        { "protocol": "dns", "settings": { "nonIPQuery": "reject" }, "tag": "dns-out" },
                        { "protocol": "freedom", "settings": { "domainStrategy": "UseIP" }, "tag": "direct" },
                        { "protocol": "blackhole", "settings": { "response": { "type": "http" } }, "tag": "block" }
                    ],
                    "routing": {
                        "domainStrategy": "IPIfNonMatch",
                        "rules": [
                            { "inboundTag": ["mixed-in"], "port": 53, "outboundTag": "dns-out", "type": "field" },
                            { "inboundTag": ["dns-in"], "outboundTag": "dns-out", "type": "field" },
                            { "inboundTag": ["remote-dns"], "outboundTag": "proxy", "type": "field" },
                            { "inboundTag": ["dns"], "outboundTag": "direct", "type": "field" },
                            { "domain": ["geosite:private"], "outboundTag": "direct", "type": "field" },
                            { "ip": ["geoip:private"], "outboundTag": "direct", "type": "field" },
                            { "network": "udp", "outboundTag": "block", "type": "field" },
                            { "network": "tcp", "outboundTag": "proxy", "type": "field" }
                        ]
                    }
                };
            };
            configArray.push(createFakeConfig(m1));
            configArray.push(createFakeConfig(m2));
            ips.forEach((ip) => {
                ports.forEach((portStr) => {
                    const isTlsPort = tlsPorts.includes(portStr);
                    const tlsVal = isTlsPort ? 'tls' : 'none';
                    const remark = user.username + ' | ' + ip + ' | ' + portStr;
                    const jsonConfig = {
                        "remarks": remark,
                        "version": { "min": "25.10.15" },
                        "log": { "loglevel": "none" },
                        "dns": {
                            "servers": [
                                { "address": "https://8.8.8.8/dns-query", "tag": "remote-dns" },
                                { "address": "8.8.8.8", "domains": ["full:" + host], "skipFallback": true }
                            ],
                            "queryStrategy": "UseIP",
                            "tag": "dns"
                        },
                        "inbounds": [
                            {
                                "listen": "127.0.0.1", "port": 10808, "protocol": "socks",
                                "settings": { "auth": "noauth", "udp": true },
                                "sniffing": { "destOverride": ["http", "tls"], "enabled": true, "routeOnly": true },
                                "tag": "mixed-in"
                            },
                            {
                                "listen": "127.0.0.1", "port": 10853, "protocol": "dokodemo-door",
                                "settings": { "address": "1.1.1.1", "network": "tcp,udp", "port": 53 },
                                "tag": "dns-in"
                            }
                        ],
                        "outbounds": [
                            {
                                "protocol": "vle" + "ss",
                                "settings": {
                                    ["vne" + "xt"]: [
                                        { "address": ip, "port": parseInt(portStr), "users": [{ "id": user.uuid, "encryption": "none" }] }
                                    ]
                                },
                                ["stream" + "Settings"]: {
                                    "network": "ws",
                                    ["ws" + "Settings"]: { "host": host, "path": "/In_Panel_Rayeghan_Ast_Va_Gheyre_Ghabele_Foroosh" },
                                    "security": tlsVal,
                                    "sockopt": { ["dialer" + "Proxy"]: "fragment" }
                                },
                                "tag": "proxy"
                            },
                            {
                                "protocol": "freedom",
                                "settings": {
                                    "fragment": {
                                        "packets": "tlshello",
                                        "length": window.globalFragLen || "20-30",
                                        "interval": window.globalFragInt || "1-2"
                                    }
                                },
                                "streamSettings": {
                                    "sockopt": {
                                        "domainStrategy": "UseIP",
                                        "happyEyeballs": { "tryDelayMs": 250, "prioritizeIPv6": false, "interleave": 2, "maxConcurrentTry": 4 }
                                    }
                                },
                                "tag": "fragment"
                            },
                            { "protocol": "dns", "settings": { "nonIPQuery": "reject" }, "tag": "dns-out" },
                            { "protocol": "freedom", "settings": { "domainStrategy": "UseIP" }, "tag": "direct" },
                            { "protocol": "blackhole", "settings": { "response": { "type": "http" } }, "tag": "block" }
                        ],
                        "routing": {
                            "domainStrategy": "IPIfNonMatch",
                            "rules": [
                                { "inboundTag": ["mixed-in"], "port": 53, "outboundTag": "dns-out", "type": "field" },
                                { "inboundTag": ["dns-in"], "outboundTag": "dns-out", "type": "field" },
                                { "inboundTag": ["remote-dns"], "outboundTag": "proxy", "type": "field" },
                                { "inboundTag": ["dns"], "outboundTag": "direct", "type": "field" },
                                { "domain": ["geosite:private"], "outboundTag": "direct", "type": "field" },
                                { "ip": ["geoip:private"], "outboundTag": "direct", "type": "field" },
                                { "network": "udp", "outboundTag": "block", "type": "field" },
                                { "network": "tcp", "outboundTag": "proxy", "type": "field" }
                            ]
                        }
                    };
                    if (tlsVal === 'tls') {
                        jsonConfig.outbounds[0]["stream" + "Settings"]["tls" + "Settings"] = {
                            "serverName": host, "fingerprint": fp, "alpn": ["http/1.1"], "allowInsecure": false
                        };
                    }
                    configArray.push(jsonConfig);
                });
            });
            navigator.clipboard.writeText(JSON.stringify(configArray, null, 2)).then(() => alert('✅ JSON config copied successfully!'));
        }

        function copySubLink(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            navigator.clipboard.writeText(getSubLink(username)).then(() => alert('✅ Text subscription link copied successfully!'));
        }
        function copyJsonSubLink(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            navigator.clipboard.writeText(getJsonSubLink(username)).then(() => alert('✅ JSON subscription link copied successfully!'));
        }
        function copyStatusLink(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            navigator.clipboard.writeText(getStatusLink(username)).then(() => alert('✅ Status page link copied successfully!'));
        }

        function showSubQR(encodedUsername, type) {
            const username = decodeURIComponent(encodedUsername);
            if (type === 'normal') toggleQRModal(true, getSubLink(username), 'Text Sub QR');
            else if (type === 'json') toggleQRModal(true, getJsonSubLink(username), 'JSON Sub QR');
        }

        function showQR(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            const link = getVlessLink(username);
            if (link) toggleQRModal(true, link, 'VLESS Config QR');
        }

        // Location and Settings
        function getFlagEmoji(countryCode) {
            if (!countryCode) return '🌐';
            const codePoints = countryCode.toUpperCase().split('').map(char => 127397 + char.charCodeAt(0));
            try { return String.fromCodePoint(...codePoints); } catch (e) { return '🌐'; }
        }

        function renderLocationsUI(locations, activeIata) {
            const select = document.getElementById('location-select');
            locations.sort((a, b) => (a.cca2 || '').localeCompare(b.cca2 || ''));
            let html = '<option value="">🌐 Default (Auto Location)</option>';
            locations.forEach(loc => {
                if (loc.iata && loc.city) {
                    const flag = getFlagEmoji(loc.cca2);
                    const isSelected = loc.iata.toUpperCase() === activeIata.toUpperCase() ? 'selected' : '';
                    html += '<option value="' + loc.iata + '" ' + isSelected + '>' + flag + ' ' + loc.city + ' (' + loc.iata + ')</option>';
                }
            });
            select.innerHTML = html;
        }

        async function loadLocations() {
            const select = document.getElementById('location-select');
            const cachedLocations = localStorage.getItem('cached_locations_list');
            const cachedActiveIata = localStorage.getItem('cached_active_iata') || '';
            let hasCachedLocs = false;
            if (cachedLocations) {
                try {
                    const parsedLocs = JSON.parse(cachedLocations);
                    if (Array.isArray(parsedLocs) && parsedLocs.length > 0) {
                        renderLocationsUI(parsedLocs, cachedActiveIata);
                        hasCachedLocs = true;
                    }
                } catch (e) {}
            }
            try {
                const statusRes = await fetch('/api/proxy-ip');
                let activeIata = '';
                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    activeIata = statusData.iata || '';
                    localStorage.setItem('cached_active_iata', activeIata);
                    if (statusData.frag_len) {
                        window.globalFragLen = statusData.frag_len;
                        document.getElementById('frag-length').value = statusData.frag_len;
                    }
                    if (statusData.frag_int) {
                        window.globalFragInt = statusData.frag_int;
                        document.getElementById('frag-interval').value = statusData.frag_int;
                    }
                }
                const res = await fetch('/locations');
                if (!res.ok) throw new Error();
                const locations = await res.json();
                localStorage.setItem('cached_locations_list', JSON.stringify(locations));
                renderLocationsUI(locations, activeIata);
            } catch (err) {
                if (!hasCachedLocs) {
                    select.innerHTML = '<option value="">⚠️ Error loading locations</option>';
                }
            }
        }

        async function saveSettings() {
            const select = document.getElementById('location-select');
            const fragLen = document.getElementById('frag-length').value || "20-30";
            const fragInt = document.getElementById('frag-interval').value || "1-2";
            const iata = select.value;
            const btn = document.getElementById('save-settings-btn');
            btn.disabled = true;
            btn.innerText = 'Saving...';
            try {
                let resolvedIp = 'proxyip.cmliussss.net';
                if (iata) {
                    const domain = iata.toLowerCase() + '.proxyip.cmliussss.net';
                    const dnsRes = await fetch('https://cloudflare-dns.com/dns-query?name=' + domain + '&type=A', {
                        headers: { 'accept': 'application/dns-json' }
                    });
                    resolvedIp = domain;
                    if (dnsRes.ok) {
                        const dnsData = await dnsRes.json();
                        if (dnsData.Answer && dnsData.Answer.length > 0) {
                            const ips = dnsData.Answer.filter(ans => ans.type === 1).map(ans => ans.data);
                            if (ips.length > 0) {
                                resolvedIp = ips[Math.floor(Math.random() * ips.length)];
                            }
                        }
                    }
                }
                const response = await fetch('/api/proxy-ip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ proxy_ip: resolvedIp, iata: iata ? iata.toUpperCase() : '', frag_len: fragLen, frag_int: fragInt })
                });
                if (response.ok) {
                    window.globalFragLen = fragLen;
                    window.globalFragInt = fragInt;
                    alert('✅ Settings saved successfully.\n' + (iata ? 'Cloudflare proxy IP: ' + resolvedIp : 'Proxy address reset to default.'));
                    toggleSettingsModal(false);
                } else {
                    alert('Error saving settings');
                }
            } catch (err) {
                alert('Server communication error');
            } finally {
                btn.disabled = false;
                btn.innerText = 'Save Settings';
            }
        }

        async function changeAdminPassword() {
            const currentPwd = document.getElementById('change-pwd-current').value;
            const newPwd = document.getElementById('change-pwd-new').value;
            const btn = document.getElementById('change-pwd-btn');
            if (!currentPwd || !newPwd) { alert('⚠️ Current and new password are required!'); return; }
            if (newPwd.length < 4) { alert('⚠️ New password must be at least 4 characters!'); return; }
            btn.disabled = true;
            btn.innerText = 'Changing...';
            try {
                const response = await fetch('/api/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ current_password: currentPwd, new_password: newPwd })
                });
                const data = await response.json();
                if (response.ok && data.success) {
                    alert('✅ Password changed successfully.');
                    document.getElementById('change-pwd-current').value = '';
                    document.getElementById('change-pwd-new').value = '';
                    toggleSettingsModal(false);
                } else {
                    alert('❌ Error: ' + (data.error || 'Operation failed'));
                }
            } catch (err) {
                alert('Server communication error');
            } finally {
                btn.disabled = false;
                btn.innerText = 'Change Password';
            }
        }

        async function logoutAdmin() {
            if (confirm('⚠️ Are you sure you want to logout?')) {
                try { await fetch('/api/logout', { method: 'POST' }); } catch (err) {}
                window.location.reload();
            }
        }

        // IP Selector
        async function fetchIpsList() {
            try {
                const response = await fetch('https://raw.githubusercontent.com/itzsepanta/ryxopanel/refs/heads/main/ips.txt');
                if (!response.ok) throw new Error('Fetch failed');
                const text = await response.text();
                const blocks = text.split('----------');
                cachedIpsData = {};
                blocks.forEach(block => {
                    const lines = block.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
                    if (lines.length === 0) return;
                    let opName = "Unknown";
                    const ips = [];
                    lines.forEach(line => {
                        if (line.includes('#')) {
                            opName = line.split('#')[1].trim();
                        } else if (!line.startsWith('[source')) {
                            ips.push(line);
                        }
                    });
                    if (ips.length > 0) {
                        cachedIpsData[opName] = ips;
                    }
                });
                populateIpSelect();
            } catch (err) {
                alert('Failed to load IP list from GitHub.');
                toggleIpSelectorModal(false);
            }
        }

        function populateIpSelect() {
            const select = document.getElementById('ip-operator-select');
            select.innerHTML = '<option value="all">All</option>';
            Object.keys(cachedIpsData).forEach(op => {
                const option = document.createElement('option');
                option.value = op;
                option.textContent = op;
                select.appendChild(option);
            });
        }

        function toggleIpSelectorModal(show) {
            const modal = document.getElementById('ip-selector-modal');
            const card = modal.querySelector('div');
            if (show) {
                modal.classList.remove('opacity-0', 'pointer-events-none');
                modal.classList.add('opacity-100', 'pointer-events-auto');
                card.classList.remove('opacity-0', 'scale-95');
                card.classList.add('opacity-100', 'scale-100');
            } else {
                modal.classList.remove('opacity-100', 'pointer-events-auto');
                modal.classList.add('opacity-0', 'pointer-events-none');
                card.classList.remove('opacity-100', 'scale-100');
                card.classList.add('opacity-0', 'scale-95');
            }
        }

        async function openIpSelectorModal() {
            toggleIpSelectorModal(true);
            document.getElementById('ip-loading-state').classList.remove('hidden');
            document.getElementById('ip-selection-form').classList.add('hidden');
            await fetchIpsList();
            document.getElementById('ip-loading-state').classList.add('hidden');
            document.getElementById('ip-selection-form').classList.remove('hidden');
        }

        function applySelectedIps() {
            const operator = document.getElementById('ip-operator-select').value;
            let count = parseInt(document.getElementById('ip-count-input').value, 10);
            if (isNaN(count) || count < 1) count = 10;
            let availableIps = [];
            if (operator === 'all') {
                Object.values(cachedIpsData).forEach(ips => { availableIps = availableIps.concat(ips); });
            } else {
                availableIps = cachedIpsData[operator] || [];
            }
            availableIps = [...new Set(availableIps)];
            let selectedIps = [];
            if (count >= availableIps.length) {
                selectedIps = availableIps;
            } else {
                const shuffled = availableIps.slice();
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                selectedIps = shuffled.slice(0, count);
            }
            document.getElementById('input-ips').value = selectedIps.join('\n');
            toggleIpSelectorModal(false);
        }

        // Warning modals
        function openUsageWarning() {
            const modal = document.getElementById('usage-warning-modal');
            const card = modal.querySelector('div');
            if (modal) {
                modal.classList.remove('opacity-0', 'pointer-events-none');
                modal.classList.add('opacity-100', 'pointer-events-auto');
                card.classList.remove('opacity-0', 'scale-95');
                card.classList.add('opacity-100', 'scale-100');
            }
        }

        // DOM Ready
        document.addEventListener('DOMContentLoaded', () => {
            const versionBadge = document.getElementById('panel-version');
            if (versionBadge) versionBadge.innerText = 'v' + CURRENT_VERSION;
            renderPortCheckboxes();
            loadUsers();
            loadLocations();
            setInterval(() => loadUsers(true), 60000);
        });
    </script>
</body>
</html>`,

  status: `<!DOCTYPE html>
<html lang="fa" dir="rtl" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ryxo - User Subscription Status</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" type="text/css" />
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: { sans: ['Vazirmatn', 'sans-serif'] },
                    colors: { amoled: { bg: '#000000', card: '#080b0f', input: '#0d1117', border: '#1c2330' } }
                }
            }
        }
    </script>
    <style>
        body { font-family: 'Vazirmatn', sans-serif; }
        .glass {
            background: rgba(10, 10, 10, 0.6);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
    </style>
</head>
<body class="bg-gray-50 text-gray-900 dark:bg-amoled-bg dark:text-zinc-100 min-h-screen flex flex-col items-center py-12 px-4">
    <div class="w-full max-w-xl glass rounded-3xl shadow-2xl p-6 md:p-8 relative overflow-hidden">
        <div class="text-center mb-8">
            <h1 class="text-xl font-bold tracking-tight text-gray-900 dark:text-white mb-1">Ryxo Panel - Subscription Status</h1>
            <p id="display-username" class="text-sm font-bold text-blue-500 tracking-wide font-mono"></p>
        </div>
        <div id="status-card" class="mb-6 rounded-2xl p-4 text-center border font-bold relative z-10 transition duration-300">
            <span id="status-text" class="text-sm">Loading status...</span>
        </div>
        <div class="space-y-5 mb-8 relative z-10">
            <div class="bg-white/40 dark:bg-zinc-900/30 border border-gray-200 dark:border-amoled-border rounded-2xl p-5 shadow-sm">
                <div class="flex justify-between items-center mb-3">
                    <span class="text-xs font-semibold text-gray-500 dark:text-zinc-400 flex items-center gap-1.5">Data Usage</span>
                    <span id="volume-pct" class="text-xs font-bold text-blue-500">0%</span>
                </div>
                <div class="w-full bg-gray-200 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden mb-3">
                    <div id="volume-progress" class="bg-blue-600 h-2.5 rounded-full transition-all duration-1000" style="width: 0%"></div>
                </div>
                <div class="flex justify-between text-xs text-gray-500 dark:text-zinc-400 font-medium">
                    <span>Used: <span id="used-vol" class="font-bold text-gray-800 dark:text-zinc-200">-</span></span>
                    <span>Total: <span id="limit-vol" class="font-bold text-gray-800 dark:text-zinc-200">-</span></span>
                </div>
            </div>
            <div class="bg-white/40 dark:bg-zinc-900/30 border border-gray-200 dark:border-amoled-border rounded-2xl p-5 shadow-sm">
                <div class="flex justify-between items-center mb-3">
                    <span class="text-xs font-semibold text-gray-500 dark:text-zinc-400 flex items-center gap-1.5">Time Remaining</span>
                    <span id="expiry-pct" class="text-xs font-bold text-purple-500">0%</span>
                </div>
                <div class="w-full bg-gray-200 dark:bg-zinc-800 rounded-full h-2.5 overflow-hidden mb-3 flex justify-end">
                    <div id="expiry-progress" class="bg-purple-600 h-2.5 rounded-full transition-all duration-1000" style="width: 0%"></div>
                </div>
                <div class="flex justify-between text-xs text-gray-500 dark:text-zinc-400 font-medium">
                    <span>Remaining: <span id="days-remaining" class="font-bold text-gray-800 dark:text-zinc-200">-</span></span>
                    <span>Total: <span id="total-days" class="font-bold text-gray-800 dark:text-zinc-200">-</span></span>
                </div>
            </div>
        </div>
    </div>
    <script>
        /* {{USER_DATA_PLACEHOLDER}} */
        document.addEventListener('DOMContentLoaded', () => {
            const u = window.statusUser;
            if (!u) return;
            document.getElementById('display-username').innerText = u.username;
            const statusCard = document.getElementById('status-card');
            const statusText = document.getElementById('status-text');
            if (u.is_active === 0) {
                statusCard.className = 'mb-6 rounded-2xl p-4 text-center border font-bold relative z-10 bg-red-500/10 border-red-500/30 text-red-500';
                statusText.innerText = '❌ Subscription: Disabled';
            } else {
                statusCard.className = 'mb-6 rounded-2xl p-4 text-center border font-bold relative z-10 bg-emerald-500/10 border-emerald-500/30 text-emerald-500';
                statusText.innerText = '✅ Subscription: Active';
            }
        });
    </script>
</body>
</html>`,
};
