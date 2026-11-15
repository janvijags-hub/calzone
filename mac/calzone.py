"""Calzone: look at a plate, see its calories, vitamins and minerals.

  page  --POST /calzone/scan    {"image": "<base64 JPEG>"}   -> foods the AI sees, each matched to USDA foods
  page  --GET  /calzone/search?q=rice                         -> USDA foods for a name (to fix or add a food)
  page  --POST /calzone/plate   {"items": [{"id": 169756, "grams": 150}], "sex": "male"}
                                                              -> nutrient totals and % of daily targets
  page  --GET  /calzone/today?sex=male                        -> today's logged plates and their totals
  page  --POST /calzone/log     {"items": [...], "label": "lunch"}  -> add a plate to today
  page  --POST /calzone/clear                                 -> empty today's log
  page  --GET  /calzone/evidence?nutrient=vit_d_ug            -> research papers (Google Scholar via SerpApi)

Who does what:
  * The AI (MedGemma 1.5 4B, on this computer, port 8081) only NAMES the foods and GUESSES grams.
    The person checks and fixes both.
  * Every nutrient number comes from the USDA table (calzone_data/foods.json, built by
    tools/build_usda.py). The AI never gives a nutrient number.
  * Targets: FDA Daily Values (Nutrition Facts label) and NASA's exploration-mission requirements.
Pictures are not saved. The day's log stays in calzone_data/log.json on this computer.
Practice code, not medical advice.
"""
import base64
import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "calzone_data"
LOG_FILE = DATA / "log.json"
AI_URL = os.environ.get("CALZONE_AI_URL", "http://127.0.0.1:8081/v1/chat/completions")
ENV_FILES = [ROOT / ".env", ROOT.parent / ".env"]  # optional SERPAPI_API_KEY; never committed
MAX_IMAGE = 6 * 1024 * 1024

# ---------- nutrients and targets ----------
# key: (label, unit, group)
NUTRIENTS = {
    "kcal": ("Calories", "kcal", "Energy"),
    "protein_g": ("Protein", "g", "Energy"),
    "carbs_g": ("Carbohydrates", "g", "Energy"),
    "fat_g": ("Fat", "g", "Energy"),
    "fiber_g": ("Fiber", "g", "Energy"),
    "satfat_g": ("Saturated fat", "g", "Limit"),
    "sugars_g": ("Sugars (total)", "g", "Limit"),
    "cholesterol_mg": ("Cholesterol", "mg", "Limit"),
    "sodium_mg": ("Sodium (salt)", "mg", "Limit"),
    "vit_a_ug": ("Vitamin A", "µg", "Vitamins"),
    "vit_c_mg": ("Vitamin C", "mg", "Vitamins"),
    "vit_d_ug": ("Vitamin D", "µg", "Vitamins"),
    "vit_e_mg": ("Vitamin E", "mg", "Vitamins"),
    "vit_k_ug": ("Vitamin K", "µg", "Vitamins"),
    "vit_b6_mg": ("Vitamin B6", "mg", "Vitamins"),
    "vit_b12_ug": ("Vitamin B12", "µg", "Vitamins"),
    "folate_dfe_ug": ("Folate", "µg", "Vitamins"),
    "calcium_mg": ("Calcium", "mg", "Minerals"),
    "iron_mg": ("Iron", "mg", "Minerals"),
    "magnesium_mg": ("Magnesium", "mg", "Minerals"),
    "potassium_mg": ("Potassium", "mg", "Minerals"),
    "zinc_mg": ("Zinc", "mg", "Minerals"),
}

# FDA Daily Values for adults and children 4 years and older: the "%DV" on a Nutrition Facts label.
# Source: 21 CFR 101.9(c), as listed in FDA, "Daily Value on the Nutrition and Supplement Facts Labels".
# "max" = eat less than this. Total sugars have no Daily Value.
FDA_SOURCE = {"name": "FDA Daily Values (Nutrition Facts label, adults)",
              "url": "https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels"}
