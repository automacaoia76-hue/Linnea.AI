"""Mais ferramentas de arquivos: fotos parecidas, pastas vazias e atalhos quebrados, renomear em lote e compactar em .zip.
Ler as fotos e os atalhos usa o próprio Windows (PowerShell), sem bibliotecas novas."""

import json
import os
import re
import tempfile
import time
import zipfile
from datetime import datetime
from pathlib import Path

from langchain.tools import tool

from paths import DATA_DIR
from tools.cleanups import log_cleanup
from tools.disk_scan import MB, USER_FOLDERS, _walk_files, allowed_folders
from tools.file_tools import _is_personal_file, _is_protected, _send_ui, _user_path, move_paths
from tools.folder_map import _root_of
from tools.system_tools import run_powershell

RENAME_LOG = DATA_DIR / "ultima_renomeacao.json"
PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".bmp"}
MAX_PHOTOS = 400  # ler cada foto leva um tempinho: olha as 400 mais recentes


def _paths_file(paths: list[str]) -> str:
    """Grava a lista de caminhos num arquivo temporário (o PowerShell lê de lá; evita problemas com acentos)."""
    handle = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8")
    handle.write("\n".join(paths))
    handle.close()
    return handle.name


# ---------- Fotos parecidas ----------

# "Impressão digital" de cada foto (dHash): reduz para 9x8 em tons de cinza e compara cada pixel com o vizinho
PHOTO_HASH_SCRIPT = r"""
Add-Type -AssemblyName System.Drawing
$rows = foreach ($path in Get-Content -LiteralPath '{file}' -Encoding UTF8) {
  try {
    $image = [System.Drawing.Image]::FromFile($path)
    $small = New-Object System.Drawing.Bitmap $image, 9, 8
    $bits = ''
    for ($y = 0; $y -lt 8; $y++) { for ($x = 0; $x -lt 8; $x++) {
      $bits += [int]($small.GetPixel($x, $y).GetBrightness() -lt $small.GetPixel($x + 1, $y).GetBrightness())
    } }
    [pscustomobject]@{ caminho = [string]$path; hash = $bits; largura = $image.Width; altura = $image.Height }
    $small.Dispose(); $image.Dispose()
  } catch { }
}
@($rows) | ConvertTo-Json -Compress
"""


@tool
def listar_fotos_parecidas() -> str:
    """Procura FOTOS PARECIDAS (não só cópias idênticas: fotos em sequência, prints repetidos, a mesma foto
    em tamanhos diferentes) nas pastas pessoais. Olha as 400 fotos mais recentes (JPG, PNG, BMP). Só lê.
    Cada grupo vem com "manter" (a de maior resolução) e "remover" (as outras).
    Para apagar as extras, use mover_para_lixeira com os caminhos de "remover"."""
    deadline = time.monotonic() + 20
    photos = [(p, s) for p, s in _walk_files(allowed_folders(), deadline) if os.path.splitext(p)[1].lower() in PHOTO_EXTS]
    photos.sort(key=lambda item: os.path.getmtime(item[0]), reverse=True)
    paths = [p for p, _size in photos[:MAX_PHOTOS]]
    if not paths:
        return "Não achei fotos nas pastas pessoais."
    file = _paths_file(paths)
    try:
        rows = run_powershell(PHOTO_HASH_SCRIPT.replace("{file}", file), timeout=300)
    finally:
        os.remove(file)
    rows = rows if isinstance(rows, list) else [rows]
    # Junta em grupos as fotos com impressões digitais quase iguais (até 6 bits diferentes de 64)
    groups, used = [], set()
    for i, a in enumerate(rows):
        if i in used:
            continue
        group = [a]
        for j in range(i + 1, len(rows)):
            if j not in used and sum(x != y for x, y in zip(a["hash"], rows[j]["hash"])) <= 6:
                group.append(rows[j])
                used.add(j)
        if len(group) > 1:
            group.sort(key=lambda r: (r["largura"] * r["altura"], os.path.getsize(r["caminho"])), reverse=True)
            groups.append({"manter": group[0]["caminho"], "remover": [r["caminho"] for r in group[1:]],
                           "remover_mb": round(sum(os.path.getsize(r["caminho"]) for r in group[1:]) / MB, 1)})
    groups.sort(key=lambda g: g["remover_mb"], reverse=True)
    return json.dumps({"fotos_analisadas": len(rows), "grupos": groups[:15]}, ensure_ascii=False)


# ---------- Pastas vazias e atalhos quebrados ----------

SHORTCUT_SCRIPT = r"""
$shell = New-Object -ComObject WScript.Shell
$rows = foreach ($path in Get-Content -LiteralPath '{file}' -Encoding UTF8) {
  try { [pscustomobject]@{ atalho = [string]$path; destino = $shell.CreateShortcut($path).TargetPath } } catch { }
}
@($rows) | ConvertTo-Json -Compress
"""


