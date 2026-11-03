"""Listas da tela Arquivos (abas Grandes, Antigos, Downloads, Duplicados e a busca da Linnea)
e as etiquetas de cada arquivo. Tudo aqui só LÊ o disco."""

import json
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Literal

from langchain.tools import tool

from tools.disk_scan import MB, _file_type, _walk_files, allowed_folders, find_duplicates
from tools.file_tools import _keep_choice, _send_ui, _user_path
from tools.folder_map import _root_of
from tools.labels import DAY, DOWNLOADS, KINDS, label_for, mtime
from tools.settings import load_settings

MAX_ITEMS = 50


def file_item(path: str, size: int, is_extra_copy: bool = False) -> dict:
    return {
        "nome": os.path.basename(path),
        "caminho": path,
        "tipo": _file_type(path),
        "tamanho_mb": round(size / MB, 2),
        "modificado": datetime.fromtimestamp(mtime(path)).isoformat(timespec="minutes"),
        "etiqueta": label_for(path, is_extra_copy),
    }


def _biggest(files, limit=MAX_ITEMS):
    return [file_item(p, s) for p, s in sorted(files, key=lambda f: f[1], reverse=True)[:limit]]


def file_list(filtro: str, time_limit_s: float = 30) -> dict:
    """Arquivos de uma aba, do maior para o menor (até 50)."""
    deadline = time.monotonic() + time_limit_s
    if filtro == "grandes":
        minimum = load_settings()["arquivo_grande_mb"] * MB
        items = _biggest((p, s) for p, s in _walk_files(allowed_folders(), deadline) if s >= minimum)
    elif filtro == "antigos":
        year_ago = time.time() - 365 * DAY
        items = _biggest((p, s) for p, s in _walk_files(allowed_folders(), deadline) if mtime(p) < year_ago)
    elif filtro == "downloads":
        items = _biggest(_walk_files([f for f in allowed_folders() if f == DOWNLOADS], deadline))
    elif filtro == "duplicados":
        extras = []
        for size, paths in find_duplicates(time_limit_s):
            keep = _keep_choice(paths)  # a cópia que fica (a mesma regra de apagar_duplicatas)
            extras += [(p, size) for p in paths if p != keep]
        items = [file_item(p, s, is_extra_copy=True) for p, s in sorted(extras, key=lambda f: f[1], reverse=True)[:MAX_ITEMS]]
    else:
        raise ValueError("Filtro desconhecido.")
    return {"filtro": filtro, "itens": items, "parcial": time.monotonic() > deadline}


def search_files(tipo="qualquer", min_mb=0.0, max_mb=None, modificado_depois=None, modificado_antes=None,
                 pasta=None, nome_contem=None, time_limit_s=30) -> list[dict]:
    """Busca nas pastas pessoais com filtros (usada pela ferramenta buscar_arquivos)."""
    deadline = time.monotonic() + time_limit_s
    folders = allowed_folders()
    if pasta:
        folder = _user_path(pasta).resolve()
        if not folder.is_dir() or _root_of(folder) is None:
            raise ValueError("Essa pasta não existe ou está fora das pastas pessoais.")
        folders = [folder]
    after = datetime.fromisoformat(modificado_depois).timestamp() if modificado_depois else None
    before = datetime.fromisoformat(modificado_antes).timestamp() if modificado_antes else None
    found = []
    for path, size in _walk_files(folders, deadline):
        ext = os.path.splitext(path)[1].lower()
        if tipo != "qualquer" and ext not in KINDS[tipo]:
            continue
        if size < min_mb * MB or (max_mb is not None and size > max_mb * MB):
            continue
        if nome_contem and nome_contem.lower() not in os.path.basename(path).lower():
            continue
        if after or before:
            modified = mtime(path)
            if (after and modified < after) or (before and modified > before):
                continue
        found.append((path, size))
    return _biggest(found)


@tool
def buscar_arquivos(
    tipo: Literal["video", "imagem", "audio", "documento", "compactado", "instalador", "qualquer"] = "qualquer",
    min_mb: float = 0,
    max_mb: float | None = None,
    modificado_depois: str | None = None,
    modificado_antes: str | None = None,
    pasta: str | None = None,
    nome_contem: str | None = None,
) -> str:
    """Busca arquivos nas pastas pessoais com filtros e MOSTRA os resultados na tela Arquivos (aba Busca).
    Use quando o usuário pedir para buscar ou achar arquivos (ex.: "vídeos do ano passado maiores que 1 GB").
    Datas no formato AAAA-MM-DD (ex.: ano passado = modificado_depois 2025-01-01 e modificado_antes 2025-12-31).
    pasta = caminho completo de uma pasta pessoal para buscar só nela. Só lê o disco; não apaga nada."""
    try:
        items = search_files(tipo, min_mb, max_mb, modificado_depois, modificado_antes, pasta, nome_contem)
    except ValueError as error:
        return str(error)
    _send_ui({"acao": "busca", "itens": items, "descricao": f"busquei e achei {len(items)} arquivo(s)"})
    total = round(sum(i["tamanho_mb"] for i in items) / 1024, 2)
    top = [{"nome": i["nome"], "tamanho_mb": i["tamanho_mb"], "modificado": i["modificado"]} for i in items[:10]]
    return json.dumps({"encontrados": len(items), "total_gb": total, "maiores": top}, ensure_ascii=False)


# Prévia: tipos que o navegador consegue mostrar
PREVIEW_EXTS = KINDS["imagem"] - {".psd", ".heic"} | {".pdf", ".mp4", ".webm", ".mov", ".mp3", ".wav", ".m4a", ".ogg", ".txt"}


def preview_path(caminho: str) -> Path:
    """Valida o arquivo da prévia: existe, está numa pasta pessoal e o navegador sabe mostrar."""
    path = Path(caminho).resolve()
    if not path.is_file() or _root_of(path) is None:
        raise ValueError("Esse arquivo não existe ou está fora das pastas pessoais.")
    if path.suffix.lower() not in PREVIEW_EXTS:
        raise ValueError("Esse tipo de arquivo não tem prévia.")
    return path
