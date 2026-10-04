"""Configurações do app que o backend usa (tela ⚙️), guardadas em data/config.json."""

import json
from pathlib import Path

CONFIG_FILE = Path(__file__).resolve().parent.parent / "data" / "config.json"
DEFAULTS = {
    "arquivo_grande_mb": 100,  # a partir de quantos MB um arquivo conta como "grande"
    "pastas_proibidas": [],  # pastas pessoais que a Linnea NÃO analisa nem mexe (ex.: ["Documentos"])
    "nunca_apagar": [],  # caminhos protegidos: nada dentro deles vai para a Lixeira
    "limpeza_semanal": False,  # apaga sozinha, 1 vez por semana, os temporários com mais de 7 dias
    "ultima_limpeza_auto": None,  # quando a limpeza semanal rodou pela última vez
    "personalidade": "padrao",  # padrao, formal, divertida ou direta
    "cuidado": "sempre_pedir",  # sempre_pedir ou lixo_sozinha (limpar o lixo sem pedir permissão)
}


def load_settings() -> dict:
    try:
        saved = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        saved = {}
    return {**DEFAULTS, **saved}


def save_settings(changes: dict) -> dict:
    """Junta as mudanças com o que já estava salvo e devolve tudo."""
    settings = {**load_settings(), **changes}
    CONFIG_FILE.parent.mkdir(exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8")
    return settings
