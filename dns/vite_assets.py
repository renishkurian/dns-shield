"""Resolve hashed Vite build assets from the build manifest."""
from functools import lru_cache
from pathlib import Path

from django.conf import settings
from django.templatetags.static import static


def _is_vite_manifest(data) -> bool:
    if not isinstance(data, dict) or not data:
        return False
    # Vite entry values are objects with a "file" key; PWA manifests are not.
    for value in data.values():
        if isinstance(value, dict) and 'file' in value:
            return True
    return False


@lru_cache(maxsize=1)
def _load_manifest():
    # Prefer Vite's own path — static/dist/manifest.json may be a PWA web manifest.
    candidates = [
        Path(settings.BASE_DIR) / 'static' / 'dist' / '.vite' / 'manifest.json',
        Path(settings.STATIC_ROOT) / 'dist' / '.vite' / 'manifest.json',
        Path(settings.BASE_DIR) / 'static' / 'dist' / 'manifest.json',
        Path(settings.STATIC_ROOT) / 'dist' / 'manifest.json',
    ]
    for path in candidates:
        if not path.is_file():
            continue
        import json
        with path.open() as f:
            data = json.load(f)
        if _is_vite_manifest(data):
            return data
    return {}


def clear_vite_manifest_cache():
    _load_manifest.cache_clear()


def get_vite_assets():
    """
    Return {'js': '/static/dist/assets/main-HASH.js', 'css': '...'}
    Falls back to unhashed names if manifest is missing.
    """
    manifest = _load_manifest()
    entry = None
    for key, meta in manifest.items():
        if not isinstance(meta, dict):
            continue
        if meta.get('isEntry') or str(key).endswith('main.jsx') or key == 'main':
            entry = meta
            break
    if not entry and isinstance(manifest.get('src/main.jsx'), dict):
        entry = manifest['src/main.jsx']

    if entry and entry.get('file'):
        js = static(f"dist/{entry['file']}")
        css_files = entry.get('css') or []
        css = static(f"dist/{css_files[0]}") if css_files else ''
        return {'js': js, 'css': css}

    return {
        'js': static('dist/assets/main.js'),
        'css': static('dist/assets/main.css'),
    }
