"""MessageTemplator - Flask Backend"""
import json
import uuid
import os
import sys
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


# --- 關閉伺服器：瀏覽器視窗關閉時呼叫，含寬限期 ---
shutdown_timer = None
SHUTDOWN_GRACE = 5  # 秒：寬限期內有新請求則取消關閉


def cancel_shutdown():
    """取消排定中的關閉計時器（代表瀏覽器只是重新整理）。"""
    global shutdown_timer
    if shutdown_timer is not None:
        shutdown_timer.cancel()
        shutdown_timer = None


@app.before_request
def on_request():
    """任何請求進來都取消關閉計時器。"""
    cancel_shutdown()


@app.route('/api/shutdown', methods=['POST'])
def shutdown():
    global shutdown_timer
    cancel_shutdown()
    shutdown_timer = threading.Timer(SHUTDOWN_GRACE, _do_shutdown)
    shutdown_timer.daemon = True
    shutdown_timer.start()
    return jsonify({'ok': True})


def _do_shutdown():
    print('瀏覽器視窗已關閉（寬限期內無新請求），伺服器自動結束。')
    os._exit(0)


def is_port_in_use(port):
    """檢查 port 是否已被占用。"""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0


if __name__ == '__main__':
    ensure_data_dir()
    port = 5588
    url = f'http://localhost:{port}'

    if is_port_in_use(port):
        print(f'偵測到伺服器已在執行中，直接開啟瀏覽器：{url}')
        webbrowser.open(url)
        sys.exit(0)

    print(f'MessageTemplator 啟動中... {url}')
    webbrowser.open(url)
    app.run(host='127.0.0.1', port=port, debug=False)
