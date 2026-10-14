# Deploying ClinicHub to IIS (single website)

The app ships as **one ASP.NET Core site**. The backend serves:

- the React frontend from `wwwroot` (built by Vite)
- the API under `/api/v1`

Because the frontend calls the API with a **relative** URL (`/api/v1`), everything
runs on one origin — no CORS, no second site, no port juggling in production.

---

IIS names below (`ClinicHub` site, `ClinicHubPool`, `C:\inetpub\ClinicHub`) are suggestions; any
names work. A server set up before the rename (2026-10-14) may still use `Drags`/`DragsPool`.

## 1. Build the package (on your dev machine)

From the solution root (`D:\ClinicHub`):

```powershell
.\deploy.ps1
```

This builds the frontend into `ClinicHub.Api\wwwroot`, publishes the backend, and
produces a ready-to-copy folder: **`D:\ClinicHub\publish`**.

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

1. **Copy** the `publish` folder to the laptop, e.g. `C:\inetpub\ClinicHub`.

2. **Create an App Pool** (IIS Manager → *Application Pools* → *Add…*):
   - Name: `ClinicHubPool`
   - .NET CLR version: **No Managed Code**  ← required (the app runs out-of-CLR via the module)

3. **Create the Website** (IIS Manager → *Sites* → *Add Website…*):
   - Site name: `ClinicHub`
   - Application pool: `ClinicHubPool`
   - Physical path: `C:\inetpub\ClinicHub`
   - Binding: **http**, port `80` (or any free port, e.g. `8080`)

4. **Grant write permission** for logs:
   - Right-click `C:\inetpub\ClinicHub` → *Properties* → *Security* → *Edit* → *Add…*
   - Enter `IIS AppPool\ClinicHubPool`, give it **Modify**.

   Or via admin PowerShell:
   ```powershell
   icacls "C:\inetpub\ClinicHub" /grant "IIS AppPool\ClinicHubPool:(OI)(CI)M" /T
   ```

5. **Browse** to `http://localhost` (on the laptop) or `http://<laptop-ip>` from
   another device on the network.

**Database:** PostgreSQL. Set the connection string on the server, e.g. an environment variable
`ConnectionStrings__DefaultConnection` (in `web.config` under `<environmentVariables>`).

**MediatR license — the app won't start without it** outside Development: environment variable
`MediatR__LicenseKey` (free community license for companies under $5M yearly revenue, from
luckypennysoftware.com).

**Login (M1.2) — the app won't start without these** (environment variables, never in `appsettings.json`):
`Auth__Jwt__SigningKey` and `Otp__HashKey` (random secrets, at least 32 bytes each) and the super
admins' phones `Platform__SuperAdminPhones__0`, `Platform__SuperAdminPhones__1`, … Note: outside
Development the app starts only with **`Otp__Mode=Display`** (there is no SMS sender yet): login codes
are shown on screen, so anyone can log in as any phone. Fine for a demo or staging server, not for
real data. That includes the super admins' phones (today: the template clinic; after M1.5: the whole
admin area, creating clinics and managing staff), so on a demo server use **throwaway super-admin
numbers** and no real data. Login also needs **HTTPS** (the refresh cookie is `Secure`): the http binding below is not
enough once login is deployed.
The schema is created automatically on first run via EF Core migrations; it starts **empty**
(the 10 000-row dev seed only runs in Development).

---

## Updating later

1. Run `.\deploy.ps1` again on your dev machine.
2. In IIS Manager, **Stop** the `ClinicHub` site (releases the running `.exe`).
3. Copy the new `publish` contents over the server folder (data lives in PostgreSQL, not the folder).
4. **Start** the site.

---

## Troubleshooting

- **HTTP 500.19 / 500.30** — Hosting Bundle not installed or IIS not reset.
  Install it, then `iisreset`.
- **HTTP 500.30 (app won't start)** — set `stdoutLogEnabled="true"` in `web.config`,
  create a `logs` folder in the site, restart, and read `logs\stdout*.log`.
- **Database errors** — check the PostgreSQL connection string and that the server can reach it.
- **Reach it from other PCs** — allow the port through Windows Firewall
  (`New-NetFirewallRule -DisplayName "ClinicHub" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow`).
