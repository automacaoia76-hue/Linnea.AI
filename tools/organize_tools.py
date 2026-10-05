"""Organizar a pasta Downloads em subpastas (PDFs, Imagens, Vídeos...), com "desfazer".

- planejar_organizacao_downloads: só lê e mostra o plano (livre).
- organizar_downloads e desfazer_organizacao: mexem em arquivos, então pedem a permissão do usuário
  (o HumanInTheLoopMiddleware pausa o agente e o app mostra o cartão "Aprovar / Recusar").
Só mexe em arquivos SOLTOS na raiz de Downloads; subpastas que já existem ficam como estão.
"""

import json
from pathlib import Path

from langchain.tools import tool

from paths import DATA_DIR
from tools.file_tools import _send_ui
from tools.settings import load_settings

DOWNLOADS = Path.home() / "Downloads"
ORGANIZE_LOG = DATA_DIR / "ultima_organizacao.json"  # para o "desfazer"

CATEGORIES = {
    "PDFs": {".pdf"},
    "Imagens": {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic", ".svg", ".ico"},
    "Vídeos": {".mp4", ".mkv", ".mov", ".avi", ".webm", ".wmv"},
    "Áudios": {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"},
    "Documentos": {".doc", ".docx", ".txt", ".odt", ".rtf", ".xls", ".xlsx", ".csv", ".ppt", ".pptx", ".md"},
    "Compactados": {".zip", ".rar", ".7z", ".tar", ".gz"},
    "Instaladores": {".exe", ".msi", ".bin", ".iso"},
}
SKIP_SUFFIXES = {".crdownload", ".part", ".tmp", ".partial"}  # downloads ainda em andamento: não mexe


def _category(path: Path):
    ext = path.suffix.lower()
    return next((name for name, exts in CATEGORIES.items() if ext in exts), None)


def _loose_files_by_category():
    """Arquivos soltos na raiz de Downloads (não entra em subpastas), agrupados por categoria."""
    groups = {}
    for path in DOWNLOADS.iterdir():
        if not path.is_file() or path.suffix.lower() in SKIP_SUFFIXES or path.name.lower() == "desktop.ini":
            continue
        category = _category(path)
        if category:
            groups.setdefault(category, []).append(path)
    return groups


def _free_name(folder: Path, name: str) -> Path:
    """Caminho livre dentro da pasta (se já existir um arquivo com o mesmo nome, vira "nome (2).ext")."""
    target = folder / name
    counter = 2
    while target.exists():
        target = folder / f"{Path(name).stem} ({counter}){Path(name).suffix}"
        counter += 1
    return target


@tool
def planejar_organizacao_downloads() -> str:
    """Mostra como a pasta Downloads ficaria organizada em subpastas (PDFs, Imagens, Vídeos, Áudios, Documentos,
    Compactados, Instaladores): quantos arquivos soltos iriam para cada uma e alguns exemplos.
    Só lê; não move nada. Use antes de organizar_downloads."""
    if "Downloads" in load_settings()["pastas_proibidas"]:
        return "A pasta Downloads está proibida nas Configurações; não mexi nela."
    groups = _loose_files_by_category()
    plan = {
        name: {"quantidade": len(files), "exemplos": [f.name for f in files[:3]]}
        for name, files in sorted(groups.items(), key=lambda item: -len(item[1]))
    }
    return json.dumps({"total_arquivos": sum(len(f) for f in groups.values()), "pastas": plan}, ensure_ascii=False)


@tool
def organizar_downloads(categorias: list[str]) -> str:
    """Organiza a pasta Downloads: cria as subpastas das categorias pedidas e move para elas os arquivos soltos.
    categorias: nomes das pastas (use as que planejar_organizacao_downloads mostrou; para tudo, passe todas).
    Só mexe em arquivos soltos na raiz de Downloads. Dá para desfazer com desfazer_organizacao.
    O app pede a confirmação do usuário automaticamente antes de executar."""
    if "Downloads" in load_settings()["pastas_proibidas"]:
        return "A pasta Downloads está proibida nas Configurações; não mexi nela."
    groups = _loose_files_by_category()
    moves, failed = [], []
    for category in categorias:
        files = groups.get(category, [])
        if not files:
            continue
        folder = DOWNLOADS / category
        folder.mkdir(exist_ok=True)
        for path in files:
            target = _free_name(folder, path.name)
            try:
                path.rename(target)
                moves.append({"de": str(path), "para": str(target)})
            except OSError:
                failed.append(path.name)  # arquivo aberto em algum programa
    ORGANIZE_LOG.parent.mkdir(exist_ok=True)
    ORGANIZE_LOG.write_text(json.dumps(moves, ensure_ascii=False, indent=2), encoding="utf-8")
    if moves:
        _send_ui({"acao": "downloads_organizados", "descricao": f"organizei {len(moves)} arquivo(s) da pasta Downloads"})
    folders = len({Path(m["para"]).parent.name for m in moves})
    result = f"Organizei {len(moves)} arquivo(s) em {folders} pasta(s) dentro de Downloads."
    if failed:
        result += f" Não consegui mover (talvez estejam abertos): {', '.join(failed[:10])}."
    return result


@tool
def desfazer_organizacao() -> str:
    """Desfaz a última organização da pasta Downloads: devolve cada arquivo para onde estava antes
    e apaga as subpastas que ficarem vazias. O app pede a confirmação do usuário automaticamente."""
    if not ORGANIZE_LOG.exists():
        return "Não há nenhuma organização para desfazer."
    moves = json.loads(ORGANIZE_LOG.read_text(encoding="utf-8"))
    restored, failed = 0, []
    for move in reversed(moves):
        current, original = Path(move["para"]), Path(move["de"])
        try:
            current.rename(_free_name(original.parent, original.name))
            restored += 1
        except OSError:
            failed.append(current.name)
    for folder in {Path(m["para"]).parent for m in moves}:
        try:
            folder.rmdir()  # só apaga se estiver vazia
        except OSError:
            pass
    ORGANIZE_LOG.unlink()
    if restored:
        _send_ui({"acao": "downloads_organizados", "descricao": f"devolvi {restored} arquivo(s) para o lugar original"})
    result = f"Devolvi {restored} arquivo(s) para o lugar onde estavam."
    if failed:
        result += f" Não consegui devolver: {', '.join(failed[:10])}."
    return result
