"""Retrato do PC para a nuvem (Supabase): a Linnea na nuvem (celular, PC da empresa) responde com o último retrato.

Vai: peças, saúde (CPU, RAM, temperaturas, discos), resumo do último scan, do que o disco é feito, histórico
(só as pastas principais), limpezas, memória e algumas configurações. NÃO vai: nomes de arquivos.
Fica só o retrato mais recente (tabela "retrato", uma linha). Envia ao ligar a API, a cada 10 minutos e depois
de cada scan. Só funciona com SUPABASE_URL e SUPABASE_API_SECRET_KEY no .env.

Na nuvem (LINNEA_MODO=nuvem) é o caminho de volta: baixa o retrato a cada minuto e grava como os arquivos de sempre
(scan.json, histórico, limpezas, configurações e Memória.md), então as telas e as ferramentas funcionam igual."""

import json
import os
import threading
import time
import urllib.request
from datetime import datetime

from tools.cleanups import CLEANUPS_FILE, load_cleanups
from tools.disk_stats import SCAN_FILE, composition
from tools.history import HISTORY_FILE, load_history
from tools.memory import HEADER, NOTEBOOK, notebook
from tools.pc_health import hardware_info, pc_health
from tools.retrato import RETRATO_FILE
from tools.settings import load_settings, save_settings

SEND_EVERY_S = 600  # 10 minutos
DOWNLOAD_EVERY_S = 60  # na nuvem: confere se o PC mandou um retrato novo a cada minuto
_user_id = None  # id da sua conta no Supabase (descoberto na primeira vez)


def enabled() -> bool:
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_API_SECRET_KEY"))


def _request(method: str, path: str, body=None, extra_headers=None):
    key = os.environ["SUPABASE_API_SECRET_KEY"]  # chave secreta: só o PC e o servidor da Linnea têm
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", **(extra_headers or {})}
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    request = urllib.request.Request(os.environ["SUPABASE_URL"].rstrip("/") + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=20) as response:
        text = response.read().decode("utf-8")
    return json.loads(text) if text else None


def user_id() -> str:
    """A conta dona do retrato: a sua (os cadastros novos ficam desligados; se houver outra, vale a mais antiga)."""
    global _user_id
    if _user_id is None:
        users = _request("GET", "/auth/v1/admin/users")["users"]
        _user_id = min(users, key=lambda user: user["created_at"])["id"]
    return _user_id


def snapshot() -> dict:
    """O retrato do PC agora (sem nomes de arquivos)."""
    try:
        scan = json.loads(SCAN_FILE.read_text(encoding="utf-8"))
        last_scan = {
            "feito_em": scan["feito_em"],
            "disco": scan["disco"],
            "discos": scan.get("discos", []),
            "lixo_gb": scan["lixo"]["tamanho_gb"],
            "duplicatas": {"tamanho_gb": scan["duplicatas"]["tamanho_gb"], "arquivos": scan["duplicatas"]["arquivos"]},
            "grandes": {k: scan["arquivos_grandes"][k] for k in ("tamanho_gb", "quantidade", "minimo_mb")},
        }
    except (OSError, ValueError, KeyError):
        last_scan = None  # ainda não fez nenhum scan
    history = [
        {**day, "pastas": {name: size for name, size in day.get("pastas", {}).items() if "/" not in name}}
        for day in load_history()
    ]
    settings = load_settings()
    return {
        "feito_em": datetime.now().isoformat(timespec="seconds"),
        "pecas": hardware_info(),
        "saude": pc_health(),
        "scan": last_scan,
        "composicao": composition(),
        "historico": history,
        "limpezas": load_cleanups(),
        "memoria": notebook(),
        "config": {k: settings[k] for k in ("personalidade", "voz", "arquivo_grande_mb", "cuidado")},
    }


def send_snapshot() -> bool:
    """Envia o retrato (substitui o anterior). Devolve False se não deu (sem internet, nuvem não configurada...)."""
    if not enabled():
        return False
    try:
        row = {"user_id": user_id(), "atualizado_em": datetime.now().astimezone().isoformat(), "dados": snapshot()}
        _request("POST", "/rest/v1/retrato?on_conflict=user_id", row, {"Prefer": "resolution=merge-duplicates"})
        return True
    except Exception as error:  # noqa: BLE001 — sem internet, Supabase pausado...: tenta de novo na próxima vez
        print(f"[nuvem] não consegui enviar o retrato: {error}")
        return False


def send_soon():
    """Envia em segundo plano (ex.: logo depois de um scan), sem fazer ninguém esperar."""
    if enabled():
        threading.Thread(target=send_snapshot, daemon=True).start()


def start_cloud_sync():
    """Tarefa em segundo plano: envia ao ligar e a cada 10 minutos (enquanto o PC estiver ligado)."""
    def loop():
        while True:
            send_snapshot()
            time.sleep(SEND_EVERY_S)

    if enabled():
        threading.Thread(target=loop, daemon=True).start()


# ---------- Na nuvem: baixar o retrato ----------


def _write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def download_snapshot() -> bool:
    """Baixa o retrato e grava como os arquivos de sempre. Devolve False se o PC ainda não enviou nenhum."""
    rows = _request("GET", "/rest/v1/retrato?select=dados")
    if not rows:
        return False
    data = rows[0]["dados"]
    _write_json(RETRATO_FILE, data)  # peças, saúde e composição (tools/retrato.py)
    last = data.get("scan")
    if last:  # no formato do scan.json; as listas de arquivos ficam vazias (não vão para a nuvem)
        _write_json(SCAN_FILE, {
            "feito_em": last["feito_em"],
            "disco": last["disco"],
            "discos": last["discos"],
            "lixo": {"tamanho_gb": last["lixo_gb"], "pastas": []},
            "duplicatas": {**last["duplicatas"], "exemplos": []},
            "arquivos_grandes": {**last["grandes"], "maiores": []},
            "maiores_arquivos": [],
            "scan": {"pastas_analisadas": 0, "segundos": 0, "incompleto": False},
        })
    _write_json(HISTORY_FILE, data.get("historico", []))
    _write_json(CLEANUPS_FILE, data.get("limpezas", []))
    save_settings(data.get("config", {}))
    memory = data.get("memoria", {})  # {seção: [anotações]} -> o mesmo Memória.md do PC
    sections = "".join(f"\n## {title}\n" + "".join(f"- {note}\n" for note in notes) for title, notes in memory.items())
    NOTEBOOK.parent.mkdir(parents=True, exist_ok=True)
    NOTEBOOK.write_text(HEADER + sections, encoding="utf-8")
    return True


def start_snapshot_refresh():
    """Na nuvem: baixa o retrato agora e depois a cada minuto (pega o que o PC mandou de novo)."""
    def refresh():
        try:
            download_snapshot()
        except Exception as error:  # noqa: BLE001 — Supabase fora do ar: tenta de novo daqui a pouco
            print(f"[nuvem] não consegui baixar o retrato: {error}")

    def loop():
        while True:
            time.sleep(DOWNLOAD_EVERY_S)
            refresh()

    refresh()  # a primeira vez antes de a API começar a responder
    threading.Thread(target=loop, daemon=True).start()
