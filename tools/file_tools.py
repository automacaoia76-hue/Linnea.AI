"""Ferramentas que MEXEM em arquivos. Todas pedem permissão ao usuário antes de rodar
(o HumanInTheLoopMiddleware pausa o agente e o app mostra um cartão "Aprovar / Recusar").

Segurança:
- mover_para_lixeira manda para a Lixeira do Windows (dá para restaurar) e só aceita arquivos das pastas pessoais.
- limpar_lixo apaga temporários do usuário (com mais de 1 dia) e esvazia a Lixeira: isso é PERMANENTE.
"""

import ctypes
import json
import os
import re
import time
from ctypes import wintypes
from pathlib import Path

from langchain.tools import tool
from langgraph.config import get_stream_writer

from tools.cleanups import log_cleanup
from tools.disk_scan import MB, allowed_folders, find_duplicates
from tools.settings import load_settings


class _SHFILEOPSTRUCTW(ctypes.Structure):
    _fields_ = [
        ("hwnd", wintypes.HWND),
        ("wFunc", wintypes.UINT),
        ("pFrom", wintypes.LPCWSTR),
        ("pTo", wintypes.LPCWSTR),
        ("fFlags", ctypes.c_ushort),
        ("fAnyOperationsAborted", wintypes.BOOL),
        ("hNameMappings", ctypes.c_void_p),
        ("lpszProgressTitle", wintypes.LPCWSTR),
    ]


FO_DELETE = 3
FOF_SILENT, FOF_NOCONFIRMATION, FOF_ALLOWUNDO, FOF_NOERRORUI = 0x4, 0x10, 0x40, 0x400


def _send_to_recycle_bin(path: str) -> bool:
    """Manda um arquivo para a Lixeira do Windows (FOF_ALLOWUNDO = dá para restaurar)."""
    operation = _SHFILEOPSTRUCTW(
        wFunc=FO_DELETE,
        pFrom=path + "\0",  # a API do Windows exige a lista terminada em dois \0
        fFlags=FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI,
    )
    return ctypes.windll.shell32.SHFileOperationW(ctypes.byref(operation)) == 0


def _is_personal_file(path: Path) -> bool:
    """True se o arquivo existe e está dentro de uma das pastas pessoais (nunca arquivos do sistema)."""
    try:
        resolved = path.resolve()
    except OSError:
        return False
    return resolved.is_file() and any(resolved.is_relative_to(folder.resolve()) for folder in allowed_folders())


def _is_protected(path: Path) -> bool:
    """True se o caminho está na lista "nunca apagar" das Configurações (ou dentro de uma pasta dela),
    ou se é uma pasta que TEM algo protegido dentro (apagar a pasta levaria o protegido junto)."""
    try:
        resolved = path.resolve()
    except OSError:
        return False
    for raw in load_settings()["nunca_apagar"]:
        protected = Path(raw).resolve()
        if resolved == protected or resolved.is_relative_to(protected) or protected.is_relative_to(resolved):
            return True
    return False


def _user_path(raw: str) -> Path:
    """Entende caminhos incompletos: "Downloads/PDFs" ou "~/Downloads/PDFs" viram C:/Users/<você>/Downloads/PDFs."""
    path = Path(raw).expanduser()
    return path if path.is_absolute() else Path.home() / path


def _is_personal_folder(path: Path) -> bool:
    """True se é uma SUBPASTA dentro de uma pasta pessoal (ex.: Downloads/PDFs).
    Nunca a própria pasta pessoal inteira (Downloads, Documentos...) nem nada fora delas."""
    try:
        resolved = path.resolve()
    except OSError:
        return False
    if not resolved.is_dir():
        return False
    roots = [folder.resolve() for folder in allowed_folders()]
    return resolved not in roots and any(resolved.is_relative_to(root) for root in roots)


def _folder_size(path: Path) -> tuple[int, int]:
    """(bytes, quantidade de arquivos) de uma pasta, somando as subpastas."""
    total, count = 0, 0
    for root, _dirs, files in os.walk(path, onerror=lambda _e: None):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
                count += 1
            except OSError:
                continue
    return total, count


