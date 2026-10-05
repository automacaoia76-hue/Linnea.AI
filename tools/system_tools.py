"""Ferramentas do sistema: programas pesados agora, programas que abrem com o Windows, programas instalados
(e desinstalar) e cache dos navegadores. Usa só o que vem com o Python e o Windows (registro e PowerShell)."""

import ctypes
import json
import os
import subprocess
from pathlib import Path

try:
    import winreg
except ImportError:  # Linux (Linnea na nuvem): nada daqui roda lá
    winreg = None

from langchain.tools import tool

from tools.cleanups import log_cleanup
from tools.disk_scan import MB
from tools.file_tools import _send_ui


def run_powershell(script: str, timeout: int = 60):
    """Roda um script do PowerShell e devolve o JSON que ele imprimiu."""
    output = subprocess.run(
        ["powershell", "-NoProfile", "-Command", "[Console]::OutputEncoding = [Text.Encoding]::UTF8\n" + script],
        capture_output=True, text=True, encoding="utf-8", timeout=timeout, creationflags=subprocess.CREATE_NO_WINDOW,
    ).stdout.strip()
    return json.loads(output) if output else []


# ---------- Programas pesados agora ----------

HEAVY_SCRIPT = r"""
$cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
$before = @{}; Get-Process | ForEach-Object { $before[$_.Id] = $_.CPU }
Start-Sleep -Milliseconds 1000
$rows = Get-Process | ForEach-Object {
  $delta = 0; if ($_.CPU -ne $null -and $before[$_.Id] -ne $null) { $delta = $_.CPU - $before[$_.Id] }
  [pscustomobject]@{ nome = $_.ProcessName; descricao = $_.Description; ram = $_.WorkingSet64; cpu = 100 * $delta / $cores }
}
$rows | Group-Object nome | ForEach-Object {
  [pscustomobject]@{
    nome = $_.Name
    descricao = ($_.Group | Where-Object { $_.descricao } | Select-Object -First 1).descricao
    processos = $_.Count
    ram_mb = [math]::Round(($_.Group | Measure-Object ram -Sum).Sum / 1MB)
    cpu = [math]::Round(($_.Group | Measure-Object cpu -Sum).Sum, 1)
  }
} | Sort-Object ram_mb -Descending | Select-Object -First 12 | ConvertTo-Json -Compress
"""


@tool
def programas_pesados() -> str:
    """Mostra os programas que mais estão usando memória RAM e processador AGORA (medidos por 1 segundo),
    juntando os vários processos de um mesmo programa (ex.: as abas do navegador). Só lê.
    Use quando perguntarem por que o PC está lento ou o que está pesando. Explique cada um em linguagem simples."""
    try:
        rows = run_powershell(HEAVY_SCRIPT)
    except (OSError, ValueError, subprocess.SubprocessError):
        return "Não consegui medir os programas agora."
    return json.dumps(rows if isinstance(rows, list) else [rows], ensure_ascii=False)


