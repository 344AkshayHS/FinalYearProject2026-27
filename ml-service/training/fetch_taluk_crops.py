# Downloads crop area for every Karnataka taluk from the Agriculture Census
# (Department of Agriculture & Farmers Welfare, Government of India, https://agcensus.da.gov.in).
#
# Table 6B, "Estimated irrigated and unirrigated area by size classes under crop", is published for
# every tehsil (taluk) and every crop, for the 2010-11 and 2015-16 censuses. The portal has no file
# download (its export button is broken), so this script asks for each report the way the web page
# does and reads the "ALL CLASSES" row: holdings, irrigated, unirrigated and total area in hectares.
#
# For every taluk it also saves table 6A's total, the gross cropped area (all crops together), as the
# row with Census_crop "GROSS CROPPED AREA" - so a crop's share of all the taluk's farmland can be shown.
#
# One report = one crop in one taluk, so a full run is about 176 taluks x 48 crops x 2 years. At one
# taluk at a time it takes about 3 hours per census year; every result is written to the CSV straight
# away, so the script can be stopped at any time and started again - it skips whatever is already saved.
#
# Run from the ml-service folder:  python training/fetch_taluk_crops.py
# One census year only (e.g. to test first whether taluk labels help):  python training/fetch_taluk_crops.py 2015

import csv
import html
import http.cookiejar
import json
import os
import re
import sys
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://agcensus.da.gov.in/"
PAGE = BASE + "TalukCharacteristics.aspx"
OUT_FILE = "data/raw/karnataka_taluk_crop_area.csv"
YEARS = {"2015": "2015-16", "2010": "2010-11"}   # newest first
KARNATAKA = "8a"
ALL_SOCIAL_GROUPS = "4"
PAUSE = 0.5   # seconds between reports, to be gentle with a government server
WORKERS = 1   # taluks fetched at the same time (3 was faster, but the portal started failing under it)

# Census crop names -> the crop names our model uses. Several census crops can make one model crop.
# Cowpea and khesari have no census row, so they cannot get taluk figures.
CROPS = {
    "PADDY": "rice", "JOWAR": "jowar", "BAJRA": "bajra", "MAIZE": "maize", "RAGI": "ragi",
    "WHEAT": "wheat", "BARLEY": "barley",
    "GRAM": "chickpea", "TUR (ARHAR)": "pigeonpea (tur)", "URAD": "black gram", "MOONG": "green gram",
    "MASUR": "lentil", "HORSEGRAM": "horse gram", "MOTH": "moth bean",
    "SUGARCANE": "sugarcane",
    "PEPPER (BLACK)": "black pepper", "CHILLIES": "chilli", "GINGER": "ginger", "TURMERIC": "turmeric",
    "CARDAMOM (SMALL)": "cardamom", "CARDAMOM (LARGE)": "cardamom", "BETELNUTS (ARECANUTS)": "arecanut",
    "MANGOES": "mango", "BANANA": "banana", "TABLE GRAPES": "grapes", "WINE GRAPES (BLACK)": "grapes",
    "CASHEWNUTS": "cashewnut", "POMEGRANATE": "pomegranate",
    "POTATO": "potato", "TAPIOCA (CASSAVA)": "tapioca", "SWEET POTATO": "sweet potato",
    "ONION": "onion", "TOMATO": "tomato",
    "GROUNDNUT": "groundnut", "CASTORSEED": "castor", "SESAMUM (TIL)": "sesame",
    "RAPESEED & MUSTARD (TORIA/TARAMIRA)": "mustard", "LINSEED": "linseed", "COCONUT": "coconut",
    "SUNFLOWER": "sunflower", "SOYABEAN": "soybean", "NIGERSEED": "niger seed",
    "COTTON": "cotton", "JUTE": "jute", "MESTA": "mesta", "TOBACCO": "tobacco", "GUAR": "guar",
    "COFFEE": "coffee",
}
COLUMNS = ["Year", "District_code", "District", "Taluk_code", "Taluk", "Census_crop", "Crop",
           "Holdings", "Irrigated_ha", "Unirrigated_ha", "Area_ha"]
ALL_CROPS = "GROSS CROPPED AREA"


