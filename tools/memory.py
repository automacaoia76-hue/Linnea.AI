"""Memória de longo prazo da Linnea, em arquivos .md que dá para abrir no Obsidian:

    E:\\LANG CLEAN\\memoria\\Linnea\\
    ├── Perfil.md            ← fatos sobre o usuário e o PC (vai junto em toda mensagem)
    └── Conversas\\
        └── 2026-10-04.md    ← uma linha por pergunta do dia (pergunta, começo da resposta, ferramentas)

Os arquivos são do usuário: ele pode ler, corrigir ou apagar à vontade no Obsidian."""

import re
from datetime import datetime
from pathlib import Path

from langchain.tools import tool

from tools.file_tools import _send_ui

MEMORY_DIR = Path(__file__).resolve().parents[2] / "memoria" / "Linnea"
PROFILE = MEMORY_DIR / "Perfil.md"
CONVERSATIONS = MEMORY_DIR / "Conversas"
PROFILE_HEADER = "# Perfil\n\nO que a Linnea lembra sobre você e o seu PC. Pode editar ou apagar linhas à vontade.\n\n"
MAX_FACTS_IN_PROMPT = 30  # o perfil vai em toda mensagem: fica curto para gastar pouco


def profile_facts() -> list[str]:
    """Fatos do perfil (as linhas que começam com "- ")."""
    try:
        text = PROFILE.read_text(encoding="utf-8")
    except OSError:
        return []
    return [line[2:].strip() for line in text.splitlines() if line.startswith("- ")]


def profile_for_prompt() -> str:
    """Trecho que entra nas instruções da Linnea (vazio se ela ainda não sabe nada)."""
    facts = profile_facts()[-MAX_FACTS_IN_PROMPT:]
    if not facts:
        return ""
    return "Memória (o que você já sabe sobre o usuário; use quando ajudar, sem repetir tudo):\n" + "\n".join(f"  • {f}" for f in facts) + "\n"


@tool
def lembrar(fato: str) -> str:
    """Anota um fato DURADOURO e útil sobre o usuário ou o PC na memória de longo prazo (arquivo Perfil.md).
    Use quando o usuário contar algo que vale para as próximas conversas: para que usa o PC, preferências,
    pastas ou arquivos importantes (ex.: "usa o FL Studio; não apagar projetos .flp").
    Uma frase curta por fato. Não anote coisas passageiras nem dados sensíveis (senhas, documentos, números pessoais)."""
    fact = " ".join(fato.split())[:200]
    if not fact:
        return "Nada para anotar."
    without_date = lambda text: re.sub(r"\s*\(anotado em [^)]*\)$", "", text).lower()  # compara sem a data do fim
    if without_date(fact) in (without_date(f) for f in profile_facts()):
        return "Esse fato já estava na memória."
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    if not PROFILE.exists():
        PROFILE.write_text(PROFILE_HEADER, encoding="utf-8")
    with PROFILE.open("a", encoding="utf-8") as file:
        file.write(f"- {fact} (anotado em {datetime.now():%d/%m/%Y})\n")
    _send_ui({"acao": "memoria", "descricao": f"anotei na memória: {fact}"})
    return "Anotado na memória."


@tool
def buscar_memoria(assunto: str) -> str:
    """Procura nas conversas antigas e no perfil o que já foi falado sobre um assunto
    (ex.: "o que limpamos semana passada", "duplicatas", "FL Studio"). Use quando o usuário perguntar sobre
    conversas anteriores ou algo que você deveria lembrar. Devolve as linhas encontradas, com a data."""
    words = [w for w in re.findall(r"\w+", assunto.lower()) if len(w) >= 4]
    if not words:
        return "Diga o assunto com uma palavra mais específica."
    found = [f"(perfil) {fact}" for fact in profile_facts() if any(w in fact.lower() for w in words)]
    for day_file in sorted(CONVERSATIONS.glob("*.md"), reverse=True):  # das conversas mais novas para as mais velhas
        for line in day_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("- ") and any(w in line.lower() for w in words):
                found.append(f"({day_file.stem}) {line[2:]}")
    if not found:
        return "Não achei nada sobre isso na memória."
    return "\n".join(found[:15])


def log_turn(question: str, reply: str, tools_used: list[str]) -> None:
    """Grava uma linha da conversa no arquivo do dia (sem IA: a pergunta, o começo da resposta e as ferramentas)."""
    if not question and not reply:
        return
    CONVERSATIONS.mkdir(parents=True, exist_ok=True)
    day_file = CONVERSATIONS / f"{datetime.now():%Y-%m-%d}.md"
    if not day_file.exists():
        day_file.write_text(f"# Conversas de {datetime.now():%d/%m/%Y}\n\n", encoding="utf-8")
    short = lambda text, size: (" ".join(text.split())[:size] + "…") if len(" ".join(text.split())) > size else " ".join(text.split())
    tools = f" [usou: {', '.join(dict.fromkeys(tools_used))}]" if tools_used else ""
    with day_file.open("a", encoding="utf-8") as file:
        file.write(f"- {datetime.now():%H:%M} · Você: {short(question, 160)} → Linnea: {short(reply, 220)}{tools}\n")


def memory_summary() -> dict:
    """Para a tela de Configurações: onde está a memória, os fatos e quantos dias de conversa."""
    return {
        "pasta": str(MEMORY_DIR),
        "fatos": profile_facts(),
        "dias_de_conversa": len(list(CONVERSATIONS.glob("*.md"))) if CONVERSATIONS.exists() else 0,
    }
