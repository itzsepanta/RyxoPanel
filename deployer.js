export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);

    // Health check
    if (request.method === "GET" && url.pathname === "/") {
      return new Response("Ryxo Deployer is running! 🚀", {
        headers: {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // ============================================================
    // DEPLOY NEW PANEL
    // ============================================================
    if (request.method === "POST" && url.pathname === "/api/deploy") {
      try {
        const { token } = await request.json();
        if (!token) {
          throw new Error("Token is required");
        }

        const headers = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        };

        // Get account info
        const accRes = await fetch(
          "https://api.cloudflare.com/client/v4/accounts",
          { headers },
        );
        const accData = await accRes.json();

        if (!accData.success || accData.result.length === 0) {
          throw new Error("Account not found. Please verify your token.");
        }

        const accountId = accData.result[0].id;

        // Get or create subdomain
        let devSub = null;
        const subRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
          { headers },
        );
        const subData = await subRes.json();

        if (subData.success && subData.result && subData.result.subdomain) {
          devSub = subData.result.subdomain;
        } else {
          const newSub = `ryxo-${Math.random().toString(36).substring(2, 8)}`;
          const createSub = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
            {
              method: "PUT",
              headers,
              body: JSON.stringify({ subdomain: newSub }),
            },
          );
          const createSubData = await createSub.json();

          if (!createSubData.success) {
            const errorMsg =
              createSubData.errors?.length > 0
                ? createSubData.errors[0].message
                : "Unknown error";
            throw new Error(`SUBDOMAIN_ERROR|${errorMsg}`);
          }
          devSub = newSub;
        }

        const uniqueSuffix = Math.random().toString(36).substring(2, 8);
        const workerName = `ryxo-panel-${uniqueSuffix}`;
        const dbName = `ryxo-db-${uniqueSuffix}`;

        // Create D1 database
        const dbRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ name: dbName }),
          },
        );
        const dbData = await dbRes.json();

        if (!dbData.success) {
          const errorMsg =
            dbData.errors?.length > 0
              ? dbData.errors[0].message
              : "Unknown error";
          throw new Error(`DATABASE_ERROR|${errorMsg}`);
        }
        const dbUuid = dbData.result.uuid;

        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Fetch panel source
        const githubRes = await fetch(
          "https://raw.githubusercontent.com/itzsepanta/ryxopanel/refs/heads/main/main.js?t=" +
            Date.now(),
        );
        if (!githubRes.ok)
          throw new Error("Failed to fetch panel source from GitHub.");
        const ryxoCode = await githubRes.text();

        const metadata = {
          main_module: "main.js",
          compatibility_date: "2024-02-08",
          bindings: [
            { type: "d1", name: "DB", id: dbUuid },
            { type: "secret_text", name: "CF_API_TOKEN", text: token },
            { type: "secret_text", name: "CF_ACCOUNT_ID", text: accountId },
          ],
        };

        const formData = new FormData();
        formData.append(
          "metadata",
          new Blob([JSON.stringify(metadata)], { type: "application/json" }),
        );
        formData.append(
          "main.js",
          new Blob([ryxoCode], { type: "application/javascript+module" }),
          "main.js",
        );

        // Deploy worker
        const deployRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`,
          {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          },
        );
        const deployData = await deployRes.json();

        if (!deployData.success) {
          const errorMsg =
            deployData.errors?.length > 0
              ? deployData.errors[0].message
              : "Unknown error";
          throw new Error(`DEPLOYMENT_ERROR|${errorMsg}`);
        }

        // Enable subdomain
        await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/subdomain`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ enabled: true }),
          },
        );

        const finalUrl = `https://${workerName}.${devSub}.workers.dev/panel`;

        return new Response(
          JSON.stringify({
            success: true,
            url: finalUrl,
            worker: workerName,
            database: dbName,
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            success: false,
            error: error.message,
            code: error.message.split("|")[0] || "UNKNOWN_ERROR",
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }
    }

    // ============================================================
    // LIST PANELS
    // ============================================================
    if (request.method === "POST" && url.pathname === "/api/list-panels") {
      try {
        const { token } = await request.json();
        if (!token) {
          throw new Error("Token is required");
        }

        const headers = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        };

        const accRes = await fetch(
          "https://api.cloudflare.com/client/v4/accounts",
          { headers },
        );
        const accData = await accRes.json();

        if (!accData.success || accData.result.length === 0) {
          throw new Error("Account not found.");
        }

        const accountId = accData.result[0].id;

        const scriptsRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`,
          { headers },
        );
        const scriptsData = await scriptsRes.json();

        if (!scriptsData.success) {
          throw new Error("Failed to fetch worker scripts.");
        }

        const panels = [];
        for (const script of scriptsData.result) {
          if (
            script.id.startsWith("ryxo-panel") ||
            script.id.startsWith("ez-")
          ) {
            panels.push({ name: script.id });
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            panels,
            latestVersion: "v1.3.9",
            total: panels.length,
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }
    }

    // ============================================================
    // UPDATE PANEL
    // ============================================================
    if (request.method === "POST" && url.pathname === "/api/do-update") {
      try {
        const { token, scriptName } = await request.json();
        if (!token || !scriptName) {
          throw new Error("Token and script name are required");
        }

        const headers = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        };

        const accRes = await fetch(
          "https://api.cloudflare.com/client/v4/accounts",
          { headers },
        );
        const accData = await accRes.json();

        if (!accData.success || accData.result.length === 0) {
          throw new Error("Account not found.");
        }

        const accountId = accData.result[0].id;

        // Fetch latest source
        const githubRes = await fetch(
          "https://raw.githubusercontent.com/itzsepanta/ryxopanel/refs/heads/main/main.js?t=" +
            Date.now(),
        );
        if (!githubRes.ok)
          throw new Error("Failed to fetch latest source from GitHub.");
        const newCode = await githubRes.text();

        // Get existing bindings
        const bindingsRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/bindings`,
          { headers },
        );
        const bindingsData = await bindingsRes.json();

        if (!bindingsData.success)
          throw new Error("Failed to fetch existing bindings.");

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
              text: token,
            });
          } else if (b.name === "CF_ACCOUNT_ID") {
            newBindings.push({
              type: "secret_text",
              name: "CF_ACCOUNT_ID",
              text: accountId,
            });
          }
        }

        const metadata = {
          main_module: "main.js",
          compatibility_date: "2024-02-08",
          bindings: newBindings,
        };

        const formData = new FormData();
        formData.append(
          "metadata",
          new Blob([JSON.stringify(metadata)], { type: "application/json" }),
        );
        formData.append(
          "main.js",
          new Blob([newCode], { type: "application/javascript+module" }),
          "main.js",
        );

        const deployRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`,
          {
            method: "PUT",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          },
        );

        const deployData = await deployRes.json();
        if (!deployData.success) {
          const errorMsg =
            deployData.errors?.length > 0
              ? deployData.errors[0].message
              : "Unknown error";
          throw new Error(`UPDATE_ERROR|${errorMsg}`);
        }

        return new Response(
          JSON.stringify({
            success: true,
            scriptName,
            message: "Panel updated successfully.",
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};
