/**
 * One-time setup for National Drowning Risk Mapping Dashboard public reports.
 * Run createDrowningCommunityReporting() once from a NEW Apps Script project.
 * It creates a separate Google Form + PRIVATE response spreadsheet.
 * It does NOT alter the official Dashboard Data spreadsheet.
 */
function createDrowningCommunityReporting() {
  const properties = PropertiesService.getScriptProperties();
  const key = 'DROWNING_COMMUNITY_REPORTING_SETUP_V1';
  const prior = properties.getProperty(key);
  if (prior) {
    const saved = JSON.parse(prior);
    console.log('Setup already completed. Form editor: ' + saved.formEditorUrl);
    console.log('Private responses: ' + saved.privateSheetUrl);
    console.log('Copy this publicReporting section into the website config.js:');
    console.log('publicReporting: ' + JSON.stringify(saved.publicReporting, null, 2) + ',');
    return;
  }

  const form = FormApp.create('Report a Dangerous Water Location – Sri Lanka');
  form.setDescription(
    'National Drowning Risk Mapping Dashboard | Injury Prevention & Control Unit, ' +
    'Directorate of Non-Communicable Diseases, Ministry of Health, Sri Lanka.\n\n' +
    'Use this form to suggest a dangerous water location or a correction to an existing map marker. ' +
    'Reports are reviewed before being included on the official map. ' +
    'This is not an emergency-response service. For immediate danger, contact emergency services. ' +
    'Do not enter personal medical or incident-victim details.'
  );
  form.setConfirmationMessage(
    'Thank you. Your report has been received for review. It will not appear on the public map until assessed.'
  );
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);
  form.setAllowResponseEdits(false);
  form.setPublishingSummary(false);

  const privateSheet = SpreadsheetApp.create('Drowning Risk Map – Community Reports (PRIVATE)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, privateSheet.getId());

  const districts = [
    'Ampara','Anuradhapura','Badulla','Batticaloa','Colombo',
    'Galle','Gampaha','Hambantota','Jaffna','Kalutara',
    'Kandy','Kegalle','Kilinochchi','Kurunegala','Mannar',
    'Matale','Matara','Monaragala','Mullaitivu','Nuwara Eliya',
    'Polonnaruwa','Puttalam','Ratnapura','Trincomalee','Vavuniya'
  ];

  const items = {};
  items.reportType = form.addListItem()
    .setTitle('Report type')
    .setChoiceValues(['New location','Correction'])
    .setRequired(true);
  items.locationName = form.addTextItem()
    .setTitle('Water location name')
    .setRequired(true);
  items.district = form.addListItem()
    .setTitle('District')
    .setChoiceValues(districts)
    .setRequired(true);
  items.waterbody = form.addListItem()
    .setTitle('Type of water body')
    .setChoiceValues(['River','Reservoir / Tank','Beach / Sea','Canal','Lake','Well','Other'])
    .setRequired(false);
  items.coordinates = form.addTextItem()
    .setTitle('Location coordinates (latitude, longitude)')
    .setHelpText('Automatically prefilled when reporting from the website map.')
    .setRequired(true);
  items.description = form.addParagraphTextItem()
    .setTitle('Description of danger / correction')
    .setHelpText('For example: dangerous currents, deep water, steep banks or previous near-misses. Avoid identifying individuals.')
    .setRequired(true);
  items.locationId = form.addTextItem()
    .setTitle('Existing map location ID (for corrections)')
    .setRequired(false);
  form.addTextItem()
    .setTitle('Contact email or phone (optional, for clarification only)')
    .setRequired(false);

  if (form.supportsAdvancedResponderPermissions()) {
    form.setPublished(true);
  } else {
    form.setAcceptingResponses(true);
  }

  // Generate Google Forms' entry IDs without submitting any test response.
  const sampleValues = {
    reportType:'New location',
    locationName:'EXAMPLE WATER SITE',
    district:'Colombo',
    waterbody:'River',
    coordinates:'6.9271, 79.8612',
    description:'Example only - not a real report',
    locationId:'EXAMPLE-ID'
  };
  const entryIds = {};
  for (const keyName in sampleValues) {
    const draft = form.createResponse()
      .withItemResponse(items[keyName].createResponse(sampleValues[keyName]));
    const prefillingLink = draft.toPrefilledUrl();
    const match = prefillingLink.match(/[?&](entry\.\d+)=/);
    if (!match) throw new Error('Could not generate prefill field ID for ' + keyName);
    entryIds[keyName] = match[1];
  }

  const publicReporting = {
    formUrl: form.getPublishedUrl(),
    entryIds: entryIds
  };
  const settings = {
    formEditorUrl: form.getEditUrl(),
    privateSheetUrl: privateSheet.getUrl(),
    publicReporting: publicReporting
  };
  properties.setProperty(key, JSON.stringify(settings));

  const setup = privateSheet.getSheets()[0];
  setup.setName('SETUP – READ ME');
  setup.getRange('A1:B5').setValues([
    ['Form editor (PRIVATE)', settings.formEditorUrl],
    ['Public responder form', publicReporting.formUrl],
    ['Response spreadsheet (PRIVATE)', settings.privateSheetUrl],
    ['GitHub config.js entry', 'publicReporting: ' + JSON.stringify(publicReporting) + ','],
    ['IMPORTANT', 'Open the form editor, publish it and set responder access to Anyone with the link (if permitted). Do NOT share this response spreadsheet publicly. Test in an incognito browser window.']
  ]);
  setup.setColumnWidth(1, 240);
  setup.setColumnWidth(2, 560);
  setup.getRange('A1:A5').setFontWeight('bold');

  console.log('FORM EDITOR (keep private): ' + settings.formEditorUrl);
  console.log('PRIVATE RESPONSE SPREADSHEET: ' + settings.privateSheetUrl);
  console.log('PUBLIC RESPONDER FORM: ' + publicReporting.formUrl);
  console.log('SEND THIS CONFIG BLOCK TO CHATGPT FOR THE GITHUB WEBSITE:');
  console.log('publicReporting: ' + JSON.stringify(publicReporting, null, 2) + ',');
  console.log('Remember to set public responder access to Anyone with the link, and test submission.');
}
