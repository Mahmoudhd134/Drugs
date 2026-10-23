"""One-time load of the shared drug catalog into a migrated ClinicHub database (design M1.7 D11).

Usage:
    python load_catalog.py --connection "host=localhost port=5432 dbname=<db> user=<user> password=<password>"

Reads ../drug-catalog.json and taxonomy.py and, in ONE transaction:
  1. inserts the 23 categories and 182 subcategories with fixed ids (taxonomy.py order, mapped by code:
     "eye" -> 17, "eye.glaucoma" -> 138),
  2. inserts the shared drugs (ClinicId null): the source rows minus those marked "(N/A)", "(N/A YET)",
     "(CANCELLED)" or "(ILLEGAL IMPORT)" and minus the second copy of rows repeated with identical imported fields,
     whitespace normalized in Name, NameAr and ActiveIngredients (every run -> one space, trimmed; blank -> null),
     with the search columns folded exactly as the app's SearchText does,
  3. sets the Categories and SubCategories identity sequences past the fixed ids,
  4. runs ANALYZE "Drugs".
Expected result: 23 categories, 182 subcategories, 23,414 shared drugs, none withdrawn.

"Load once and forget": no guard, no re-run support (a second run fails on the fixed ids and rolls back). Needs
Python 3.10+ and psycopg 3 (pip install "psycopg[binary]"). A change to SearchText's fold table is mirrored in fold().
"""

import argparse
import datetime
import json
import os
import re
import sys

import psycopg

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from taxonomy import TAXONOMY  # noqa: E402

CATALOG = os.path.join(HERE, "..", "drug-catalog.json")
NOT_FOR_SALE = ("(N/A)", "(N/A YET)", "(CANCELLED)", "(ILLEGAL IMPORT)")

# SearchText.Replacements and SearchText.Removed (ClinicHub.Application/Common/Search/SearchText.cs)
REPLACEMENTS = {
    "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ٰ": "ا",
    "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي",
}
REMOVED = {"ـ", *(chr(c) for c in range(0x064B, 0x065F + 1))}
WHITESPACE = re.compile(r"\s+")


def fold(text):
    """SearchText.Fold: lower case, the letter forms unified, tatweel and diacritics dropped."""
    return "".join(REPLACEMENTS.get(c, c) for c in text.lower() if c not in REMOVED)


def other_text(name_ar, active_ingredients):
    """SearchText.OtherText: the two joined by a space (a null as empty), '+' and '(' as spaces, folded."""
    joined = f"{name_ar or ''} {active_ingredients or ''}"
    return fold(joined.replace("+", " ").replace("(", " "))


def normalize(text):
    """Every run of whitespace (line breaks and tabs included) -> one space, trimmed; blank -> None."""
    if text is None:
        return None
    text = WHITESPACE.sub(" ", text).strip()
    return text or None


def main():
    parser = argparse.ArgumentParser(description="Load the shared drug catalog (one time).")
    parser.add_argument("--connection", required=True, help="libpq conninfo: host=... port=... dbname=... user=... password=...")
    args = parser.parse_args()

    category_ids, subcategory_ids, categories, subcategories = {}, {}, [], []
    for category_code, name_en, name_ar, subs in TAXONOMY:
        category_ids[category_code] = len(categories) + 1
        categories.append((category_ids[category_code], name_en, name_ar))
        for sub_code, sub_en, sub_ar in subs:
            code = f"{category_code}.{sub_code}"
            subcategory_ids[code] = len(subcategories) + 1
            subcategories.append((subcategory_ids[code], category_ids[category_code], sub_en, sub_ar))

    with open(CATALOG, encoding="utf-8") as f:
        source = json.load(f)

    drugs, seen = [], set()
    for category in source:
        for sub in category["subCategories"]:
            for row in sub["drugs"]:
                if any(marker in row["nameEn"] for marker in NOT_FOR_SALE):
                    continue
                key = (sub["code"], row["nameEn"], row["nameAr"], row["scientificName"])
                if key in seen:
                    continue
                seen.add(key)
                name = normalize(row["nameEn"])
                name_ar = normalize(row["nameAr"])
                ingredients = normalize(row["scientificName"])
                drugs.append((name, name_ar, ingredients, category_ids[category["code"]], subcategory_ids[sub["code"]],
                              fold(name), other_text(name_ar, ingredients)))

    now = datetime.datetime.now(datetime.timezone.utc)
    with psycopg.connect(args.connection) as connection:
        with connection.transaction(), connection.cursor() as cursor:
            cursor.executemany(
                'INSERT INTO "Categories" ("Id", "NameEn", "NameAr", "CreatedAt", "UpdatedAt") '
                "OVERRIDING SYSTEM VALUE VALUES (%s, %s, %s, %s, %s)",
                [(*c, now, now) for c in categories])
            cursor.executemany(
                'INSERT INTO "SubCategories" ("Id", "CategoryId", "NameEn", "NameAr", "CreatedAt", "UpdatedAt") '
                "OVERRIDING SYSTEM VALUE VALUES (%s, %s, %s, %s, %s, %s)",
                [(*s, now, now) for s in subcategories])
            with cursor.copy(
                    'COPY "Drugs" ("Name", "NameAr", "ActiveIngredients", "CategoryId", "SubCategoryId", '
                    '"SearchName", "SearchOther", "IsWithdrawn", "CreatedAt", "UpdatedAt") FROM STDIN') as copy:
                for drug in drugs:
                    copy.write_row((*drug, False, now, now))
            for table in ("Categories", "SubCategories"):
                cursor.execute(
                    f"SELECT setval(pg_get_serial_sequence('\"{table}\"', 'Id'), (SELECT max(\"Id\") FROM \"{table}\"))")
            cursor.execute('ANALYZE "Drugs"')
    print(f"Loaded {len(categories)} categories, {len(subcategories)} subcategories, {len(drugs)} shared drugs.")


if __name__ == "__main__":
    main()
