"""Histórico do disco (tela Gráficos): guarda um resumo por dia a cada scan, em data/historico.json.
Se rodar mais de um scan no mesmo dia, fica o mais recente."""

import json

from paths import DATA_DIR
from tools.disk_stats import folder_sizes

HISTORY_FILE = DATA_DIR / "historico.json"
MAX_DAYS = 365  # guarda até 1 ano


def load_history() -> list[dict]:
    """Lista de dias, do mais antigo para o mais novo (vazia se ainda não tem nenhum scan salvo)."""
    try:
        return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def save_history(scan: dict) -> None:
    """Acrescenta (ou atualiza) o dia do scan no histórico."""
    day = scan["feito_em"][:10]  # "2026-10-04T08:30:00" -> "2026-10-04"
    entry = {
        "data": day,
        "feito_em": scan["feito_em"],
        "total_gb": scan["disco"]["total_gb"],
        "usado_gb": scan["disco"]["usado_gb"],
        "livre_gb": scan["disco"]["livre_gb"],
        "lixo_gb": scan["lixo"]["tamanho_gb"],
        "duplicatas_gb": scan["duplicatas"]["tamanho_gb"],
        "grandes_gb": scan["arquivos_grandes"]["tamanho_gb"],
        "pastas": folder_sizes(),  # tamanho de cada pasta, para o ranking das que mais cresceram
    }
    history = [item for item in load_history() if item["data"] != day] + [entry]
    history.sort(key=lambda item: item["data"])
    HISTORY_FILE.parent.mkdir(exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(history[-MAX_DAYS:], ensure_ascii=False, indent=2), encoding="utf-8")
