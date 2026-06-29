export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(getHtmlContent(), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    if (request.method === "POST" && url.pathname === "/api/deploy") {
      try {
        const { token } = await request.json();
        if (!token) throw new Error("Token cannot be empty.");

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
          throw new Error("Account not found. Please verify your token.");
        }

        const accountId = accData.result[0].id;

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
            const cfError =
              createSubData.errors && createSubData.errors.length > 0
                ? createSubData.errors[0].message
                : "Unknown";
            throw new Error(`CF_TOS_ERROR|${cfError}`);
          }
          devSub = newSub;
        }

        const uniqueSuffix = Math.random().toString(36).substring(2, 8);
        const workerName = `ryxo-panel-${uniqueSuffix}`;
        const dbName = `ryxo-db-${uniqueSuffix}`;

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
          const cfError =
            dbData.errors && dbData.errors.length > 0
              ? dbData.errors[0].message
              : "Unknown";
          throw new Error(`CF_DB_ERROR|${cfError}`);
        }
        const dbUuid = dbData.result.uuid;

        await new Promise((resolve) => setTimeout(resolve, 1000));

        const githubRes = await fetch(
          "https://raw.githubusercontent.com/itzsepanta/ryxopanel/refs/heads/main/main.js?t=" +
            Date.now(),
        );
        if (!githubRes.ok)
          throw new Error("Failed to fetch source from GitHub.");
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
          const cfError =
            deployData.errors && deployData.errors.length > 0
              ? deployData.errors[0].message
              : "Unknown";
          throw new Error(`CF_DEPLOY_ERROR|${cfError}`);
        }

        const routeRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/subdomain`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({ enabled: true }),
          },
        );

        if (!routeRes.ok) throw new Error("Failed to activate final link.");

        const finalUrl = `https://${workerName}.${devSub}.workers.dev/panel`;

        return new Response(JSON.stringify({ success: true, url: finalUrl }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    if (request.method === "POST" && url.pathname === "/api/list-panels") {
      try {
        const { token } = await request.json();
        if (!token) throw new Error("Token cannot be empty");

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
          throw new Error("Account not found");
        }

        const accountId = accData.result[0].id;

        const scriptsRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`,
          { headers },
        );
        const scriptsData = await scriptsRes.json();

        if (!scriptsData.success) {
          throw new Error("Failed to fetch scripts");
        }

        let panels = [];
        for (let script of scriptsData.result) {
          if (
            script.id.startsWith("ryxo-panel") ||
            script.id.startsWith("ez-")
          ) {
            panels.push({ name: script.id });
          }
        }

        let latestVersion = "Unknown";
        try {
          const ghRes = await fetch(
            "https://raw.githubusercontent.com/itzsepanta/ryxopanel/main/main.js?t=" +
              Date.now(),
          );
          if (ghRes.ok) {
            const ghText = await ghRes.text();
            const match = ghText.match(
              /CURRENT_VERSION\s*=\s*['"]([0-9\.]+)['"]/i,
            );
            if (match && match[1]) latestVersion = "v" + match[1];
          }
        } catch (e) {}

        return new Response(
          JSON.stringify({ success: true, panels, latestVersion }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/get-panel-version"
    ) {
      try {
        const { token, scriptName } = await request.json();
        const headers = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        };

        const accRes = await fetch(
          "https://api.cloudflare.com/client/v4/accounts",
          { headers },
        );
        const accData = await accRes.json();
        const accountId = accData.result[0].id;

        const contentRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`,
          { headers },
        );
        const contentText = await contentRes.text();

        let version = "Unknown";
        const varMatch = contentText.match(
          /CURRENT_VERSION\s*=\s*['"]([0-9\.]+)['"]/i,
        );

        if (varMatch && varMatch[1]) {
          version = "v" + varMatch[1];
        } else {
          const spanMatch = contentText.match(
            /id=["']panel-version["'][^>]*>\s*v?([0-9\.]+)\s*<\/span>/i,
          );
          if (spanMatch && spanMatch[1]) {
            version = "v" + spanMatch[1];
          }
        }
        return new Response(JSON.stringify({ success: true, version }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, version: "Unknown" }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (request.method === "POST" && url.pathname === "/api/do-update") {
      try {
        const { token, scriptName } = await request.json();
        if (!token || !scriptName)
          throw new Error("Token or script name missing");

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
          throw new Error("Account not found");
        }

        const accountId = accData.result[0].id;

        const githubRes = await fetch(
          "https://raw.githubusercontent.com/itzsepanta/ryxopanel/refs/heads/main/main.js?t=" +
            Date.now(),
        );
        if (!githubRes.ok)
          throw new Error("Failed to fetch source from GitHub");
        const newCode = await githubRes.text();

        const bindingsRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/bindings`,
          { headers },
        );
        const bindingsData = await bindingsRes.json();

        if (!bindingsData.success) throw new Error("Failed to fetch bindings");

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
          const cfError =
            deployData.errors && deployData.errors.length > 0
              ? deployData.errors[0].message
              : "Unknown error";
          throw new Error(cfError);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};

function getHtmlContent() {
  return `<!DOCTYPE html>
<html lang="en" dir="ltr" class="dark">

<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ryxo Panel — Serverless VPN Management</title>

    <!-- ===== Tailwind + Vazirmatn ===== -->
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" />
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />

    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: { sans: ['Vazirmatn', 'sans-serif'] },
                    colors: {
                        amoled: { bg: '#000000', card: '#080b0f', input: '#0d1117', border: '#1c2330' },
                        brand: {
                            indigo: '#4f46e5',
                            violet: '#7c3aed',
                            cyan: '#06b6d4',
                            rose: '#f43f5e',
                            amber: '#f59e0b'
                        }
                    }
                }
            }
        }
    </script>

    <!-- ===== Custom CSS ===== -->
    <style>
        /* --- Reset & Base --- */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Vazirmatn', sans-serif;
            background: #000000;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 1.5rem;
            position: relative;
            overflow-x: hidden;
        }

        /* --- Animated Background --- */
        .bg-gradient-animated {
            position: fixed;
            inset: 0;
            z-index: 0;
            background:
                radial-gradient(ellipse at 20% 50%, rgba(79, 70, 229, 0.08) 0%, transparent 60%),
                radial-gradient(ellipse at 80% 50%, rgba(124, 58, 237, 0.08) 0%, transparent 60%),
                radial-gradient(ellipse at 50% 100%, rgba(6, 182, 212, 0.05) 0%, transparent 50%);
            animation: pulseGlow 8s ease-in-out infinite alternate;
        }

        @keyframes pulseGlow {
            0% { opacity: 0.6; }
            100% { opacity: 1; }
        }

        /* --- Glass Card --- */
        .glass-card {
            position: relative;
            z-index: 1;
            background: rgba(8, 11, 15, 0.85);
            backdrop-filter: blur(24px) saturate(1.3);
            -webkit-backdrop-filter: blur(24px) saturate(1.3);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 2rem;
            padding: 2.5rem 2rem;
            max-width: 440px;
            width: 100%;
            box-shadow:
                0 30px 80px -20px rgba(0, 0, 0, 0.9),
                inset 0 1px 0 rgba(255, 255, 255, 0.04);
            transition: box-shadow 0.4s ease;
        }

        .glass-card:hover {
            box-shadow:
                0 40px 100px -20px rgba(0, 0, 0, 0.95),
                inset 0 1px 0 rgba(255, 255, 255, 0.06);
        }

        /* --- Glow Orbs --- */
        .orb {
            position: absolute;
            border-radius: 50%;
            filter: blur(100px);
            pointer-events: none;
            opacity: 0.3;
            animation: orbFloat 12s ease-in-out infinite alternate;
        }

        .orb--blue {
            width: 300px;
            height: 300px;
            background: #4f46e5;
            top: -150px;
            right: -120px;
        }

        .orb--emerald {
            width: 250px;
            height: 250px;
            background: #10b981;
            bottom: -120px;
            left: -100px;
            animation-delay: 3s;
        }

        .orb--purple {
            width: 200px;
            height: 200px;
            background: #7c3aed;
            top: 40%;
            left: 50%;
            transform: translate(-50%, -50%);
            opacity: 0.12;
            animation-delay: 6s;
        }

        @keyframes orbFloat {
            0% { transform: translate(0, 0) scale(1); }
            100% { transform: translate(20px, -20px) scale(1.1); }
        }

        /* --- Logo Icon --- */
        .logo-icon {
            width: 72px;
            height: 72px;
            border-radius: 1.5rem;
            background: linear-gradient(135deg, rgba(79, 70, 229, 0.15), rgba(124, 58, 237, 0.15));
            border: 1px solid rgba(79, 70, 229, 0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1.25rem;
            box-shadow: 0 0 40px rgba(79, 70, 229, 0.08);
            transition: all 0.4s ease;
        }

        .logo-icon:hover {
            transform: scale(1.05);
            box-shadow: 0 0 60px rgba(79, 70, 229, 0.15);
        }

        .logo-icon i {
            font-size: 2rem;
            color: #818cf8;
        }

        /* --- Gradient Text --- */
        .gradient-text {
            background: linear-gradient(135deg, #818cf8, #a78bfa, #34d399);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        /* --- Input --- */
        .input-token {
            background: rgba(13, 17, 23, 0.8);
            border: 1px solid #1c2330;
            border-radius: 1rem;
            padding: 0.9rem 1rem 0.9rem 3.2rem;
            width: 100%;
            font-size: 0.9rem;
            font-family: 'Vazirmatn', monospace;
            color: #e5e7eb;
            outline: none;
            transition: all 0.3s ease;
            height: 3.75rem;
        }

        .input-token::placeholder {
            color: #4b5563;
            font-weight: 400;
        }

        .input-token:focus {
            border-color: #4f46e5;
            box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.1);
            background: rgba(13, 17, 23, 0.95);
        }

        .input-wrapper {
            position: relative;
        }

        .input-icon {
            position: absolute;
            right: 1rem;
            top: 50%;
            transform: translateY(-50%);
            color: #4b5563;
            font-size: 1rem;
            transition: color 0.3s ease;
            pointer-events: none;
        }

        .input-token:focus~.input-icon {
            color: #818cf8;
        }

        .toggle-eye {
            position: absolute;
            left: 1rem;
            top: 50%;
            transform: translateY(-50%);
            background: transparent;
            border: none;
            color: #4b5563;
            cursor: pointer;
            padding: 0.25rem;
            transition: color 0.3s ease;
            font-size: 1.1rem;
        }

        .toggle-eye:hover {
            color: #e5e7eb;
        }

        /* --- Buttons --- */
        .btn-primary {
            background: linear-gradient(145deg, #0b8a3a, #0a6b2e);
            border: 1px solid rgba(16, 185, 129, 0.2);
            color: white;
            font-weight: 900;
            font-size: 1rem;
            padding: 0.9rem 1.5rem;
            border-radius: 1rem;
            width: 100%;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
            box-shadow: 0 8px 30px rgba(11, 138, 58, 0.15);
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            background: linear-gradient(145deg, #0e9e45, #0b7a32);
            box-shadow: 0 12px 40px rgba(11, 138, 58, 0.25);
        }

        .btn-primary:disabled {
            opacity: 0.5;
            transform: none;
            cursor: not-allowed;
        }

        .btn-token {
            background: linear-gradient(145deg, #1a3d7a, #0f2b5c);
            border: 1px solid rgba(59, 130, 246, 0.15);
            color: white;
            font-weight: 900;
            font-size: 0.9rem;
            padding: 0.9rem 1.5rem;
            border-radius: 1rem;
            width: 100%;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
            box-shadow: 0 8px 30px rgba(26, 61, 122, 0.1);
            text-decoration: none;
        }

        .btn-token:hover {
            transform: translateY(-2px);
            background: linear-gradient(145deg, #1f4a94, #13346e);
            box-shadow: 0 12px 40px rgba(26, 61, 122, 0.2);
        }

        .btn-outline {
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.06);
            color: #9ca3af;
            padding: 0.6rem 1.2rem;
            border-radius: 3rem;
            font-size: 0.8rem;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            gap: 0.6rem;
            text-decoration: none;
        }

        .btn-outline:hover {
            border-color: rgba(79, 70, 229, 0.3);
            color: white;
            background: rgba(79, 70, 229, 0.06);
            transform: translateY(-1px);
        }

        .btn-outline i {
            font-size: 1.1rem;
            transition: transform 0.3s ease;
        }

        .btn-outline:hover i {
            transform: scale(1.15);
        }

        /* --- Status Bar --- */
        .status-bar {
            background: rgba(13, 17, 23, 0.6);
            border: 1px solid #1c2330;
            border-radius: 1rem;
            padding: 1rem 1.2rem;
            margin-top: 1.25rem;
            display: none;
            flex-direction: column;
            gap: 0.6rem;
        }

        .status-bar.visible {
            display: flex;
        }

        .progress-track {
            width: 100%;
            height: 4px;
            background: #1c2330;
            border-radius: 999px;
            overflow: hidden;
        }

        .progress-fill {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #10b981, #34d399);
            border-radius: 999px;
            transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* --- Error Box --- */
        .error-box {
            background: rgba(127, 29, 29, 0.12);
            border: 1px solid rgba(239, 68, 68, 0.12);
            border-radius: 1rem;
            padding: 1rem 1.2rem;
            margin-top: 1.25rem;
            display: none;
            font-size: 0.85rem;
            color: #fca5a5;
            text-align: center;
            line-height: 1.6;
        }

        .error-box.visible {
            display: block;
        }

        /* --- Footer Links --- */
        .footer-links {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
            margin-top: 2rem;
            position: relative;
            z-index: 1;
        }

        /* --- Responsive --- */
        @media (max-width: 480px) {
            .glass-card {
                padding: 1.75rem 1.25rem;
                border-radius: 1.5rem;
            }
            .btn-primary, .btn-token {
                font-size: 0.9rem;
                padding: 0.75rem 1rem;
            }
            .input-token {
                height: 3.25rem;
                font-size: 0.8rem;
            }
            .logo-icon {
                width: 60px;
                height: 60px;
            }
            .logo-icon i {
                font-size: 1.6rem;
            }
        }

        /* --- Utility --- */
        .text-soft {
            color: #6b7280;
        }
        .text-soft-light {
            color: #9ca3af;
        }
        .border-soft {
            border-color: rgba(255, 255, 255, 0.04);
        }
        .gap-2-5 {
            gap: 0.625rem;
        }
    </style>
</head>

<body>

    <!-- ===== BACKGROUND ===== -->
    <div class="bg-gradient-animated"></div>

    <!-- ============================================================ -->
    <!-- MAIN CARD                                                    -->
    <!-- ============================================================ -->
    <div class="glass-card">

        <!-- Orbs -->
        <div class="orb orb--blue"></div>
        <div class="orb orb--emerald"></div>
        <div class="orb orb--purple"></div>

        <!-- Logo -->
        <div class="logo-icon">
            <i class="fas fa-bolt"></i>
        </div>

        <!-- Title -->
        <div class="text-center mb-7">
            <h1 class="text-3xl font-black tracking-tight">
                <span class="gradient-text">Ryxo</span>
                <span class="text-white/90">Panel</span>
            </h1>
            <p class="text-sm text-soft mt-1">Serverless · Zero Cost · 15s Deploy</p>
            <div class="flex items-center justify-center gap-2 mt-3">
                <span
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 text-[11px] font-bold">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Ready
                </span>
                <span
                    class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/15 text-blue-400 text-[11px] font-bold">
                    <i class="fas fa-code text-[10px]"></i>
                    v26.1.0
                </span>
            </div>
        </div>

        <!-- ===== FORM ===== -->
        <div class="space-y-4">

            <!-- Get Token -->
            <a href="https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_subdomain%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_analytics%22%2C%22type%22%3A%22read%22%7D%5D&accountId=*&zoneId=all&name=Ryxo-Deployer-Token"
                target="_blank" class="btn-token">
                <i class="fas fa-key"></i>
                Get Cloudflare Token
            </a>

            <p class="text-[11px] text-soft text-center leading-relaxed">
                <i class="fas fa-info-circle text-blue-400"></i>
                After login → scroll to bottom → click
                <span class="text-blue-400 font-bold">Continue to summary</span>
            </p>

            <!-- Token Input -->
            <div class="input-wrapper">
                <input type="password" id="apiToken" placeholder="Paste your token here…" autocomplete="off"
                    spellcheck="false" class="input-token" dir="ltr" />
                <span class="input-icon"><i class="fas fa-lock"></i></span>
                <button type="button" onclick="toggleToken()" class="toggle-eye" aria-label="Toggle token visibility">
                    <i id="eyeIcon" class="fas fa-eye"></i>
                </button>
            </div>

            <!-- Deploy -->
            <button id="deployBtn" onclick="startDeploy()" class="btn-primary">
                <i class="fas fa-rocket"></i>
                Deploy Panel
            </button>

            <!-- Status -->
            <div id="status-container" class="status-bar">
                <div class="flex items-center justify-between text-xs">
                    <span id="status-text" class="text-soft-light font-bold">
                        <i class="fas fa-spinner fa-spin"></i>
                        Initializing…
                    </span>
                    <span id="status-pct" class="text-emerald-400 font-black">0%</span>
                </div>
                <div class="progress-track">
                    <div id="progressBar" class="progress-fill" style="width:0%"></div>
                </div>
            </div>

            <!-- Error -->
            <div id="error-box" class="error-box"></div>

            <!-- Success (injected) -->
            <div id="success-area"></div>
        </div>
    </div>

    <!-- ============================================================ -->
    <!-- FOOTER                                                       -->
    <!-- ============================================================ -->
    <div class="footer-links">
        <a href="https://github.com/itzsepanta/RyxoPanel" target="_blank" class="btn-outline">
            <i class="fab fa-github"></i>
            Source Code
        </a>
        <a href="https://t.me/RyxoStudio" target="_blank" class="btn-outline">
            <i class="fab fa-telegram-plane" style="color: #38bdf8;"></i>
            @RyxoStudio
        </a>
    </div>

    <!-- ============================================================ -->
    <!-- SCRIPT                                                       -->
    <!-- ============================================================ -->
    <script>
        // ------------------------------------------------------------
        // HELPERS
        // ------------------------------------------------------------
        function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

        function $(id) { return document.getElementById(id); }

        function showStatus(text, pct) {
            const container = $('status-container');
            container.classList.add('visible');
            $('status-text').innerHTML = text;
            $('status-pct').innerText = pct + '%';
            $('progressBar').style.width = pct + '%';
        }

        function hideStatus() {
            $('status-container').classList.remove('visible');
        }

        function showError(msg) {
            const box = $('error-box');
            box.innerHTML = msg;
            box.classList.add('visible');
        }

        function hideError() {
            $('error-box').classList.remove('visible');
        }

        function clearSuccess() {
            $('success-area').innerHTML = '';
        }

        function showSuccess(url) {
            $('success-area').innerHTML = \`
                <div class="mt-5 text-center">
                    <div class="text-emerald-400 font-bold text-sm mb-3">
                        <i class="fas fa-check-circle"></i> Panel deployed successfully
                    </div>
                    <a href="\${url}" target="_blank"
                       class="btn-primary" style="background:linear-gradient(145deg,#2563eb,#1d4ed8); box-shadow:0 8px 30px rgba(37,99,235,0.2);">
                        <i class="fas fa-sign-in-alt"></i> Enter Panel
                    </a>
                </div>
            \`;
        }

        // ------------------------------------------------------------
        // TOGGLE TOKEN
        // ------------------------------------------------------------
        function toggleToken() {
            const input = $('apiToken');
            const eye = $('eyeIcon');
            if (input.type === 'password') {
                input.type = 'text';
                eye.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                eye.className = 'fas fa-eye';
            }
        }

        // ------------------------------------------------------------
        // DEPLOY
        // ------------------------------------------------------------
        async function startDeploy() {
            const token = $('apiToken').value.trim();
            const btn = $('deployBtn');

            hideError();
            clearSuccess();

            if (!token) {
                showError('<i class="fas fa-exclamation-triangle"></i> Please enter your Cloudflare token first.');
                return;
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deploying…';
            showStatus('<i class="fas fa-spinner fa-spin"></i> Validating token…', 15);
            await sleep(500);

            showStatus('<i class="fas fa-cloud"></i> Connecting to Cloudflare…', 30);
            await sleep(500);

            showStatus('<i class="fas fa-database"></i> Creating D1 database…', 50);

            try {
                const res = await fetch('/api/deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });

                showStatus('<i class="fas fa-code"></i> Fetching Ryxo panel…', 75);
                await sleep(600);

                showStatus('<i class="fas fa-link"></i> Activating link…', 90);
                await sleep(500);

                const data = await res.json();

                if (data.success) {
                    showStatus('<i class="fas fa-check-circle"></i> Complete!', 100);
                    await sleep(400);
                    hideStatus();
                    showSuccess(data.url);
                } else {
                    throw new Error(data.error || 'Deployment failed');
                }
            } catch (e) {
                hideStatus();
                const msg = e.message;
                const raw = msg.includes('|') ? msg.split('|')[1] : msg;

                if (msg.includes('databases per account') || msg.includes('limit reached')) {
                    showError(
                        '<i class="fas fa-database"></i> D1 database limit reached.<br><span style="font-size:11px;opacity:0.7">' + raw +
                        '</span><br><a href="https://dash.cloudflare.com/?to=/:account/workers/d1" target="_blank" class="inline-block mt-3 bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold"><i class="fas fa-external-link-alt"></i> Manage Databases</a>'
                    );
                } else if (msg.includes('script limit') || msg.includes('scripts per account')) {
                    showError(
                        '<i class="fas fa-code"></i> Worker script limit reached.<br><span style="font-size:11px;opacity:0.7">' + raw +
                        '</span><br><a href="https://dash.cloudflare.com/?to=/:account/workers/services" target="_blank" class="inline-block mt-3 bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold"><i class="fas fa-external-link-alt"></i> Manage Workers</a>'
                    );
                } else if (msg.includes('Account not found') || msg.includes('Authentication') || msg.includes('Invalid')) {
                    showError(
                        '<i class="fas fa-key"></i> Invalid token or insufficient permissions.<br><span style="font-size:11px;opacity:0.7">' + raw +
                        '</span><br><a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" class="inline-block mt-3 bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold"><i class="fas fa-external-link-alt"></i> Manage Tokens</a>'
                    );
                } else if (msg.includes('CF_TOS_ERROR') || msg.includes('CF_DB_ERROR') || msg.includes('CF_DEPLOY_ERROR')) {
                    if (msg.includes('email') || msg.includes('verify')) {
                        showError(
                            '<i class="fas fa-envelope"></i> Please verify your email on Cloudflare first.<br><span style="font-size:11px;opacity:0.7">' + raw +
                            '</span><br><a href="https://dash.cloudflare.com/profile" target="_blank" class="inline-block mt-3 bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold"><i class="fas fa-external-link-alt"></i> Verify Email</a>'
                        );
                    } else {
                        showError(
                            '<i class="fas fa-file-contract"></i> Please accept Cloudflare Terms of Service.<br><span style="font-size:11px;opacity:0.7">' + raw +
                            '</span><br><a href="https://dash.cloudflare.com/?to=/:account/workers/overview" target="_blank" class="inline-block mt-3 bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold"><i class="fas fa-external-link-alt"></i> Go to Cloudflare</a>'
                        );
                    }
                } else {
                    showError('<i class="fas fa-times-circle"></i> ' + msg);
                }
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-rocket"></i> Deploy Panel';
            }
        }
    </script>

</body>
</html>`;
}