def _send_ui(action: dict):
    try:
        get_stream_writer()({"ui": action})
    except (RuntimeError, KeyError):  # fora do streaming do agente não há tela para avisar
        pass  # fora do streaming (ex.: chat no terminal)


@tool
def mover_para_lixeira(caminhos: list[str]) -> str:
    """Move ARQUIVOS ou PASTAS INTEIRAS para a Lixeira do Windows (o usuário pode restaurar depois).
    Aceita caminhos de arquivos e de subpastas (ex.: o caminho completo de Downloads/PDFs apaga a pasta PDFs com tudo dentro).
    Só funciona dentro das pastas pessoais (Downloads, Documentos, Imagens, Vídeos, Música, Área de Trabalho);
    a própria pasta pessoal inteira (ex.: Downloads) nunca pode ser apagada.
    O app pede a confirmação do usuário automaticamente antes de executar."""
    moved, refused, freed = move_paths(caminhos)
    if moved:
        _send_ui({"acao": "arquivos_removidos", "descricao": f"movi {len(moved)} item(ns) para a Lixeira"})
    result = f"Movidos para a Lixeira: {', '.join(moved) or 'nada'}. {round(freed / MB, 1)} MB liberados."
    if refused:
        result += " Não movidos: " + "; ".join(refused)
    return result


def move_paths(caminhos: list[str]) -> tuple[list[str], list[str], int]:
    """Manda os caminhos para a Lixeira com as travas de segurança. Usada pela Linnea e pela tela Arquivos.
    Devolve (movidos, recusados com o motivo, bytes liberados)."""
    moved, refused = [], []
    freed = 0
    for raw in caminhos:
        path = _user_path(raw)
        if _is_protected(path):
            refused.append(f"{raw} (protegido na lista \"nunca apagar\" das Configurações)")
            continue
        if _is_personal_file(path):
            size, label = path.stat().st_size, path.name
        elif _is_personal_folder(path):
            size, count = _folder_size(path)
            label = f"{path.name} (pasta com {count} arquivos)"
        else:
            refused.append(f"{raw} (não existe, está fora das pastas pessoais ou é uma pasta pessoal inteira)")
            continue
        if _send_to_recycle_bin(str(path)):
            moved.append(label)
            freed += size
        else:
            refused.append(f"{raw} (o Windows não deixou mover; talvez algo esteja aberto)")
    log_cleanup("Lixeira", len(moved), freed / MB)  # para o "Já liberei" da tela Gráficos
    return moved, refused, freed


TEMP_FOLDER = Path(os.environ.get("TEMP", Path.home() / "AppData" / "Local" / "Temp"))


def delete_old_temp(days: float, temp: Path = TEMP_FOLDER) -> tuple[int, int]:
    """Apaga os arquivos temporários do usuário com mais de `days` dias. Devolve (quantos, bytes liberados).
    Usada pelo limpar_lixo e pela limpeza automática semanal."""
    limit = time.time() - days * 86400
    deleted, freed = 0, 0
    for root, _dirs, files in os.walk(temp, onerror=lambda _e: None):
        for name in files:
            path = os.path.join(root, name)
            try:
                if os.path.getmtime(path) < limit:
                    size = os.path.getsize(path)
                    os.remove(path)
                    deleted += 1
                    freed += size
            except OSError:
                continue  # arquivo em uso por algum programa: deixa quieto
    return deleted, freed


@tool
def limpar_lixo() -> str:
    """Apaga os arquivos temporários do usuário com mais de 1 dia e esvazia a Lixeira do Windows.
    ATENÇÃO: é permanente (não dá para recuperar). O app pede a confirmação do usuário automaticamente."""
    deleted, freed = delete_old_temp(days=1)
    # Esvazia a Lixeira sem mostrar janela de confirmação (a confirmação já foi feita no app)
    ctypes.windll.shell32.SHEmptyRecycleBinW(None, None, 0x1 | 0x2 | 0x4)
    log_cleanup("Lixo", deleted, freed / MB)
    _send_ui({"acao": "lixo_limpo", "descricao": "limpei os temporários e esvaziei a Lixeira"})
    return f"Apaguei {deleted} arquivos temporários ({round(freed / MB, 1)} MB) e esvaziei a Lixeira."


