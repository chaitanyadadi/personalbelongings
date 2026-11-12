# My website + AI Hub

A personal website (About, Skills, Interests, Favourites, Wishlist) with an
**AI Hub** that updates itself at **7 AM and 7 PM IST** every day.

Everything runs free on GitHub: GitHub Actions collects the news, GitHub Pages hosts the site.

```
my-website/
├── index.html                  Home page (personal sections)
├── ai.html                     AI Hub page
├── content/profile.json        ← YOUR text: about, skills, interests, favourites, wishlist
├── assets/                     Styles and scripts
├── data/ai/                    AI news data (written by the robot, don't edit)
├── scripts/
│   ├── fetch_ai_news.py        The news collector
│   └── sources.yaml            ← Which websites to collect from, which stocks to track
├── requirements.txt            Python packages the collector needs
└── .github/workflows/
    └── update-ai-hub.yml       The twice-a-day schedule
```

## How the AI Hub gets its information

1. Twice a day, GitHub starts a small Linux machine and runs `scripts/fetch_ai_news.py`.
2. The script reads ~40 sources listed in `scripts/sources.yaml`: company blogs (Anthropic, OpenAI,
   Google, Meta, Mistral, xAI…), tech news sites, Google News searches, Hacker News, Reddit,
   Hugging Face, arXiv, GitHub and Yahoo Finance for stock prices.
3. It removes duplicates, tags each item with companies (Anthropic, OpenAI, Google…), marks rumours
   as unverified, and keeps the last 30 days in `data/ai/items.json`.
4. If you add a Claude API key, Claude writes a short "today's brief" at the top of the page.
5. The new data is committed to the repository and the website is republished.

| Tab on the site | Sources |
|---|---|
| Official updates | Company blogs and release notes |
| Headlines | TechCrunch, The Verge, VentureBeat, MIT Tech Review, Ars Technica, Google News |
| Gossip & buzz | Hacker News, Reddit (r/LocalLLaMA, r/singularity, r/ClaudeAI), rumour searches |
| Research | Hugging Face daily papers, arXiv |
| New models & tools | Hugging Face trending models, new GitHub AI repos, Cursor, Ollama |
| Market & funding | Funding/IPO/valuation news + stock prices of NVIDIA, Microsoft, Alphabet… |

---

## Setup (about 20 minutes, one time)

### 1. Create a GitHub account
Go to <https://github.com/signup> and sign up. Remember your **username**.

### 2. Create the repository
1. Click **+** (top right) → **New repository**.
2. Repository name: `YOUR-USERNAME.github.io` (exactly your username + `.github.io`).
   Your site will then live at `https://YOUR-USERNAME.github.io`.
3. Choose **Public**. (GitHub Pages is free for public repositories.)
4. Click **Create repository**.

### 3. Upload the files
The easiest reliable way is **GitHub Desktop** (<https://desktop.github.com>):
1. Install it and sign in.
2. **File → Clone repository** → pick `YOUR-USERNAME.github.io` → choose a folder on your computer.
3. Unzip `my-website.zip` and copy **everything inside** the `my-website` folder into that cloned folder,
   including the hidden `.github` folder. (On Windows: View → Show → Hidden items. On Mac: Cmd+Shift+.)
4. Back in GitHub Desktop: write "First version" in the summary box → **Commit to main** → **Push origin**.

> Uploading through the website (Add file → Upload files) also works, but browsers often skip the
> hidden `.github` folder. If you go that way, check afterwards that `.github/workflows/update-ai-hub.yml`
> exists in the repository. If not, create it with **Add file → Create new file**, type the path
> `.github/workflows/update-ai-hub.yml` and paste the file's contents.

### 4. Turn on GitHub Pages
Repository → **Settings → Pages** → under **Build and deployment**, set **Source** to **GitHub Actions**.

### 5. Allow the robot to save data
Repository → **Settings → Actions → General** → **Workflow permissions** → choose
**Read and write permissions** → **Save**.

### 6. (Optional) Add a Claude API key for the daily brief
The site works without this. With it, Claude writes a short summary of each edition.
The API is billed separately from your Claude.ai subscription; with the small Haiku model this
costs a few cents a day.
1. Get a key at <https://console.anthropic.com> → API keys.
2. Repository → **Settings → Secrets and variables → Actions → New repository secret**.
3. Name: `ANTHROPIC_API_KEY`, value: your key → **Add secret**.

### 7. Run it for the first time
Repository → **Actions** tab → **Update AI Hub and publish site** → **Run workflow** → **Run workflow**.
Wait 2–4 minutes until it shows a green tick, then open `https://YOUR-USERNAME.github.io`.

From now on it runs by itself at 7:00 AM and 7:00 PM IST. (GitHub sometimes starts scheduled runs
10–30 minutes late; that's normal.)

---

## Everyday changes

**Edit your personal sections:** open `content/profile.json` on GitHub → pencil icon → change the text →
**Commit changes**. The site republishes in about a minute. Keep the quotes and commas intact; if the
page goes blank, paste the file into <https://jsonlint.com> to find the mistake.

**Add or remove news sources / stocks:** edit `scripts/sources.yaml`. Indian stocks use the `.NS`
suffix, for example `TCS.NS`.

**Change the update times:** edit the `cron` line in `.github/workflows/update-ai-hub.yml`. Times are
in UTC: 7:00 AM IST = `30 1`, 7:00 PM IST = `30 13`. Three times a day, for example:
`"30 1,7,13 * * *"`.

**Check which sources worked:** at the bottom of the AI Hub page, open **Source health**.
Some sites occasionally block GitHub's servers (Reddit is the usual one); the rest keep working.

**Preview on your own computer:**
```
cd my-website
python -m http.server 8000
```
then open <http://localhost:8000>. (Opening `index.html` by double-clicking won't load the data.)

**Run the collector on your own computer:**
```
pip install -r requirements.txt
python scripts/fetch_ai_news.py
```

## Good to know
- The site shows headlines, short summaries and links to the original articles, not full articles.
- If the repository has no activity for 60 days GitHub may pause the schedule; the robot's own
  commits normally keep it active. If it pauses, the Actions tab shows a button to re-enable it.
- Future ideas: a Power BI report built from `data/ai/items.json`, email/Telegram alerts for Claude
  releases, a search across the full archive.
