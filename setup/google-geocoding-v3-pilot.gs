/**
 * Small Google Maps geocoding comparison, using existing English search queries.
 * Evaluation only: no coordinates, formatted addresses, Google place IDs or
 * raw responses are stored, exported, or transferred to the Leaflet dashboard.
 * Logs aggregate counts only. No changes to any spreadsheet cells.
 * Run testGoogleGeocodingV3() from the existing bound Apps Script project.
 */
function testGoogleGeocodingV3(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const input=ss&&ss.getSheetByName('LANGUAGE REVIEW');
  if(!input||input.getLastRow()<2)throw new Error('LANGUAGE REVIEW not found.');
  const data=input.getRange(1,1,input.getLastRow(),input.getLastColumn()).getValues();
  const head=data.shift().map(x=>String(x).trim());
  const names=['Location ID','District','Primary geocoding query','Alternative geocoding query','Lookup status','Audit priority'];
  const ix=names.map(n=>head.indexOf(n));
  if(ix.some(x=>x<0))throw new Error('Missing required headers: '+names.filter((_,i)=>ix[i]<0).join(', '));
  const rows=data.map(r=>ix.map(i=>r[i])).filter(r=>r[0]);
  const pilot=rows.map((r,i)=>({r,i})).sort((a,b)=>Number(b.r[5]==='HIGH')-Number(a.r[5]==='HIGH')||a.i-b.i).slice(0,25);
  const norm=v=>String(v||'').toLowerCase().replace(/district/g,'').replace(/moneragala/g,'monaragala').replace(/[^a-z]/g,'');
  const geocoder=Maps.newGeocoder().setRegion('lk').setLanguage('en');
  const counts={'Specific feature or address, district reported as matching':0,'Specific feature or address, district unresolved':0,'Coarse locality / route / approximate result':0,'District conflict or outside Sri Lanka':0,'No result':0,'Skipped: insufficient or sensitive query':0,'Request error':0};
  let requests=0,processed=0;
  for(const {r} of pilot){
    if(String(r[4]||'').startsWith('HOLD')){counts['Skipped: insufficient or sensitive query']++;processed++;continue;}
    const queries=[...new Set([r[2],r[3]].map(v=>String(v||'').trim()).filter(Boolean))];
    if(!queries.length||queries.some(q=>/\b(?:mr|mrs|miss|dr)\.?\s|\b(?:private residence|private house|house of|residence of|home of)\b/i.test(q))){
      counts['Skipped: insufficient or sensitive query']++;processed++;continue;
    }
    let best=0,failed=false;
    for(let q of queries){
      if(!/sri\s+lanka/i.test(q))q+=', Sri Lanka';
      let response;
      try{requests++;response=geocoder.geocode(q);}catch(e){failed=true;break;}
      if(response.status==='ZERO_RESULTS')continue;
      if(response.status!=='OK'){failed=true;break;}
      for(const result of (response.results||[])){
        const components=result.address_components||[];
        const country=components.find(c=>(c.types||[]).includes('country'));
        const districts=components.filter(c=>(c.types||[]).includes('administrative_area_level_2'));
        if(!country||String(country.short_name).toUpperCase()!=='LK'){
          best=Math.max(best,1);continue;
        }
        const districtMatch=districts.some(c=>norm(c.long_name)===norm(r[1])||norm(c.short_name)===norm(r[1]));
        if(districts.length&&!districtMatch){best=Math.max(best,1);continue;}
        const type=result.types||[],precision=result.geometry&&result.geometry.location_type;
        const specific=!result.partial_match&&['ROOFTOP','RANGE_INTERPOLATED','GEOMETRIC_CENTER'].includes(precision)&&type.some(t=>['point_of_interest','establishment','natural_feature','premise','street_address'].includes(t));
        best=Math.max(best,specific?(districtMatch?4:3):2);
      }
      Utilities.sleep(200);
    }
    const labels=['No result','District conflict or outside Sri Lanka','Coarse locality / route / approximate result','Specific feature or address, district unresolved','Specific feature or address, district reported as matching'];
    counts[failed&&best===0?'Request error':labels[best]]++;
    processed++;
  }
  console.log('Google Maps V3 comparison: '+processed+' pilot records; '+requests+' geocode requests.');
  console.log(JSON.stringify(counts));
  console.log('Specificity is not proof of a correct hazard. District check uses returned address components, not independent boundary polygons.');
  console.log('No Google coordinates or raw results retained. No spreadsheet or public map changes.');
}
