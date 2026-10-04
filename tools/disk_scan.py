"""Ferramenta de scan de disco: mede os 4 números dos cards do app.

- Disco: espaço usado e total do disco do sistema
- Lixo: tamanho das pastas temporárias e da lixeira
- Duplicatas: arquivos idênticos nas pastas do usuário (e quanto espaço desperdiçam)
- Arquivos grandes: arquivos acima de um tamanho mínimo nas pastas do usuário

Só LÊ o disco: não apaga nem move nada.
"""

import hashlib
import heapq
import json
import os
import shutil
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from langchain.tools import tool

from tools.settings import load_settings

GB = 1024**3
MB = 1024**2

HOME = Path.home()


def _desktop_folder():
    """Pasta real da Área de Trabalho (pode estar no OneDrive, ex.: OneDrive\\Área de Trabalho)."""
    try:
        import ctypes

        buffer = ctypes.create_unicode_buffer(260)
        ctypes.windll.shell32.SHGetFolderPathW(None, 0x10, None, 0, buffer)  # 0x10 = Área de Trabalho
        if buffer.value:
            return Path(buffer.value)
    except (AttributeError, OSError):
        pass
    return HOME / "Desktop"


USER_FOLDERS = [HOME / name for name in ("Downloads", "Documents", "Pictures", "Videos", "Music")] + [_desktop_folder()]
# Nomes em português, na mesma ordem de USER_FOLDERS
ROOT_NAMES = ["Downloads", "Documentos", "Imagens", "Vídeos", "Música", "Área de Trabalho"]


def allowed_roots():
    """Pastas pessoais permitidas nas Configurações: [(nome, pasta)]. As proibidas ficam de fora de tudo."""
    blocked = set(load_settings()["pastas_proibidas"])
    return [(name, folder) for name, folder in zip(ROOT_NAMES, USER_FOLDERS) if name not in blocked]


def allowed_folders():
    return [folder for _name, folder in allowed_roots()]

SYSTEM_DRIVE = Path(os.environ.get("SystemDrive", "C:") + "\\")
JUNK_FOLDERS = [
    Path(os.environ.get("TEMP", HOME / "AppData" / "Local" / "Temp")),
    SYSTEM_DRIVE / "Windows" / "Temp",
    SYSTEM_DRIVE / "$Recycle.Bin",
]


FILE_TYPES = {
    ".exe": "Instalador", ".msi": "Instalador", ".bin": "Arquivo de instalação", ".iso": "Imagem de disco",
    ".zip": "Arquivo ZIP", ".rar": "Arquivo RAR", ".7z": "Arquivo 7Z",
    ".mp4": "Vídeo MP4", ".mkv": "Vídeo MKV", ".mov": "Vídeo MOV", ".avi": "Vídeo AVI",
    ".mp3": "Áudio MP3", ".wav": "Áudio WAV", ".m4a": "Áudio M4A", ".flac": "Áudio FLAC",
    ".pdf": "PDF", ".docx": "Documento Word", ".xlsx": "Planilha Excel", ".pptx": "Apresentação",
    ".jpg": "Imagem JPG", ".jpeg": "Imagem JPG", ".png": "Imagem PNG", ".psd": "Photoshop",
    ".flp": "Projeto FL Studio",
}


def _file_type(path):
    ext = os.path.splitext(path)[1].lower()
    return FILE_TYPES.get(ext, f"Arquivo {ext[1:].upper()}" if ext else "Arquivo")


def _walk_files(folders, deadline):
    """Percorre os arquivos das pastas, pulando o que não dá para ler, até o tempo acabar."""
    for folder in folders:
        if not folder.exists():
            continue
        for root, _dirs, files in os.walk(folder, onerror=lambda _e: None):
            if time.monotonic() > deadline:
                return
            for name in files:
                path = os.path.join(root, name)
                try:
                    if os.path.islink(path):
                        continue
                    yield path, os.path.getsize(path)
                except OSError:
                    continue  # arquivo sem permissão ou que sumiu no meio do scan


def _folder_size(folder, deadline):
    return sum(size for _path, size in _walk_files([folder], deadline))


def _file_hash(path, chunk=1024 * 1024):
    """Impressão digital (SHA-256) do conteúdo do arquivo."""
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        while block := f.read(chunk):
            digest.update(block)
    return digest.hexdigest()


def _duplicate_groups(by_size, deadline):
    """Grupos de arquivos idênticos. Só compara o conteúdo (impressão digital) de arquivos do MESMO tamanho.
    Devolve uma lista de (tamanho, [caminhos])"""
    groups = []
    for size, paths in by_size.items():
        if len(paths) < 2 or time.monotonic() > deadline:
            continue
        by_hash = defaultdict(list)
        for path in paths:
            try:
                by_hash[_file_hash(path)].append(path)
            except OSError:
                continue
        groups += [(size, group) for group in by_hash.values() if len(group) > 1]
    return groups


