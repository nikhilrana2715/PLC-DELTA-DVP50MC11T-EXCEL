# How to Start the Morning Meeting Dashboard

A short guide to run the app every day (for example, in the morning).

---

## 1. What you need (one-time)

- **Node.js** must be installed on the laptop. It already is — you have been running the app.
- The project folder:

  ```
  d:\Editor\VS CODE\Morning Meeting Application
  ```

---

## 2. Open a terminal inside the project folder

Pick **any one** of these:

- **VS Code (easiest):** Open the project in VS Code → top menu **Terminal → New Terminal**.
  The terminal opens inside the project folder automatically.
- **Windows Explorer:** Open the folder above, click the address bar, type `cmd`, press **Enter**.
- **Right-click** the folder → **Open in Terminal** (Windows 11).

---

## 3. Start the server

Type this command and press **Enter**:

```bash
npm run serve
```

- This starts the app instantly (it uses the already-built version).
- **Keep this terminal window open** while you use the app. Closing it stops the server.

> If you ever change the code, or the app behaves oddly, use this instead (it rebuilds first, takes a few seconds):
>
> ```bash
> npm run start
> ```

---

## 4. Open the dashboard

When the server starts, it prints something like this:

```
  Morning Meeting server running:
    Local:    http://localhost:5180/
    Network:  http://192.168.100.186:5180/
    
```

- **On the same laptop:** open **http://localhost:5180/** in the browser.
- **On your phone / another device:** open the **Network** URL shown in the terminal
  (for example `http://192.168.100.186:5180/`).

> ⚠️ The phone and the laptop must be on the **same Wi-Fi**.
> The Network IP address can change day to day — always use the one printed in the terminal.

---

## 5. Stop the server

In the terminal, press **Ctrl + C** (or just close the terminal window).

---

## 6. Quick daily routine

1. Open VS Code → **Terminal → New Terminal**.
2. Type `npm run serve` → **Enter**.
3. On the laptop open **http://localhost:5180/**, or on the phone use the **Network** URL.
4. Import your Excel → **Convert into Dashboard**.
5. When done, press **Ctrl + C** in the terminal.

---

## 7. If something goes wrong

| Problem | Fix |
|---|---|
| `npm` is not recognised | Node.js is not installed / not on PATH. Reinstall Node.js from nodejs.org. |
| Port 5180 already in use | The server is already running in another terminal. Use that one, or close it and run again. |
| Phone can't open the link | Make sure phone + laptop are on the **same Wi-Fi**, and use the exact **Network** URL from the terminal. |
| Dashboard is empty after opening | That is normal until you **Import → Convert** an Excel. Your last converted data is remembered on that device. |
| App looks old after an update | In the browser press **Ctrl + Shift + R** to hard-refresh. |

---

## Command summary

| Command | What it does |
|---|---|
| `npm run serve` | **Start the app** (recommended for daily use). |
| `npm run start` | Rebuild, then start (use after code changes). |
| `Ctrl + C` | Stop the server. |

*Run all commands from inside the project folder: `d:\Editor\VS CODE\Morning Meeting Application`.*