# ---------- Programas que abrem com o Windows ----------

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
APPROVED_KEY = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved"
USER_STARTUP = Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"
COMMON_STARTUP = Path(os.environ.get("PROGRAMDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"


def _approved(hive, sub: str, name: str) -> bool:
    """O Gerenciador de Tarefas guarda se um item está ativo em StartupApproved (1º byte par = ativo)."""
    try:
        with winreg.OpenKey(hive, f"{APPROVED_KEY}\\{sub}") as key:
            value, _ = winreg.QueryValueEx(key, name)
            return value[0] % 2 == 0
    except OSError:
        return True  # sem registro = ativo


def startup_items() -> list[dict]:
    items = []
    for hive, path, who in [
        (winreg.HKEY_CURRENT_USER, RUN_KEY, "usuario"),
        (winreg.HKEY_LOCAL_MACHINE, RUN_KEY, "todos"),
        (winreg.HKEY_LOCAL_MACHINE, r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run", "todos"),
    ]:
        try:
            with winreg.OpenKey(hive, path) as key:
                for i in range(winreg.QueryInfoKey(key)[1]):
                    name, command, _ = winreg.EnumValue(key, i)
                    approved_hive = winreg.HKEY_CURRENT_USER if who == "usuario" else winreg.HKEY_LOCAL_MACHINE
                    items.append({"nome": name, "comando": str(command)[:160], "de": who,
                                  "ativo": _approved(approved_hive, "Run" if "WOW" not in path else "Run32", name)})
        except OSError:
            continue
    for folder, who in [(USER_STARTUP, "usuario"), (COMMON_STARTUP, "todos")]:
        if folder.exists():
            for entry in folder.iterdir():
                if entry.suffix.lower() in (".lnk", ".exe", ".bat", ".cmd", ".url"):
                    hive = winreg.HKEY_CURRENT_USER if who == "usuario" else winreg.HKEY_LOCAL_MACHINE
                    items.append({"nome": entry.name, "comando": "(atalho na pasta Inicializar)", "de": who,
                                  "ativo": _approved(hive, "StartupFolder", entry.name)})
    return items


@tool
def listar_inicializacao() -> str:
    """Lista os programas que abrem sozinhos quando o Windows liga (e se estão ativos). Só lê.
    "de": "usuario" = dá para desativar pelo app; "todos" = só pelo Gerenciador de Tarefas como administrador."""
    return json.dumps(startup_items(), ensure_ascii=False)


def _set_startup(names: list[str], active: bool) -> tuple[list[str], list[str]]:
    """Liga/desliga itens da inicialização do usuário do mesmo jeito que o Gerenciador de Tarefas (reversível)."""
    done, refused = [], []
    by_name = {item["nome"].lower(): item for item in startup_items()}
    for name in names:
        item = by_name.get(name.lower())
        if item is None:
            refused.append(f"{name} (não está na inicialização)")
            continue
        if item["de"] != "usuario":
            refused.append(f"{name} (é de todos os usuários: desative pelo Gerenciador de Tarefas como administrador)")
            continue
        sub = "StartupFolder" if item["comando"].startswith("(atalho") else "Run"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, f"{APPROVED_KEY}\\{sub}") as key:
            winreg.SetValueEx(key, item["nome"], 0, winreg.REG_BINARY, bytes([2 if active else 3]) + bytes(11))
        done.append(item["nome"])
    return done, refused


@tool
def desativar_inicializacao(nomes: list[str]) -> str:
    """Desativa programas que abrem com o Windows (só os do usuário; dá para reativar depois).
    Passe os nomes como listar_inicializacao mostrou. O app pede a confirmação do usuário automaticamente."""
    done, refused = _set_startup(nomes, active=False)
    if done:
        _send_ui({"acao": "inicializacao", "descricao": f"desativei {len(done)} programa(s) da inicialização"})
    result = f"Desativados (não abrem mais com o Windows): {', '.join(done) or 'nenhum'}."
    return result + (f" Não mexi em: {'; '.join(refused)}." if refused else "")


@tool
def reativar_inicializacao(nomes: list[str]) -> str:
    """Reativa programas que tinham sido desativados da inicialização do Windows.
    O app pede a confirmação do usuário automaticamente."""
    done, refused = _set_startup(nomes, active=True)
    result = f"Reativados: {', '.join(done) or 'nenhum'}."
    return result + (f" Não mexi em: {'; '.join(refused)}." if refused else "")


# ---------- Programas instalados (e desinstalar) ----------

UNINSTALL_KEYS = [
    (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
    (winreg.HKEY_LOCAL_MACHINE, r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
    (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
] if winreg else []  # Linux (nuvem): sem registro do Windows


def _split_command(command: str) -> tuple[str, str]:
    """'"C:\\X\\unins000.exe" /SILENT' -> ('C:\\X\\unins000.exe', '/SILENT'); 'MsiExec.exe /X{...}' -> ('MsiExec.exe', '/X{...}')."""
    command = command.strip()
    if command.startswith('"'):
        end = command.find('"', 1)
        return command[1:end], command[end + 1 :].strip()
    index = command.lower().find(".exe")
    return (command[: index + 4], command[index + 4 :].strip()) if index >= 0 else (command, "")


def installed_programs() -> list[dict]:
    programs = {}
    for hive, path in UNINSTALL_KEYS:
        try:
            root = winreg.OpenKey(hive, path)
        except OSError:
            continue
        for i in range(winreg.QueryInfoKey(root)[0]):
            try:
                with winreg.OpenKey(root, winreg.EnumKey(root, i)) as key:
                    get = lambda name, default=None: _reg_value(key, name, default)
                    name, uninstall = get("DisplayName"), get("UninstallString")
                    if not name or not uninstall or get("SystemComponent", 0) == 1 or get("ParentKeyName"):
                        continue  # componentes do sistema e atualizações ficam de fora
                    date = str(get("InstallDate", "") or "")
                    exe, _params = _split_command(uninstall)
                    location = (get("InstallLocation", "") or "").strip().strip('"') or (os.path.dirname(exe) if os.path.isabs(exe) else "")
                    # Já apagado: o desinstalador ou a pasta do programa sumiram (só sobrou a entrada na lista do Windows)
                    removed = (os.path.isabs(exe) and not os.path.exists(exe)) or (bool(location) and not os.path.exists(location))
                    programs[name] = {
                        "nome": name,
                        "editor": get("Publisher", ""),
                        "versao": get("DisplayVersion", ""),
                        "tamanho_mb": 0 if removed else round((get("EstimatedSize", 0) or 0) / 1024),
                        "disco": location[:2].upper() if location[1:2] == ":" else "",
                        "ja_removido": removed,
                        "instalado_em": f"{date[6:8]}/{date[4:6]}/{date[:4]}" if len(date) == 8 else "",
                        "_desinstalar": uninstall,
                    }
            except OSError:
                continue
        root.Close()
    return list(programs.values())


def _reg_value(key, name, default=None):
    try:
        return winreg.QueryValueEx(key, name)[0]
    except OSError:
        return default


@tool
def listar_programas_instalados(busca: str = "") -> str:
    """Lista os programas instalados, do maior para o menor (até 25), com editor, versão, tamanho, data de instalação
    e o disco onde estão (C:, E:...). ja_removido = True: o programa já foi apagado do disco e só sobrou na lista do
    Windows (não ocupa espaço e não dá para desinstalar). busca = parte do nome (ex.: "steam"). Só lê."""
    programs = installed_programs()
    if busca:
        programs = [p for p in programs if busca.lower() in p["nome"].lower()]
    programs.sort(key=lambda p: p["tamanho_mb"], reverse=True)
    visible = [{k: v for k, v in p.items() if not k.startswith("_")} for p in programs[:25]]
    return json.dumps({"total": len(programs), "programas": visible}, ensure_ascii=False)


@tool
def desinstalar_programa(nome: str) -> str:
    """Abre o DESINSTALADOR do próprio programa (o usuário termina na janela dele). Passe o nome exato como
    listar_programas_instalados mostrou. Atenção: remove o programa do PC. O app pede a confirmação do usuário."""
    program = next((p for p in installed_programs() if p["nome"].lower() == nome.lower()), None)
    if program is None:
        return f"Não achei o programa \"{nome}\" na lista de instalados."
    if program["ja_removido"]:
        return (f"{program['nome']} já foi apagado do disco: só sobrou o nome na lista de programas do Windows, "
                "sem desinstalador. Ele não ocupa espaço; não há nada para desinstalar.")
    exe, params = _split_command(program["_desinstalar"])
    if exe.lower().startswith("msiexec"):
        params = params.replace("/I", "/X").replace("/i", "/X")  # /I abre "modificar"; /X desinstala
    # ShellExecute (e não um processo comum): assim, se o desinstalador precisar de administrador, o Windows mostra o pedido
    result = ctypes.windll.shell32.ShellExecuteW(None, "open", exe, params or None, None, 1)
    if result <= 32:  # o Windows devolve um número até 32 quando não conseguiu abrir
        return f"Não consegui abrir o desinstalador do {program['nome']} (erro {result}). Tente pelo Aplicativos instalados do Windows."
    _send_ui({"acao": "desinstalar", "descricao": f"abri o desinstalador do {program['nome']}"})
    return f"Abri o desinstalador do {program['nome']}. O usuário precisa terminar na janela que abriu (pode estar atrás do navegador)."


# ---------- Cache dos navegadores ----------

LOCAL = Path(os.environ.get("LOCALAPPDATA", ""))
CHROMIUM = {"Edge": LOCAL / "Microsoft" / "Edge" / "User Data", "Chrome": LOCAL / "Google" / "Chrome" / "User Data",
            "Brave": LOCAL / "BraveSoftware" / "Brave-Browser" / "User Data"}
CACHE_FOLDERS = [Path("Cache"), Path("Code Cache"), Path("GPUCache"), Path("Service Worker") / "CacheStorage"]


def _cache_dirs() -> dict[str, list[Path]]:
    found = {}
    for browser, data in CHROMIUM.items():
        if data.exists():
            profiles = [p for p in data.iterdir() if p.is_dir() and (p.name == "Default" or p.name.startswith("Profile "))]
            found[browser] = [profile / folder for profile in profiles for folder in CACHE_FOLDERS if (profile / folder).exists()]
    firefox = LOCAL / "Mozilla" / "Firefox" / "Profiles"
    if firefox.exists():
        found["Firefox"] = [p / "cache2" for p in firefox.iterdir() if (p / "cache2").exists()]
    return {browser: dirs for browser, dirs in found.items() if dirs}


def _walk_size(folder: Path) -> int:
    total = 0
    for root, _dirs, files in os.walk(folder, onerror=lambda _e: None):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                continue
    return total


@tool
def tamanho_cache_navegadores() -> str:
    """Mostra quanto espaço o cache de cada navegador instalado ocupa (Edge, Chrome, Brave, Firefox). Só lê."""
    return json.dumps({b: round(sum(_walk_size(d) for d in dirs) / MB) for b, dirs in _cache_dirs().items()}, ensure_ascii=False)


@tool
def limpar_cache_navegador(navegadores: list[str]) -> str:
    """Apaga o CACHE dos navegadores pedidos (arquivos temporários de sites; não apaga senhas, favoritos nem histórico).
    É permanente. Com o navegador aberto, parte dos arquivos fica em uso e não sai. O app pede a confirmação."""
    dirs = _cache_dirs()
    deleted, freed = 0, 0
    for browser in navegadores:
        for folder in dirs.get(browser.strip().capitalize(), []):
            for root, _subs, files in os.walk(folder, onerror=lambda _e: None):
                for name in files:
                    path = os.path.join(root, name)
                    try:
                        size = os.path.getsize(path)
                        os.remove(path)
                        deleted += 1
                        freed += size
                    except OSError:
                        continue  # em uso pelo navegador aberto
    log_cleanup("Cache do navegador", deleted, freed / MB)
    if deleted:
        _send_ui({"acao": "lixo_limpo", "descricao": f"limpei o cache: {round(freed / MB)} MB"})
    return f"Apaguei {deleted} arquivos de cache ({round(freed / MB)} MB). Arquivos em uso (navegador aberto) ficaram."

