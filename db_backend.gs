/**
 * PairMap - Google Apps Script クラウドデータベース用スクリプト
 * 
 * 使い方:
 * 1. Google ドライブで「Google Apps Script」プロジェクトを新規作成します。
 * 2. このコードをエディタにコピー＆ペーストします。
 * 3. 画面右上の「デプロイ」➔「新しいデプロイ」をクリックします。
 * 4. 種類の選択で「ウェブアプリ」を選択します。
 * 5. 設定を以下のように指定します：
 *    - 次のユーザーとして実行: 「自分」（ご自身のアカウント）
 *    - アクセスできるユーザー: 「全員」（Anyone）
 * 6. 「デプロイ」を押し、表示された「ウェブアプリのURL」をコピーして、アプリの設定画面に入力してください。
 */

function doGet(e) {
  var data = loadData();
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);
    saveData(postData);
    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function loadData() {
  var prop = PropertiesService.getScriptProperties();
  var val = prop.getProperty("places_data");
  if (!val) {
    var initial = {
      settings: {
        user1: "パートナー1",
        user2: "パートナー2",
        title: "ふたりの行きたい場所マップ"
      },
      places: []
    };
    prop.setProperty("places_data", JSON.stringify(initial));
    return initial;
  }
  return JSON.parse(val);
}

function saveData(data) {
  var prop = PropertiesService.getScriptProperties();
  prop.setProperty("places_data", JSON.stringify(data));
}