FDA_DV = {
    "kcal": (2000, "goal"), "protein_g": (50, "goal"), "carbs_g": (275, "goal"), "fat_g": (78, "max"),
    "satfat_g": (20, "max"), "fiber_g": (28, "goal"), "cholesterol_mg": (300, "max"), "sodium_mg": (2300, "max"),
    "vit_a_ug": (900, "goal"), "vit_c_mg": (90, "goal"), "vit_d_ug": (20, "goal"), "vit_e_mg": (15, "goal"),
    "vit_k_ug": (120, "goal"), "vit_b6_mg": (1.7, "goal"), "vit_b12_ug": (2.4, "goal"), "folate_dfe_ug": (400, "goal"),
    "calcium_mg": (1300, "goal"), "iron_mg": (18, "goal"), "magnesium_mg": (420, "goal"),
    "potassium_mg": (4700, "goal"), "zinc_mg": (11, "goal"),
}

# NASA, JSC-67378 Rev. 1 "Nutritional Requirements for Exploration Missions up to 365 days" (April 2020).
# (men, women, kind). Ranges use the low end as the goal; the note keeps the full wording.
# Energy, protein, carbohydrate and fat are set per body weight or as % of calories, so they have no fixed number here.
NASA_SOURCE = {"name": "NASA JSC-67378 Rev 1, exploration missions (2020)",
               "url": "https://ntrs.nasa.gov/api/citations/20205008306/downloads/JSC67378%20Expl%20Nutr%20Reqs%20042020.pdf"}
NASA = {
    "fiber_g": (38, 25, "goal", ""),
    "cholesterol_mg": (300, 300, "max", ""),
    "sodium_mg": (2300, 2300, "max", "NASA: 1,500–2,300 mg a day"),
    "vit_a_ug": (900, 700, "goal", ""),
    "vit_c_mg": (125, 110, "goal", "Higher than on Earth"),
    "vit_d_ug": (25, 25, "goal", "Higher than on Earth: no sunlight in space"),
    "vit_e_mg": (15, 15, "goal", ""),
    "vit_k_ug": (120, 90, "goal", ""),
    "vit_b6_mg": (1.3, 1.3, "goal", ""),
    "vit_b12_ug": (2.4, 2.4, "goal", ""),
    "folate_dfe_ug": (400, 400, "goal", ""),
    "calcium_mg": (1000, 1000, "goal", "NASA: 1,000–1,200 mg a day, never above 2,500"),
    "iron_mg": (8, 8, "max", "A limit in space: flight changes how the body stores iron"),
    "magnesium_mg": (420, 320, "goal", ""),
    "potassium_mg": (3400, 2600, "goal", ""),
    "zinc_mg": (11, 8, "goal", ""),
}
NASA_PERCENT_NOTE = {
    "protein_g": "NASA: 1.2–1.8 g per kg of body weight",
    "carbs_g": "NASA: 45–65% of calories",
    "fat_g": "NASA: 20–35% of calories",
    "satfat_g": "NASA: under 10% of calories",
    "kcal": "NASA: enough to keep body weight steady",
}


# ---------- the USDA food table ----------
_foods = None
_index = None
_lock = threading.Lock()
STOP = {"and", "with", "of", "in", "a", "the", "or", "fresh", "plain", "slice", "slices", "piece", "pieces", "serving"}
SKIP_CATS = {"Baby Foods", "American Indian/Alaska Native Foods"}
LESS_LIKELY = {"glutinous", "unenriched", "nugget", "roll", "frozen", "unprepared", "dehydrated", "powder", "mixture",
               "canned", "imitation", "dry", "concentrate", "babyfood", "mix", "spread", "dressing", "flavored"}
