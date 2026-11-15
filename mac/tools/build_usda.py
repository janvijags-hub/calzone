"""Build Calzone's offline food table from USDA FoodData Central (SR Legacy, April 2018 release).

Source (public domain, U.S. Department of Agriculture, Agricultural Research Service):
  https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip
Unzip it into calzone_data/raw/, then run:  python3 tools/build_usda.py
Writes calzone_data/foods.json: every food's nutrients per 100 g, plus its USDA id (fdc_id).
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "calzone_data" / "raw" / "FoodData_Central_sr_legacy_food_csv_2018-04"
OUT = ROOT / "calzone_data" / "foods.json"

# USDA nutrient id -> our short key. Units are USDA's (per 100 g of food).
NUTRIENTS = {
    1008: "kcal", 1003: "protein_g", 1005: "carbs_g", 1004: "fat_g", 1258: "satfat_g",
    1079: "fiber_g", 2000: "sugars_g", 1253: "cholesterol_mg",
    1106: "vit_a_ug", 1162: "vit_c_mg", 1114: "vit_d_ug", 1109: "vit_e_mg", 1185: "vit_k_ug",
    1175: "vit_b6_mg", 1178: "vit_b12_ug", 1190: "folate_dfe_ug",
    1087: "calcium_mg", 1089: "iron_mg", 1090: "magnesium_mg", 1092: "potassium_mg",
    1093: "sodium_mg", 1095: "zinc_mg",
}


def main():
    cats = {r["id"]: r["description"] for r in csv.DictReader(open(RAW / "food_category.csv"))}
    foods = {}
    for r in csv.DictReader(open(RAW / "food.csv")):
        foods[r["fdc_id"]] = {"id": int(r["fdc_id"]), "name": r["description"],
                              "cat": cats.get(r["food_category_id"], ""), "per100g": {}}
    for r in csv.DictReader(open(RAW / "food_nutrient.csv")):
        key = NUTRIENTS.get(int(r["nutrient_id"]))
        food = foods.get(r["fdc_id"])
        if key and food and r["amount"] != "":
            food["per100g"][key] = round(float(r["amount"]), 3)
    rows = [f for f in foods.values() if "kcal" in f["per100g"]]
    OUT.write_text(json.dumps({
        "source": "USDA FoodData Central, SR Legacy (April 2018). Public domain.",
        "url": "https://fdc.nal.usda.gov/",
        "foods": rows,
    }, separators=(",", ":")))
    print(f"{len(rows)} foods -> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
