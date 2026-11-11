# National Drowning Risk Mapping Dashboard — Prototype v2 — Royal Blue & Silver Grey

A VS Code–ready, static website prototype for the Injury Prevention & Control Unit, Directorate of Non-Communicable Diseases, Ministry of Health, Sri Lanka.

**This is a development prototype, not an official public safety map.** It intentionally contains **no drowning risk locations or incident counts**. We will connect the confirmed location registry later.

## What's included

- Professional responsive homepage and Ministry of Health attribution (without using an official emblem)
- National interactive base map with district selection and zoom
- District boundary *attempt* using the Sri Lanka National Spatial Data Infrastructure (NSDI) public boundary service; if that remote service is unavailable, selecting a district still zooms to its approximate district capital / town
- 25-district explorer
- High-risk map layer visible by default; optional lower-risk and unclassified layers
- Optional crocodile-warning symbol on reported locations
- Searchable location directory (appears as an empty state until data are added)
- District summary cards and district ranking when data arrive
- Water Safety, About, Data Notes
- Two alternative dataset modes: local JSON or public/approved Google Sheets CSV
- Ready for GitHub Pages; no build step or backend server needed

## Open the site on your computer

1. Extract the ZIP file to a folder.
2. Open the folder in **Visual Studio Code**.
3. Install the free **Live Server** VS Code extension, then right-click `index.html` → **Open with Live Server**.

Alternatively, from a terminal in this folder:

```bash
python -m http.server 5500
```

Then visit `http://localhost:5500/` in your browser. Do **not** double-click `index.html` using `file://`, because browsers often block the local JSON fetch.

**An internet connection is required** for Leaflet's CDN, OpenStreetMap basemap tiles and the NSDI district boundary service. If the district boundary service is temporarily unavailable, the district selector still navigates using approximate district-town coordinates (not administrative boundary shapes).

## File structure

```
index.html                 Homepage and other screens
styles.css                 Layout, typography, mobile design
app.js                     Map, navigation, filters, records, automatic refresh
config.js                  Data source and mapping settings
districts.js               District names + approximate town positions
.nojekyll                  GitHub Pages publishing support
/data/risk-locations.json  Empty until confirmed locations are added
/data/locations-template.csv   Header-only schema for later data entry
```

## Adding locations later

Once the locations and coordinates are confirmed, populate `data/risk-locations.json` with records like this **illustrative format only** (replace placeholders with confirmed information):

```json
[
  {
    "id": "LOCATION-001",
    "locationName": "[confirmed water location]",
    "district": "[district name]",
    "mohArea": "[MOH area]",
    "dsDivision": "",
    "gnDivision": "",
    "riskLevel": "high",
    "waterbodyType": "river",
    "latitude": null,
    "longitude": null,
    "crocodileHazard": false,
    "notes": "",
    "source": "district report",
    "reportYear": "2024"
  }
]
```

**Do not put the above illustrative record into your live data file.** Until valid numeric coordinates are entered, records can appear in the directory but not as map pins. Accepted `riskLevel` values: `high`, `low`, or `unknown`. The map displays **high risk** by default.

### Later: connect Google Sheets without Apps Script

The default in `config.js` is:

```js
dataMode: 'local',
googleSheetCsvUrl: '',
```

To read an **approved and publicly accessible** Google Sheets CSV feed:

1. Prepare a Google Sheet with column headings matching `data/locations-template.csv`.
2. Publish **only a separate, approved public-data sheet** as CSV (not private surveillance records). Copy the resulting CSV feed URL.
3. Change `config.js` to `dataMode: 'googleSheetsCsv'` and set `googleSheetCsvUrl` to that URL.
4. The browser will attempt to load it on opening and again every five minutes while open.

Important: Google Sheets feeds may have publication/cache delays and cross-origin limitations. We will test the actual Sheet URL before declaring automatic synchronization complete. You do not need to rewrite the website when adding data. Do not put Google API credentials or any private patient/incident data into a public repository.

## Publish on GitHub Pages

1. Create a **public** GitHub repository (for GitHub Free).
2. Upload the **contents** of this folder to the root of the repository. `index.html` must be in the root.
3. Open **Settings → Pages → Build and deployment**.
4. Select **Deploy from a branch → main → /(root)** and save.
5. The resulting website will have an address such as `https://username.github.io/repository-name/`.

GitHub Pages serves the exact static website and can later be replaced with ministry-hosted or other hosting with minor configuration changes.

## Data meaning and public safety

- “High-risk” and “lower-risk” are descriptions reported by district health authorities; they are **not** calculated incidence rates.
- The reports include material from 2024 and some earlier periods. Do not present all records as current or contemporaneous.
- “Lower-risk” **must not** be interpreted as permission or an assurance that swimming is safe.
- Other hazards (e.g. crocodiles) are optional site attributes when documented, not national crocodile attack statistics.
- A missing pin means the coordinates are absent or the marker is filtered, not that a district is risk-free.
- Only verified, approved non-sensitive site information should be made publicly accessible.

## Mapping sources / credits

- Basemap: © OpenStreetMap contributors (attribution appears on the map).
- JavaScript map engine: Leaflet 1.9.4, BSD-2-Clause, https://leafletjs.com/.
- District boundary layer (requested at runtime, not bundled or redistributed): National Spatial Data Infrastructure of Sri Lanka, `https://gisapps.nsdi.gov.lk/server/rest/services/BaseMap/BaseMap/MapServer/3` (District Boundary layer). External service availability, permission for reuse and quality should be verified before official deployment.
- Fallback district navigation locations represent approximate district towns, not district centroids or polygon boundaries.

## Next development priorities

1. Review the design on your computer and adjust typography/branding.
2. Confirm district-boundary loading and test actual 25 district polygons in your network.
3. Prepare an approved locations Google Sheet including coordinates and risk classification.
4. Add the data and test all district filters, pins and warnings.
5. Test on mobile and arrange any required institutional approval before public release.


## Visual theme — Royal Blue & Silver Grey

The user-approved brand palette is:

- Primary royal blue: `#243B83` (navigation and branding)
- Secondary blue: `#527DD3` (links and interactive accents)
- Steel blue: `#8FA7C3` (neutral supporting details)
- Silver-grey canvas: `#F3F5F9` (page background)
- High-risk site pins: RED `#D54E49` (do not recolour as part of the brand theme)
- Lower-risk site pins: BLUE `#2877B8` (do not recolour as part of the brand theme)

The underlying map logic, layout, empty-data behaviour and risk-category definitions are unchanged from v1.
