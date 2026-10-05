"""Memória de longo prazo da Linnea: um caderno .md que dá para abrir no Obsidian.

    E:\\LANG CLEAN\\memoria\\Linnea\\Memória.md

Guarda só o que é importante de cada conversa para ela ser a assistente pessoal do usuário e especialista no PC
dele, separado por seções (você, uso, peças, problemas, upgrades, conhecimento e histórico).
Vai junto em toda mensagem, então o conhecimento cresce com o tempo.
O arquivo é do usuário: ele pode ler, corrigir ou apagar linhas à vontade no Obsidian."""

import re
from datetime import datetime
from typing import Literal

from langchain.tools import tool

from paths import MEMORY_DIR
from tools.file_tools import _send_ui

NOTEBOOK = MEMORY_DIR / "Memória.md"
# Seção (como a Linnea escolhe) -> título no caderno
SECTIONS = {
    "voce": "Sobre você",
    "uso": "Como uso o PC",
    "pecas": "Peças (o que o Windows não mostra)",
    "problemas": "Problemas e soluções",
    "upgrades": "Upgrades",
    "conhecimento": "Conhecimento de PC",
    "historico": "Histórico do PC",
}
HEADER = "# Memória da Linnea\n\nO que ela aprendeu nas conversas sobre você e o seu PC. Ela anota sozinha; pode editar ou apagar linhas à vontade.\n"
MAX_NOTES_IN_PROMPT = 15  # por seção: o caderno vai em toda mensagem, então fica curto para gastar pouco


def _lines() -> list[str]:
    try:
        return NOTEBOOK.read_text(encoding="utf-8").splitlines()
    except OSError:
        return (HEADER + "".join(f"\n## {title}\n" for title in SECTIONS.values())).splitlines()


def notebook() -> dict[str, list[str]]:
    """Anotações do caderno por seção: {"Como uso": ["...", ...], ...} (só as linhas que começam com "- ")."""
    notes, section = {}, None
    for line in _lines():
        if line.startswith("## "):
            section = line[3:].strip()
            notes.setdefault(section, [])
        elif line.startswith("- ") and section:
            notes[section].append(line[2:].strip())
    return notes


def profile_for_prompt() -> str:
    """Trecho que entra nas instruções da Linnea (vazio se o caderno ainda está vazio)."""
    parts = [
        f"  {section}:\n" + "\n".join(f"    • {note}" for note in notes[-MAX_NOTES_IN_PROMPT:])
        for section, notes in notebook().items()
        if notes
    ]
    if not parts:
        return ""
    return "Memória (o que você já aprendeu sobre o usuário e o PC dele; use quando ajudar, sem repetir tudo):\n" + "\n".join(parts) + "\n"


@tool
def lembrar(
    secao: Literal["voce", "uso", "pecas", "problemas", "upgrades", "conhecimento", "historico"], nota: str
) -> str:
    """Anota na memória de longo prazo algo IMPORTANTE da conversa, que vai ajudar nas próximas. Seções:
    voce = quem é o usuário e como ele gosta de ser ajudado (nome, preferências, objetivos);
    uso = para que ele usa o PC, programas e pastas importantes (ex.: "usa o FL Studio; não apagar projetos .flp");
    pecas = peças que o Windows não mostra (fonte, gabinete, cooler, monitor...);
    problemas = problema encontrado e a solução; upgrades = planos e o que já foi feito;
    conhecimento = algo sobre computadores que você confirmou (com pesquisar_web: cite o site) e vale guardar;
    historico = mudanças no PC (peça instalada, formatação...).
    Uma frase curta por nota. Nada de conversa fiada, coisas passageiras ou dados sensíveis (senhas, documentos)."""
    note = " ".join(nota.split())[:220]
    title = SECTIONS.get(secao)
    if not note or not title:
        return "Nada para anotar."
    without_date = lambda text: re.sub(r"\s*\(\d{2}/\d{2}/\d{4}\)$", "", text).lower()  # compara sem a data do fim
    if without_date(note) in (without_date(n) for n in notebook().get(title, [])):
        return "Isso já estava na memória."

    lines = _lines()
    heading = f"## {title}"
    if heading not in lines:
        lines += ["", heading]
    start = lines.index(heading)
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    while end > start + 1 and not lines[end - 1].strip():  # entra logo depois da última anotação da seção
        end -= 1
    lines.insert(end, f"- {note} ({datetime.now():%d/%m/%Y})")
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    NOTEBOOK.write_text("\n".join(lines) + "\n", encoding="utf-8")
    _send_ui({"acao": "memoria", "descricao": f"anotei na memória ({title}): {note}"})
    return f"Anotado na memória, em {title}."


@tool
def buscar_memoria(assunto: str) -> str:
    """Procura na memória o que você já anotou sobre um assunto (ex.: "fonte", "RAM", "BIOS", "FL Studio").
    Use quando o usuário perguntar algo que você já deveria saber sobre ele ou o PC. Devolve as anotações com a seção."""
    words = [w for w in re.findall(r"\w+", assunto.lower()) if len(w) >= 3]
    if not words:
        return "Diga o assunto com uma palavra mais específica."
    found = [
        f"({section}) {note}"
        for section, notes in notebook().items()
        for note in notes
        if any(w in note.lower() for w in words)
    ]
    return "\n".join(found[:15]) or "Não achei nada sobre isso na memória."


def memory_summary() -> dict:
    """Para a tela de Configurações: onde está a memória e as anotações (com a seção)."""
    return {
        "pasta": str(MEMORY_DIR),
        "fatos": [f"{section}: {note}" for section, notes in notebook().items() for note in notes],
    }
