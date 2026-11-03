"""Linnea.AI como programa (é este arquivo que vira o Linnea.AI.exe): liga a API e abre a janela própria (pywebview).
Fechar a janela desliga a API que ele ligou. Se a API já estava ligada (ex.: pelo atalho da inicialização do Windows),
ele só abre a janela.
  --so-ligar   só liga a API, sem janela (para ligar escondida junto com o Windows)
Gerar o .exe: uv run python build_exe.py (nesta pasta)."""

import os
import sys
import threading
import time
import urllib.request
from pathlib import Path

from paths import DATA_DIR, FROZEN

DATA_DIR.mkdir(parents=True, exist_ok=True)
if FROZEN:  # o .exe não tem terminal: as mensagens da API vão para um arquivo
    sys.stdout = sys.stderr = open(DATA_DIR / "linnea.log", "a", encoding="utf-8", buffering=1)  # noqa: SIM115

import uvicorn  # noqa: E402
import webview  # noqa: E402

PORT = int(os.environ.get("LINNEA_PORT", "8000"))  # outra porta só para testes
URL = f"http://127.0.0.1:{PORT}"
ICON = (Path(sys._MEIPASS) if FROZEN else Path(__file__).parent) / "linnea.ico"  # vai dentro do .exe


def api_on() -> bool:
    try:
        urllib.request.urlopen(f"{URL}/api/health", timeout=1)
        return True
    except OSError:
        return False


def start_api() -> threading.Thread:
    """Liga a API (FastAPI + a tela) numa thread deste programa e espera ela responder."""
    from api import app  # só agora: carregar o agente e as ferramentas leva alguns segundos

    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=PORT, log_config=None))
    thread = threading.Thread(target=server.run, daemon=True)  # daemon: morre junto quando o programa fecha
    thread.start()
    for _ in range(120):
        if api_on():
            break
        time.sleep(0.5)
    return thread


class Api:
    """Funções do Python que a página pode chamar (window.pywebview.api.<nome>)."""

    def tela_cheia(self):
        webview.windows[0].toggle_fullscreen()


# F11 liga/desliga a tela cheia
F11_JS = """document.addEventListener('keydown', e => {
  if (e.key === 'F11') { e.preventDefault(); window.pywebview.api.tela_cheia(); }
});"""


def main():
    thread = None if api_on() else start_api()
    if "--so-ligar" in sys.argv:
        if thread:
            thread.join()  # fica ligada até o Windows desligar
        return
    window = webview.create_window(
        "Linnea.AI", URL, width=1600, height=900, min_size=(1100, 700), background_color="#05060f", js_api=Api()
    )
    window.events.loaded += lambda: window.evaluate_js(F11_JS)  # a cada carregamento da página
    # private_mode=False + storage_path: guarda o tema, a cor da aura e a permissão do microfone entre uma vez e outra
    webview.start(private_mode=False, storage_path=str(DATA_DIR / "janela"), icon=str(ICON))


if __name__ == "__main__":
    main()
