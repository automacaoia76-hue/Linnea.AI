"""Converse com a Linnea no terminal: uv run python chat.py  (digite "sair" para encerrar)."""

import sys
import uuid

from openrouter.errors import TooManyRequestsResponseError

from agent import MODEL, build_agent

sys.stdout.reconfigure(encoding="utf-8")  # acentos certinhos no terminal do Windows


def main():
    agent = build_agent()
    # Um thread_id por conversa: é por ele que a memória sabe o que já foi dito
    config = {"configurable": {"thread_id": str(uuid.uuid4())}}
    print(f"Linnea pronta ({MODEL}). Digite sua mensagem ou 'sair'.\n")

    while True:
        try:
            text = input("Você: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if text.lower() in {"sair", "exit", "quit"}:
            break
        if not text:
            continue

        # stream_mode="updates" mostra cada passo do loop ReAct: o modelo pensa, chama a ferramenta, responde
        try:
            for step in agent.stream({"messages": [{"role": "user", "content": text}]}, config, stream_mode="updates"):
                for node, update in step.items():
                    for message in update.get("messages", []):
                        if node == "model" and message.tool_calls:
                            for call in message.tool_calls:
                                print(f"  [Linnea usou a ferramenta: {call['name']} {call['args']}]")
                        elif node == "tools":
                            print(f"  [ferramenta respondeu: {len(message.content)} caracteres de dados]")
                        elif node == "model" and message.content:
                            model_used = message.response_metadata.get("model_name", "?")
                            print(f"\nLinnea ({model_used}): {message.content}\n")
        except TooManyRequestsResponseError:
            # Os dois modelos (principal e reserva) estão lotados (erro 429)
            print("\nLinnea: a IA está ocupada agora. Tente de novo em alguns segundos.\n")
        except Exception:  # noqa: BLE001 — sem internet, chave errada...: avisa em vez de fechar o chat
            print("\nLinnea: algo deu errado ao falar com a IA. Tente de novo.\n")

    print("Até mais!")


if __name__ == "__main__":
    main()
