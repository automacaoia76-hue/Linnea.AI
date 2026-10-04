"""API do app: conecta o chat do frontend à Linnea.

Rodar:  uv run uvicorn api:app --port 8000 --reload
Docs automáticas: http://localhost:8000/docs
"""

import json
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from openrouter.errors import TooManyRequestsResponseError
from langgraph.types import Command
from pydantic import BaseModel, Field

from agent import FALLBACK_MODEL, MODEL, build_agent
from tools import run_and_save_scan
from tools.auto_clean import start_weekly_cleaner
from tools.disk_scan import MB, ROOT_NAMES
from tools.file_tools import move_paths
from langchain_openrouter import ChatOpenRouter

from tools.cleanups import load_cleanups
from tools.disk_stats import composition
from tools.file_lists import file_list, preview_path
from tools.pc_health import pc_health
from tools.report import month_summary
from tools.folder_map import folder_map
from tools.history import load_history
from tools.settings import load_settings, save_settings

app = FastAPI(title="Linnea API")
agent = build_agent()  # um agente só; a memória separa as conversas pelo thread_id
start_weekly_cleaner()  # limpeza automática semanal (só roda se estiver ligada nas Configurações)


@app.post("/api/scan")
def run_scan():
    """Botão "Start scan": roda o scan, salva o resultado em JSON (data/scan.json) e devolve para o front."""
    return run_and_save_scan()  # a mesma função que a Linnea usa na ferramenta rodar_scan


@app.get("/api/pastas")
def folders(caminho: str = ""):
    """Tela Arquivos: tamanho de cada item de uma pasta pessoal (sem caminho = as pastas pessoais)."""
    try:
        return folder_map(caminho)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@app.get("/api/arquivos")
def files(filtro: str):
    """Tela Arquivos: abas Grandes, Antigos, Downloads e Duplicados (até 50 arquivos, do maior para o menor)."""
    try:
        return file_list(filtro)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@app.get("/api/arquivo")
def file_preview(caminho: str):
    """Prévia de um arquivo (foto, PDF, vídeo, áudio, texto) — só das pastas pessoais."""
    try:
        return FileResponse(preview_path(caminho))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@app.get("/api/saude")
def health_check():
    """Tela do fone do robô: CPU, GPU, RAM, armazenamento, temperatura e a nota de saúde do PC."""
    return pc_health()


@app.get("/api/composicao")
def disk_composition():
    """Tela Gráficos: do que o disco é feito (tipos de arquivo, lixo, sistema e programas)."""
    return composition()


@app.get("/api/limpezas")
def cleanups():
    """Tela Gráficos: todas as limpezas registradas ("Já liberei", últimas limpezas e o calendário)."""
    return load_cleanups()


# Relatório: o DeepSeek responde em poucos segundos (o Qwen pode ficar na fila), e é 1 chamada só por relatório
report_model = ChatOpenRouter(model=FALLBACK_MODEL, temperature=0.4)
REPORT_PROMPT = (
    "Você é a Linnea, agente de limpeza de um app para Windows. Com os números do mês em JSON, escreva um resumo "
    "de 3 a 4 frases em português do Brasil, simpático e direto: como o espaço livre mudou, o que foi limpo e uma "
    "sugestão prática para o próximo mês. Use só os números do JSON (null = sem dado). Sem títulos, sem listas."
)


@app.post("/api/relatorio")
def month_report():
    """Relatório do mês: os números e um resumo curto escrito pela Linnea."""
    data = month_summary()
    try:
        text = report_model.invoke([("system", REPORT_PROMPT), ("user", json.dumps(data, ensure_ascii=False))]).content
    except Exception:  # noqa: BLE001 — IA lotada ou fora do ar: o relatório sai só com os números
        text = ""
    return {**data, "resumo": text}


@app.get("/api/historico")
def history():
    """Tela Gráficos: um resumo do disco por dia (do mais antigo para o mais novo)."""
    return load_history()