MORE_LIKELY = {"long", "grain", "regular", "enriched", "whole", "plain"}
# Two-word names USDA spells differently.
PHRASES = {
    "french fry": "potatoes french fried frozen home prepared heated oven without salt",
    "white bread": "bread white commercially prepared", "brown rice": "rice brown long grain cooked",
    "fried rice": "rice white long grain regular enriched cooked", "ice cream": "ice creams vanilla",
    "peanut butter": "peanut butter smooth style without salt", "orange juice": "orange juice raw",
    "sweet potato": "sweet potato cooked baked skin without salt", "hard boiled egg": "egg whole cooked hard boiled",
}
# Plain words a person (or the AI) says -> words USDA uses for that food.
SYNONYMS = {
    "dal": "lentils mature seeds cooked boiled", "daal": "lentils mature seeds cooked boiled",
    "lentil": "lentils mature seeds cooked boiled", "chickpea": "chickpeas mature seeds cooked boiled",
    "burger": "hamburger single patty plain", "hamburger": "hamburger single patty plain",
    "fries": "potatoes french fried", "chip": "potato chips",
    "pizza": "pizza cheese topping regular crust", "steak": "beef top sirloin steak cooked broiled",
    "salmon": "fish salmon atlantic farmed cooked dry heat", "tuna": "fish tuna light canned water",
    "shrimp": "crustaceans shrimp cooked", "toast": "bread whole wheat toasted",
    "bread": "bread whole wheat commercially prepared", "roti": "chapati roti whole wheat", "naan": "bread naan plain",
    "salad": "lettuce green leaf raw", "lettuce": "lettuce green leaf raw",
    "potato": "potatoes flesh skin baked", "egg": "egg whole cooked", "milk": "milk reduced fat fluid milkfat added vitamin",
    "yogurt": "yogurt plain whole milk", "cheese": "cheese cheddar", "oatmeal": "cereals oats regular quick cooked water without salt",
    "pasta": "pasta cooked enriched", "spaghetti": "spaghetti cooked enriched", "noodle": "noodles egg cooked enriched",
    "apple": "apples raw with skin", "orange": "oranges raw all commercial varieties", "tofu": "tofu raw firm",
    "beans": "beans black mature seeds cooked boiled", "carrot": "carrots raw", "tomato": "tomatoes red ripe raw",
    "chicken": "chicken broilers fryers breast meat only cooked roasted",
}
COOKED_HINT = {"Cereal Grains and Pasta", "Poultry Products", "Beef Products", "Pork Products", "Lamb, Veal, and Game Products",
               "Finfish and Shellfish Products", "Legumes and Legume Products"}
RAW_HINT = {"Fruits and Fruit Juices", "Vegetables and Vegetable Products", "Nut and Seed Products"}


def _words(text):
    out = []
    for w in re.findall(r"[a-z]+", text.lower()):
        if w in STOP or len(w) < 2:
            continue
        if len(w) > 3 and w.endswith("ies"):
            w = w[:-3] + "y"
        elif len(w) > 3 and w.endswith("es") and w[-3] in "sxz":
            w = w[:-2]
        elif len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        out.append(w)
    return out


def foods():
    global _foods, _index
    with _lock:
        if _foods is None:
            path = DATA / "foods.json"
            if not path.exists():
                raise FileNotFoundError("calzone_data/foods.json is missing. Run: python3 tools/build_usda.py")
            rows = json.loads(path.read_text())["foods"]
            _foods = {f["id"]: f for f in rows}
            _index = {}
            for f in rows:
                plain = re.sub(r"\(.*?\)", "", f["name"])   # drop notes like "(Includes foods for USDA's ...)"
                f["_plain"] = plain
                f["_words"] = _words(plain)
                f["_head"] = _words(plain.split(",")[0])
                for w in set(f["_words"]):
                    _index.setdefault(w, []).append(f["id"])
    return _foods

