"""Registro das limpezas (tela Gráficos: "Já liberei X GB", últimas limpezas e o calendário).
Cada vez que algo vai para a Lixeira ou o lixo é limpo, guarda uma linha em data/limpezas.json."""

import json
from datetime import datetime

from paths import DATA_DIR

CLEANUPS_FILE = DATA_DIR / "limpezas.json"


def load_cleanups() -> list[dict]:
    try:
        return json.loads(CLEANUPS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def log_cleanup(acao: str, itens: int, liberado_mb: float) -> None:
    """acao: "Lixeira", "Duplicatas" ou "Lixo"."""
    if itens <= 0 and liberado_mb <= 0:
        return
    entries = load_cleanups() + [
        {"quando": datetime.now().isoformat(timespec="seconds"), "acao": acao, "itens": itens, "liberado_mb": round(liberado_mb, 1)}
    ]
    CLEANUPS_FILE.parent.mkdir(exist_ok=True)
    CLEANUPS_FILE.write_text(json.dumps(entries[-2000:], ensure_ascii=False, indent=2), encoding="utf-8")