@app.get("/api/config")
def get_settings():
    """Tela Configurações: as opções que o backend usa."""
    return load_settings()


class SettingsRequest(BaseModel):
    """Só os campos enviados mudam (os outros ficam como estavam)."""

    arquivo_grande_mb: int | None = Field(None, ge=10, le=10000)  # de 10 MB a 10 GB
    pastas_proibidas: list[str] | None = None  # nomes das pastas pessoais (ex.: ["Documentos"])
    nunca_apagar: list[str] | None = None  # caminhos protegidos
    limpeza_semanal: bool | None = None
    personalidade: Literal["padrao", "formal", "divertida", "direta"] | None = None
    cuidado: Literal["sempre_pedir", "lixo_sozinha"] | None = None


@app.put("/api/config")
def put_settings(request: SettingsRequest):
    changes = request.model_dump(exclude_none=True)
    unknown = set(changes.get("pastas_proibidas", [])) - set(ROOT_NAMES)
    if unknown:
        raise HTTPException(status_code=400, detail=f"Pasta desconhecida: {', '.join(unknown)}.")
    if "nunca_apagar" in changes:
        paths = []
        for raw in changes["nunca_apagar"]:
            path = Path(raw.strip().strip('"')).expanduser()
            if not path.exists():
                raise HTTPException(status_code=400, detail=f"Não encontrei: {raw}")
            if str(path.resolve()) not in paths:
                paths.append(str(path.resolve()))  # caminho completo, sem repetir
        changes["nunca_apagar"] = paths
    return save_settings(changes)


class TrashRequest(BaseModel):
    caminhos: list[str]


@app.post("/api/lixeira")
def to_trash(request: TrashRequest):
    """Tela Arquivos: manda os itens marcados para a Lixeira (o usuário confirma na tela antes).
    Usa as mesmas travas da Linnea: só dentro das pastas pessoais e nunca a pasta pessoal inteira."""
    moved, refused, freed = move_paths(request.caminhos)
    return {"movidos": moved, "recusados": refused, "liberado_mb": round(freed / MB, 1)}


class ChatRequest(BaseModel):
    message: str
    thread_id: str  # id da conversa, gerado pelo frontend


class Step(BaseModel):
    kind: str  # "pensando", "acao", "resultado" ou "resposta"
    text: str


class ChatResponse(BaseModel):
    reply: str
    tools_used: list[str]  # ferramentas que a Linnea usou para responder (ex.: scan_disk)
    model: str  # modelo que respondeu (o principal ou o reserva, se o principal estava lotado)
    steps: list[Step]  # passos do loop ReAct (pensar -> agir -> observar -> responder), para o painel do front


def summarize_tool_result(name: str, content: str) -> str:
    """Resumo curto do que a ferramenta devolveu (o JSON completo é grande demais para o painel)."""
    if name == "scan_disk":
        try:
            data = json.loads(content)
            disk = data["disco"]
            br = lambda n: str(n).replace(".", ",")  # 218.7 -> 218,7 (formato brasileiro)
            return (
                f"Disco {br(disk['usado_gb'])} de {br(disk['total_gb'])} GB · lixo {br(data['lixo']['tamanho_gb'])} GB · "
                f"{data['duplicatas']['arquivos']} duplicatas · {data['arquivos_grandes']['quantidade']} arquivos grandes"
            )
        except (ValueError, KeyError):
            pass
    if name == "planejar_organizacao_downloads":
        try:
            data = json.loads(content)
            folders = ", ".join(f"{k} ({v['quantidade']})" for k, v in data["pastas"].items())
            return f"{data['total_arquivos']} arquivos soltos · {folders}"
        except (ValueError, KeyError):
            pass
    if name == "listar_duplicatas":
        try:
            data = json.loads(content)
            mb = str(data["espaco_desperdicado_mb"]).replace(".", ",")
            return f"{data['grupos_total']} grupos de duplicatas · {data['copias_extras_total']} cópias extras · {mb} MB desperdiçados"
        except (ValueError, KeyError):
            pass
    if name == "olhar_pasta":
        try:
            data = json.loads(content)
            biggest = ", ".join(i["nome"] for i in data["itens"][:3])
            return f"{len(data['itens'])} itens na pasta · maiores: {biggest}"
        except (ValueError, KeyError):
            pass
    if name == "rodar_scan":
        try:
            data = json.loads(content)
            br = lambda n: str(n).replace(".", ",")
            return (
                f"Scan novo: disco {br(data['disco']['usado_gb'])} de {br(data['disco']['total_gb'])} GB · "
                f"lixo {br(data['lixo_gb'])} GB · {data['duplicatas']['arquivos']} duplicatas · tela atualizada"
            )
        except (ValueError, KeyError):
            pass
    return content[:120]