# Common foods -> the exact USDA entry to offer first. Used when the name has no other detail
# than words like "cooked" or "grilled" (so "brown rice" still goes to the search below).
CANON = {
    "oatmeal": 173905, "broccoli": 169967, "chicken breast": 171477, "chicken": 171054, "french fry": 170118,
    "pasta": 169737, "spaghetti": 169737, "potato": 170093, "baked potato": 170093, "carrot": 170393,
    "beef": 174032, "ground beef": 174032, "egg": 173424, "boiled egg": 173424, "fried egg": 173423,
    "spinach": 168462, "cucumber": 168409, "tomato": 170457, "salad": 169249, "lettuce": 169249,
    "grape": 174683, "yogurt": 171284, "pizza": 170317, "burger": 170693, "hamburger": 170693,
    "tofu": 172475, "black bean": 173735, "bean": 173735, "corn": 169999, "pea": 170420, "salmon": 175168,
    "shrimp": 175180, "pancake": 175009, "donut": 174990, "doughnut": 174990, "cookie": 172716,
    "chocolate cake": 174934, "cake": 174934, "chocolate": 167587, "nut": 170585, "almond": 170567,
    "coffee": 171890, "water": 173647, "tortilla": 167535, "rice": 168878, "mango": 169910,
    "blueberry": 171711, "watermelon": 167765, "pineapple": 169124, "pear": 169118, "peach": 169928,
    "cauliflower": 170397, "mushroom": 169251, "onion": 170000, "bell pepper": 170108, "hummus": 174289,
    "butter": 173410, "olive oil": 171413, "sausage": 171636, "pork sausage": 171636,
    "bacon": 167914, "cola": 174852, "soda": 174852, "cheddar": 170899, "cheese": 170899, "whole milk": 171265,
    "noodle": 168919, "egg noodle": 168919,
}
NEUTRAL = {"cooked", "steamed", "grilled", "boiled", "baked", "roasted", "broiled", "sliced", "chopped", "plain",
           "white", "small", "large", "medium", "fresh", "mixed", "raw", "hot", "warm", "cold", "piece", "portion", "side", "serving"}


def canonical(query):
    q = _words(query)
    best = None
    for key, fid in CANON.items():
        kw = _words(key)
        if all(w in q for w in kw) and all(w in kw or w in NEUTRAL for w in q):
            if best is None or len(kw) > best[0]:
                best = (len(kw), fid)
    return best[1] if best else None


def search(query, limit=6):
    """USDA foods that best match a plain name like 'grilled chicken breast'."""
    table = foods()
    q = _words(query)
    if not q:
        return []
    # A plain word on its own ("dal", "burger") becomes USDA's wording, keeping any extra words given.
    phrase = " ".join(q)
    if phrase in PHRASES:
        q = _words(PHRASES[phrase])
    elif len(q) == 1 and q[0] in SYNONYMS:
        q = _words(SYNONYMS[q[0]])
    q = ["roasted" if w in ("grilled", "grill", "broiled", "baked") and "potato" not in q else "cooked" if w in ("steamed", "boiled") and "chicken" not in q else w
         for w in q]
    ids = set()
    for w in q:
        ids.update(_index.get(w, []))
    scored = []
    for i in ids:
        f = table[i]
        if f["cat"] in SKIP_CATS:
            continue
        have = set(f["_words"])
        hit = sum(1 for w in q if w in have)
        score = hit / len(q)                                   # how many of the words match
        score += 0.6 * sum(1 for w in q if w in f["_head"]) / len(q)   # match on the main word ("Rice, ...")
        score -= 0.012 * len(f["_words"])                       # prefer plain entries over long, specific ones
        if f["_head"] and all(w in q for w in f["_head"]):       # its main name is one of our words
            score += 0.35
        score -= 0.25 * len((have & LESS_LIKELY) - set(q))
        score += 0.05 * len(have & MORE_LIKELY)
        if f["cat"] in ("Fast Foods", "Restaurant Foods"):
            score -= 0.1
        if f["cat"] in COOKED_HINT and ("cooked" in have or "roasted" in have) and "raw" not in q:
            score += 0.15
        if f["cat"] in RAW_HINT and "raw" in have and not {"cooked", "boiled", "fried"} & set(q):
            score += 0.15
        if re.search(r"[A-Z]{3,}", f["_plain"]):   # brand names in capitals
            score -= 0.2
        scored.append((score, f))
    scored.sort(key=lambda s: -s[0])
    first = canonical(query)
    if first in table:
        scored = [(9, table[first])] + [x for x in scored if x[1]["id"] != first]
    return [{"id": f["id"], "name": f["name"], "kcal100": f["per100g"].get("kcal")} for _, f in scored[:limit]]


