"""Números para os gráficos (tela Gráficos): do que o disco é feito e o tamanho de cada pasta.
Só lê o disco."""

import json
import os
import shutil
import time
from pathlib import Path

from tools.disk_scan import GB, MB, SYSTEM_DRIVE, allowed_roots
from tools.labels import KINDS

SCAN_FILE = Path(__file__).resolve().parent.parent / "data" / "scan.json"
CATEGORY_NAMES = {
    "video": "Vídeos",
    "imagem": "Imagens",
    "audio": "Áudios",
    "documento": "Documentos",
    "compactado": "Compactados",
    "instalador": "Instaladores",
}


def _walk_sizes(deadline):
    """(nome da pasta pessoal, caminho relativo da pasta, extensão, tamanho) de cada arquivo."""
    for root_name, folder in allowed_roots():
        if not folder.exists():
            continue
        for root, _dirs, files in os.walk(folder, onerror=lambda _e: None):
            if time.monotonic() > deadline:
                return
            relative = os.path.relpath(root, folder)
            for name in files:
                path = os.path.join(root, name)
                try:
                    if not os.path.islink(path):
                        yield root_name, relative, os.path.splitext(name)[1].lower(), os.path.getsize(path)
                except OSError:
                    continue


def composition(time_limit_s: float = 30) -> dict:
    """Do que o disco é feito: tipos de arquivo das pastas pessoais, lixo e o resto (sistema e programas)."""
    deadline = time.monotonic() + time_limit_s
    by_kind = {name: 0 for name in CATEGORY_NAMES.values()}
    others = 0
    for _root, _relative, ext, size in _walk_sizes(deadline):
        kind = next((CATEGORY_NAMES[k] for k, exts in KINDS.items() if ext in exts), None)
        if kind:
            by_kind[kind] += size
        else:
            others += size
    try:
        junk_gb = json.loads(SCAN_FILE.read_text(encoding="utf-8"))["lixo"]["tamanho_gb"]  # do último scan
    except (OSError, ValueError, KeyError):
        junk_gb = 0
    usage = shutil.disk_usage(SYSTEM_DRIVE)
    personal_gb = (sum(by_kind.values()) + others) / GB
    parts = [{"nome": name, "gb": round(size / GB, 2)} for name, size in by_kind.items()]
    parts += [
        {"nome": "Lixo", "gb": round(junk_gb, 2)},
        {"nome": "Outros arquivos", "gb": round(others / GB, 2)},
        {"nome": "Sistema e programas", "gb": round(max(usage.used / GB - personal_gb - junk_gb, 0), 2)},
    ]
    return {
        "usado_gb": round(usage.used / GB, 1),
        "total_gb": round(usage.total / GB, 1),
        "partes": parts,
        "parcial": time.monotonic() > deadline,
    }


def folder_sizes(time_limit_s: float = 20) -> dict:
    """Tamanho (MB) de cada pasta pessoal e das pastas de dentro dela: {"Downloads": 200, "Downloads/Jogos": 150}."""
    deadline = time.monotonic() + time_limit_s
    sizes = {}
    for root_name, relative, _ext, size in _walk_sizes(deadline):
        sizes[root_name] = sizes.get(root_name, 0) + size
        if relative != ".":
            key = f"{root_name}/{relative.split(os.sep)[0]}"
            sizes[key] = sizes.get(key, 0) + size
    return {key: round(size / MB, 1) for key, size in sizes.items() if size >= MB}  # ignora pastas com menos de 1 MB