def message_steps(message, tool_names) -> list[Step]:
    """Passos do ReAct gerados por UMA mensagem do agente. tool_names guarda id -> nome das ferramentas chamadas."""
    if message.type == "ai" and message.tool_calls:
        steps = [Step(kind="pensando", text=(message.content or "").strip()[:160] or "Preciso de dados reais do computador para responder.")]
        for call in message.tool_calls:
            tool_names[call["id"]] = call["name"]
            args = ", ".join(f"{k}={v}" for k, v in call["args"].items())
            steps.append(Step(kind="acao", text=f"{call['name']}({args})"))
        return steps
    if message.type == "tool":
        name = tool_names.get(message.tool_call_id, message.name or "")
        return [Step(kind="resultado", text=summarize_tool_result(name, message.content))]
    if message.type == "ai" and message.content:
        return [Step(kind="resposta", text="Resposta pronta para o usuário.")]
    return []


def react_steps(new_messages) -> list[Step]:
    """Transforma as mensagens do agente nos passos do ReAct."""
    steps = []
    tool_names = {}
    for message in new_messages:
        steps += message_steps(message, tool_names)
    if not any(step.kind == "acao" for step in steps):
        steps.insert(0, Step(kind="pensando", text="Consigo responder sem usar ferramentas."))
    return steps


@app.get("/api/health")
def health():
    return {"status": "ok", "model": MODEL, "fallback_model": FALLBACK_MODEL}


# "def" (e não "async def"): o FastAPI roda numa thread separada, então o agente pode demorar sem travar a API
@app.post("/api/chat")
def chat(request: ChatRequest) -> ChatResponse:
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Mensagem vazia.")

    config = {"configurable": {"thread_id": request.thread_id}}
    try:
        result = agent.invoke({"messages": [{"role": "user", "content": request.message}]}, config)
    except TooManyRequestsResponseError:
        # Os dois modelos (principal e reserva) estão lotados (erro 429): avisa de um jeito amigável
        raise HTTPException(status_code=503, detail="A IA está ocupada agora. Tente de novo em alguns segundos.")

    # A memória devolve a conversa inteira; pegamos só o que veio depois da última mensagem do usuário
    messages = result["messages"]
    last_user = max(i for i, m in enumerate(messages) if m.type == "human")
    new_messages = messages[last_user + 1 :]
    tools_used = [call["name"] for m in new_messages if m.type == "ai" for call in m.tool_calls]
    model_used = messages[-1].response_metadata.get("model_name", MODEL)
    return ChatResponse(
        reply=messages[-1].content, tools_used=tools_used, model=model_used, steps=react_steps(new_messages)
    )



