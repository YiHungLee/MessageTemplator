/**
 * MessageTemplator - GAS 雲端同步腳本
 *
 * 使用方式：
 * 1. 建立一個 Google Spreadsheet
 * 2. 在 Apps Script 編輯器中貼上此程式碼
 * 3. 部署為網頁應用程式（存取權限：「所有人」）
 * 4. 將部署 URL 貼到 app.py 的 GAS_URL 常數
 */

function doGet(e) {
  var sheet = getOrCreateSheet();
  var data = sheet.getRange('A1').getValue() || '[]';
  return ContentService.createTextOutput(data)
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var sheet = getOrCreateSheet();
  var data = e.postData.contents;
  sheet.getRange('A1').setValue(data);
  return ContentService.createTextOutput(
    JSON.stringify({ success: true })
  ).setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Templates');
  if (!sheet) {
    sheet = ss.insertSheet('Templates');
    sheet.getRange('A1').setValue('[]');
  }
  return sheet;
}
