"""訊息模板小工具 - Flask Backend"""
import json
import uuid
import os
import sys
import signal
import time
import threading
import webbrowser
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

# 確定路徑（支援 PyInstaller 打包）
if getattr(sys, 'frozen', False):
    # --onefile 模式：靜態檔案在暫存目錄，資料檔案在 exe 旁
    BUNDLE_DIR = sys._MEIPASS
    APP_DIR = os.path.dirname(sys.executable)
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    APP_DIR = BUNDLE_DIR

DATA_DIR = os.path.join(APP_DIR, 'data')
TEMPLATES_FILE = os.path.join(DATA_DIR, 'templates.json')
STATIC_DIR = os.path.join(BUNDLE_DIR, 'static')

app = Flask(__name__, static_folder=STATIC_DIR)
CORS(app)


def ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(TEMPLATES_FILE):
        with open(TEMPLATES_FILE, 'w', encoding='utf-8') as f:
            json.dump([], f, ensure_ascii=False)


def load_templates():
    ensure_data_dir()
    with open(TEMPLATES_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_templates(templates):
    ensure_data_dir()
    with open(TEMPLATES_FILE, 'w', encoding='utf-8') as f:
        json.dump(templates, f, ensure_ascii=False, indent=2)


# --- 靜態頁面 ---
@app.route('/')
def index():
    return send_from_directory(STATIC_DIR, 'index.html')


@app.route('/favicon.ico')
def favicon():
    return send_from_directory(STATIC_DIR, 'favicon.png', mimetype='image/png')


# --- API ---
@app.route('/api/templates', methods=['GET'])
def get_templates():
    return jsonify(load_templates())


@app.route('/api/templates', methods=['POST'])
def create_template():
    data = request.json
    template = {
        'id': str(uuid.uuid4()),
        'name': data.get('name', ''),
        'description': data.get('description', ''),
        'tags': data.get('tags', []),
        'variables': data.get('variables', []),
        'body': data.get('body', ''),
        'created_at': datetime.now().isoformat(),
        'updated_at': datetime.now().isoformat(),
    }
    templates = load_templates()
    templates.append(template)
    save_templates(templates)
    return jsonify(template), 201


@app.route('/api/templates/<template_id>', methods=['PUT'])
def update_template(template_id):
    data = request.json
    templates = load_templates()
    for t in templates:
        if t['id'] == template_id:
            t['name'] = data.get('name', t['name'])
            t['description'] = data.get('description', t['description'])
            t['tags'] = data.get('tags', t['tags'])
            t['variables'] = data.get('variables', t['variables'])
            t['body'] = data.get('body', t['body'])
            t['updated_at'] = datetime.now().isoformat()
            save_templates(templates)
            return jsonify(t)
    return jsonify({'error': '模板不存在'}), 404


@app.route('/api/templates/<template_id>', methods=['DELETE'])
def delete_template(template_id):
    templates = load_templates()
    templates = [t for t in templates if t['id'] != template_id]
    save_templates(templates)
    return jsonify({'success': True})


@app.route('/api/tags', methods=['GET'])
def get_tags():
    templates = load_templates()
    tags = {}
    for t in templates:
        for tag in t.get('tags', []):
            tags[tag] = tags.get(tag, 0) + 1
    return jsonify(tags)


# --- 心跳機制：瀏覽器關閉後自動結束伺服器 ---
last_heartbeat = time.time()
HEARTBEAT_TIMEOUT = 10  # 秒，超過此時間未收到心跳則關閉


@app.route('/api/heartbeat', methods=['POST'])
def heartbeat():
    global last_heartbeat
    last_heartbeat = time.time()
    return jsonify({'ok': True})


def watchdog():
    """背景執行緒，偵測心跳逾時後關閉伺服器"""
    global last_heartbeat
    while True:
        time.sleep(3)
        if time.time() - last_heartbeat > HEARTBEAT_TIMEOUT:
            print('瀏覽器已關閉，伺服器自動結束。')
            # 用 SIGINT 優雅關閉，讓 PyInstaller 正常清理暫存目錄
            os.kill(os.getpid(), signal.SIGINT)


if __name__ == '__main__':
    ensure_data_dir()
    port = 5588
    print(f'訊息模板小工具啟動中... http://localhost:{port}')

    # 啟動心跳監控
    t = threading.Thread(target=watchdog, daemon=True)
    t.start()

    webbrowser.open(f'http://localhost:{port}')
    app.run(host='127.0.0.1', port=port, debug=False)
