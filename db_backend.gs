/**
 * PairMap - Google Apps Script クラウドデータベース用スクリプト (v2)
 *
 * v1 との違い:
 * - PropertiesService (1プロパティあたり9KB, 合計500KBまで) に全データをJSONで
 *   丸ごと保存していたため、スポットやコメントが増えると保存が静かに失敗し、
 *   相手の端末に反映されなくなる不具合があった。
 * - v2 では自動生成される専用のGoogle Sheetにデータを保存する方式に変更し、
 *   容量上限を実質的に無くした。
 * - 「全件まるごと上書き保存」ではなく、スポット作成/更新/削除・コメント追加・
 *   設定変更をそれぞれ個別のサーバー側操作として処理するようにした。
 *   これにより、二人が同時に別々の操作をしても、片方の変更がもう片方の
 *   保存で上書きされて消える、という競合が起きにくくなっている。
 * - 同時アクセス時の書き込み競合を防ぐため LockService でロックしている。
 *
 * 使い方:
 * 1. Google ドライブで「Google Apps Script」プロジェクトを新規作成します。
 * 2. このコードをエディタにコピー＆ペーストします（既存コードは全て置き換えてください）。
 * 3. 画面右上の「デプロイ」➔「新しいデプロイ」をクリックします。
 * 4. 種類の選択で「ウェブアプリ」を選択します。
 * 5. 設定を以下のように指定します：
 *    - 次のユーザーとして実行: 「自分」（ご自身のアカウント）
 *    - アクセスできるユーザー: 「全員」（Anyone）
 * 6. 「デプロイ」を押し、表示された「ウェブアプリのURL」をコピーして、アプリの設定画面に入力してください。
 * 7. 初回アクセス時に自動的に「PairMap Data」という名前のスプレッドシートが
 *    Googleドライブのルートに作成され、以後そこにデータが保存されます。
 *    （中身を直接見たい/バックアップしたい場合はドライブから開けます）
 *
 * 以前の v1 (PropertiesServiceのみで保存する版) からの移行:
 * 1. 古いウェブアプリのURLに直接アクセスし、表示されたJSONをコピーしておく。
 * 2. このv2をデプロイし直す。
 * 3. 新しいURLに対して、控えておいたJSONを {"action":"restore_all", ...そのJSON...}
 *    という形にして一度だけPOSTすると移行できます（不要ならスキップしてOK）。
 */

var PLACES_HEADERS = ["id", "title", "description", "category", "url", "imageUrl", "latitude", "longitude", "proposedBy", "status", "type", "createdAt", "commentsJson"];
var SETTINGS_KEYS = ["title", "user1", "user2"];

function doGet(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return jsonResponse(loadAllData());
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var req = JSON.parse(e.postData.contents);
    var action = req.action || "sync_all"; // sync_all: backward compat with the old "overwrite everything" clients

    switch (action) {
      case "create_place":
        return jsonResponse({ success: true, place: createPlace(req.place) });
      case "update_place":
        updatePlace(req.id, req.place);
        return jsonResponse({ success: true });
      case "delete_place":
        deletePlace(req.id);
        return jsonResponse({ success: true });
      case "add_comment":
        return jsonResponse({ success: true, comment: addComment(req.placeId, req.comment) });
      case "update_settings":
        updateSettings(req.settings);
        return jsonResponse({ success: true, settings: req.settings });
      case "sync_all":
      case "restore_all":
        syncAll(req.settings, req.places);
        return jsonResponse({ success: true });
      default:
        throw new Error("Unknown action: " + action);
    }
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---- Spreadsheet bootstrap ----

function getDb() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty("sheet_id");
  var ss;
  if (sheetId) {
    try {
      ss = SpreadsheetApp.openById(sheetId);
    } catch (e) {
      ss = null; // sheet was deleted/moved; fall through and recreate
    }
  }
  if (!ss) {
    ss = SpreadsheetApp.create("PairMap Data");
    props.setProperty("sheet_id", ss.getId());
  }

  var placesSheet = ss.getSheetByName("Places");
  if (!placesSheet) {
    placesSheet = ss.insertSheet("Places");
    placesSheet.appendRow(PLACES_HEADERS);
  }

  var settingsSheet = ss.getSheetByName("Settings");
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet("Settings");
    settingsSheet.appendRow(["key", "value"]);
    settingsSheet.appendRow(["title", "ふたりの行きたい場所マップ"]);
    settingsSheet.appendRow(["user1", "パートナー1"]);
    settingsSheet.appendRow(["user2", "パートナー2"]);
  }

  // The default "Sheet1" created alongside a new spreadsheet is unused; remove it if present.
  var defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  return { ss: ss, placesSheet: placesSheet, settingsSheet: settingsSheet };
}

// ---- Read ----

function loadAllData() {
  var db = getDb();
  return { settings: readSettings(db.settingsSheet), places: readPlaces(db.placesSheet) };
}

