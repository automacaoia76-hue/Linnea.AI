"""Pesquisa na internet (Tavily), só em sites confiáveis de hardware, Windows e fabricantes.
A lista de sites fica fixa aqui: a IA escolhe o que pesquisar, mas não consegue sair dela.
Cada pesquisa gasta 1 crédito do Tavily (o plano grátis dá 1.000 por mês)."""

import json

from langchain.tools import tool
from langchain_tavily import TavilySearch

TRUSTED_SITES = [
    # Testes e notícias de hardware
    "tomshardware.com",
    "techpowerup.com",
    "anandtech.com",
    "gamersnexus.net",
    "hardwareunboxed.com",
    "notebookcheck.net",
    "pcpartpicker.com",
    "rtings.com",
    # Fabricantes
    "amd.com",
    "nvidia.com",
    "intel.com",
    "msi.com",
    "asus.com",
    "gigabyte.com",
    "kingston.com",
    "crucial.com",
    "samsung.com",
    "westerndigital.com",
    "lexar.com",
    # Windows
    "learn.microsoft.com",
    "support.microsoft.com",
    # Em português
    "adrenaline.com.br",
    "clubedohardware.com.br",
    "tecmundo.com.br",
    "tecnoblog.net",
    "canaltech.com.br",
]

_search = None  # criado na primeira pesquisa (a chave TAVILY_API_KEY do .env só é carregada depois deste import)


@tool
def pesquisar_web(pergunta: str) -> str:
    """Pesquisa na internet, só em sites confiáveis (Tom's Hardware, TechPowerUp, sites da AMD, NVIDIA, MSI,
    Kingston, Microsoft, Adrenaline, Clube do Hardware...). Use quando não tiver certeza de algo sobre hardware,
    compatibilidade (ex.: se a placa-mãe aceita um processador), BIOS, drivers, Windows, lançamentos ou desempenho
    em jogos. Escreva a pergunta de forma específica, com os modelos (de preferência em inglês, que tem mais resultados).
    Na resposta, cite as fontes (nome do site) que usou. Cada pesquisa gasta 1 crédito: não pesquise o que já sabe."""
    global _search
    try:
        if _search is None:
            _search = TavilySearch(max_results=5, search_depth="basic", include_domains=TRUSTED_SITES)
        data = _search.invoke({"query": pergunta})
    except Exception as error:  # noqa: BLE001 — sem internet, chave errada, créditos acabaram...
        return f"Não consegui pesquisar agora ({error}). Responda com o que você sabe e avise que não confirmou."
    results = [
        {"titulo": item["title"], "site": item["url"], "trecho": item["content"][:700]}
        for item in data.get("results", [])
    ]
    if not results:
        return "Nenhum resultado nos sites confiáveis. Diga ao usuário que não encontrou confirmação."
    return json.dumps(results, ensure_ascii=False)
