"""
Synthetic noisy review dataset for ReviewSense demos (Hack Malenadu '26).
Outputs three CSV files under reviewsense/data/.
"""
import csv
import random
from pathlib import Path

random.seed(42)

OUT_DIR = Path(__file__).resolve().parent

PHONE_TEMPLATES_EARLY = [
    "TechX Pro 5G camera is sharp and low light photos look great.",
    "Display is bright and colors pop, gaming feels smooth.",
    "Performance is fast for daily apps and no lag noticed.",
    "Build feels premium in hand, metal frame is solid.",
    "Battery lasts full day with light use, no heating issues.",
    "Charging speed is okay, reaches fifty percent in thirty minutes.",
]

PHONE_BATTERY_NEG_EARLY = [
    "Battery is average, needs charge by evening.",
]

PHONE_TEMPLATES_LATE = [
    "Camera still good but battery drains way faster than before.",
    "Screen is nice but overnight the phone loses twenty percent idle battery.",
    "Performance okay but battery backup is poor now.",
]

PHONE_BATTERY_NEG_LATE = [
    "Battery drains in half day even on wifi, very disappointing.",
    "Battery health seems bad, drops from eighty to twenty in hours.",
    "Charging does not hold, battery dies fast while browsing.",
    "Overnight drain is terrible, battery issue is real.",
]

FOOD_PACK_EARLY = [
    "NutriMax tastes great with milk, mixes easily.",
    "Protein content feels adequate for the price.",
    "Fresh vanilla smell, no chalky aftertaste.",
]

FOOD_PACK_NEG_EARLY = [
    "Packaging was slightly dented but seal intact.",
]

FOOD_TEMPLATES_LATE = [
    "Taste is still good but box arrived crushed.",
    "Powder fine but outer pouch torn and tape resealed.",
]

FOOD_PACK_NEG_LATE = [
    "Packaging completely damaged, powder spilled in transit.",
    "Box smashed open, had to throw away leaking pouch.",
    "Seal broken on arrival, unsafe packaging.",
    "Outer wrap torn and inner bag punctured, poor packaging.",
]

CLOTHING = [
    "UrbanFit shirt fabric is soft, colors match photos.",
    "Fit is relaxed as described, good for casual wear.",
    "Delivery arrived on time from Mumbai warehouse.",
    "Size medium fits well, sleeve length perfect.",
    "Color faded slightly after first wash.",
]

HINDI_SAMPLES = [
    "bahut accha product hai lekin battery fast drain hoti hai",
    "delivery jaldi thi lekin packaging damage tha",
    "taste acha hai quantity kam lagti hai",
    "camera accha hai lekin price thoda zyada hai",
]

HINGLISH = [
    "Delivery ekdum fast thi but packaging damage tha",
    "Battery backup thoda weak hai otherwise phone solid hai",
    "Taste mast hai but box thoda crush ho gaya tha",
]

SARCASTIC = [
    "Oh great, battery died in two hours thumbs up",
    "Love how the packaging was basically confetti amazing job",
]

EMOJI_REVIEWS = [
    "\U0001f4e6 packaging was \U0001f494 disappointing, seal broken",
    "delivery \u26a1 fast but \U0001f44e box crushed",
]

TYPOS = [
    "baterry is vry bad drains super quick",
    "pkng was terible box opend already",
]

BOT_DUP = "great product highly recommend five stars"
BOT_SHORT = "good"


def pick(r: random.Random, pool, p: float) -> bool:
    return r.random() < p


def write_csv(path: Path, rows: list):
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["review_text", "rating", "review_date", "reviewer_location"])
        w.writeheader()
        for row in rows:
            w.writerow(row)


def gen_smartphone(n=120):
    r = random.Random(1)
    rows = []
    for i in range(1, n + 1):
        loc = random.choice(["Bangalore", "Mysuru", "Pune", "Mumbai", "Delhi"])
        dt = f"2026-01-{i % 28 + 1:02d}"
        text = None
        if i <= 70:
            if pick(r, None, 0.10):
                text = r.choice(PHONE_BATTERY_NEG_EARLY)
            else:
                text = r.choice(PHONE_TEMPLATES_EARLY)
        else:
            if pick(r, None, 0.42):
                text = r.choice(PHONE_BATTERY_NEG_LATE)
            else:
                text = r.choice(PHONE_TEMPLATES_LATE)
        if pick(r, None, 0.15):
            text = r.choice(HINDI_SAMPLES)
        if pick(r, None, 0.10):
            text = r.choice(HINGLISH)
        if pick(r, None, 0.05) and i > 5:
            text = BOT_DUP if i % 2 == 0 else BOT_SHORT
        if pick(r, None, 0.05):
            text = r.choice(SARCASTIC)
        if pick(r, None, 0.10):
            text = r.choice(EMOJI_REVIEWS)
        if pick(r, None, 0.08):
            text = r.choice(TYPOS)
        rows.append({"review_text": text, "rating": random.randint(3, 5), "review_date": dt, "reviewer_location": loc})
    write_csv(OUT_DIR / "TechX_Pro_5G_reviews.csv", rows)


def gen_food(n=100):
    r = random.Random(2)
    rows = []
    for i in range(1, n + 1):
        loc = random.choice(["Bengaluru", "Mumbai", "Kochi", "Hyderabad"])
        dt = f"2026-02-{(i % 27) + 1:02d}"
        if i <= 60:
            if pick(r, None, 0.08):
                text = r.choice(FOOD_PACK_NEG_EARLY)
            else:
                text = r.choice(FOOD_PACK_EARLY)
        else:
            if pick(r, None, 0.38):
                text = r.choice(FOOD_PACK_NEG_LATE)
            else:
                text = r.choice(FOOD_TEMPLATES_LATE)
        if pick(r, None, 0.15):
            text = r.choice(HINDI_SAMPLES)
        if pick(r, None, 0.10):
            text = r.choice(HINGLISH)
        if pick(r, None, 0.05):
            text = BOT_DUP
        if pick(r, None, 0.05):
            text = r.choice(SARCASTIC)
        if pick(r, None, 0.10):
            text = r.choice(EMOJI_REVIEWS)
        if pick(r, None, 0.08):
            text = r.choice(TYPOS)
        rows.append({"review_text": text, "rating": random.randint(2, 5), "review_date": dt, "reviewer_location": loc})
    write_csv(OUT_DIR / "NutriMax_reviews.csv", rows)


def gen_clothing(n=80):
    r = random.Random(3)
    rows = []
    for i in range(1, n + 1):
        loc = random.choice(["Chennai", "Ahmedabad", "Jaipur"])
        dt = f"2026-03-{(i % 26) + 1:02d}"
        text = r.choice(CLOTHING)
        if pick(r, None, 0.15):
            text = r.choice(HINDI_SAMPLES)
        if pick(r, None, 0.10):
            text = r.choice(HINGLISH)
        if pick(r, None, 0.05):
            text = BOT_DUP
        rows.append({"review_text": text, "rating": random.randint(3, 5), "review_date": dt, "reviewer_location": loc})
    write_csv(OUT_DIR / "UrbanFit_shirt_reviews.csv", rows)


def main():
    print("[generate_dataset] Writing ReviewSense demo CSVs to", OUT_DIR)
    gen_smartphone(120)
    gen_food(100)
    gen_clothing(80)
    print("[generate_dataset] Done: 300 rows total across 3 files.")


if __name__ == "__main__":
    main()
