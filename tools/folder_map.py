"""Mapa do disco (tela Arquivos): o tamanho de cada pasta e arquivo dentro de uma pasta pessoal.
Só lê o disco e só funciona dentro das pastas pessoais (Downloads, Documentos...)."""

import json
import os
import time
from pathlib import Path

from langchain.tools import tool

from tools.disk_scan import MB, _file_type, _folder_size, allowed_roots
from tools.file_tools import _user_path
from tools.labels import label_for

MAX_ITEMS = 40  # o resto vira um quadradinho "Outros"


def _root_of(path: Path):
    """Pasta pessoal que contém o caminho (ou None se estiver fora delas)."""
    for name, folder in allowed_roots():
        if path == folder.resolve() or path.is_relative_to(folder.resolve()):
            return name, folder.resolve()
    return None


def _item(name, path, kind, size):
    item = {"nome": name, "caminho": str(path), "tipo": kind, "tamanho_mb": round(size / MB, 2)}
    if kind != "pasta":
        item["etiqueta"] = label_for(str(path))
    return item


def folder_map(caminho: str = "", time_limit_s: float = 20) -> dict:
    """Itens de uma pasta com o tamanho de cada um, do maior para o menor.
    Sem caminho: devolve as pastas pessoais (o "topo" do mapa)."""
    deadline = time.monotonic() + time_limit_s
    if not caminho:
        items = [
            _item(name, folder, "pasta", _folder_size(folder, deadline))
            for name, folder in allowed_roots()
            if folder.exists()
        ]
        items.sort(key=lambda i: i["tamanho_mb"], reverse=True)
        return {"caminho": "", "trilha": [], "itens": items, "parcial": time.monotonic() > deadline}

    path = Path(caminho).resolve()
    root = _root_of(path)
    if root is None or not path.is_dir():
        raise ValueError("Essa pasta não existe ou está fora das pastas pessoais.")

    items = []
    with os.scandir(path) as entries:
        for entry in entries:
            try:
                if entry.is_symlink():
                    continue
                if entry.is_dir():
                    items.append(_item(entry.name, entry.path, "pasta", _folder_size(Path(entry.path), deadline)))
                else:
                    items.append(_item(entry.name, entry.path, _file_type(entry.name), entry.stat().st_size))
            except OSError:
                continue  # sem permissão ou sumiu no meio
    items.sort(key=lambda i: i["tamanho_mb"], reverse=True)
    rest = items[MAX_ITEMS:]
    items = items[:MAX_ITEMS]
    if rest:
        items.append({"nome": f"Outros {len(rest)} itens", "caminho": None, "tipo": "outros",
                      "tamanho_mb": round(sum(i["tamanho_mb"] for i in rest), 2)})

    # Trilha para o "caminho de pão" no topo da tela: Downloads > Jogos > Mods
    root_name, root_path = root
    trail = [{"nome": root_name, "caminho": str(root_path)}]
    current = root_path
    for part in path.relative_to(root_path).parts:
        current = current / part
        trail.append({"nome": part, "caminho": str(current)})
    return {"caminho": str(path), "trilha": trail, "itens": items, "parcial": time.monotonic() > deadline}


@tool
def olhar_pasta(caminho: str) -> str:
    """Mostra o que tem dentro de uma pasta pessoal: os maiores itens, com nome, tipo e tamanho. Só lê; não apaga nada.
    Use para entender o que é uma pasta antes de explicar ao usuário ou de sugerir apagar.
    Passe o caminho completo da pasta (ex.: a pasta Jogos dentro de Downloads do usuário)."""
    try:
        data = folder_map(str(_user_path(caminho)), time_limit_s=10)
    except (ValueError, OSError) as error:
        return str(error)
    items = [{"nome": i["nome"], "tipo": i["tipo"], "tamanho_mb": i["tamanho_mb"]} for i in data["itens"][:25]]
    return json.dumps({"pasta": data["caminho"], "itens": items}, ensure_ascii=False)