@tool
def listar_pastas_vazias_e_atalhos() -> str:
    """Procura PASTAS VAZIAS (sem nenhum arquivo dentro, nem nas subpastas) e ATALHOS QUEBRADOS (.lnk que apontam
    para algo que não existe mais) nas pastas pessoais. Só lê. Para apagar, use mover_para_lixeira com os caminhos."""
    roots = [folder.resolve() for folder in USER_FOLDERS]
    empty, shortcuts = [], []
    for folder in allowed_folders():
        has_files = {}  # pasta -> tem algum arquivo dentro (contando as subpastas)?
        for root, dirs, files in os.walk(folder, topdown=False, onerror=lambda _e: None):
            if any(name.lower().endswith(".lnk") for name in files):
                shortcuts += [os.path.join(root, n) for n in files if n.lower().endswith(".lnk")]
            has_files[root] = bool(files) or any(has_files.get(os.path.join(root, d), True) for d in dirs)
        for path, full in has_files.items():
            parent_empty = not has_files.get(os.path.dirname(path), True)
            if not full and not parent_empty and Path(path).resolve() not in roots:
                empty.append(path)  # só a pasta vazia de cima (não lista as subpastas vazias dentro dela)
    broken = []
    if shortcuts:
        file = _paths_file(shortcuts[:500])
        try:
            rows = run_powershell(SHORTCUT_SCRIPT.replace("{file}", file))
        finally:
            os.remove(file)
        for row in rows if isinstance(rows, list) else [rows]:
            target = row.get("destino") or ""
            if re.match(r"^[a-zA-Z]:\\", target) and not os.path.exists(target):
                broken.append({"atalho": row["atalho"], "apontava_para": target})
    return json.dumps({"pastas_vazias": empty[:40], "atalhos_quebrados": broken[:40]}, ensure_ascii=False)


# ---------- Renomear em lote ----------

INVALID_NAME = re.compile(r'[\\/:*?"<>|]')


@tool
def renomear_arquivos(pasta: str, nomes: list[dict]) -> str:
    """Renomeia arquivos de UMA pasta pessoal. nomes = [{"atual": "IMG_001.jpg", "novo": "Praia 2026 - 01.jpg"}, ...]
    (só os nomes, sem o caminho; mantenha a extensão). Antes, use olhar_pasta para ver os nomes de verdade.
    Dá para desfazer com desfazer_renomeacao. O app pede a confirmação do usuário automaticamente."""
    folder = _user_path(pasta).resolve()
    if not folder.is_dir() or _root_of(folder) is None:
        return "Essa pasta não existe ou está fora das pastas pessoais."
    done, refused = [], []
    for item in nomes:
        old, new = folder / str(item.get("atual", "")), folder / str(item.get("novo", "")).strip()
        if not old.is_file() or _is_protected(old):
            refused.append(f"{old.name} (não existe ou está protegido)")
        elif not new.name or INVALID_NAME.search(new.name):
            refused.append(f"{old.name} (nome novo inválido)")
        elif new.exists():
            refused.append(f"{old.name} (já existe um arquivo chamado {new.name})")
        else:
            old.rename(new)
            done.append({"de": str(old), "para": str(new)})
    if done:
        RENAME_LOG.parent.mkdir(exist_ok=True)
        RENAME_LOG.write_text(json.dumps(done, ensure_ascii=False, indent=2), encoding="utf-8")
        _send_ui({"acao": "arquivos_renomeados", "descricao": f"renomeei {len(done)} arquivo(s)"})
    result = f"Renomeados: {len(done)}."
    return result + (f" Não renomeados: {'; '.join(refused)}." if refused else "")


@tool
def desfazer_renomeacao() -> str:
    """Desfaz a última renomeação em lote (cada arquivo volta ao nome antigo).
    O app pede a confirmação do usuário automaticamente."""
    try:
        done = json.loads(RENAME_LOG.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return "Não há nenhuma renomeação para desfazer."
    restored = 0
    for item in done:
        new, old = Path(item["para"]), Path(item["de"])
        if new.exists() and not old.exists():
            new.rename(old)
            restored += 1
    RENAME_LOG.unlink(missing_ok=True)
    return f"Voltei {restored} arquivo(s) ao nome antigo."


# ---------- Compactar em .zip ----------

@tool
def compactar_em_zip(itens: list[str], nome_zip: str) -> str:
    """Junta arquivos num .zip (na pasta do primeiro arquivo) e manda os originais para a Lixeira, liberando espaço.
    Bom para arquivos antigos que você quer guardar mas quase não usa (documentos, projetos velhos).
    itens = caminhos completos dos arquivos; nome_zip = nome do arquivo .zip. O app pede a confirmação do usuário."""
    files = [Path(p) for p in itens if _is_personal_file(Path(p)) and not _is_protected(Path(p))]
    if not files:
        return "Nenhum dos arquivos existe, está nas pastas pessoais ou pode ser mexido."
    name = INVALID_NAME.sub("", nome_zip).strip() or f"Arquivos antigos {datetime.now():%Y-%m-%d}"
    target = files[0].parent / (name if name.lower().endswith(".zip") else f"{name}.zip")
    if target.exists():
        return f"Já existe um arquivo chamado {target.name} nessa pasta; escolha outro nome."
    original = sum(f.stat().st_size for f in files)
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        used_names = set()
        for f in files:
            arcname = f.name if f.name not in used_names else f"{f.parent.name}_{f.name}"
            used_names.add(arcname)
            archive.write(f, arcname)
    moved, refused, _freed = move_paths([str(f) for f in files])  # originais vão para a Lixeira (dá para restaurar)
    saved = original - target.stat().st_size if moved else 0
    log_cleanup("Compactar em .zip", len(moved), max(saved, 0) / MB)
    _send_ui({"acao": "arquivos_removidos", "descricao": f"compactei {len(moved)} arquivo(s) em {target.name}"})
    result = f"Criei {target} com {len(files)} arquivo(s) e mandei {len(moved)} original(is) para a Lixeira. Economia: {round(saved / MB, 1)} MB."
    return result + (f" Não movidos: {'; '.join(refused)}." if refused else "")