# ---------- Duplicatas ----------

_COPY_MARKERS = re.compile(r"\(\d+\)|\bc[oó]pia\b|\bcopy\b", re.IGNORECASE)


def _keep_choice(paths):
    """Qual cópia manter: a sem "(1)" / "cópia" / "copy" no nome; empate -> nome mais curto; depois a mais antiga."""
    def score(path):
        name = os.path.basename(path)
        try:
            modified = os.path.getmtime(path)
        except OSError:
            modified = float("inf")
        return (bool(_COPY_MARKERS.search(name)), len(name), modified)

    return min(paths, key=score)


@tool
def listar_duplicatas() -> str:
    """Lista os arquivos duplicados (conteúdo idêntico) das pastas pessoais e sugere qual cópia manter de cada grupo.
    Devolve os maiores grupos (até 20), cada um com 'manter' (fica) e 'remover' (cópias extras).
    Use antes de apagar_duplicatas. Só lê o disco; não apaga nada."""
    groups = sorted(find_duplicates(), key=lambda g: g[0] * (len(g[1]) - 1), reverse=True)
    result = []
    for size, paths in groups[:20]:
        keep = _keep_choice(paths)
        result.append({"tamanho_mb": round(size / MB, 1), "manter": keep, "remover": [p for p in paths if p != keep]})
    total_extra = sum(len(paths) - 1 for _, paths in groups)
    wasted = sum(size * (len(paths) - 1) for size, paths in groups)
    return json.dumps(
        {
            "grupos_total": len(groups),
            "copias_extras_total": total_extra,
            "espaco_desperdicado_mb": round(wasted / MB, 1),
            "maiores_grupos": result,
        },
        ensure_ascii=False,
    )


@tool
def apagar_duplicatas(remover: list[str]) -> str:
    """Move para a Lixeira as cópias EXTRAS de arquivos duplicados (dá para restaurar).
    Passe em 'remover' os caminhos da lista 'remover' que listar_duplicatas sugeriu.
    Segurança: confere o conteúdo de novo e NUNCA apaga a última cópia de um arquivo.
    O app pede a confirmação do usuário automaticamente antes de executar."""
    wanted = {os.path.normcase(os.path.abspath(p)) for p in remover}
    removed, kept_safe, refused = [], [], []
    kept_paths = set()  # cópias mantidas pela trava de segurança
    freed = 0
    for size, paths in find_duplicates():  # confere de novo: só apaga o que AINDA é duplicata agora
        in_group = [p for p in paths if os.path.normcase(os.path.abspath(p)) in wanted]
        if not in_group:
            continue
        if len(in_group) == len(paths):  # pediram para apagar todas as cópias: mantém uma
            keep = _keep_choice(paths)
            in_group = [p for p in in_group if p != keep]
            kept_safe.append(os.path.basename(keep))
            kept_paths.add(os.path.normcase(os.path.abspath(keep)))
        for path in in_group:
            if not _is_protected(Path(path)) and _is_personal_file(Path(path)) and _send_to_recycle_bin(path):
                removed.append(path)
                freed += size
            else:
                refused.append(os.path.basename(path))
    found = {os.path.normcase(os.path.abspath(p)) for p in removed} | kept_paths
    not_duplicates = [os.path.basename(p) for p in remover if os.path.normcase(os.path.abspath(p)) not in found]
    log_cleanup("Duplicatas", len(removed), freed / MB)
    if removed:
        _send_ui({"acao": "arquivos_removidos", "descricao": f"movi {len(removed)} cópia(s) duplicada(s) para a Lixeira"})
    result = f"Movidas para a Lixeira: {len(removed)} cópias duplicadas, {round(freed / MB, 1)} MB liberados."
    if kept_safe:
        result += f" Por segurança mantive 1 cópia de: {', '.join(kept_safe)}."
    if not_duplicates:
        result += f" Ignorados (não eram mais duplicata ou não puderam ser movidos): {', '.join(not_duplicates[:10])}."
    return result
