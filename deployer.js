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
          throw new Error("Account not found. Please check your token.");
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
          "https://raw.githubusercontent.com/itzsepanta/RyxoPanel/refs/heads/main/ryxo.js?t=" +
            Date.now(),
        );
        if (!githubRes.ok)
          throw new Error("Failed to fetch source from GitHub.");
        const rydoCode = await githubRes.text();

        const metadata = {
          main_module: "ryxo.js",
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
          "ryxo.js",
          new Blob([rydoCode], { type: "application/javascript+module" }),
          "ryxo.js",
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
            script.id.startsWith("rx-")
          ) {
            panels.push({ name: script.id });
          }
        }

        let latestVersion = "Unknown";
        try {
          const ghRes = await fetch(
            "https://raw.githubusercontent.com/itzsepanta/RyxoPanel/main/ryxo.js?t=" +
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
          "https://raw.githubusercontent.com/itzsepanta/RyxoPanel/refs/heads/main/ryxo.js?t=" +
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
  return `
<!DOCTYPE html>
<html lang="en" dir="ltr" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ryxo Deployer | v26.2.1</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:opsz@14..32&display=swap" rel="stylesheet">
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: { sans: ['Inter', 'sans-serif'] },
                    colors: { amoled: { bg: '#000000', card: '#080b0f', input: '#0d1117', border: '#1c2330' } }
                }
            }
        }
    </script>
    <style>
        body { font-family: 'Inter', sans-serif; }
        .token-input::-ms-reveal, .token-input::-ms-clear { display: none; }
        
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }
        .dark ::-webkit-scrollbar-thumb { background: #3f3f46; }
        ::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
        .dark ::-webkit-scrollbar-thumb:hover { background: #52525b; }
        * { scrollbar-width: thin; scrollbar-color: #d1d5db transparent; }
        .dark * { scrollbar-color: #3f3f46 transparent; }
        
        .glass-card {
            background: rgba(8, 11, 15, 0.7);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .btn-primary {
            background: linear-gradient(135deg, #0ea5e9, #3b82f6);
            transition: all 0.3s ease;
        }
        .btn-primary:hover {
            transform: scale(1.02);
            box-shadow: 0 0 25px rgba(59, 130, 246, 0.4);
        }
        .btn-secondary {
            background: linear-gradient(135deg, #8b5cf6, #6d28d9);
            transition: all 0.3s ease;
        }
        .btn-secondary:hover {
            transform: scale(1.02);
            box-shadow: 0 0 25px rgba(139, 92, 246, 0.4);
        }
        .glow-text {
            text-shadow: 0 0 20px rgba(59, 130, 246, 0.3);
        }
    </style>
</head>
<body class="bg-gray-50 text-gray-900 dark:bg-amoled-bg dark:text-zinc-100 min-h-screen flex flex-col items-center justify-center p-4">
    
    <div id="mainCard" class="w-full max-w-md glass-card rounded-3xl shadow-2xl p-8 relative overflow-hidden z-10 border border-amoled-border">
        
        <div class="absolute -left-12 -top-12 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div class="absolute -right-12 -bottom-12 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div class="text-center mb-6 relative z-10">
            <div class="inline-flex items-center justify-center p-3 bg-blue-950/60 border border-blue-500 text-blue-400 rounded-2xl mb-4 shadow-[0_0_15px_rgba(59,130,246,0.4)]">
                <svg class="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </div>
            <h2 class="text-2xl font-black text-gray-900 dark:text-white mb-1 glow-text">Ryxo Deployer</h2>
            <p class="text-sm font-medium text-gray-500 dark:text-zinc-400">Deploy Ryxo Panel on Cloudflare Workers</p>
            <div class="mt-2 inline-block px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-full text-xs font-bold text-blue-400">
                v26.2.1
            </div>
        </div>

        <div class="space-y-5 relative z-10">
            <a href="https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_subdomain%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_analytics%22%2C%22type%22%3A%22read%22%7D%5D&accountId=*&zoneId=all&name=Ryxo-Deployer-Token" target="_blank" class="flex items-center justify-center w-full py-3.5 bg-[#d94800] hover:bg-[#e35802] text-white font-bold rounded-xl text-sm transition duration-300 shadow-lg shadow-orange-500/20 border border-[#ff943d]">
                Get Cloudflare Token
            </a>
            <div class="mt-2 text-center mb-4">
                <p class="text-[11px] text-gray-500 dark:text-zinc-400 font-medium">
                    Click 
                    <span class="font-bold text-orange-500">Get Token</span>, 
                    then at the bottom of the page click 
                    <span class="font-bold text-blue-500">Continue to summary</span> 
                    and create your token.
                </p>
            </div>   
            <div class="relative">
                <input type="password" id="apiToken" placeholder="Enter your token..." autocomplete="off" spellcheck="false" class="w-full pl-12 pr-4 py-3.5 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono text-left text-gray-900 dark:text-zinc-100 transition token-input" dir="ltr">
                <button type="button" onclick="toggleToken()" class="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 transition">
                    <svg id="eyeIcon" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                </button>
            </div>

            <button id="deployBtn" onclick="startDeploy()" class="w-full py-3.5 btn-primary text-white font-black rounded-xl text-lg transition duration-300 shadow-lg shadow-blue-900/40 border border-blue-500/50">
                Deploy Panel
            </button>
            <button type="button" id="openUpdateModalBtn" onclick="toggleUpdateModal(true)" class="w-full py-3.5 btn-secondary text-white font-black rounded-xl text-lg transition duration-300 shadow-lg shadow-purple-900/40 border border-purple-500/50 mt-3">
                Update Panel
            </button>
            <div id="status-container" class="hidden mt-4 bg-gray-50 dark:bg-zinc-900/50 rounded-xl p-4 border border-gray-200 dark:border-zinc-800/80">
                <div class="flex justify-between items-center mb-2.5">
                    <span id="status-text" class="text-xs font-bold text-gray-600 dark:text-zinc-300">Starting process...</span>
                    <span id="status-pct" class="text-xs font-black text-emerald-600 dark:text-emerald-500">0%</span>
                </div>
                <div class="w-full bg-gray-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div id="progressBar" class="bg-emerald-500 h-1.5 rounded-full transition-all duration-300" style="width: 0%"></div>
                </div>
            </div>

            <div id="error-box" class="hidden mt-4 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-xl text-sm text-red-600 dark:text-red-400 text-center font-medium"></div>
        </div>
    </div>

    <div class="flex items-center gap-4 mt-6 z-10">
        <a href="https://github.com/itzsepanta/RyxoPanel" target="_blank" class="flex items-center gap-2 px-4 py-2 bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-full shadow-sm hover:shadow-md transition text-sm font-bold text-gray-700 dark:text-zinc-300 hover:text-black dark:hover:text-white group">
            <svg class="w-5 h-5 group-hover:scale-110 transition" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"/></svg>
            Source Code
        </a>
        <a href="https://t.me/itzsepanta" target="_blank" class="flex items-center gap-2 px-4 py-2 bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-full shadow-sm hover:shadow-md transition text-sm font-bold text-gray-700 dark:text-zinc-300 hover:text-sky-500 dark:hover:text-sky-400 group">
            <svg class="w-5 h-5 text-sky-500 group-hover:scale-110 transition" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.94-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.37.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .24z"/></svg>
            @itzsepanta
        </a>
    </div>

    <script>
        function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
        
        function toggleToken() {
            const tokenInput = document.getElementById('apiToken');
            const eyeIcon = document.getElementById('eyeIcon');
            
            if (tokenInput.type === 'password') {
                tokenInput.type = 'text';
                eyeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>';
            } else {
                tokenInput.type = 'password';
                eyeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>';
            }
        }

        function toggleUpdateModal(show) {
            const modal = document.getElementById('update-modal');
            const card = document.getElementById('update-modal-card');
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

        async function checkExistingPanels() {
            const token = document.getElementById('updateApiToken').value.trim();
            const btn = document.getElementById('checkPanelsBtn');
            const listContainer = document.getElementById('panels-list-container');
            const statusBox = document.getElementById('update-status');

            if (!token) {
                statusBox.classList.remove('hidden');
                statusBox.className = 'mt-4 text-center text-sm font-bold p-3 rounded-xl bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400';
                statusBox.innerText = 'Please enter your token first.';
                return;
            }

            btn.disabled = true;
            btn.innerText = 'Checking...';
            statusBox.classList.add('hidden');
            listContainer.classList.add('hidden');
            listContainer.innerHTML = '';

            try {
                const response = await fetch('/api/list-panels', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    const latestVersion = result.latestVersion || "Unknown";
                    
                    if (result.panels.length === 0) {
                        statusBox.classList.remove('hidden');
                        statusBox.className = 'mt-4 text-center text-sm font-bold p-3 rounded-xl bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400';
                        statusBox.innerText = 'No Ryxo panels found in this account.';
                    } else {
                        result.panels.forEach(panel => {
                            const panelDiv = document.createElement('div');
                            panelDiv.className = 'flex items-center justify-between p-3 bg-gray-50 dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700 rounded-xl';
                            panelDiv.id = 'panel-item-' + panel.name;
                            
                            panelDiv.innerHTML = '<div class="flex flex-col">' +
                                '<span class="font-bold text-gray-900 dark:text-zinc-100">' + panel.name + '</span>' +
                                '<span id="version-text-' + panel.name + '" class="text-[11px] text-blue-500 font-medium mt-1 animate-pulse" dir="ltr">Checking version...</span>' +
                            '</div>' + 
                            '<div id="btn-container-' + panel.name + '">' +
                                '<div class="w-16 h-6 bg-gray-200 dark:bg-zinc-700 rounded-lg animate-pulse"></div>' +
                            '</div>';
                            
                            listContainer.appendChild(panelDiv);
                            
                            fetchPanelVersion(token, panel.name, latestVersion);
                        });
                        listContainer.classList.remove('hidden');
                    }
                } else {
                    throw new Error(result.error);
                }
            } catch (e) {
                statusBox.classList.remove('hidden');
                statusBox.className = 'mt-4 text-center text-sm font-bold p-3 rounded-xl bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400';
                statusBox.innerText = e.message;
            } finally {
                btn.disabled = false;
                btn.innerText = 'Check Existing Panels';
            }
        }

        async function fetchPanelVersion(token, scriptName, latestVersion) {
            try {
                const response = await fetch('/api/get-panel-version', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, scriptName })
                });
                
                const result = await response.json();
                const version = result.success ? result.version : "Unknown";
                
                const isLatest = (version === latestVersion && latestVersion !== "Unknown");
                const displayVersion = version === "Unknown" ? "Old / Unknown" : version;
                
                const versionText = document.getElementById('version-text-' + scriptName);
                const btnContainer = document.getElementById('btn-container-' + scriptName);
                
                if (versionText && btnContainer) {
                    versionText.className = 'text-[11px] text-gray-500 dark:text-zinc-400 font-medium mt-1';
                    versionText.innerText = displayVersion;
                    
                    if (isLatest) {
                        btnContainer.innerHTML = '<button disabled class="px-3 py-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-bold rounded-lg text-xs cursor-not-allowed">Up to date</button>';
                    } else {
                        btnContainer.innerHTML = '<button data-name="' + scriptName + '" onclick="updateRyxoPanel(this.dataset.name)" class="px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-400 font-bold rounded-lg text-xs transition">Update</button>';
                    }
                }
            } catch (e) {
                const versionText = document.getElementById('version-text-' + scriptName);
                if (versionText) {
                    versionText.className = 'text-[11px] text-red-500 font-medium mt-1';
                    versionText.innerText = 'Error fetching version';
                }
            }
        }

        async function updateRyxoPanel(scriptName) {
            const token = document.getElementById('updateApiToken').value.trim();
            const statusBox = document.getElementById('update-status');
            
            if (!confirm('Are you sure you want to update panel: ' + scriptName + '?')) return;

            statusBox.classList.remove('hidden');
            statusBox.className = 'mt-4 text-center text-sm font-bold p-3 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400';
            statusBox.innerText = 'Updating ' + scriptName + '...';

            try {
                const response = await fetch('/api/do-update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, scriptName })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    statusBox.className = 'mt-4 text-center text-sm font-bold p-3 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400';
                    statusBox.innerText = '✅ Panel ' + scriptName + ' updated successfully!';
                    setTimeout(() => checkExistingPanels(), 2000);
                } else {
                    throw new Error(result.error);
                }
            } catch (e) {
                statusBox.className = 'mt-4 text-center text-sm font-bold p-3 rounded-xl bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400';
                statusBox.innerText = 'Error: ' + e.message;
            }
        }

        async function startDeploy() {
            const token = document.getElementById('apiToken').value.trim();
            const btn = document.getElementById('deployBtn');
            const statusContainer = document.getElementById('status-container');
            const statusText = document.getElementById('status-text');
            const statusPct = document.getElementById('status-pct');
            const progressBar = document.getElementById('progressBar');
            const errorBox = document.getElementById('error-box');
            
            const oldText = document.getElementById('successTxt');
            if (oldText) oldText.remove();

            const oldSuccessLink = document.getElementById('successBtn');
            if (oldSuccessLink) oldSuccessLink.remove();
            
            if(!token) {
                errorBox.classList.remove('hidden');
                errorBox.innerText = 'Please enter your token first.';
                return;
            }
            
            errorBox.classList.add('hidden');
            btn.disabled = true;
            document.getElementById('apiToken').disabled = true;
            btn.innerText = 'Processing...';
            statusContainer.classList.remove('hidden');

            statusText.innerText = 'Verifying token...';
            statusPct.innerText = '15%';
            progressBar.style.width = '15%';
            await sleep(500);

            statusText.innerText = 'Connecting to Cloudflare...';
            statusPct.innerText = '30%';
            progressBar.style.width = '30%';
            await sleep(500);

            statusText.innerText = 'Creating D1 database...';
            statusPct.innerText = '50%';
            progressBar.style.width = '50%';

            try {
                const response = await fetch('/api/deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token })
                });
                
                statusText.innerText = 'Fetching Ryxo panel...';
                statusPct.innerText = '75%';
                progressBar.style.width = '75%';
                await sleep(600);

                statusText.innerText = 'Activating link...';
                statusPct.innerText = '90%';
                progressBar.style.width = '90%';
                await sleep(500);
                
                const result = await response.json();
                
                if (result.success) {
                    progressBar.style.width = '100%';
                    statusPct.innerText = '100%';
                    statusText.innerText = 'Completed!';
                    await sleep(400);

                    statusContainer.classList.add('hidden');

                    const successText = document.createElement('div');
                    successText.id = 'successTxt';
                    successText.className = 'text-center mt-6 font-bold text-sm text-emerald-600 dark:text-emerald-400';
                    successText.innerText = '✅ Panel deployed successfully!';
                    document.getElementById('mainCard').appendChild(successText);

                    const successLink = document.createElement('a');
                    successLink.href = result.url;
                    successLink.target = '_blank';
                    successLink.className = 'block w-full py-3.5 mt-3 btn-primary text-white text-center font-bold rounded-xl transition duration-300 shadow-lg shadow-blue-500/25';
                    successLink.id = 'successBtn';
                    successLink.innerText = 'Open Panel';
                    
                    document.getElementById('mainCard').appendChild(successLink);
                } else {
                    throw new Error(result.error);
                }
            } catch(e) {
                statusContainer.classList.add('hidden');
                errorBox.classList.remove('hidden');

                btn.disabled = false;
                document.getElementById('apiToken').disabled = false;
                btn.innerText = 'Deploy Panel';

                const errorMsg = e.message;
                const rawError = errorMsg.includes('|') ? errorMsg.split('|')[1] : errorMsg;
                
                if (errorMsg.includes("databases per account") || errorMsg.includes("limit reached")) {
                    errorBox.innerHTML = '<div class="mb-2 font-bold">You have reached the D1 database limit.</div>' +
                        '<div class="text-[11px] opacity-70 mb-3" dir="ltr">' + rawError + '</div>' +
                        '<a href="https://dash.cloudflare.com/?to=/:account/workers/d1" target="_blank" class="inline-block bg-red-500 text-white px-4 py-2 rounded-lg font-bold text-xs">Manage Databases</a>';
                }
                else if (errorMsg.includes("script limit") || errorMsg.includes("scripts per account")) {
                    errorBox.innerHTML = '<div class="mb-2 font-bold">You have reached the Workers script limit.</div>' +
                        '<div class="text-[11px] opacity-70 mb-3" dir="ltr">' + rawError + '</div>' +
                        '<a href="https://dash.cloudflare.com/?to=/:account/workers/services" target="_blank" class="inline-block bg-red-500 text-white px-4 py-2 rounded-lg font-bold text-xs">Manage Workers</a>';
                }
                else if (errorMsg.includes("Account not found") || errorMsg.includes("Authentication") || errorMsg.includes("Invalid")) {
                    errorBox.innerHTML = '<div class="mb-2 font-bold">Invalid token or insufficient permissions.</div>' +
                        '<div class="text-[11px] opacity-70 mb-3" dir="ltr">' + rawError + '</div>' +
                        '<a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" class="inline-block bg-red-500 text-white px-4 py-2 rounded-lg font-bold text-xs">Manage Tokens</a>';
                }
                else if (errorMsg.includes("CF_TOS_ERROR") || errorMsg.includes("CF_DB_ERROR") || errorMsg.includes("CF_DEPLOY_ERROR")) {
                    if (errorMsg.includes("email") || errorMsg.includes("verify")) {
                        errorBox.innerHTML = '<div class="mb-2 font-bold">Please verify your email on Cloudflare.</div>' +
                            '<div class="text-[11px] opacity-70 mb-3" dir="ltr">' + rawError + '</div>' +
                            '<a href="https://dash.cloudflare.com/profile" target="_blank" class="inline-block bg-red-500 text-white px-4 py-2 rounded-lg font-bold text-xs">Verify Email</a>';
                    } else {
                        errorBox.innerHTML = '<div class="mb-2 font-bold">Please accept Cloudflare TOS in the dashboard.</div>' +
                            '<div class="text-[11px] opacity-70 mb-3" dir="ltr">' + rawError + '</div>' +
                            '<a href="https://dash.cloudflare.com/?to=/:account/workers/overview" target="_blank" class="inline-block bg-red-500 text-white px-4 py-2 rounded-lg font-bold text-xs">Go to Cloudflare</a>';
                    }
                } else {
                    errorBox.innerText = errorMsg;
                }
            }
        }
    </script>

    <!-- Update Modal -->
    <div id="update-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 opacity-0 pointer-events-none transition-opacity duration-200 ease-out">
        <div id="update-modal-card" class="w-full max-w-md bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-3xl shadow-2xl p-6 transform transition-all scale-95 opacity-0 duration-200 flex flex-col max-h-[85vh]">
            <div class="flex justify-between items-center mb-6 shrink-0">
                <h3 class="text-xl font-bold text-gray-900 dark:text-white">Update Ryxo Panel</h3>
                <button onclick="toggleUpdateModal(false)" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            
            <div class="space-y-4 shrink-0">
                <a href="https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22d1%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_subdomain%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22account_analytics%22%2C%22type%22%3A%22read%22%7D%5D&accountId=*&zoneId=all&name=Ryxo-Deployer-Token" target="_blank" class="flex items-center justify-center w-full py-2.5 bg-[#d94800] hover:bg-[#e35802] text-white font-bold rounded-xl text-sm transition duration-300">
                    Get Cloudflare Token
                </a>
                <div class="mt-2 text-center mb-4">
                    <p class="text-[11px] text-gray-500 dark:text-zinc-400 font-medium">
                        Click 
                        <span class="font-bold text-orange-500">Get Token</span>, 
                        then at the bottom of the page click 
                        <span class="font-bold text-blue-500">Continue to summary</span> 
                        and create your token.
                    </p>
                </div>         
                <input type="password" id="updateApiToken" placeholder="Enter your token..." autocomplete="off" spellcheck="false" class="w-full px-4 py-3 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono text-left text-gray-900 dark:text-zinc-100 transition" dir="ltr">
                
                <button id="checkPanelsBtn" onclick="checkExistingPanels()" class="w-full py-3 btn-secondary text-white font-bold rounded-xl text-md transition duration-300">
                    Check Existing Panels
                </button>
            </div>

            <div id="panels-list-container" class="mt-6 hidden overflow-y-auto space-y-3 pr-1 pb-2">
            </div>

            <div id="update-status" class="hidden mt-4 text-center text-sm font-bold shrink-0 p-3 rounded-xl"></div>
        </div>
    </div>
</body>
</html>
    `;
}
