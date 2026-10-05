"""Ferramentas de interface: deixam a Linnea "mexer" no app.

Ela decide quando usar (como qualquer ferramenta do loop ReAct). A ferramenta manda um evento "ui"
pelo streaming (canal "custom" do LangGraph); o frontend recebe e aplica na tela.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Literal

from langchain.tools import tool
from pydantic import BaseModel, Field

from paths import DATA_DIR
from tools.cloud_sync import send_soon
from tools.disk_scan import scan
from tools.file_tools import _send_ui, _user_path
from tools.folder_map import _root_of
from tools.history import save_history
from tools.settings import load_settings, save_settings

SCAN_FILE = DATA_DIR / "scan.json"  # último scan salvo

CARD_NAMES = {"disco": "Disco", "lixo": "Lixo", "duplicatas": "Duplicatas", "grandes": "Arquivos grandes"}


def run_and_save_scan():
    """Roda o scan completo, salva em data/scan.json e devolve o resultado (usado pelo botão e pela Linnea)."""
    result = scan(large_file_mb=load_settings()["arquivo_grande_mb"])  # tamanho escolhido nas Configurações
    result["feito_em"] = datetime.now().isoformat(timespec="seconds")
    SCAN_FILE.parent.mkdir(exist_ok=True)
    SCAN_FILE.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    save_history(result)  # 1 registro por dia, para o gráfico da tela Gráficos
    send_soon()  # atualiza o retrato do PC na nuvem
    return result


@tool
def destacar_card(card: Literal["disco", "lixo", "duplicatas", "grandes"]) -> str:
    """Destaca na tela um dos 4 cards do painel (acende um brilho nele por alguns segundos).
    Use quando falar sobre o assunto de um card, para mostrar ao usuário onde está a informação:
    disco = espaço usado, lixo = temporários e lixeira, duplicatas = arquivos repetidos, grandes = arquivos grandes."""
    name = CARD_NAMES[card]
    _send_ui({"acao": "destacar", "alvo": card, "descricao": f"destaquei o card {name}"})
    return f"Card {name} destacado na tela."


@tool
def abrir_tela(tela: Literal["inicio", "arquivos", "graficos", "configuracoes"], pasta: str = "") -> str:
    """Troca a tela do app. inicio = tela inicial (cards, raciocínio e tabela); arquivos = mapa do disco;
    graficos = histórico, previsão, do que o disco é feito e limpezas; configuracoes = tema, cor da aura etc.
    Em arquivos, passe em 'pasta' o caminho completo de uma pasta pessoal para já abri-la no mapa
    (ex.: a pasta Downloads do usuário). Sem 'pasta', o mapa abre nas pastas pessoais.
    Use quando o usuário pedir para ver, mostrar ou abrir uma dessas telas, uma pasta, ou voltar para o início."""
    if tela != "arquivos":
        names = {"inicio": "a tela inicial", "graficos": "os Gráficos", "configuracoes": "as Configurações"}
        _send_ui({"acao": "abrir_tela", "tela": tela, "descricao": f"abri {names[tela]}"})
        return f"Abri {names[tela]}."
    path = ""
    if pasta:
        resolved = _user_path(pasta).resolve()
        if not resolved.is_dir() or _root_of(resolved) is None:
            return "Essa pasta não existe ou está fora das pastas pessoais; não abri nada."
        path = str(resolved)
    name = Path(path).name if path else "pastas pessoais"
    _send_ui({"acao": "abrir_tela", "tela": "arquivos", "pasta": path, "descricao": f"abri o mapa de arquivos em {name}"})
    return f"Tela Arquivos aberta em {name}."


@tool
def mudar_configuracao(
    tema: Literal["claro", "escuro"] | None = None,
    aura: Literal["padrao", "azul", "verde", "rosa", "dourado"] | None = None,
    arquivo_grande_mb: int | None = None,
) -> str:
    """Muda as configurações do app (a tela de Configurações abre e o usuário vê a mudança acontecer).
    tema = claro ou escuro; aura = cor da aura do robô ('padrao' muda junto com o tema);
    arquivo_grande_mb = a partir de quantos MB um arquivo conta como "grande" (de 10 a 10000; o app sugere 50, 100,
    250, 500 ou 1000). Passe só o que o usuário pediu para mudar."""
    changes = {}
    if arquivo_grande_mb is not None:
        if not 10 <= arquivo_grande_mb <= 10000:
            return "O tamanho de arquivo grande precisa ficar entre 10 MB e 10000 MB; não mudei nada."
        save_settings({"arquivo_grande_mb": arquivo_grande_mb})  # salva antes, para a tela já abrir com o valor novo
        changes["arquivo_grande_mb"] = arquivo_grande_mb
    if tema:
        changes["tema"] = tema
    if aura:
        changes["aura"] = aura
    if not changes:
        return "Nenhuma configuração foi pedida."
    text = ", ".join(f"{key.replace('_', ' ')} = {value}" for key, value in changes.items())
    _send_ui({"acao": "configurar", **changes, "descricao": f"mudei: {text}"})
    return f"Configurações mudadas: {text}."


@tool
def marcar_arquivos(pasta: str, itens: list[str]) -> str:
    """Abre uma pasta pessoal no mapa de arquivos e deixa itens dela MARCADOS (rosa, com ✓) para o usuário conferir.
    Não apaga nada: o usuário decide na tela se manda para a Lixeira. Use quando pedirem para marcar ou selecionar arquivos.
    'pasta' = caminho completo da pasta; 'itens' = nomes dos itens de dentro dela (como olhar_pasta mostra)
    ou seus caminhos completos. Chame olhar_pasta antes para saber os nomes."""
    folder = _user_path(pasta).resolve()
    if not folder.is_dir() or _root_of(folder) is None:
        return "Essa pasta não existe ou está fora das pastas pessoais; não marquei nada."
    real_names = {name.lower(): name for name in os.listdir(folder)}  # o Windows não diferencia maiúsculas
    marked, missing = [], []
    for item in itens:
        given = Path(item)
        real = real_names.get(given.name.lower())
        if real is None or (given.is_absolute() and given.resolve().parent != folder):
            missing.append(item)
        else:
            marked.append(str(folder / real))  # mesmo formato de caminho que o mapa usa
    if marked:
        _send_ui({"acao": "marcar", "pasta": str(folder), "caminhos": marked,
                  "descricao": f"marquei {len(marked)} item(ns) em {folder.name}"})
    result = f"Marquei {len(marked)} item(ns) na pasta {folder.name}; o usuário confere e decide na tela."
    if missing:
        result += f" Não encontrei: {', '.join(missing)}."
    return result


class PassoDoPlano(BaseModel):
    titulo: str = Field(description="o que vai ser feito, curto (ex.: 'Limpar 2,1 GB de lixo')")
    detalhe: str = Field(description="uma frase explicando (ex.: 'temporários antigos e a Lixeira')")
    ferramenta: Literal["limpar_lixo", "apagar_duplicatas", "organizar_downloads", "marcar_arquivos", "mover_para_lixeira"] = Field(
        description="a ferramenta que você vai usar para fazer este passo"
    )
    libera_mb: float = Field(description="quanto espaço este passo libera, em MB (0 se não libera, ex.: organizar)")


@tool
def mostrar_plano(passos: list[PassoDoPlano]) -> str:
    """Mostra na tela o PLANO DO AGENTE: um cartão com até 4 passos de limpeza, cada um com quanto libera,
    e os botões "Executar plano" e "Agora não". Use quando pedirem para executar o plano do agente ou montar um plano.
    Antes, colete os dados (scan_disk; listar_duplicatas e planejar_organizacao_downloads se fizer sentido).
    Ordene do passo que mais libera para o que menos libera. NÃO execute nada depois: espere o usuário clicar."""
    steps = [step.model_dump() for step in passos[:4]]
    _send_ui({"acao": "plano", "passos": steps, "descricao": f"montei um plano com {len(steps)} passo(s)"})
    return (
        "Plano mostrado na tela. Diga em uma frase quanto ele libera no total e espere: só execute quando o usuário "
        "disser que pode executar o plano."
    )


@tool
def iniciar_tour() -> str:
    """Começa o tour guiado pelo app: a tela passa por cada parte (chat, cards, raciocínio, tabela, mapa de arquivos,
    gráficos e tema) com um balão explicando. Use quando pedirem para explicar o app, como ele funciona ou um tour."""
    _send_ui({"acao": "tour", "descricao": "comecei o tour pelo app"})
    return "Tour iniciado: o app mostra as explicações sozinho. Responda só com uma frase curta convidando a acompanhar."


@tool
def rodar_scan() -> str:
    """Roda um scan novo no computador e atualiza os cards e a tabela do app com os números novos.
    Use quando o usuário pedir para analisar de novo, atualizar ou escanear o computador."""
    _send_ui({"acao": "scan_iniciado", "descricao": "iniciei um scan novo"})
    result = run_and_save_scan()
    _send_ui({"acao": "scan_concluido", "scan": result, "descricao": "atualizei os cards com o scan novo"})
    # Para o modelo, devolve só um resumo (o resultado completo já foi para a tela)
    return json.dumps(
        {
            "disco": result["disco"],
            "lixo_gb": result["lixo"]["tamanho_gb"],
            "duplicatas": {"gb": result["duplicatas"]["tamanho_gb"], "arquivos": result["duplicatas"]["arquivos"]},
            "arquivos_grandes": {
                "gb": result["arquivos_grandes"]["tamanho_gb"],
                "quantidade": result["arquivos_grandes"]["quantidade"],
            },
        },
        ensure_ascii=False,
    )