def same_name(name):
    # The two census years space and punctuate a few names differently ("TUR(ARHAR)", "TUR (ARHAR)")
    return re.sub(r"[^A-Z]", "", html.unescape(name).upper())


WANTED = {same_name(census): (census, crop) for census, crop in CROPS.items()}


class Session:
    """One browser-like session on the portal, set to one taluk."""

    def __init__(self, year, district, taluk):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.opener.addheaders = [("User-Agent", "Mozilla/5.0"), ("Referer", PAGE)]
        page = self.open(PAGE).decode(errors="replace")
        self.hidden = {k: html.unescape(v) for k, v in
                       re.findall(r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', page)}
        self.year, self.district, self.taluk = year, district, taluk
        self.call("getDistrict", "{'value':'%s','Text':'KARNATAKA','CallFor':'State','year':'%s'}" % (KARNATAKA, year))
        self.call("getTehsil", "{'value':'%s','Text':'%s','CallFor':'District','stcdu':'%s','year':'%s'}"
                  % (district[0], district[1], KARNATAKA, year))
        crops = self.call("Get_Crop", "{'year':'%s','State':'%s','Level':'TehsilLevel','District':'%s','Tehsil':'%s'}"
                          % (year, KARNATAKA, district[0], taluk[0]))["Crops"] or ""
        self.crops = [item.split(",", 1) for item in crops.split("|") if "," in item]

    def open(self, url, data=None, headers=None):
        request = urllib.request.Request(url, data=data, headers=headers or {})
        with self.opener.open(request, timeout=120) as response:
            self.last_url = response.geturl()
            return response.read()

    def call(self, method, payload):
        answer = self.open(PAGE + "/" + method, payload.encode(), {"Content-Type": "application/json; charset=utf-8"})
        return json.loads(answer.decode())["d"]

    def report(self, crop_code, crop_name, table="6b"):
        """The ALL CLASSES row for one crop (table 6B): holdings, irrigated, unirrigated, total area.
        Table 6A gives the same for all crops together; it ignores the crop, but the portal still checks it."""
        table_name = {"6a": "GROSS CROPPED AREA", "6b": "CROPPING PATTERN"}[table]
        choice = [YEARS[self.year], self.year, table_name, table, "ALL SOCIAL GROUPS", ALL_SOCIAL_GROUPS,
                  html.unescape(crop_name), crop_code, "KARNATAKA", KARNATAKA,
                  self.district[1], self.district[0], self.taluk[1], self.taluk[0]]
        self.call("GetSession", json.dumps({"value1": choice}))
        form = dict(self.hidden)
        field = "ctl00$ContentPlaceHolder1$"
        form.update({field + "ddlYear": self.year, field + "ddlState": KARNATAKA, field + "ddlDistrict": self.district[0],
                     field + "ddlTehsil": self.taluk[0], field + "ddlTables": table,
                     field + "ddlSocialGroup": ALL_SOCIAL_GROUPS, field + "ddlCrop": crop_code,
                     field + "btnSubmit": "Submit"})
        page = self.open(PAGE, urllib.parse.urlencode(form).encode()).decode(errors="replace")
        if "MessagePage" in self.last_url:
            raise Exception("portal refused the request")

        # The report viewer fills its table in a second request, like the page's own script does
        fields = {}
        for tag in re.findall(r"<input[^>]*>", page):
            name = re.search(r'name="([^"]+)"', tag)
            if name and not re.search(r'type="(submit|image|button|checkbox|radio)"', tag):
                value = re.search(r'value="([^"]*)"', tag)
                fields[html.unescape(name.group(1))] = html.unescape(value.group(1)) if value else ""
        fields.update({"__EVENTTARGET": "ReportViewer1$ctl09$Reserved_AsyncLoadTarget", "__EVENTARGUMENT": "",
                       "ScriptManager1": "ScriptManager1|ReportViewer1$ctl09$Reserved_AsyncLoadTarget",
                       "__ASYNCPOST": "true"})
        answer = self.open(self.last_url, urllib.parse.urlencode(fields).encode(),
                           {"X-MicrosoftAjax": "Delta=true",
                            "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"}).decode(errors="replace")
        cells = [html.unescape(c).strip() for c in re.split(r"<[^>]+>", answer)]
        cells = [c for c in cells if c]
        if "No Record Found" in cells:   # the census found no holding growing this crop in the taluk
            return [0, 0, 0, 0]

        # Make sure the table really is for the crop and taluk we asked for
        header = cells[:30]
        if self.taluk[1].strip() not in header or (table == "6b" and same_name(crop_name) not in map(same_name, header)):
            raise Exception("report does not match the request")
        row = cells.index("ALL CLASSES")
        # 6B's row is: holdings, irrigated, unirrigated, total area
        # 6A's row is: holdings, their area, irrigated, unirrigated, total cropped area
        width = 4 if table == "6b" else 5
        values = [0 if value == "Neg" else int(value.replace(",", "")) for value in cells[row + 1: row + 1 + width]]
        return values if table == "6b" else [values[0]] + values[2:]


def taluks(year):
    session = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(method, payload):
        request = urllib.request.Request(PAGE + "/" + method, payload.encode(),
                                         {"Content-Type": "application/json; charset=utf-8", "User-Agent": "Mozilla/5.0"})
        # The portal sometimes times out for a moment (504), so try 3 times like the reports do
        for attempt in range(3):
            try:
                return json.loads(session.open(request, timeout=120).read().decode())["d"]
            except Exception as err:
                if attempt == 2:
                    raise
                print(f"  taluk list: {err} - trying again in 30 s", flush=True)
                time.sleep(30)

    districts = call("getDistrict", "{'value':'%s','Text':'KARNATAKA','CallFor':'State','year':'%s'}" % (KARNATAKA, year))
    for district in [d.split(",", 1) for d in districts["District"].split("|")]:
        tehsils = call("getTehsil", "{'value':'%s','Text':'%s','CallFor':'District','stcdu':'%s','year':'%s'}"
                       % (district[0], district[1], KARNATAKA, year))["Tehsil"] or ""
        for taluk in [t.split(",", 1) for t in tehsils.split("|") if "," in t]:
            yield district, taluk


done = set()
if os.path.exists(OUT_FILE):
    with open(OUT_FILE, newline="", encoding="utf-8") as f:
        done = {(r["Year"], r["District_code"], r["Taluk_code"], r["Census_crop"]) for r in csv.DictReader(f)}
else:
    with open(OUT_FILE, "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerow(COLUMNS)
print(f"Already saved: {len(done)} reports")

write_lock = threading.Lock()


def fetch_taluk(year, district, taluk):
    if (year, district[0], taluk[0], ALL_CROPS) in done:
        return   # the total is fetched last, so this taluk is complete
    session = None
    for attempt in range(3):
        try:
            session = session or Session(year, district, taluk)
            todo = [(code, name) for code, name in session.crops if same_name(name) in WANTED
                    and (year, district[0], taluk[0], WANTED[same_name(name)][0]) not in done]
            if (year, district[0], taluk[0], ALL_CROPS) not in done:
                todo.append((None, ALL_CROPS))
            for code, name in todo:
                if name == ALL_CROPS:
                    census_crop, crop = ALL_CROPS, ""
                    holdings, irrigated, unirrigated, total = session.report(*session.crops[0], table="6a")
                else:
                    census_crop, crop = WANTED[same_name(name)]
                    holdings, irrigated, unirrigated, total = session.report(code, name)
                with write_lock:
                    with open(OUT_FILE, "a", newline="", encoding="utf-8") as f:
                        csv.writer(f).writerow([year, district[0], district[1], taluk[0], taluk[1], census_crop, crop,
                                                holdings, irrigated, unirrigated, total])
                    done.add((year, district[0], taluk[0], census_crop))
                time.sleep(PAUSE)
            break
        except Exception as err:
            print(f"  {YEARS[year]} {district[1]} / {taluk[1]}: {err} - trying again in 30 s", flush=True)
            session = None
            time.sleep(30)
    print(f"{YEARS[year]} {district[1]:18s} {taluk[1]:18s} saved: {len(done)}", flush=True)


# A few taluks at a time: each report is one slow request, but more than this would be unkind to the portal
for year in sys.argv[1:] or YEARS:
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        list(pool.map(lambda place: fetch_taluk(year, *place), list(taluks(year))))

print("Finished:", OUT_FILE)
