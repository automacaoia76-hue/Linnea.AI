"""Linnea na nuvem: o último retrato do PC, baixado do Supabase por tools/cloud_sync.py (data/retrato.json).
Na nuvem, peças, saúde e "do que o disco é feito" vêm daqui em vez de serem medidos (o PC pode estar desligado)."""

import json

from paths import DATA_DIR

RETRATO_FILE = DATA_DIR / "retrato.json"


def retrato() -> dict:
    """O retrato inteiro ({} se ainda não baixou nenhum)."""
    try:
        return json.loads(RETRATO_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
