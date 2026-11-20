/**
 * Dashboard configuration. Keep this file alongside index.html.
 *
 * 'local' reads ./data/risk-locations.json (currently an empty array).
 * 'googleSheetsCsv' reads a publicly accessible, explicitly approved CSV feed.
 * Do not publish sensitive incident-level records or private credentials.
 */
window.DASHBOARD_CONFIG = {
  dataMode: 'googleSheetsCsv',
  googleSheetCsvUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS454sTUgu2pbCzVuiDT5XJy6H5ObSGVzBdYbcXT_lbOlg2Ov8CNZ0Vk-fWLFXqcZ4aHee34YA-jl4C/pub?output=csv',
  refreshIntervalMs: 5 * 60 * 1000,
  // Sri Lanka NSDI ArcGIS district-boundary layer. The map still works for
  // approximate district-centre navigation if this external service is offline.
  districtBoundaryUrl: 'https://gisapps.nsdi.gov.lk/server/rest/services/BaseMap/BaseMap/MapServer/3/query?where=1%3D1&outFields=district_name%2Cprovince_name&returnGeometry=true&outSR=4326&f=geojson',
  tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',

  // Public reports are submitted through Google Forms to a PRIVATE review spreadsheet.
  // This does not give visitors write access to the official drowning-risk dataset.
  publicReporting: {
    formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSdusV9Gj28FzjRqJbAjUccDJXWVJeAuPnrpOpjvnE5TyHWyjw/viewform',
    entryIds: {
      reportType: 'entry.1442491595',
      locationName: 'entry.1122762771',
      district: 'entry.80155400',
      waterbody: 'entry.1603544369',
      coordinates: 'entry.2055369712',
      description: 'entry.1230605966',
      locationId: 'entry.1445160712'
    }
  },
};
