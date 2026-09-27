# What each crop needs - soil pH, temperature, rainfall, soil texture and fertility - from FAO EcoCrop, the
# FAO database of crop environmental requirements (https://gaez.fao.org/pages/ecocrop). The CSV copy of the
# database is the one used by the OpenCLIM crop suitability model (github.com/OpenCLIM/ecocrop); it is
# downloaded if missing and not kept on GitHub, the small table written here is.
#
# Two kinds of crops:
#   - every crop the model recommends, so the app can check the model's crops against a farmer's soil test
#     and the local climate;
#   - vegetables, herbs, spices and plantation crops the government statistics do not count, so the model cannot learn
#     them; the app lists those that suit the land by these requirements alone, and says so.
#
# EcoCrop gives an optimal range and an absolute range for each value: inside the optimal range the crop
# does well, outside the absolute range it does not grow.
#
# Output: artifacts/crop_requirements.csv
# Run from the ml-service folder:  python training/read_ecocrop.py

import json
import os
import urllib.request

import pandas as pd

URL = "https://raw.githubusercontent.com/OpenCLIM/ecocrop/main/EcoCrop_DB.csv"
RAW_FILE = "data/raw/ecocrop/EcoCrop_DB.csv"
OUT_FILE = "artifacts/crop_requirements.csv"

# Our crop name -> EcoCrop scientific name
MODEL_CROPS = {
    "rice": "Oryza sativa", "wheat": "Triticum aestivum", "maize": "Zea mays", "jowar": "Sorghum bicolor",
    "bajra": "Pennisetum glaucum", "ragi": "Eleusine coracana ssp. coracana", "barley": "Hordeum vulgare",
    "chickpea": "Cicer arietinum", "pigeonpea (tur)": "Cajanus cajan", "green gram": "Vigna radiata",
    "black gram": "Vigna mungo", "horse gram": "Macrotyloma uniflorum", "lentil": "Lens culinaris",
    "cowpea": "Vigna unguiculata", "field bean (avare)": "Lablab purpureus", "moth bean": "Vigna aconitifolia",
    "khesari": "Lathyrus sativus", "rajma": "Phaseolus vulgaris", "groundnut": "Arachis hypogaea",
    "sunflower": "Helianthus annuus", "soybean": "Glycine max", "mustard": "Brassica juncea", "sesame": "Sesamum indicum",
    "castor": "Ricinus communis", "linseed": "Linum usitatissimum", "niger seed": "Guizotia abyssinica",
    "safflower": "Carthamus tinctorius", "cotton": "Gossypium hirsutum", "sugarcane": "Saccharum officinarum",
    "tobacco": "Nicotiana tabacum", "jute": "Corchorus capsularis", "mesta": "Hibiscus cannabinus",
    "guar": "Cyamopsis tetragonoloba", "coconut": "Cocos nucifera", "arecanut": "Areca catechu", "coffee": "Coffea arabica",
    "black pepper": "Piper nigrum", "cardamom": "Elettaria cardamomum", "cashewnut": "Anacardium occidentale",
    "banana": "Musa acuminata", "mango": "Mangifera indica", "grapes": "Vitis vinifera", "pomegranate": "Punica granatum",
    "papaya": "Carica papaya", "sapota": "Manilkara zapota", "tapioca": "Manihot esculenta", "sweet potato": "Ipomoea batatas",
    "potato": "Solanum tuberosum", "onion": "Allium cepa", "garlic": "Allium sativum", "tomato": "Lycopersicon esculentum",
    "chilli": "Capsicum annuum", "turmeric": "Curcuma longa", "ginger": "Zingiber officinale", "coriander": "Coriandrum sativum",
    "orange": "Citrus sinensis", "pineapple": "Ananas comosus",
}
# Vegetables, herbs, spices and plantation crops grown in Karnataka that the crop statistics do not count:
# our name -> (EcoCrop scientific name, the group the app shows it in)
OTHER_CROPS = {
    "tulsi": ("Ocimum tenuiflorum", "herb"), "ashwagandha": ("Withania somnifera", "herb"),
    "aloe vera": ("Aloe barbadensis", "herb"), "stevia": ("Stevia rebaudiana", "herb"),
    "kalmegh": ("Andrographis paniculata", "herb"), "centella": ("Centella asiatica", "herb"),
    "curry leaf": ("Murraya koenigii", "herb"), "mint": ("Mentha arvensis var. piperascens", "herb"),
    "fenugreek": ("Trigonella foenum-graecum", "herb"), "lemongrass": ("Cymbopogon flexuosus", "herb"),
    "citronella": ("Cymbopogon nardus var. lenabatu", "herb"), "vetiver": ("Vetiveria zizanioides", "herb"),
    "patchouli": ("Pogostemon cablin", "herb"),
    "clove": ("Eugenia aromatica", "spice"), "nutmeg": ("Myristica fragrans", "spice"),
    "cinnamon": ("Cinnamomum verum", "spice"), "vanilla": ("Vanilla planifolia", "spice"),
    "rubber": ("Hevea brasiliensis", "plantation"), "tea": ("Camellia sinensis", "plantation"),
    "cocoa": ("Theobroma cacao", "plantation"), "betel vine": ("Piper betle", "plantation"),
    "drumstick": ("Moringa oleifera", "plantation"),
    # vegetables the Udupi and other district horticulture departments list; the crop statistics count few
    "brinjal": ("Solanum melongena", "vegetable"), "okra": ("Abelmoschus esculentus", "vegetable"),
    "cucumber": ("Cucumis sativus", "vegetable"), "bitter gourd": ("Momordica charantia", "vegetable"),
    "bottle gourd": ("Lagenaria siceraria", "vegetable"), "ridge gourd": ("Luffa acutangula", "vegetable"),
    "pumpkin": ("Cucurbita moschata", "vegetable"), "cabbage": ("Brassica oleracea var. capitata", "vegetable"),
    "cauliflower": ("Brassica oleracea var. botrytis", "vegetable"), "carrot": ("Daucus carota", "vegetable"),
    "radish": ("Raphanus sativus", "vegetable"), "amaranthus": ("Amaranthus tricolor", "vegetable"),
    "spinach": ("Spinacia oleracea", "vegetable"),
    "vegetable cowpea": ("Vigna unguiculata ssp. sesquipedalis", "vegetable"),
}
COLUMNS = {   # EcoCrop column -> ours
    "PHOPMN": "pH_opt_min", "PHOPMX": "pH_opt_max", "PHMIN": "pH_min", "PHMAX": "pH_max",
    "TOPMN": "Temp_opt_min", "TOPMX": "Temp_opt_max", "TMIN": "Temp_min", "TMAX": "Temp_max",
    "ROPMN": "Rain_opt_min", "ROPMX": "Rain_opt_max", "RMIN": "Rain_min", "RMAX": "Rain_max",
    "TEXT": "Texture_opt", "TEXTR": "Texture", "FER": "Fertility", "LISPA": "Life_span", "CAT": "Category",
}

