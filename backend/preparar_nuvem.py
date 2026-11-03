"""Prepara o backend para a Linnea na nuvem (Render). Rodar nesta pasta:  uv run python preparar_nuvem.py
Depois é só enviar para o GitHub (git commit + git push): o Render publica sozinho.

1. Compila a tela (npm run build) e copia para backend/static (no Render só vai esta pasta).
2. Gera o requirements.txt (a lista de bibliotecas que o Render instala)."""

import shutil
import subprocess
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
FRONTEND = BACKEND.parent / "frontend"

print("1/2 Compilando a tela e copiando para backend/static...")
subprocess.run("npm run build", cwd=FRONTEND, shell=True, check=True)
shutil.rmtree(BACKEND / "static", ignore_errors=True)
# Os modelos de robô antigos (sem uso) ficam de fora: só o que a tela usa
unused = shutil.ignore_patterns("robo-branco.glb", "robo-iris*", "robo-textura.jpg", "robo.glb")
shutil.copytree(FRONTEND / "dist", BACKEND / "static", ignore=unused)

print("2/2 Gerando o requirements.txt (sem as bibliotecas de desenvolvimento, como o pyinstaller)...")
subprocess.run(
    "uv export --no-dev --no-hashes --no-emit-project --format requirements-txt -o requirements.txt",
    cwd=BACKEND, shell=True, check=True,
)
print("Pronto. Agora: git add, git commit e git push.")
