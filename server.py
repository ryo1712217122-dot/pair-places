import http.server
import json
import os
import sys

PORT = 8000
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(PROJECT_DIR, 'data.json')

def load_data():
    if not os.path.exists(DATA_FILE):
        initial_data = {
            "settings": {
                "user1": "パートナー1",
                "user2": "パートナー2",
                "title": "ふたりの行きたい場所マップ"
            },
            "places": []
        }
        save_data(initial_data)
        return initial_data
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {"settings": {"user1": "パートナー1", "user2": "パートナー2", "title": "ふたりの行きたい場所マップ"}, "places": []}

def save_data(data):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Parse query params out of path if any
        if '?' in path:
            path = path.split('?', 1)[0]
        if '#' in path:
            path = path.split('#', 1)[0]

        # Normalize path
        path = os.path.normpath(path)
        
        # If requesting root, map to index.html
        if path == '/' or path == '.' or path == '\\':
            return os.path.join(PROJECT_DIR, 'index.html')
        
        if path.startswith('/') or path.startswith('\\'):
            path = path[1:]
            
        target = os.path.join(PROJECT_DIR, path)
        return target

    def end_headers(self):
        # Add CORS headers to all responses
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        # Respond to CORS preflight requests
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # Prevent access to source files, JSON database, shell scripts, and git configs
        path_lower = self.path.lower()
        if '..' in self.path or any(path_lower.endswith(ext) for ext in ['.py', '.json', '.sh', '.git', '.pyc']) or '/.' in self.path:
            self.send_error_response(403, "Access Forbidden")
            return

        # Route API requests
        if self.path.startswith('/api/data'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            data = load_data()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
        else:
            # Serve static files from root directory
            super().do_GET()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        try:
            req_data = json.loads(post_data) if post_data else {}
        except Exception:
            self.send_error_response(400, "Invalid JSON")
            return

        if self.path == '/api/places':
            # Create a new place
            data = load_data()
            import uuid
            new_place = {
                "id": str(uuid.uuid4())[:8],
                "title": req_data.get("title", "無題のスポット").strip(),
                "description": req_data.get("description", "").strip(),
                "category": req_data.get("category", "other"),
                "url": req_data.get("url", "").strip(),
                "imageUrl": req_data.get("imageUrl", "").strip(),
                "latitude": float(req_data.get("latitude", 35.6895)),
                "longitude": float(req_data.get("longitude", 139.6917)),
                "proposedBy": req_data.get("proposedBy", "user1"),
                "status": req_data.get("status", "want_to_go"),
                "comments": [],
                "createdAt": req_data.get("createdAt", "")
            }
            if not new_place["imageUrl"]:
                cat_images = {
                    "food": "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&auto=format&fit=crop&q=60",
                    "scenic": "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&auto=format&fit=crop&q=60",
                    "activity": "https://images.unsplash.com/photo-1530541930197-ff16ac917b0e?w=600&auto=format&fit=crop&q=60",
                    "shopping": "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&auto=format&fit=crop&q=60",
                    "lodging": "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600&auto=format&fit=crop&q=60",
                    "other": "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&auto=format&fit=crop&q=60"
                }
                new_place["imageUrl"] = cat_images.get(new_place["category"], cat_images["other"])

            data["places"].append(new_place)
            save_data(data)
            self.send_json_response({"success": True, "place": new_place})

        elif self.path.startswith('/api/places/') and self.path.endswith('/comments'):
            parts = self.path.split('/')
            place_id = parts[3]
            data = load_data()
            found = False
            for place in data["places"]:
                if place["id"] == place_id:
                    import uuid
                    import datetime
                    new_comment = {
                        "id": str(uuid.uuid4())[:8],
                        "user": req_data.get("user", "user1"),
                        "text": req_data.get("text", "").strip(),
                        "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
                    }
                    if not new_comment["text"]:
                        self.send_error_response(400, "Comment text cannot be empty")
                        return
                    place.setdefault("comments", []).append(new_comment)
                    found = True
                    break
            if found:
                save_data(data)
                self.send_json_response({"success": True, "comment": new_comment})
            else:
                self.send_error_response(404, "Place not found")

        elif self.path == '/api/settings':
            data = load_data()
            data["settings"]["user1"] = req_data.get("user1", data["settings"]["user1"]).strip()
            data["settings"]["user2"] = req_data.get("user2", data["settings"]["user2"]).strip()
            data["settings"]["title"] = req_data.get("title", data["settings"]["title"]).strip()
            save_data(data)
            self.send_json_response({"success": True, "settings": data["settings"]})
        else:
            self.send_error_response(404, "Not Found")

    def do_PUT(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        try:
            req_data = json.loads(post_data) if post_data else {}
        except Exception:
            self.send_error_response(400, "Invalid JSON")
            return

        if self.path.startswith('/api/places/'):
            parts = self.path.split('/')
            place_id = parts[3]
            data = load_data()
            found = False
            for place in data["places"]:
                if place["id"] == place_id:
                    if "title" in req_data: place["title"] = req_data["title"].strip()
                    if "description" in req_data: place["description"] = req_data["description"].strip()
                    if "category" in req_data: place["category"] = req_data["category"]
                    if "url" in req_data: place["url"] = req_data["url"].strip()
                    if "imageUrl" in req_data: place["imageUrl"] = req_data["imageUrl"].strip()
                    if "latitude" in req_data: place["latitude"] = float(req_data["latitude"])
                    if "longitude" in req_data: place["longitude"] = float(req_data["longitude"])
                    if "status" in req_data: place["status"] = req_data["status"]
                    found = True
                    break
            if found:
                save_data(data)
                self.send_json_response({"success": True})
            else:
                self.send_error_response(404, "Place not found")
        else:
            self.send_error_response(404, "Not Found")

    def do_DELETE(self):
        if self.path.startswith('/api/places/'):
            parts = self.path.split('/')
            place_id = parts[3]
            data = load_data()
            original_len = len(data["places"])
            data["places"] = [p for p in data["places"] if p["id"] != place_id]
            if len(data["places"]) < original_len:
                save_data(data)
                self.send_json_response({"success": True})
            else:
                self.send_error_response(404, "Place not found")
        else:
            self.send_error_response(404, "Not Found")

    def send_json_response(self, data_dict):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data_dict, ensure_ascii=False).encode('utf-8'))

    def send_error_response(self, code, message):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}, ensure_ascii=False).encode('utf-8'))

if __name__ == '__main__':
    load_data()
    server_address = ('', PORT)
    httpd = http.server.HTTPServer(server_address, CustomHandler)
    print(f"Server running on port {PORT}...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        sys.exit(0)
