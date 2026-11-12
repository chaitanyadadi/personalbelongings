#!/usr/bin/env python3
"""
AI Hub fetcher.

Collects AI updates from the sources in scripts/sources.yaml, merges them
with what was collected before, and writes:

    data/ai/items.json   every item from the last `keep_days` days
    data/ai/meta.json    last update time, market prices, briefs, source health

Runs twice a day on GitHub Actions (see .github/workflows/update-ai-hub.yml).
You can also run it on your own computer:

    pip install -r requirements.txt
    python scripts/fetch_ai_news.py

If the environment variable ANTHROPIC_API_KEY is set, Claude writes a short
"Today's brief" for each edition. Without it, everything else still works.
"""

from __future__ import annotations

import hashlib
import html
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote_plus, urlsplit, urlunsplit

import feedparser
import requests
import yaml

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "ai"
ITEMS_FILE = DATA_DIR / "items.json"
META_FILE = DATA_DIR / "meta.json"
CONFIG_FILE = Path(__file__).resolve().parent / "sources.yaml"

UA = "Mozilla/5.0 (compatible; PersonalAIHub/1.0; +https://github.com)"
TIMEOUT = 20
NOW = datetime.now(timezone.utc)
CATEGORIES = ["official", "news", "buzz", "research", "tools", "market"]
UNVERIFIED_WORDS = re.compile(
    r"\b(rumou?r|leak(ed|s)?|reportedly|sources say|allegedly|could be|spotted|hint(s|ed)? at|teases?)\b",
    re.I,
)

session = requests.Session()
session.headers.update({"User-Agent": UA})


# ───────────────────────── helpers ─────────────────────────

def log(msg: str) -> None:
    print(msg, flush=True)


def clean_text(raw: str | None, limit: int = 280) -> str:
    """Strip HTML, collapse whitespace, cut to `limit` characters."""
    if not raw:
        return ""
    text = re.sub(r"<[^>]+>", " ", raw)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0].rstrip(",.;:") + "…"
    return text


def normalize_url(url: str) -> str:
    """Drop tracking query strings and fragments so duplicates match."""
    try:
        parts = urlsplit(url.strip())
        query = "&".join(
            q for q in parts.query.split("&")
            if q and not q.lower().startswith(("utm_", "ref=", "source=", "fbclid", "gclid"))
        )
        return urlunsplit((parts.scheme, parts.netloc.lower(), parts.path.rstrip("/"), query, ""))
    except Exception:
        return url


