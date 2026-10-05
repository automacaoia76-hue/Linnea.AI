"""Onde ficam os arquivos da Linnea: dados (scan, histórico, configurações...), memória, .env e a tela compilada.

- Rodando pelo código: na pasta do projeto (E:\\LANG CLEAN).
- Rodando pelo Linnea.AI.exe: na mesma pasta do projeto, se ela existir neste PC (assim o app e o código usam
  os mesmos dados e a mesma memória do Obsidian); senão, na pasta do próprio .exe (ex.: levou para outro PC).
  A tela vai dentro do .exe."""

import os
import sys
from pathlib import Path

# Linnea na nuvem (Render): sem acesso ao PC; responde com o último retrato que o PC enviou (tools/cloud_sync.py)
CLOUD = os.environ.get("LINNEA_MODO") == "nuvem"
FROZEN = getattr(sys, "frozen", False)  # True quando roda pelo .exe (PyInstaller)

if FROZEN:
    BUNDLE = Path(sys._MEIPASS)  # pasta interna do .exe
    saved = Path((BUNDLE / "projeto.txt").read_text(encoding="utf-8").strip())  # gravado ao gerar o .exe
    PROJECT = saved if saved.exists() else Path(sys.executable).parent
    DIST = BUNDLE / "tela"
else:
    CODE = Path(__file__).resolve().parent.parent
    PROJECT = CODE
    DIST = CODE / "frontend" / "dist"
    if not DIST.exists():  # no Render só vai o backend: a tela vai numa cópia (preparar_nuvem.py)
        DIST = Path(__file__).resolve().parent / "static"

DATA_DIR = PROJECT / "backend" / "data"
MEMORY_DIR = PROJECT / "memoria" / "Linnea"
ENV_FILE = PROJECT / ".env"

# Testes: LINNEA_HOME troca a pasta dos dados e da memória (o .env continua o do projeto)
if os.environ.get("LINNEA_HOME"):
    DATA_DIR = Path(os.environ["LINNEA_HOME"]) / "data"
    MEMORY_DIR = Path(os.environ["LINNEA_HOME"]) / "memoria" / "Linnea"
