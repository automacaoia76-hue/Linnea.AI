"""Gera o Linnea.AI.exe em backend/dist/Linnea.AI/ (leva alguns minutos). Rodar nesta pasta:  uv run python build_exe.py
Depois de mudar o código (backend ou frontend), rode de novo para o .exe ter as mudanças."""

import subprocess
from pathlib import Path

import PyInstaller.__main__

BACKEND = Path(__file__).resolve().parent
PROJECT = BACKEND.parent

print("1/3 Compilando a tela (npm run build)...")
subprocess.run("npm run build", cwd=PROJECT / "frontend", shell=True, check=True)

print("2/3 Anotando onde fica o projeto (o .exe usa os mesmos dados e a mesma memória)...")
(BACKEND / "projeto.txt").write_text(str(PROJECT), encoding="utf-8")

print("3/3 Gerando o .exe (PyInstaller)...")
PyInstaller.__main__.run([
    "linnea_app.py",
    "--name=Linnea.AI",
    "--windowed",  # sem janela preta de terminal
    "--noconfirm",  # substitui o .exe anterior sem perguntar
    "--icon=linnea.ico",
    f"--add-data={PROJECT / 'frontend' / 'dist'};tela",  # a tela compilada vai dentro do .exe
    "--add-data=linnea.ico;.",
    "--add-data=projeto.txt;.",
    "--collect-submodules=uvicorn",  # o uvicorn carrega partes dele pelo nome, o PyInstaller não acha sozinho
])
print(f"\nPronto: {BACKEND / 'dist' / 'Linnea.AI' / 'Linnea.AI.exe'}")