function readSettings(settingsSheet) {
  var values = settingsSheet.getDataRange().getValues();
  var settings = { title: "ふたりの行きたい場所マップ", user1: "パートナー1", user2: "パートナー2" };
  for (var i = 1; i < values.length; i++) {
    var key = values[i][0];
    if (SETTINGS_KEYS.indexOf(key) !== -1) {
      settings[key] = values[i][1];
    }
  }
  return settings;
}

function readPlaces(placesSheet) {
  var values = placesSheet.getDataRange().getValues();
  var places = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[0]) continue; // skip blank rows
    places.push(rowToPlace(row));
  }
  return places;
}

function rowToPlace(row) {
  var comments = [];
  try {
    if (row[12]) comments = JSON.parse(row[12]);
  } catch (e) {
    comments = [];
  }
  return {
    id: row[0],
    title: row[1],
    description: row[2],
    category: row[3],
    url: row[4],
    imageUrl: row[5],
    latitude: row[6],
    longitude: row[7],
    proposedBy: row[8],
    status: row[9],
    type: row[10],
    createdAt: row[11],
    comments: comments
  };
}

// ---- Places: create / update / delete ----

function findPlaceRowIndex(placesSheet, id) {
  var ids = placesSheet.getRange(2, 1, Math.max(placesSheet.getLastRow() - 1, 0), 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2; // +2: header row + 1-indexed
  }
  return -1;
}

function createPlace(place) {
  var db = getDb();
  var id = Utilities.getUuid().substring(0, 8);
  var row = [
    id,
    place.title || "無題のスポット",
    place.description || "",
    place.category || "other",
    place.url || "",
    place.imageUrl || "",
    place.latitude != null ? place.latitude : 35.6895,
    place.longitude != null ? place.longitude : 139.6917,
    place.proposedBy || "user1",
    place.status || "want_to_go",
    place.type || "place",
    place.createdAt || new Date().toISOString(),
    "[]"
  ];
  db.placesSheet.appendRow(row);
  return rowToPlace(row);
}

function updatePlace(id, place) {
  var db = getDb();
  var rowIndex = findPlaceRowIndex(db.placesSheet, id);
  if (rowIndex === -1) throw new Error("Place not found: " + id);

  var fieldToCol = { title: 2, description: 3, category: 4, url: 5, imageUrl: 6, latitude: 7, longitude: 8, status: 10, type: 11 };
  for (var key in fieldToCol) {
    if (Object.prototype.hasOwnProperty.call(place, key) && place[key] !== undefined) {
      db.placesSheet.getRange(rowIndex, fieldToCol[key]).setValue(place[key]);
    }
  }
}

function deletePlace(id) {
  var db = getDb();
  var rowIndex = findPlaceRowIndex(db.placesSheet, id);
  if (rowIndex === -1) throw new Error("Place not found: " + id);
  db.placesSheet.deleteRow(rowIndex);
}

// ---- Comments ----

function addComment(placeId, comment) {
  var db = getDb();
  var rowIndex = findPlaceRowIndex(db.placesSheet, placeId);
  if (rowIndex === -1) throw new Error("Place not found: " + placeId);

  var cell = db.placesSheet.getRange(rowIndex, 13);
  var comments = [];
  try {
    var existing = cell.getValue();
    if (existing) comments = JSON.parse(existing);
  } catch (e) {
    comments = [];
  }

  var newComment = {
    id: Utilities.getUuid().substring(0, 8),
    user: comment.user || "user1",
    text: (comment.text || "").toString().trim(),
    timestamp: comment.timestamp || Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Tokyo", "yyyy-MM-dd HH:mm")
  };
  if (!newComment.text) throw new Error("Comment text cannot be empty");

  comments.push(newComment);
  cell.setValue(JSON.stringify(comments));
  return newComment;
}

// ---- Settings ----

function updateSettings(settings) {
  var db = getDb();
  var values = db.settingsSheet.getDataRange().getValues();
  for (var key in settings) {
    if (SETTINGS_KEYS.indexOf(key) === -1) continue;
    var found = false;
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] === key) {
        db.settingsSheet.getRange(i + 1, 2).setValue(settings[key]);
        found = true;
        break;
      }
    }
    if (!found) {
      db.settingsSheet.appendRow([key, settings[key]]);
    }
  }
}

// ---- Legacy full-overwrite (kept for backward compatibility / manual restore) ----

function syncAll(settings, places) {
  var db = getDb();

  if (settings) updateSettings(settings);

  if (places) {
    var lastRow = db.placesSheet.getLastRow();
    if (lastRow > 1) {
      db.placesSheet.getRange(2, 1, lastRow - 1, PLACES_HEADERS.length).clearContent();
    }
    var rows = places.map(function (p) {
      return [
        p.id, p.title || "", p.description || "", p.category || "other", p.url || "", p.imageUrl || "",
        p.latitude != null ? p.latitude : 35.6895, p.longitude != null ? p.longitude : 139.6917,
        p.proposedBy || "user1", p.status || "want_to_go", p.type || "place",
        p.createdAt || new Date().toISOString(), JSON.stringify(p.comments || [])
      ];
    });
    if (rows.length > 0) {
      db.placesSheet.getRange(2, 1, rows.length, PLACES_HEADERS.length).setValues(rows);
    }
  }
}
