/**
 * Dashboard configuration. Keep this file alongside index.html.
 *
 * 'local' reads ./data/risk-locations.json (currently an empty array).
 * 'googleSheetsCsv' reads a publicly accessible, explicitly approved CSV feed.
 * Do not publish sensitive incident-level records or private credentials.
 */
window.DASHBOARD_CONFIG = {
  dataMode: 'local',
  googleSheetCsvUrl: '',
  refreshIntervalMs: 5 * 60 * 1000,
  // Sri Lanka NSDI ArcGIS district-boundary layer. The map still works for
  // approximate district-centre navigation if this external service is offline.
  districtBoundaryUrl: 'https://gisapps.nsdi.gov.lk/server/rest/services/BaseMap/BaseMap/MapServer/3/query?where=1%3D1&outFields=district_name%2Cprovince_name&returnGeometry=true&outSR=4326&f=geojson',
  tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};
