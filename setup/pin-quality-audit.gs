/**
 * National Drowning Risk Mapping Dashboard — PIN QUALITY AUDIT
 * Add as a NEW Apps Script file in the Google Sheet containing "Dashboard Data".
 * Run auditDrowningMapPins(). Never changes "Dashboard Data".
 * Creates/rebuilds "PIN QA" for human review.
 */
function auditDrowningMapPins() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw new Error('Open your MASTER Google Sheet, then Extensions > Apps Script to run this.');
  const source=ss.getSheetByName('Dashboard Data');
  if(!source)throw new Error('Could not find the sheet named "Dashboard Data".');
  const grid=source.getDataRange().getDisplayValues();
  if(grid.length<2)throw new Error('Dashboard Data contains no records.');
  const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
  const headings=grid[0].map(normalize);
  const col=(...aliases)=>aliases.map(normalize).map(a=>headings.indexOf(a)).find(x=>x>=0);
  const ix={
    id:col('id','locationId'),name:col('locationName','location'),district:col('district'),
    ds:col('dsDivision','ds'),gn:col('gnDivision','gn'),lat:col('latitude','lat'),
    lon:col('longitude','lon','lng'),status:col('Geocoding Status','geocodingStatus'),
    verification:col('Pin Verification','pinVerification','verificationStatus'),
    notes:col('notes','remarks'),water:col('waterbodyType','waterbody')
  };
  if([ix.id,ix.name,ix.district,ix.lat,ix.lon].some(x=>x===undefined))
    throw new Error('Missing required columns: id, locationName, district, latitude, longitude.');
  const get=(row,i)=>i===undefined?'':String(row[i]||'').trim();
  const n=v=>{if(!String(v||'').trim())return null;const x=Number(String(v).replace(/,/g,''));return Number.isFinite(x)?x:null};
  const records=grid.slice(1).map((row,j)=>({
    row:j+2,id:get(row,ix.id),name:get(row,ix.name),district:get(row,ix.district),
    ds:get(row,ix.ds),gn:get(row,ix.gn),lat:n(get(row,ix.lat)),lon:n(get(row,ix.lon)),
    geocode:get(row,ix.status),verified:get(row,ix.verification),
    notes:get(row,ix.notes),water:get(row,ix.water)
  })).filter(r=>r.id||r.name);
  const positionKey=r=>r.lat===null||r.lon===null?null:r.lat.toFixed(5)+'|'+r.lon.toFixed(5);
  const duplicates=new Map();
  for(const r of records){const k=positionKey(r);if(k){if(!duplicates.has(k))duplicates.set(k,[]);duplicates.get(k).push(r);}}
  // Attempt a district polygon check. An outage NEVER leads to a false "verified" status.
  const boundary=loadDrowningDistrictBoundaries_();
  const districtNormalize=s=>String(s||'').toLowerCase().replace(/district|දිස්ත්‍රික්කය|மாவட்டம்/g,'')
    .replace(/moneragala/g,'monaragala').replace(/[^a-z]/g,'');
  const output=[];
  let high=0,medium=0,low=0,unflagged=0;
  const sriLankaBounds=r=>r.lat>=5.7&&r.lat<=10.1&&r.lon>=79.3&&r.lon<=82.2;
  for(const r of records){
    const flags=[];let priority=0;
    const flag=(label,p)=>{flags.push(label);priority=Math.max(priority,p);};
    if(r.lat===null||r.lon===null)flag('MISSING COORDINATES',2);
    else if(!sriLankaBounds(r))flag('OUTSIDE SRI LANKA COORDINATE RANGE',3);
    else {
      const same=(duplicates.get(positionKey(r))||[]).filter(x=>x.name!==r.name||x.id!==r.id);
      if(same.length>=1){
        const uniqueNames=new Set([r,...same].map(x=>x.name.toLowerCase())).size;
        if(uniqueNames>=2)flag('SAME PIN USED FOR '+(same.length+1)+' RECORDS',2);
      }
      if(boundary.features.length){
        const actual=boundary.features
          .filter(f=>insideGeoGeometry_(r.lon,r.lat,f.geometry))
          .map(f=>f.district);
        if(actual.length){
          const expected=districtNormalize(r.district);
          const matches=actual.some(s=>districtNormalize(s)===expected);
          if(!matches){
            const expectedKnown=boundary.features.some(f=>districtNormalize(f.district)===expected);
            if(expectedKnown)flag('DISTRICT MISMATCH: PIN INSIDE '+actual.join('/'),3);
            else flag('DISTRICT NAME NOT RECOGNISED BY BOUNDARY DATA — CHECK',2);
          }
        } else flag('OUTSIDE ALL AVAILABLE DISTRICT POLYGONS — CHECK',2);
      }
    }
    if(!r.ds&&!r.gn)flag('NO DS OR GN INFORMATION',1);
    if(/^(river|tank|lake|reservoir|stream|canal|pond|beach|waterfall|bathing place)$/i.test(r.name))
      flag('GENERIC LOCATION NAME',1);
    if(/verify|review|check|uncertain|approx|unmatched|fuzzy|no match/i.test(r.geocode))
      flag('GEOCODING STATUS: '+r.geocode,2);
    const reviewed=/^verified$|^field verified$|^confirmed$/i.test(r.verified);
    const verification=reviewed?'Recorded as verified':(r.verified||'Verification not documented');
    if(priority===3)high++;
    else if(priority===2)medium++;
    else if(priority===1)low++;
    else unflagged++;
    const link=r.lat===null||r.lon===null?'':'https://www.google.com/maps?q='+r.lat.toFixed(6)+','+r.lon.toFixed(6);
    const action=priority===3?'Check district and source; manually relocate or unmap'
      :priority===2?'Check source and exact water-body position'
      :priority===1?'Confirm location identity and administrative details'
      :'Sample-check against source; absence of flags is not verification';
    output.push([priority===3?'HIGH':priority===2?'MEDIUM':priority===1?'LOW':'NO AUTOMATED FLAG',
      r.id,r.name,r.district,r.ds,r.gn,r.lat,r.lon,flags.join('; ')||'No automatic issue detected',
      r.geocode,link,r.row,r.water,r.notes,verification,action]);
  }
  const sortValue=x=>x[0]==='HIGH'?0:x[0]==='MEDIUM'?1:x[0]==='LOW'?2:3;
  output.sort((a,b)=>sortValue(a)-sortValue(b));
  let audit=ss.getSheetByName('PIN QA');
  if(!audit)audit=ss.insertSheet('PIN QA');
  // A previous failed run may have left merged headings in place.
  audit.setFrozenColumns(0);
  audit.setFrozenRows(0);
  audit.getRange('A1:P5').breakApart();
  audit.clear();
  audit.getRange('A1:P1').merge().setValue('NATIONAL DROWNING RISK MAPPING — PIN QUALITY AUDIT')
    .setBackground('#243B83').setFontColor('#FFFFFF').setFontSize(16).setFontWeight('bold');
  audit.getRange('A2:P2').merge().setValue('Read-only review list. Correct coordinates only in Dashboard Data. This audit does not move or remove pins.')
    .setFontColor('#33415C');
  audit.getRange('A3:P3').merge().setValue(
    'Records: '+records.length+' | High: '+high+' | Medium: '+medium+' | Low: '+low+
    ' | No automatic flag: '+unflagged+' (NOT automatically verified).');
  audit.getRange('A4:P4').merge().setValue(
    'District-boundary test: '+boundary.note+'. Translation errors and exact riverbank positions require local verification.');
  audit.getRange('A5:P5').merge().setValue(
    'Priority HIGH = administrative mismatch / outside Sri Lanka; MEDIUM = shared coordinates or questionable geocoding; LOW = incomplete/vague locality.');
  const header=['Priority','Location ID','Original location name','District','DS division','GN division',
    'Latitude','Longitude','Why flagged','Geocoding status','Open pin in Google Maps',
    'Source spreadsheet row','Water-body type','Source notes','Verification documentation','Recommended action'];
  audit.getRange(6,1,1,16).setValues([header]).setFontWeight('bold')
    .setBackground('#527DD3').setFontColor('#FFFFFF');
  if(output.length)audit.getRange(7,1,output.length,16).setValues(output);
  audit.setFrozenRows(6);
  // Keep rows frozen, but not columns: the title spans A:P.
  audit.getRange(7,7,Math.max(1,output.length),2).setNumberFormat('0.000000');
  audit.getRange(1,1,Math.max(7,output.length+6),16).setVerticalAlignment('middle');
  const widths=[145,140,280,140,165,180,100,100,340,160,300,160,135,300,200,300];
  widths.forEach((width,j)=>audit.setColumnWidth(j+1,width));
  const priorityRange=audit.getRange(7,1,Math.max(1,output.length),1);
  const rules=[
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('HIGH').setBackground('#FCE8E6').setFontColor('#B3261E').setRanges([priorityRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('MEDIUM').setBackground('#FFF1D2').setFontColor('#92400E').setRanges([priorityRange]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('LOW').setBackground('#EAF2FF').setFontColor('#243B83').setRanges([priorityRange]).build()
  ];
  audit.setConditionalFormatRules(rules);
  ss.setActiveSheet(audit);
  console.log('Audit completed. '+records.length+' records; '+high+' high, '+medium+' medium, '+low+' low.');
  console.log('District check: '+boundary.note);
  console.log('Open the PIN QA sheet; edit original data in Dashboard Data ONLY.');
}

// Returns empty polygons on service failure; the audit still works.
function loadDrowningDistrictBoundaries_() {
  const sources=[
    {
      name:'NSDI Sri Lanka',
      url:'https://gisapps.nsdi.gov.lk/server/rest/services/BaseMap/BaseMap/MapServer/3/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&geometryPrecision=4&f=geojson'
    },
    {
      name:'geoBoundaries gbOpen LKA ADM2 (simplified; OpenStreetMap/Wambacher, ODbL 1.0; boundary vintage 2017)',
      url:'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/LKA/ADM2/geoBoundaries-LKA-ADM2_simplified.geojson'
    }
  ];
  const normalize=s=>String(s||'').toLowerCase().replace(/district|දිස්ත්‍රික්කය|மாவட்டம்/g,'')
    .replace(/moneragala/g,'monaragala').replace(/[^a-z]/g,'');
  for(const source of sources){
    try{
      const response=UrlFetchApp.fetch(source.url,{muteHttpExceptions:true,followRedirects:true});
      if(response.getResponseCode()!==200)throw new Error('HTTP '+response.getResponseCode());
      const body=response.getContentText().trim();
      if(!body.startsWith('{'))throw new Error('Response is not JSON (possibly a login or error page)');
      const geo=JSON.parse(body);
      if(!Array.isArray(geo.features))throw new Error('No GeoJSON features');
      const features=geo.features.map(f=>{
        const p=f.properties||{};
        const district=['district_name','DISTRICT_NAME','District','district','dist_name',
          'DIST_NAME','ADM2_EN','NAME_2','shapeName','name','Name'].map(k=>p[k]).find(Boolean);
        return {district:String(district||''),geometry:f.geometry};
      }).filter(f=>f.district&&f.geometry&&['Polygon','MultiPolygon'].includes(f.geometry.type));
      const names=new Set(features.map(f=>normalize(f.district)).filter(Boolean));
      if(names.size!==25)throw new Error('Expected 25 unique named district polygons, got '+names.size);
      return {features,note:features.length+' features for 25 districts loaded from '+source.name};
    }catch(error){
      console.warn(source.name+' unavailable: '+error.message);
    }
  }
  return {features:[],note:'Both boundary sources unavailable — district mismatch checks skipped; other checks completed'};
}

// WGS84 GeoJSON coordinates are always [longitude,latitude]. Supports holes.
function insideGeoGeometry_(lon,lat,geom) {
  if(!geom||!Array.isArray(geom.coordinates))return false;
  if(geom.type==='Polygon')return insidePolygon_(lon,lat,geom.coordinates);
  if(geom.type==='MultiPolygon')return geom.coordinates.some(p=>insidePolygon_(lon,lat,p));
  return false;
}
function insidePolygon_(lon,lat,rings) {
  if(!Array.isArray(rings)||!rings.length)return false;
  if(!insideRing_(lon,lat,rings[0]))return false;
  return !rings.slice(1).some(hole=>insideRing_(lon,lat,hole));
}
function insideRing_(lon,lat,ring) {
  let isInside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=Number(ring[i][0]),yi=Number(ring[i][1]);
    const xj=Number(ring[j][0]),yj=Number(ring[j][1]);
    if((yi>lat)!==(yj>lat) && lon<(xj-xi)*(lat-yi)/(yj-yi)+xi)isInside=!isInside;
  }
  return isInside;
}