# ---------- the AI: name the foods, guess the grams ----------
PROMPT = (
    "You are helping log a meal. Look at the photo and list each separate food or drink you can see on the plate "
    "or table. For each one give a short plain name a nutrition database would use (for example \"white rice, cooked\", "
    "\"broccoli, steamed\", \"chicken breast, grilled\", \"apple\") and your best guess of its weight in grams. "
    "Do not give calories or nutrients. If you see no food, return an empty list. "
    'Reply with JSON only, like {"foods": [{"name": "white rice, cooked", "grams": 150}]}.'
)


def recognise(jpeg_b64):
    body = json.dumps({
        "messages": [{"role": "user", "content": [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{jpeg_b64}"}},
            {"type": "text", "text": PROMPT}]}],
        "temperature": 0.1, "max_tokens": 400,
        "response_format": {"type": "json_object"},
    }).encode()
    req = urllib.request.Request(AI_URL, body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        text = json.load(r)["choices"][0]["message"]["content"]
    m = re.search(r"\{.*\}", text, re.S)
    data = json.loads(m.group(0)) if m else {}
    out = []
    for item in data.get("foods", [])[:12]:
        name = str(item.get("name", "")).strip()[:80]
        try:
            grams = float(item.get("grams") or 0)
        except (TypeError, ValueError):
            grams = 0
        if name:
            out.append({"label": name, "grams": round(min(max(grams, 1), 2000)) if grams else 100})
    return out


def scan(body):
    payload = json.loads(body)
    b64 = payload.get("image", "")
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64, validate=False)
    if raw[:2] != b"\xff\xd8":
        raise ValueError("Send one JPEG picture.")
    started = time.time()
    items = recognise(b64)
    for it in items:
        it["matches"] = search(it["label"])
        it["id"] = it["matches"][0]["id"] if it["matches"] else None
    return {"items": items, "seconds": round(time.time() - started, 1),
            "ai": "MedGemma 1.5 4B (Google), running on this computer"}


# ---------- adding up a plate ----------
def plate(items, sex="male"):
    table = foods()
    total = {k: 0.0 for k in NUTRIENTS}
    rows = []
    for it in items:
        f = table.get(int(it.get("id") or 0))
        grams = max(0.0, min(float(it.get("grams") or 0), 5000))
        if not f or not grams:
            continue
        part = {k: f["per100g"].get(k, 0) * grams / 100 for k in NUTRIENTS}
        for k, v in part.items():
            total[k] += v
        rows.append({"id": f["id"], "name": f["name"], "grams": grams, "kcal": round(part["kcal"]),
                     "usda": f"https://fdc.nal.usda.gov/food-details/{f['id']}/nutrients",
                     "missing": [k for k in NUTRIENTS if k not in f["per100g"]]})
    return {"foods": rows, "nutrients": nutrient_rows(total, sex), "sources": [FDA_SOURCE, NASA_SOURCE],
            "usda": "USDA FoodData Central, SR Legacy (April 2018). Public domain."}


def nutrient_rows(total, sex):
    women = sex == "female"
    out = []
    for k, (label, unit, group) in NUTRIENTS.items():
        amount = total[k]
        row = {"key": k, "label": label, "unit": unit, "group": group, "amount": round(amount, 2 if amount < 10 else 1)}
        if k in FDA_DV:
            target, kind = FDA_DV[k]
            row["fda"] = {"target": target, "kind": kind, "pct": round(100 * amount / target)}
        if k in NASA:
            men_v, women_v, kind, note = NASA[k]
            target = women_v if women else men_v
            if k == "iron_mg" and women:  # NASA's exception for women under 50 who menstruate
                target, kind = 18, "goal"
                note = "NASA: at least 18 mg for women under 50 who menstruate; otherwise a limit of 8 mg"
            row["nasa"] = {"target": target, "kind": kind, "pct": round(100 * amount / target), "note": note}
        elif k in NASA_PERCENT_NOTE:
            row["nasa"] = {"note": NASA_PERCENT_NOTE[k]}
        out.append(row)
    return out


# ---------- today's log ----------
def _load_log():
    try:
        log = json.loads(LOG_FILE.read_text())
    except (OSError, ValueError):
        log = {}
    if log.get("date") != date.today().isoformat():
        log = {"date": date.today().isoformat(), "plates": []}
    return log