def sse(event: str, data: dict) -> str:
    """Formata um evento SSE (Server-Sent Events): o navegador recebe cada um assim que é enviado."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def auto_approved(requests) -> bool:
    """Nível de cuidado "pode limpar o lixo sozinha": só o limpar_lixo passa sem o cartão de permissão.
    Apagar arquivos, duplicatas e organizar pastas continuam pedindo, sempre."""
    return load_settings()["cuidado"] == "lixo_sozinha" and all(r["name"] == "limpar_lixo" for r in requests)


def agent_events(agent_input, config):
    """Roda o agente (mensagem nova ou retomada depois da permissão) e gera os eventos SSE:
    - step:     um passo do ReAct (pensando, ação, resultado)
    - token:    um pedaço do texto da resposta
    - switch:   o modelo principal não respondeu e a reserva assumiu
    - ui:       ação da Linnea na tela (destacar card, scan novo...)
    - approval: a Linnea quer mexer em arquivos e está esperando o usuário aprovar ou recusar
    - done:     fim (modelo que respondeu e ferramentas usadas)
    - error:    algo deu errado (mensagem amigável)"""
    tool_names, tools_used, model_used = {}, [], MODEL
    try:
        # Repete quando a permissão é dada automaticamente (nível de cuidado "pode limpar o lixo sozinha")
        while agent_input is not None:
            stream = agent.stream(agent_input, config, stream_mode=["custom", "updates"])
            agent_input = None
            for mode, data in stream:
                if mode == "custom":
                    if "token" in data:
                        yield sse("token", {"text": data["token"]})
                    elif "switch" in data:
                        yield sse("switch", {"model": data["switch"]})
                    elif "ui" in data:
                        yield sse("ui", data["ui"])
                    continue
                for source, update in data.items():
                    if source == "__interrupt__":
                        # O agente PAUSOU antes de uma ferramenta que mexe em arquivos
                        requests = [r for interrupt in update for r in interrupt.value["action_requests"]]
                        if auto_approved(requests):
                            yield sse("step", {"kind": "permissao", "text": "limpeza do lixo liberada sem perguntar (nível de cuidado)"})
                            agent_input = Command(resume={"decisions": [{"type": "approve"}] * len(requests)})
                        else:  # manda o pedido para a tela (cartão Aprovar / Recusar)
                            yield sse("approval", {"acoes": [{"nome": r["name"], "args": r["args"]} for r in requests]})
                        continue
                    for message in (update or {}).get("messages", []):
                        if message.type == "ai":
                            model_used = message.response_metadata.get("model_name", model_used)
                            tools_used += [call["name"] for call in message.tool_calls]
                        for step in message_steps(message, tool_names):
                            if step.kind != "resposta":  # a resposta o usuário já vê chegando no chat
                                yield sse("step", step.model_dump())
        yield sse("done", {"model": model_used, "tools_used": tools_used})
    except TooManyRequestsResponseError:
        yield sse("error", {"detail": "A IA está ocupada agora. Tente de novo em alguns segundos."})
    except Exception:  # noqa: BLE001 — qualquer outro erro vira uma mensagem amigável no chat
        yield sse("error", {"detail": "Algo deu errado ao falar com a IA. Tente de novo."})


@app.post("/api/chat/stream")
def chat_stream(request: ChatRequest):
    """Conversa ao vivo: envia passos, palavras e ações na hora em que acontecem (ver agent_events)."""
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Mensagem vazia.")
    config = {"configurable": {"thread_id": request.thread_id}}
    agent_input = {"messages": [{"role": "user", "content": request.message}]}
    return StreamingResponse(agent_events(agent_input, config), media_type="text/event-stream")


class ResumeRequest(BaseModel):
    thread_id: str
    approve: bool  # True = Aprovar, False = Recusar


@app.post("/api/chat/resume")
def chat_resume(request: ResumeRequest):
    """Retoma o agente que pausou pedindo permissão, com a decisão do usuário (aprovar ou recusar)."""
    config = {"configurable": {"thread_id": request.thread_id}}
    pending = agent.get_state(config).interrupts
    if not pending:
        raise HTTPException(status_code=400, detail="Não há nenhuma ação esperando permissão.")
    count = sum(len(interrupt.value["action_requests"]) for interrupt in pending)
    decision = {"type": "approve"} if request.approve else {"type": "reject", "message": "O usuário recusou esta ação."}
    agent_input = Command(resume={"decisions": [decision] * count})
    return StreamingResponse(agent_events(agent_input, config), media_type="text/event-stream")