if not os.path.exists(RAW_FILE):
    os.makedirs(os.path.dirname(RAW_FILE), exist_ok=True)
    urllib.request.urlretrieve(URL, RAW_FILE)
ecocrop = pd.read_csv(RAW_FILE, encoding="latin-1")
ecocrop["ScientificName"] = ecocrop["ScientificName"].str.strip()
by_name = ecocrop.drop_duplicates("ScientificName").set_index("ScientificName")

rows = []
for crop, name in MODEL_CROPS.items():
    rows.append({"Crop": crop, "Scientific_name": name, "In_model": True, "Group": "", **by_name.loc[name, list(COLUMNS)]})
for crop, (name, group) in OTHER_CROPS.items():
    rows.append({"Crop": crop, "Scientific_name": name, "In_model": False, "Group": group, **by_name.loc[name, list(COLUMNS)]})
table = pd.DataFrame(rows).rename(columns=COLUMNS)

model_crops = set(json.load(open("artifacts/crop_model_info.json"))["crops"])
missing = model_crops - set(MODEL_CROPS)
table.to_csv(OUT_FILE, index=False)
print(f"Saved {OUT_FILE}: {table['In_model'].sum()} model crops and {(~table['In_model']).sum()} vegetables, herbs, spices "
      f"and plantation crops | model crops without requirements: {sorted(missing) or 'none'}")
print("Values missing in EcoCrop:", table[["pH_min", "Temp_min", "Rain_min"]].isna().sum().to_dict())