def today(sex):
    log = _load_log()
    items = [it for p in log["plates"] for it in p["items"]]
    result = plate(items, sex)
    result["plates"] = [{"label": p["label"], "at": p["at"], "kcal": plate(p["items"], sex)["nutrients"][0]["amount"]}
                        for p in log["plates"]]
    result["date"] = log["date"]
    return result


def add_to_log(body):
    payload = json.loads(body)
    items = [{"id": int(i["id"]), "grams": float(i["grams"])} for i in payload.get("items", []) if i.get("id")]
    if not items:
        raise ValueError("No foods to log.")
    with _lock:
        log = _load_log()
        log["plates"].append({"label": str(payload.get("label") or "Meal")[:40], "at": time.strftime("%H:%M"), "items": items})
        DATA.mkdir(exist_ok=True)
        LOG_FILE.write_text(json.dumps(log))


def clear_log():
    with _lock:
        LOG_FILE.write_text(json.dumps({"date": date.today().isoformat(), "plates": []}))


# ---------- research papers (optional, needs a SerpApi key) ----------
_evidence_cache = {}


def _serpapi_key():
    if os.environ.get("SERPAPI_API_KEY"):
        return os.environ["SERPAPI_API_KEY"]
    for f in ENV_FILES:
        try:
            for line in f.read_text().splitlines():
                if line.startswith("SERPAPI_API_KEY=") and line.split("=", 1)[1].strip():
                    return line.split("=", 1)[1].strip()
        except OSError:
            continue
    return None


def evidence(nutrient):
    if nutrient not in NUTRIENTS:
        raise ValueError("Unknown nutrient.")
    if nutrient in _evidence_cache:
        return _evidence_cache[nutrient]
    key = _serpapi_key()
    if not key:
        return {"papers": [], "note": "No SerpApi key found, so no paper search."}
    q = f"{NUTRIENTS[nutrient][0].split(' (')[0]} intake spaceflight astronauts"
    url = "https://serpapi.com/search.json?" + urllib.parse.urlencode({"engine": "google_scholar", "q": q, "num": 3, "api_key": key})
    with urllib.request.urlopen(url, timeout=20) as r:
        data = json.load(r)
    papers = [{"title": p.get("title"), "link": p.get("link"),
               "info": (p.get("publication_info") or {}).get("summary", ""), "snippet": p.get("snippet", "")}
              for p in data.get("organic_results", [])[:3]]
    _evidence_cache[nutrient] = {"query": q, "papers": papers, "source": "Google Scholar via SerpApi"}
    return _evidence_cache[nutrient]


# ---------- routing (called by server.py) ----------
def handle(method, path, query, body=b""):
    """Returns (status, content type, body bytes)."""
    q = urllib.parse.parse_qs(query)
    sex = (q.get("sex") or ["male"])[0]
    try:
        if method == "GET" and path == "search":
            result = {"matches": search((q.get("q") or [""])[0], limit=10)}
        elif method == "GET" and path == "today":
            result = today(sex)
        elif method == "GET" and path == "evidence":
            result = evidence((q.get("nutrient") or [""])[0])
        elif method == "POST" and path == "scan":
            if len(body) > MAX_IMAGE * 2:
                return 413, "text/plain", b"Picture too large.\n"
            result = scan(body)
        elif method == "POST" and path == "plate":
            payload = json.loads(body)
            result = plate(payload.get("items", []), payload.get("sex", "male"))
        elif method == "POST" and path == "log":
            add_to_log(body)
            result = {"ok": True}
        elif method == "POST" and path == "clear":
            clear_log()
            result = {"ok": True}
        else:
            return 404, "text/plain", b"Not found.\n"
    except urllib.error.URLError as e:
        return 503, "application/json", json.dumps({"error": f"The food AI is not answering ({e.reason}). Start MedGemma on port 8081."}).encode()
    except (ValueError, KeyError, TypeError, FileNotFoundError) as e:
        return 400, "application/json", json.dumps({"error": str(e)}).encode()
    return 200, "application/json", json.dumps(result).encode()
