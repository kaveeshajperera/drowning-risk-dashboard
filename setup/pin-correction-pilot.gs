/**
 * Drowning-risk map — Location Correction pilot (21 high-priority records).
 * Run createDrowningPinReviewQueue() in the MASTER spreadsheet's Apps Script.
 * Reads PIN QA only. Creates a private PIN CORRECTIONS tab; does not alter
 * Dashboard Data, current pins, or any publishing settings.
 * Refined search queries are suggestions, NOT verified locations.
 */
function createDrowningPinReviewQueue() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Run this from the Apps Script project bound to your master spreadsheet.');
  const qa = ss.getSheetByName('PIN QA');
  if (!qa || qa.getLastRow() < 7) throw new Error('Run the comprehensive pin quality audit first.');
  const tab = 'PIN CORRECTIONS';
  if (ss.getSheetByName(tab)) {
    ss.setActiveSheet(ss.getSheetByName(tab));
    console.log('PIN CORRECTIONS already exists. Existing review work preserved; no changes made.');
    return;
  }

  // Search strings are locality clues only; no personal names or household
  // descriptions are included in external search links.
  const plans = {
    'GAMPAHA-014-1': ['Ambepussa Bridge Maha Oya Sri Lanka','Point / boundary','Check which riverbank or bridge approach the report refers to; the boundary flag alone is not proof of an error.'],
    'KURUNAGELA-034-1': ['Maha Oya Giriulla Kurunegala Sri Lanka','Point / boundary','Identify the named landmark and actual bathing place; shared river coordinates are not sufficient.'],
    'KURUNAGELA-046-1': ['Pallandeniya Mawathagama Kurunegala Sri Lanka','Point','Locate the abandoned quarry behind the GN office with a local officer. Do not use the village centre.'],
    'AMPARA-015-1': ['Helagampura Ampara Sri Lanka','Multiple points','Original record contains multiple locations. Ask the district team to separate and verify them; do not replace with one point.'],
    'PUTTALAM-011-1': ['Maha Oya Puttalam District Sri Lanka','Extent unknown','Ask which river reach or bathing place was reported. Do not use a generic river pin.'],
    'PUTTALAM-038-1': ['Kala Oya Puttalam District Sri Lanka','Extent unknown','Ask which river reach or bathing place was reported; check administrative boundary.'],
    'PUTTALAM-042-1': ['Sindathriya Maha Oya mouth Ulhitiyawa Sri Lanka','Line / coastal stretch','Confirm both endpoints with district officers. One coordinate cannot represent the entire reported stretch.'],
    'PUTTALAM-043-1': ['Thoppu Thota Maha Oya Sindathriya Sri Lanka','Line / river reach','Confirm both endpoints and the relevant riverbank.'],
    'MULLAITIVU-011-1': ['Maruthamadu Kulam Mullaitivu Sri Lanka','Water body / extent unknown','Confirm tank identity and whether the risk applies to a particular access point or the entire tank.'],
    'BATTICALOA-008-1': ['Verugal Main Beach Sri Lanka','Area / boundary','Confirm the reported beach segment and reporting jurisdiction.'],
    'RATNAPURA-002-2': ['Diyawinna Diyawini Dola Ratnapura Sri Lanka','Point','Find the specific bathing place described in the original text; do not use the village centre.'],
    'RATNAPURA-027-1': ['Bopetta Ganga Lellopitiya Ratnapura Sri Lanka','Extent unknown','Check spelling, river identity and exact access point.'],
    'RATNAPURA-039-1': ['Duwili Ella Nandanagama Ratnapura Sri Lanka','Point','Confirm the specific waterfall and river named in the source; similar waterfalls exist.'],
    'RATNAPURA-044-2': ['Pimbura Ella Ratnapura Sri Lanka','Point','Confirm waterfall identity with the district team.'],
    'RATNAPURA-047-1': ['Gawaragiriya Ratnapura Sri Lanka','Extent unknown','Identify the actual water body; a village name is not an exact hazard location.'],
    'RATNAPURA-047-2': ['Ellahena Ukwatta Kanda Ratnapura Sri Lanka','Line / stream','Confirm the stream between the two villages and the relevant section.'],
    'RATNAPURA-060-2': ['Waleboda North Imbulpe Walawe Ganga Ratnapura Sri Lanka','Point / river reach','Locate the GN office and confirm the adjacent Walawe river section.'],
    'RATNAPURA-061-1': ['Bolthumbe Oya Pinnawala Imbulpe Ratnapura Sri Lanka','Point','Confirm the location of Aliya Wetunu Wala; do not use Pinnawala in Kegalle.'],
    'MATARA-009-1': ['Hiriketiya Pehembiya Dickwella Matara Sri Lanka','Point / beach area','Clarify whether the source means Hiriketiya, Pehembiya, or a broader beach area.'],
    'MATARA-011-1': ['Kudawella Dickwella Tangalle Sri Lanka','Extent unknown / boundary','Check the intended water location and reporting district before making changes.'],
    'MATARA-059-1': ['Baliyagoda Welipitiya Matara Sri Lanka','Extent unknown','Confirm spelling and locality, then identify the water body.']
  };
  const src = qa.getRange(6, 1, qa.getLastRow()-5, 16).getValues();
  const h = src[0].map(v=>String(v).trim());
  const needed = ['Priority','Location ID','Original location name','District','Latitude','Longitude','Why flagged','Open pin in Google Maps','Source spreadsheet row'];
  for (const field of needed) if (!h.includes(field)) throw new Error('PIN QA missing column: '+field);
  const at = (row,name)=>row[h.indexOf(name)];
  const safe = v=>typeof v==='string' && /^[=+\-@]/.test(v)? "'"+v:v;
  const rows = [];
  for (const r of src.slice(1)) {
    if (String(at(r,'Priority')).trim()!=='HIGH') continue;
    const id = String(at(r,'Location ID')).trim();
    const plan = plans[id] || ['', 'Extent unknown', 'Consult original district report and local officers before proposing coordinates.'];
    const link = plan[0] ? 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(plan[0]) : '';
    rows.push([
      safe(id),safe(at(r,'District')),safe(at(r,'Original location name')),
      at(r,'Latitude'),at(r,'Longitude'),safe(at(r,'Why flagged')),
      plan[0],plan[1],link,'','','','NOT REVIEWED','',plan[2],
      safe(at(r,'Open pin in Google Maps')),at(r,'Source spreadsheet row'),'',''
    ]);
  }
  if (!rows.length) throw new Error('No HIGH records found. Run the comprehensive audit and check its results.');
  const sheet = ss.insertSheet(tab);
  const headers = ['Location ID','Reported district','Original description','Current latitude','Current longitude','Audit flag','Refined search query (unverified)','Geometry / scope (provisional)','Search candidate area','Candidate latitude','Candidate longitude','Open candidate pin','Review decision','Verification evidence / source','Review guidance','Open current pin','Master source row (reference only)','Reviewer','Review date'];
  sheet.getRange(1,1,1,headers.length).setValues([headers]).setBackground('#243B83').setFontColor('#FFFFFF').setFontWeight('bold').setWrap(true);
  sheet.setRowHeight(1,48);
  sheet.getRange(2,1,rows.length,headers.length).setValues(rows).setVerticalAlignment('top');
  sheet.getRange(2,4,rows.length,2).setNumberFormat('0.000000');
  sheet.getRange(2,10,rows.length,2).setNumberFormat('0.000000').setBackground('#EAF2FF');
  sheet.getRange(2,12,rows.length,1).setFormulas(rows.map((_,i)=>{
    const n=i+2;
    return ['=IF(AND(ISNUMBER(J'+n+'),ISNUMBER(K'+n+')),HYPERLINK("https://www.google.com/maps?q="&J'+n+'&","View candidate"),"")'];
  }));
  const decisions=['NOT REVIEWED','CANDIDATE IDENTIFIED','NEEDS LOCAL VERIFICATION','CONFIRMED POINT','CONFIRMED NON-POINT / MULTIPLE','WITHHOLD PIN','RETAIN EXISTING PIN'];
  const rule=SpreadsheetApp.newDataValidation().requireValueInList(decisions,true).setAllowInvalid(false).build();
  sheet.getRange(2,13,rows.length,1).setDataValidation(rule).setBackground('#FFF1D2');
  sheet.getRange(2,19,rows.length,1).setNumberFormat('yyyy-mm-dd');
  [155,130,320,110,110,320,300,175,260,110,110,135,210,280,340,260,120,155,120].forEach((w,i)=>sheet.setColumnWidth(i+1,w));
  [3,6,7,8,14,15].forEach(c=>sheet.getRange(2,c,rows.length,1).setWrap(true));
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);
  sheet.getRange(1,1,rows.length+1,headers.length).createFilter();
  ss.setActiveSheet(sheet);
  SpreadsheetApp.flush();
  console.log('Created PIN CORRECTIONS with '+rows.length+' HIGH-priority records.');
  console.log('All candidate coordinates blank. No changes to Dashboard Data or public website.');
  console.log('Review manually; a locality search result is NOT an exact hazard pin.');
}
