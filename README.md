# 🤖 Apollo Lead Agent — Chrome Extension

**Automate Apollo.io lead research. One click. Zero manual work.**

A Chrome Extension that automatically scrapes lead data from Apollo.io and saves everything directly into Google Sheets — LinkedIn profiles, company names, company LinkedIn, and websites. No copy-pasting. No missed fields. No broken workflows.

---

## ✨ What It Does

| Before | After |
|--------|-------|
| Open each profile manually | ✔ Select leads |
| Copy LinkedIn URL | ✔ Click one button |
| Find company website | ✔ Walk away |
| Paste into spreadsheet | ✔ Data in Google Sheets |
| Repeat 50+ times | ✔ Zero manual work |

**4 hours of weekly manual work → Zero.**

---

## 🎯 Features

- ✅ **One-click automation** — select leads, click Process, done
- ✅ **Full profile scraping** — Person LinkedIn, Company Name, Company LinkedIn, Company Website
- ✅ **Google Sheets integration** — data saved automatically, formatted & timestamped
- ✅ **Duplicate detection** — never saves the same lead twice
- ✅ **Persistent queue** — survives page reloads, picks up exactly where it left off
- ✅ **Live HUD** — real-time progress display on the page
- ✅ **Pause / Resume / Stop** — full control during runs
- ✅ **Speed control** — slow / medium / fast between profiles

---

## 🛠️ Tech Stack

- **Chrome Extension** — Manifest V3
- **Content Script** — React DOM scraping on Apollo.io
- **Service Worker** — Background fetch + Chrome Storage API
- **Google Apps Script** — Web App backend writing to Google Sheets
- **Chrome Storage API** — Persistent queue system (survives SPA reloads)

---

## 🚀 Setup Guide

### Step 1 — Google Apps Script (Backend)

1. Go to [script.google.com](https://script.google.com) → **New Project**
2. Paste the contents of `AppScript_Code.gs`
3. Replace `YOUR_GOOGLE_SHEET_ID_HERE` with your actual Google Sheet ID
   - Your Sheet ID is in the URL: `docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`
4. Save the project (`Ctrl+S`)
5. Click **Deploy → New Deployment**
   - Type: `Web App`
   - Execute as: `Me`
   - Who has access: `Anyone`
6. Click **Deploy** → Copy the `/exec` URL

---

### Step 2 — Chrome Extension (Frontend)

1. Open Chrome → go to `chrome://extensions/`
2. Enable **Developer Mode** (top right toggle)
3. Click **Load unpacked**
4. Select this project's folder
5. The extension icon appears in your toolbar

---

### Step 3 — Connect Extension to Google Sheets

1. Click the extension icon in Chrome
2. Paste your Apps Script `/exec` URL into the **Google Apps Script URL** field
3. Click **Save** then **Test** to verify the connection
4. You should see ✅ Connected!

---

## 📖 How To Use

1. Go to **Apollo.io → People** list
2. Apply your filters (job title, location, company size, etc.)
3. **Check ✅** the contacts you want to scrape
4. Click the extension icon → **▶ Process Checked Contacts**
5. Watch the HUD — agent opens each profile, scrapes data, saves to Sheets
6. When done, go to the next page and repeat

---

## 📁 Project Structure

```
apollo-agent/
├── manifest.json        # Chrome Extension config (Manifest V3)
├── agent.js             # Content script — scraping logic + HUD
├── background.js        # Service worker — storage + Google Sheets fetch
├── popup.html           # Extension popup UI
├── popup.js             # Popup logic — config, start, stats
├── AppScript_Code.gs    # Google Apps Script — Sheets backend
└── icon.png             # Extension icon
```

---

## ⚙️ Google Sheets Output Format

| Timestamp | Person Name | Person LinkedIn | Company Name | Company LinkedIn | Company Website | Apollo URL |
|-----------|-------------|-----------------|--------------|------------------|-----------------|------------|
| 2026-03-08 | Justin K. | linkedin.com/in/... | Markerly | linkedin.com/company/... | markerly.com | apollo.io/... |

---

## ⚠️ Important Notes

- **Apollo.io account required** — works on any plan
- **Do not close the browser tab** while the agent is running
- Works best on **Medium speed (4s)** setting for stable internet
- The agent handles Apollo's React SPA routing automatically — no manual refresh needed
- This tool automates data extraction from Apollo.io while logged into your own account. Automated scraping may not be permitted under Apollo's Terms of Service — review their current terms before using this beyond personal/demo purposes

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first.

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

## 👤 Author

**Muhammad Hamza Kaleem**
AI Automation Consultant — I help businesses automate repetitive workflows using LLMs, Chrome Extensions, and custom AI systems.

🔗 [LinkedIn](https://www.linkedin.com/in/muhammad-hamza-kaleem)

---

*If this saved you time, consider giving it a ⭐ — it helps others find it.*
