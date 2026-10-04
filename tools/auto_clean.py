"""Limpeza automática semanal (Configurações): se estiver ligada, apaga sozinha os arquivos temporários
com mais de 7 dias, uma vez por semana. NÃO esvazia a Lixeira (isso continua só com permissão).
A API confere a cada hora se já está na hora (ver start_weekly_cleaner)."""

import threading
import time
from datetime import datetime, timedelta

from tools.cleanups import log_cleanup
from tools.disk_scan import MB
from tools.file_tools import delete_old_temp
from tools.settings import load_settings, save_settings

WEEK = timedelta(days=7)
CHECK_EVERY_S = 3600  # confere 1 vez por hora


def run_if_due(now: datetime | None = None) -> dict | None:
    """Roda a limpeza se ela estiver ligada e a última tiver sido há 7 dias ou mais. Devolve o resultado (ou None)."""
    now = now or datetime.now()
    settings = load_settings()
    if not settings["limpeza_semanal"]:
        return None
    last = settings["ultima_limpeza_auto"]
    if last and now - datetime.fromisoformat(last) < WEEK:
        return None
    deleted, freed = delete_old_temp(days=7)
    log_cleanup("Limpeza automática", deleted, freed / MB)
    save_settings({"ultima_limpeza_auto": now.isoformat(timespec="seconds")})
    return {"apagados": deleted, "liberado_mb": round(freed / MB, 1)}


def start_weekly_cleaner():
    """Liga uma tarefa em segundo plano que confere a cada hora (a primeira vez, 1 minuto depois de a API ligar)."""
    def loop():
        time.sleep(60)
        while True:
            try:
                run_if_due()
            except Exception:  # noqa: BLE001 — um erro numa conferência não pode derrubar a tarefa
                pass
            time.sleep(CHECK_EVERY_S)

    threading.Thread(target=loop, daemon=True).start()
