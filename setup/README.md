# Enable public reporting for the National Drowning Risk Mapping Dashboard

The map already has **Report a risk location**, **Place pin**, **Use GPS** and **Suggest correction** functionality. What it lacks is an approved reporting destination. This setup creates a **separate Google Form and private response spreadsheet** with all the field IDs needed for the website to prefill responses.

## One-time setup

1. Open https://script.google.com/home/projects/create and create a **NEW Apps Script project**. Do not delete or replace the geocoding script used by the main dashboard.
2. Copy the complete contents of `create-reporting-form.gs` into the new project's `Code.gs`.
3. Save. Select **createDrowningCommunityReporting** in the function dropdown, click **Run** and grant permission to create Forms and a Spreadsheet in your Google account.
4. In the **Execution log**, copy the `publicReporting: { ... }` configuration block. The same block is stored in the automatically created **Drowning Risk Map – Community Reports (PRIVATE)** sheet, on the `SETUP – READ ME` tab.
5. Open the new Google Form editor. Ensure it is **Published**, accepting responses and its **Responder access** is **Anyone with the link** (subject to the account's administrative policy). Turn OFF **Limit to 1 response**. Do NOT add a file-upload question if you want anonymous submissions.
6. Test the responder link in a private/incognito browser window. Ensure the submitted response appears in the private spreadsheet. Do not make the response spreadsheet public.
7. Add the `publicReporting: { ... }` configuration to `window.DASHBOARD_CONFIG = { ... }` in the existing GitHub repo `config.js`. The dashboard's existing **Continue to reporting form** button will then launch Google Forms with the map pin and entered details prefilled. You can send the block to ChatGPT to have GitHub updated for you.

## Moderation

New public reports go ONLY to the private review spreadsheet and **must not** be published automatically. A Ministry reviewer should verify locations and approve any additions to the public master `Dashboard Data` spreadsheet.

## Privacy and limitation

Google Forms is the actual submission destination, not GitHub Pages. The user must click **Submit** on the Google Form for a report to be received. The public website does not claim submission success simply because the Form opens. Do not collect identifiable victim or patient data. Choose a suitable account owned or approved by the Ministry, and follow institutional information-governance requirements.
