"""使用 PyInstaller 打包為可攜式執行檔"""
import PyInstaller.__main__
import os

base = os.path.dirname(os.path.abspath(__file__))

PyInstaller.__main__.run([
    os.path.join(base, 'app.py'),
    '--onefile',
    '--name', 'MessageTemplatorShu',
    '--icon', os.path.join(base, 'app.ico'),
    '--add-data', f'{os.path.join(base, "static")};static',
    '--noconsole',
    '--clean',
])
