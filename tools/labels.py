"""Etiquetas dos arquivos na tela Arquivos ("seguro apagar", "instalador antigo"...), por regras simples:
extensão, idade e local. Não usa IA: é instantâneo e não gasta API."""

import os
import time

from tools.disk_scan import USER_FOLDERS

DOWNLOADS = USER_FOLDERS[0]
DAY = 86400

# Grupos de extensões (usados nas etiquetas e na busca)
KINDS = {
    "video": {".mp4", ".mkv", ".mov", ".avi", ".wmv", ".webm"},
    "imagem": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic", ".psd"},
    "audio": {".mp3", ".wav", ".m4a", ".flac", ".ogg"},
    "documento": {".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".txt", ".odt"},
    "compactado": {".zip", ".rar", ".7z", ".tar", ".gz"},
    "instalador": {".exe", ".msi", ".iso"},
}
SAFE_TO_DELETE = {".tmp", ".crdownload", ".part", ".partial", ".log", ".bak", ".old", ".dmp"}
PROJECTS = {".flp", ".psd", ".blend", ".prproj", ".aep"}


def mtime(path: str) -> float:
    """Data de modificação (agora, se o arquivo sumiu ou não dá para ler)."""
    try:
        return os.path.getmtime(path)
    except OSError:
        return time.time()


def label_for(path: str, is_extra_copy: bool = False) -> str | None:
    ext = os.path.splitext(path)[1].lower()
    age_days = (time.time() - mtime(path)) / DAY
    if is_extra_copy or ext in SAFE_TO_DELETE:
        return "seguro apagar"
    if ext in KINDS["instalador"] and age_days > 30:
        return "instalador antigo"
    in_downloads = os.path.normcase(path).startswith(os.path.normcase(str(DOWNLOADS)))
    if ext in KINDS["documento"] or ext in PROJECTS or (ext in KINDS["imagem"] and not in_downloads):
        return "pode ser importante"
    if age_days > 365:
        return "sem uso há 1 ano+"
    return None
