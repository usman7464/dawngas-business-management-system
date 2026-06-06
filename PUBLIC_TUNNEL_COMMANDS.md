# DawnGas Public Tunnel Commands

Current public URL:

```text
https://dos-earliest-civilian-commit.trycloudflare.com
```

Important: this exact `trycloudflare.com` URL only stays active while the current `cloudflared` tunnel process is running. If the tunnel is stopped and started again, Cloudflare may generate a new URL.

## 1. Start DawnGas on Port 5000

Open PowerShell:

```powershell
cd "D:\My PC\C\DawnGas\DawnGas Business Management System"
$env:PORT="5000"
$env:MONGODB_URI="mongodb://127.0.0.1:27017/dawngas"
npm run start
```

Keep this PowerShell window open.

## 2. Confirm DawnGas Is Running

Open another PowerShell window:

```powershell
Invoke-WebRequest -Uri "http://localhost:5000/api/health" -UseBasicParsing
```

You should see a successful response from the DawnGas API.

## 3. Start Cloudflare Tunnel

In the second PowerShell window:

```powershell
& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:5000
```

Cloudflare will print a public URL like:

```text
https://dos-earliest-civilian-commit.trycloudflare.com
```

Share that URL with the person who needs to view the portal.

## 4. Verify the Public URL

```powershell
Invoke-WebRequest -Uri "https://dos-earliest-civilian-commit.trycloudflare.com" -UseBasicParsing
```

If the status is `200`, the public link is working.

## 5. Check Running Tunnel Process

```powershell
Get-Process cloudflared -ErrorAction SilentlyContinue
```

## 6. Stop Sharing the Public Link

If the current tunnel process ID is still `2784`, stop it with:

```powershell
Stop-Process -Id 2784
```

Or stop all Cloudflare tunnel processes:

```powershell
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process
```

## 7. If `cloudflared` Is Not Installed

```powershell
winget install --id Cloudflare.cloudflared -e --accept-package-agreements --accept-source-agreements
```

Then close PowerShell, open it again, and run the tunnel command from step 3.
