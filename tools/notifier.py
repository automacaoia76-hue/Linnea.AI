"""Aviso do Windows quando o disco do sistema passa de 90% cheio (no máximo 1 por dia; dá para desligar nas
Configurações). A notificação aparece no canto da tela do Windows, usando o próprio PowerShell (sem bibliotecas)."""

import shutil
import subprocess
import threading
import time
from datetime import date
from xml.sax.saxutils import escape

from tools.disk_scan import GB, SYSTEM_DRIVE
from tools.settings import load_settings, save_settings

LIMIT = 90  # % de uso que dispara o aviso
CHECK_EVERY_S = 1800  # confere a cada 30 minutos

TOAST_SCRIPT = r"""
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] > $null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>{title}</text><text>{body}</text></binding></visual></toast>')
$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($xml))
"""


def show_toast(title: str, body: str) -> None:
    """Mostra uma notificação do Windows."""
    safe = lambda text: escape(text).replace("'", "&apos;")  # o texto vai dentro de um XML entre aspas simples
    script = TOAST_SCRIPT.replace("{title}", safe(title)).replace("{body}", safe(body))
    subprocess.run(["powershell", "-NoProfile", "-Command", script], capture_output=True, timeout=30,
                   creationflags=subprocess.CREATE_NO_WINDOW)


def check_disk(today: date | None = None) -> bool:
    """Avisa se o disco do sistema passou do limite (só 1 vez por dia). Devolve True se avisou."""
    today = today or date.today()
    settings = load_settings()
    if not settings["avisar_disco_cheio"] or settings["ultimo_aviso_disco"] == today.isoformat():
        return False
    usage = shutil.disk_usage(SYSTEM_DRIVE)
    percent = round(100 * usage.used / usage.total)
    if percent < LIMIT:
        return False
    free = f"{usage.free / GB:.1f}".replace(".", ",")
    show_toast("Linnea: seu disco está quase cheio", f"O disco C: está {percent}% cheio (só {free} GB livres). Abra o app para eu ajudar a liberar espaço.")
    save_settings({"ultimo_aviso_disco": today.isoformat()})
    return True


def start_disk_watch():
    """Tarefa em segundo plano: confere o disco a cada 30 minutos (a primeira vez, 2 minutos depois de a API ligar)."""
    def loop():
        time.sleep(120)
        while True:
            try:
                check_disk()
            except Exception:  # noqa: BLE001 — um erro numa conferência não pode derrubar a tarefa
                pass
            time.sleep(CHECK_EVERY_S)

    threading.Thread(target=loop, daemon=True).start()