def title_key(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", title.lower())[:90]


def make_id(url: str, title: str) -> str:
    return hashlib.sha1((normalize_url(url) or title).encode()).hexdigest()[:12]


def to_iso(value) -> str:
    """Accept struct_time, epoch, or ISO string and return UTC ISO-8601."""
    try:
        if value is None:
            return NOW.isoformat(timespec="seconds")
        if isinstance(value, time.struct_time):
            dt = datetime(*value[:6], tzinfo=timezone.utc)
        elif isinstance(value, (int, float)):
            dt = datetime.fromtimestamp(value, tz=timezone.utc)
        else:
            s = str(value).replace("Z", "+00:00")
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        # Future dates (bad feeds) are clamped to now.
        return min(dt.astimezone(timezone.utc), NOW).isoformat(timespec="seconds")
    except Exception:
        return NOW.isoformat(timespec="seconds")


def get(url: str, **kw) -> requests.Response:
    r = session.get(url, timeout=TIMEOUT, **kw)
    r.raise_for_status()
    return r


def item(source: dict, title: str, url: str, published, summary: str = "", **extra) -> dict:
    title = clean_text(title, 220)
    return {
        "id": make_id(url, title),
        "title": title,
        "url": url,
        "source": source["name"],
        "category": source["category"],
        "published": to_iso(published),
        "summary": clean_text(summary),
        **extra,
    }


# ───────────────────────── source readers ─────────────────────────

def read_rss(src: dict, url: str | None = None) -> list[dict]:
    resp = get(url or src["url"])
    feed = feedparser.parse(resp.content)
    if feed.bozo and not feed.entries:
        raise ValueError(f"not a valid feed ({feed.bozo_exception})")
    out = []
    for e in feed.entries:
        link = e.get("link") or ""
        if not link or not e.get("title"):
            continue
        published = e.get("published_parsed") or e.get("updated_parsed")
        summary = e.get("summary") or e.get("description") or ""
        source_name = None
        # Google News items carry the real publisher in <source>.
        if src.get("type") == "google_news" and e.get("source"):
            source_name = e["source"].get("title")
        it = item(src, e.title, link, published, summary)
        if source_name:
            it["publisher"] = source_name
            # Google News titles end with " - Publisher"; remove it.
            it["title"] = re.sub(r"\s+-\s+" + re.escape(source_name) + r"$", "", it["title"])
            it["summary"] = ""  # Google's summary is just the title again
        out.append(it)
    return out


def read_google_news(src: dict) -> list[dict]:
    url = (
        "https://news.google.com/rss/search?q="
        + quote_plus(src["query"] + " when:2d")
        + "&hl=en-IN&gl=IN&ceid=IN:en"
    )
    return read_rss(src, url)


def read_hn(src: dict) -> list[dict]:
    since = int((NOW - timedelta(days=2)).timestamp())
    params = {
        "query": src.get("query", "AI"),
        "tags": "story",
        "numericFilters": f"points>{src.get('min_points', 50)},created_at_i>{since}",
        "hitsPerPage": 50,
    }
    # Algolia treats the query words as AND; run one search per term instead.
    terms = [t.strip() for t in params["query"].split(" OR ")]
    seen, out = set(), []
    for term in terms:
        params["query"] = term
        data = get("https://hn.algolia.com/api/v1/search_by_date", params=params).json()
        for h in data.get("hits", []):
            if h["objectID"] in seen or not h.get("title"):
                continue
            seen.add(h["objectID"])
            discuss = f"https://news.ycombinator.com/item?id={h['objectID']}"
            out.append(item(
                src, h["title"], h.get("url") or discuss, h.get("created_at_i"),
                f"{h.get('points', 0)} points, {h.get('num_comments', 0)} comments on Hacker News",
                discussion=discuss, score=h.get("points", 0),
            ))
    out.sort(key=lambda x: x.get("score", 0), reverse=True)
    return out


def read_hf_papers(src: dict) -> list[dict]:
    data = get("https://huggingface.co/api/daily_papers", params={"limit": 40}).json()
    out = []
    for d in data:
        p = d.get("paper", d)
        pid = p.get("id")
        if not pid:
            continue
        out.append(item(
            src, p.get("title") or d.get("title", ""), f"https://huggingface.co/papers/{pid}",
            d.get("publishedAt") or p.get("publishedAt"),
            p.get("ai_summary") or p.get("summary", ""),
            score=p.get("upvotes", 0),
        ))
    out.sort(key=lambda x: x.get("score", 0), reverse=True)
    return out


def read_arxiv(src: dict) -> list[dict]:
    url = (
        "https://export.arxiv.org/api/query?search_query="
        + quote_plus(src["query"])
        + "&sortBy=submittedDate&sortOrder=descending&max_results=40"
    )
    return read_rss(src, url)


def read_hf_models(src: dict) -> list[dict]:
    data = get("https://huggingface.co/api/models", params={"sort": "trendingScore", "limit": 30}).json()
    out = []
    for m in data:
        mid = m.get("id") or m.get("modelId")
        if not mid:
            continue
        task = (m.get("pipeline_tag") or "model").replace("-", " ")
        out.append(item(
            src, mid, f"https://huggingface.co/{mid}", m.get("createdAt"),
            f"Trending {task} on Hugging Face, {m.get('likes', 0):,} likes, {m.get('downloads', 0):,} downloads",
            score=m.get("trendingScore", 0),
        ))
    return out


def read_github(src: dict) -> list[dict]:
    since = (NOW - timedelta(days=14)).date().isoformat()
    # GitHub search: one topic per query works best.
    topics = re.findall(r"topic:([\w-]+)", src["query"]) or ["llm"]
    headers = {"Accept": "application/vnd.github+json"}
    if os.getenv("GITHUB_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['GITHUB_TOKEN']}"
    seen, out = set(), []
    for topic in topics:
        data = get(
            "https://api.github.com/search/repositories",
            params={"q": f"topic:{topic} created:>{since}", "sort": "stars", "order": "desc", "per_page": 15},
            headers=headers,
        ).json()
        for r in data.get("items", []):
            if r["full_name"] in seen:
                continue
            seen.add(r["full_name"])
            out.append(item(
                src, r["full_name"], r["html_url"], r.get("created_at"),
                (r.get("description") or "") + f" ({r.get('stargazers_count', 0):,} stars)",
                score=r.get("stargazers_count", 0),
            ))
    out.sort(key=lambda x: x.get("score", 0), reverse=True)
    return out


READERS = {
    "rss": read_rss,
    "google_news": read_google_news,
    "hn": read_hn,
    "hf_papers": read_hf_papers,
    "arxiv": read_arxiv,
    "hf_models": read_hf_models,
    "github": read_github,
}


# ───────────────────────── enrichment ─────────────────────────

def build_company_matchers(companies: dict) -> dict:
    return {
        name: re.compile(r"(?<![a-z0-9])(" + "|".join(re.escape(k) for k in kws) + ")", re.I)
        for name, kws in (companies or {}).items()
    }


def enrich(it: dict, matchers: dict) -> dict:
    text = f"{it['title']} {it.get('summary', '')}"
    it["companies"] = [name for name, rx in matchers.items() if rx.search(text)]
    it["unverified"] = it["category"] == "buzz" or bool(UNVERIFIED_WORDS.search(it["title"]))
    return it


# ───────────────────────── market ─────────────────────────

def fetch_stocks(stocks: list[dict]) -> list[dict]:
    if not stocks:
        return []
    try:
        import yfinance as yf
    except ImportError:
        log("  yfinance not installed; skipping stocks")
        return []
    tickers = [s["ticker"] for s in stocks]
    try:
        df = yf.download(tickers, period="1mo", interval="1d", progress=False, auto_adjust=True, group_by="ticker")
    except Exception as exc:
        log(f"  stocks failed: {exc}")
        return []
    out = []
    for s in stocks:
        try:
            closes = df[s["ticker"]]["Close"].dropna() if len(tickers) > 1 else df["Close"].dropna()
            if len(closes) < 2:
                continue
            last, prev = float(closes.iloc[-1]), float(closes.iloc[-2])
            out.append({
                "ticker": s["ticker"],
                "name": s.get("name", s["ticker"]),
                "price": round(last, 2),
                "change_pct": round((last - prev) / prev * 100, 2),
                "month_pct": round((last - float(closes.iloc[0])) / float(closes.iloc[0]) * 100, 2),
                "spark": [round(float(v), 2) for v in closes.tolist()],
                "as_of": closes.index[-1].strftime("%Y-%m-%d"),
            })
        except Exception as exc:
            log(f"  {s['ticker']}: {exc}")
    return out


# ───────────────────────── Claude brief (optional) ─────────────────────────

def write_brief(new_items: list[dict]) -> dict | None:
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key or not new_items:
        return None
    try:
        import anthropic
    except ImportError:
        log("  anthropic package not installed; skipping brief")
        return None

    order = {c: i for i, c in enumerate(CATEGORIES)}
    picked = sorted(new_items, key=lambda x: (order.get(x["category"], 9), -x.get("score", 0)))[:120]
    lines = "\n".join(
        f"[{x['id']}] ({x['category']}{', unverified' if x.get('unverified') else ''}) "
        f"{x['title']} — {x.get('publisher') or x['source']}"
        for x in picked
    )
    prompt = f"""You are the editor of a personal AI newspaper. Below are the AI items collected since the last edition.

Write a brief for a busy reader:
- "headline": one sentence naming the single biggest development.
- "points": 5 to 8 short bullet points, most important first. Prefer official announcements and concrete facts (new models, releases, prices, funding amounts). Mention rumours only if notable and say they are unverified. Do not invent facts that are not in the titles.
- Each point lists the ids of the items it is based on.

Return only JSON: {{"headline": "...", "points": [{{"text": "...", "ids": ["..."]}}]}}

Items:
{lines}"""
    try:
        client = anthropic.Anthropic(api_key=key)
        msg = client.messages.create(
            model=os.getenv("AI_HUB_MODEL", "claude-haiku-5-5"),
            max_tokens=1200,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        data = json.loads(re.search(r"\{.*\}", text, re.S).group(0))
        return {"headline": data.get("headline", ""), "points": data.get("points", [])}
    except Exception as exc:
        log(f"  brief failed: {exc}")
        return None


# ───────────────────────── main ─────────────────────────

def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def main() -> int:
    cfg = yaml.safe_load(CONFIG_FILE.read_text(encoding="utf-8"))
    keep_days = int(cfg.get("keep_days", 30))
    per_source = int(cfg.get("max_items_per_source", 25))
    matchers = build_company_matchers(cfg.get("companies", {}))

    old_items = load_json(ITEMS_FILE, [])
    old_meta = load_json(META_FILE, {})
    known_ids = {x["id"] for x in old_items}
    known_titles = {title_key(x["title"]) for x in old_items}

    health, fresh = [], []
    for src in cfg.get("sources", []):
        reader = READERS.get(src.get("type", "rss"))
        if not reader or src.get("category") not in CATEGORIES:
            health.append({"name": src.get("name", "?"), "ok": False, "count": 0, "error": "bad type or category"})
            continue
        try:
            got = reader(src)[:per_source]
            fresh.extend(enrich(x, matchers) for x in got)
            health.append({"name": src["name"], "category": src["category"], "ok": True, "count": len(got)})
            log(f"  ok   {src['name']}: {len(got)}")
        except Exception as exc:
            msg = str(exc).split("\n")[0][:160]
            health.append({"name": src["name"], "category": src["category"], "ok": False, "count": 0, "error": msg})
            log(f"  FAIL {src['name']}: {msg}")

    cutoff = (NOW - timedelta(days=keep_days)).isoformat()

    # Merge: new items get first_seen = now; old items keep theirs.
    new_items, seen_titles = [], set(known_titles)
    for x in fresh:
        if x["published"] < cutoff:
            continue
        tk = title_key(x["title"])
        if x["id"] in known_ids or tk in seen_titles:
            continue
        seen_titles.add(tk)
        known_ids.add(x["id"])
        x["first_seen"] = NOW.isoformat(timespec="seconds")
        new_items.append(x)

    # Refresh scores (stars, points) for items we already had.
    fresh_by_id = {x["id"]: x for x in fresh}
    for x in old_items:
        if x["id"] in fresh_by_id and "score" in fresh_by_id[x["id"]]:
            x["score"] = fresh_by_id[x["id"]]["score"]

    items = [x for x in new_items + old_items if x.get("published", "") >= cutoff]
    items.sort(key=lambda x: x["published"], reverse=True)

    stocks = fetch_stocks(cfg.get("stocks", [])) or old_meta.get("stocks", [])

    editions = old_meta.get("editions", [])
    brief = write_brief(new_items)
    editions.insert(0, {
        "at": NOW.isoformat(timespec="seconds"),
        "new_count": len(new_items),
        "by_category": {c: sum(1 for x in new_items if x["category"] == c) for c in CATEGORIES},
        "brief": brief,
    })

    meta = {
        "updated": NOW.isoformat(timespec="seconds"),
        "item_count": len(items),
        "stocks": stocks,
        "editions": editions[:60],
        "health": health,
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ITEMS_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=0), encoding="utf-8")
    META_FILE.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")

    ok = sum(1 for h in health if h["ok"])
    log(f"\n{len(new_items)} new items, {len(items)} kept, {ok}/{len(health)} sources ok, {len(stocks)} stocks")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
