# Deploying Drags to IIS (single website)

The app ships as **one ASP.NET Core site**. The backend serves:

- the React frontend from `wwwroot` (built by Vite)
- the API under `/api/v1`

Because the frontend calls the API with a **relative** URL (`/api/v1`), everything
runs on one origin — no CORS, no second site, no port juggling in production.

---

## 1. Build the package (on your dev machine)

From the solution root (`D:\Drags`):

```powershell
.\deploy.ps1
```

This builds the frontend into `Drags.Api\wwwroot`, publishes the backend, and
produces a ready-to-copy folder: **`D:\Drags\publish`**.

> The build is **self-contained** (the .NET runtime is bundled), so the old
> laptop does not need a matching .NET 9 runtime installed — only the IIS module
> (step 2). For a smaller, framework-dependent build run `.\deploy.ps1 -SelfContained $false`.

---

## 2. One-time server setup (on the old laptop)

1. **Enable IIS**
   Control Panel → *Turn Windows features on or off* → check **Internet Information Services**
   (include *Web Management Tools* → *IIS Management Console*).

2. **Install the ASP.NET Core Hosting Bundle**
   This installs the `AspNetCoreModuleV2` that lets IIS launch the app.
   Download: <https://dotnet.microsoft.com/download/dotnet/9.0> → *Hosting Bundle*.
   After installing, restart IIS: open an **admin** terminal and run `iisreset`.

---

## 3. Deploy the app

1. **Copy** the `publish` folder to the laptop, e.g. `C:\inetpub\Drags`.

2. **Create an App Pool** (IIS Manager → *Application Pools* → *Add…*):
   - Name: `DragsPool`
   - .NET CLR version: **No Managed Code**  ← required (the app runs out-of-CLR via the module)

3. **Create the Website** (IIS Manager → *Sites* → *Add Website…*):
   - Site name: `Drags`
   - Application pool: `DragsPool`
   - Physical path: `C:\inetpub\Drags`
   - Binding: **http**, port `80` (or any free port, e.g. `8080`)

4. **Grant write permission** so SQLite can create/update `database.db` and logs:
   - Right-click `C:\inetpub\Drags` → *Properties* → *Security* → *Edit* → *Add…*
   - Enter `IIS AppPool\DragsPool`, give it **Modify**.

   Or via admin PowerShell:
   ```powershell
   icacls "C:\inetpub\Drags" /grant "IIS AppPool\DragsPool:(OI)(CI)M" /T
   ```

5. **Browse** to `http://localhost` (on the laptop) or `http://<laptop-ip>` from
   another device on the network.

The database (`database.db`) is created automatically on first run via EF Core
migrations — it starts **empty** (the 10 000-row dev seed only runs in Development).

---

## Updating later

1. Run `.\deploy.ps1` again on your dev machine.
2. In IIS Manager, **Stop** the `Drags` site (releases the running `.exe`).
3. Copy the new `publish` contents over the server folder —
   **keep the existing `database.db`** so you don't lose data.
4. **Start** the site.

---

## Troubleshooting

- **HTTP 500.19 / 500.30** — Hosting Bundle not installed or IIS not reset.
  Install it, then `iisreset`.
- **HTTP 500.30 (app won't start)** — set `stdoutLogEnabled="true"` in `web.config`,
  create a `logs` folder in the site, restart, and read `logs\stdout*.log`.
- **Database errors / read-only** — the app pool identity lacks write access to the
  folder. Re-check step 3.4.
- **Reach it from other PCs** — allow the port through Windows Firewall
  (`New-NetFirewallRule -DisplayName "Drags" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow`).
