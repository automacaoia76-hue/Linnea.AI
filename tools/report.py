"""Relatório mensal (tela Gráficos): junta os números do mês. O resumo em texto é escrito pela IA na API."""

from datetime import datetime

from tools.cleanups import load_cleanups
from tools.history import load_history

MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
          "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]


def month_summary(today: datetime | None = None) -> dict:
    today = today or datetime.now()
    prefix = today.strftime("%Y-%m")  # ex.: "2026-10"
    days = [d for d in load_history() if d["data"].startswith(prefix)]
    cleanups = [c for c in load_cleanups() if c["quando"].startswith(prefix)]
    by_action = {}
    for cleanup in cleanups:
        by_action[cleanup["acao"]] = round(by_action.get(cleanup["acao"], 0) + cleanup["liberado_mb"], 1)
    last = days[-1] if days else None
    return {
        "mes": f"{MONTHS[today.month - 1]} de {today.year}",
        "dias_com_scan": len(days),
        "livre_inicio_gb": days[0]["livre_gb"] if days else None,
        "livre_fim_gb": last["livre_gb"] if last else None,
        "total_gb": last["total_gb"] if last else None,
        "lixo_gb": last["lixo_gb"] if last else None,
        "limpezas": len(cleanups),
        "liberado_mb": round(sum(c["liberado_mb"] for c in cleanups), 1),
        "liberado_por_acao_mb": by_action,
    }
