// ═══════════════════════════════════════════════════════════════
//  APOLLO LEAD AGENT — Google Apps Script v6.0
// ═══════════════════════════════════════════════════════════════
//  SETUP (one time only):
//  1. Go to script.google.com → New Project → paste this code
//  2. Set your SHEET_ID below
//  3. Save (Ctrl+S)
//  4. Deploy → New Deployment
//     Type: Web App | Execute as: Me | Access: Anyone
//  5. Copy /exec URL → paste in extension popup → Save → Test
// ═══════════════════════════════════════════════════════════════

const SHEET_ID   = 'Your Google Sheet ID Here'; // 🔴 Replace with your Sheet ID
const SHEET_NAME = 'Apollo Leads';
const COLS = ['Timestamp','Person Name','Person LinkedIn','Company Name','Company LinkedIn','Company Website','Apollo URL'];

function doGet(e) {
  try {
    const p = e.parameter;

    // Health check
    if (!p || !p.n) {
      // If action=getUrls, return all Apollo URLs already in the sheet
      if (p && p.action === 'getUrls') {
        const sheet = getSheet();
        const urls  = sheet.getLastRow() < 2
          ? []
          : sheet.getRange(2, 7, sheet.getLastRow() - 1, 1).getValues()
              .map(r => r[0]).filter(Boolean);
        return respond({ status: 'ok', urls });
      }
      return respond({ status: 'ok', message: 'Apollo Lead Agent v6.0 ✅' });
    }

    const sheet = getSheet();
    const url   = decodeURIComponent(p.u || '');

    if (url && isDuplicate(sheet, url)) {
      return respond({ status: 'skipped', message: 'Already saved' });
    }

    sheet.appendRow([
      new Date().toISOString(),
      decodeURIComponent(p.n   || ''),   // Person Name
      decodeURIComponent(p.li  || ''),   // Person LinkedIn
      decodeURIComponent(p.cn  || ''),   // Company Name
      decodeURIComponent(p.cli || ''),   // Company LinkedIn
      decodeURIComponent(p.w   || ''),   // Company Website
      url                                // Apollo URL
    ]);

    // Row formatting
    const row = sheet.getLastRow();
    sheet.getRange(row, 1, 1, COLS.length).setVerticalAlignment('middle');

    return respond({ status: 'success', message: 'Saved: ' + decodeURIComponent(p.n) });

  } catch(ex) {
    return respond({ status: 'error', message: ex.toString() });
  }
}

function doPost(e) {
  try {
    const d     = JSON.parse(e.postData.contents);
    const sheet = getSheet();
    if (d.apolloUrl && isDuplicate(sheet, d.apolloUrl))
      return respond({ status: 'skipped' });
    sheet.appendRow([
      d.timestamp||new Date().toISOString(),
      d.personName||'', d.personLinkedIn||'',
      d.companyName||'', d.companyLinkedIn||'',
      d.companyWebsite||'', d.apolloUrl||''
    ]);
    return respond({ status: 'success', message: 'Saved: ' + d.personName });
  } catch(ex) {
    return respond({ status: 'error', message: ex.toString() });
  }
}

function getSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(COLS);
    const header = sh.getRange(1, 1, 1, COLS.length);
    header.setBackground('#1e293b')
          .setFontColor('#ffffff')
          .setFontWeight('bold')
          .setFontSize(11);
    sh.setFrozenRows(1);
    [160, 180, 300, 180, 300, 240, 340].forEach((w, i) => sh.setColumnWidth(i+1, w));
  }
  return sh;
}

function isDuplicate(sheet, url) {
  if (sheet.getLastRow() < 2) return false;
  const urls = sheet.getRange(2, 7, sheet.getLastRow()-1, 1).getValues();
  return urls.some(r => r[0] === url);
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}