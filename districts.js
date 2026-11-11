/* Approximate district capital coordinates for map navigation fallback.
   These are NOT polygon boundaries or drowning site coordinates. */
window.SRI_LANKA_DISTRICTS = [
  ['Ampara',7.2917,81.6739],['Anuradhapura',8.3114,80.4037],
  ['Badulla',6.9934,81.0550],['Batticaloa',7.7170,81.7000],
  ['Colombo',6.9271,79.8612],['Galle',6.0535,80.2210],
  ['Gampaha',7.0917,79.9997],['Hambantota',6.1240,81.1185],
  ['Jaffna',9.6615,80.0255],['Kalutara',6.5854,79.9607],
  ['Kandy',7.2906,80.6337],['Kegalle',7.2513,80.3464],
  ['Kilinochchi',9.3803,80.3770],['Kurunegala',7.4863,80.3647],
  ['Mannar',8.9810,79.9044],['Matale',7.4675,80.6234],
  ['Matara',5.9549,80.5550],['Monaragala',6.8726,81.3507],
  ['Mullaitivu',9.2670,80.8140],['Nuwara Eliya',6.9497,80.7891],
  ['Polonnaruwa',7.9403,81.0188],['Puttalam',8.0362,79.8283],
  ['Ratnapura',6.6828,80.3992],['Trincomalee',8.5874,81.2152],
  ['Vavuniya',8.7514,80.4971]
].map(([name,lat,lng]) => ({ name, lat, lng }));
