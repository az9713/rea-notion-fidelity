"""Explicit public packaging: never includes investigation/, user files or private inventory."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'releases'
OUT.mkdir(exist_ok=True)
ROOT_FILES = ['.gitignore','LICENSE','README.md','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','electron-app.json']
PUBLIC_DIRS = ['docs','src','scripts','tests','fixtures']

def within(path):
    path = path.resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError('Packaging path escapes project')
    return path

# An existing package was produced by the pinned shared/standalone helper.
# Refresh only explicit project docs and notices; never delete or overwrite runtime files.
desktop_dir = ROOT/'releases/NotionFidelity-win-x64'
if desktop_dir.is_dir():
    config=json.loads((ROOT/'electron-app.json').read_text(encoding='utf-8-sig'))
    bundled=within(desktop_dir/'resources/app')
    if not (bundled/'main.cjs').is_file():raise ValueError('Not an existing helper-built package')
    if not (desktop_dir/'LICENSE.electron').is_file() or not (desktop_dir/'LICENSES.chromium.html').is_file():
        raise ValueError('Preserve Electron and Chromium license notices before packaging')
    for name in config['docs_files']:
        source=within(ROOT/'docs'/name)
        target=within(bundled/'docs'/name)
        if not source.is_file() or source.is_symlink():raise ValueError('Expected public document asset')
        target.write_bytes(source.read_bytes())
    for name in ['LICENSE','README.md','THIRD_PARTY_NOTICES.md']:
        within(desktop_dir/name).write_bytes((ROOT/name).read_bytes())
    desktop=OUT/'NotionFidelity-0.1.0-win-x64.zip'
    with zipfile.ZipFile(desktop,'w',zipfile.ZIP_DEFLATED,compresslevel=6, strict_timestamps=False) as z:
        for file in sorted(desktop_dir.rglob('*')):
            within(file)
            if file.is_symlink():raise ValueError('Symlink rejected')
            if file.is_file():z.write(file,(Path('NotionFidelity')/file.relative_to(desktop_dir)).as_posix())

def write_zip(name, files, prefix):
    target = OUT / name
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=6, strict_timestamps=False) as z:
        for file in sorted(set(files)):
            within(file)
            if file.is_symlink() or not file.is_file():
                raise ValueError('Expected a regular project file')
            rel = file.relative_to(ROOT)
            if any(p in ('node_modules','investigation','.test-build','__pycache__') for p in rel.parts) or '.private.' in str(rel) or 'privateinventory' in str(rel):
                raise ValueError('Private or non-public path rejected')
            arc = Path(prefix) / rel
            z.write(file, arc.as_posix())
    return target

web_files = [p for p in (ROOT/'docs').rglob('*') if p.is_file()] + [ROOT/'LICENSE',ROOT/'README.md',ROOT/'THIRD_PARTY_NOTICES.md']
# The web ZIP puts app.html directly in its root for a usable local-file launch.
web = OUT/'notion-fidelity-web-0.1.0.zip'
with zipfile.ZipFile(web,'w',zipfile.ZIP_DEFLATED,compresslevel=6, strict_timestamps=False) as z:
    for file in sorted(web_files):
        within(file)
        if file.is_symlink():raise ValueError('Symlink rejected')
        z.write(file,(file.relative_to(ROOT/'docs') if file.is_relative_to(ROOT/'docs') else Path(file.name)).as_posix())
source_files = [ROOT/p for p in ROOT_FILES]
for directory in PUBLIC_DIRS:
    source_files.extend(p for p in (ROOT/directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
source = write_zip('notion-fidelity-source-0.1.0.zip',source_files,'notion-fidelity')
desktop = OUT/'NotionFidelity-0.1.0-win-x64.zip'
artifacts = [web,source] + ([desktop] if desktop.is_file() else [])
results=[]
app_bytes=(ROOT/'docs/app.js').read_bytes()
for file in artifacts:
    with zipfile.ZipFile(file) as z:
        assert z.testzip() is None, 'ZIP CRC check failed'
        assert len(z.namelist()) == len(set(z.namelist())), 'Duplicate archive entries'
        for name in z.namelist():
            parts=Path(name).parts
            assert not Path(name).is_absolute() and '..' not in parts and '\\' not in name
            assert 'investigation' not in parts and '.private.' not in name and 'privateinventory' not in name
        if file == web:
            assert z.read('app.js') == app_bytes
            assert z.read('app.html') == (ROOT/'docs/app.html').read_bytes()
        elif file == source:
            assert z.read('notion-fidelity/docs/app.js') == app_bytes
            assert z.read('notion-fidelity/src/core.mjs') == (ROOT/'src/core.mjs').read_bytes()
        elif file == desktop:
            assert z.read('NotionFidelity/resources/app/docs/app.js') == app_bytes
            assert z.read('NotionFidelity/resources/app/main.cjs') == (ROOT/'scripts/electron-main.cjs').read_bytes()
            assert z.read('NotionFidelity/LICENSE.electron') == (desktop_dir/'LICENSE.electron').read_bytes()
            assert z.read('NotionFidelity/LICENSES.chromium.html')
        results.append({'artifact':file.name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'crc':'pass','entries':len(z.namelist()),'bundledAppMatchesBuild':True})
(OUT/'SHA256SUMS.txt').write_text(''.join(f"{r['sha256']}  {r['artifact']}\n" for r in results))
(OUT/'package-verification.json').write_text(json.dumps({'command':'python scripts/release.py','appSha256':hashlib.sha256(app_bytes).hexdigest(),'artifacts':results,'scope':'CRC, safe paths, absence of private investigation data, SHA-256, bundled code equality, Electron/Chromium license presence; desktop renderer smoke reported separately.'},indent=2)+'\n')
print(json.dumps(results,indent=2))