def find_duplicates(time_limit_s=60):
    """Procura duplicatas (arquivos de 1 MB ou mais) nas pastas pessoais. Devolve [(tamanho, [caminhos])]."""
    deadline = time.monotonic() + time_limit_s
    by_size = defaultdict(list)
    for path, size in _walk_files(allowed_folders(), deadline):
        if size >= 1 * MB:
            by_size[size].append(path)
    return _duplicate_groups(by_size, deadline)


def scan(large_file_mb=100, time_limit_s=60):
    """Faz o scan e devolve um dicionário com os números (tamanhos em GB)."""
    start = time.monotonic()
    deadline = start + time_limit_s

    # Disco
    usage = shutil.disk_usage(SYSTEM_DRIVE)

    # Lixo
    junk_bytes = sum(_folder_size(folder, deadline) for folder in JUNK_FOLDERS)

    # Arquivos grandes e candidatos a duplicata (agrupados pelo tamanho)
    large = []
    biggest = []  # os 10 maiores arquivos de todos (para a tabela do app)
    by_size = defaultdict(list)
    for path, size in _walk_files(allowed_folders(), deadline):
        if size >= large_file_mb * MB:
            large.append((size, path))
        if len(biggest) < 10:
            heapq.heappush(biggest, (size, path))
        elif size > biggest[0][0]:
            heapq.heapreplace(biggest, (size, path))
        if size >= 1 * MB:  # arquivos muito pequenos não valem a pena
            by_size[size].append(path)

    # Duplicatas: arquivos com conteúdo idêntico
    duplicate_files = 0
    wasted_bytes = 0
    examples = []
    for size, group in _duplicate_groups(by_size, deadline):
        duplicate_files += len(group) - 1  # a primeira cópia não conta como desperdício
        wasted_bytes += size * (len(group) - 1)
        if len(examples) < 5:
            examples.append({"tamanho_mb": round(size / MB, 1), "copias": group[:3]})

    large.sort(reverse=True)
    top_files = []
    for size, path in sorted(biggest, reverse=True):
        try:
            modified = datetime.fromtimestamp(os.path.getmtime(path)).isoformat(timespec="minutes")
        except OSError:
            modified = None
        top_files.append({
            "nome": os.path.basename(path),
            "caminho": path,
            "tamanho_mb": round(size / MB, 1),
            "tipo": _file_type(path),
            "modificado": modified,
        })
    return {
        "disco": {
            "usado_gb": round(usage.used / GB, 1),
            "total_gb": round(usage.total / GB, 1),
            "livre_gb": round(usage.free / GB, 1),
            "unidade": str(SYSTEM_DRIVE),
        },
        "lixo": {"tamanho_gb": round(junk_bytes / GB, 2), "pastas": [str(f) for f in JUNK_FOLDERS]},
        "duplicatas": {
            "tamanho_gb": round(wasted_bytes / GB, 2),
            "arquivos": duplicate_files,
            "exemplos": examples,
        },
        "arquivos_grandes": {
            "tamanho_gb": round(sum(size for size, _ in large) / GB, 2),
            "quantidade": len(large),
            "minimo_mb": large_file_mb,
            "maiores": [{"tamanho_mb": round(size / MB), "caminho": path} for size, path in large[:5]],
        },
        "maiores_arquivos": top_files,  # os 10 maiores arquivos, com tipo e data (tabela do app)
        "scan": {
            "pastas_analisadas": [str(f) for f in allowed_folders() if f.exists()],
            "segundos": round(time.monotonic() - start, 1),
            "incompleto": time.monotonic() > deadline,  # True se o tempo acabou antes de terminar
        },
    }


@tool
def scan_disk(large_file_mb: int | None = None) -> str:
    """Analisa o computador do usuário e devolve, em JSON: uso do disco (GB usados/total),
    lixo (arquivos temporários e lixeira), arquivos duplicados (espaço desperdiçado e exemplos)
    e arquivos grandes (acima de large_file_mb MB, com os maiores caminhos).
    Use sempre que o usuário perguntar sobre espaço, saúde do disco, lixo, duplicados ou arquivos grandes.
    Sem large_file_mb, usa o tamanho escolhido nas Configurações do app.
    Esta ferramenta só lê o disco; nunca apaga nada."""
    minimum = large_file_mb or load_settings()["arquivo_grande_mb"]
    return json.dumps(scan(large_file_mb=minimum), ensure_ascii=False)
