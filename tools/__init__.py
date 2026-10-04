from tools.disk_scan import scan_disk
from tools.extra_files import compactar_em_zip, desfazer_renomeacao, listar_fotos_parecidas, listar_pastas_vazias_e_atalhos, renomear_arquivos
from tools.file_tools import apagar_duplicatas, limpar_lixo, listar_duplicatas, mover_para_lixeira
from tools.file_lists import buscar_arquivos
from tools.folder_map import olhar_pasta
from tools.memory import buscar_memoria, lembrar
from tools.pc_health import ver_configuracao_pc
from tools.organize_tools import desfazer_organizacao, organizar_downloads, planejar_organizacao_downloads
from tools.system_tools import (
    desativar_inicializacao,
    desinstalar_programa,
    limpar_cache_navegador,
    listar_inicializacao,
    listar_programas_instalados,
    programas_pesados,
    reativar_inicializacao,
    tamanho_cache_navegadores,
)
from tools.ui_tools import abrir_tela, destacar_card, iniciar_tour, marcar_arquivos, mostrar_plano, mudar_configuracao, rodar_scan, run_and_save_scan

# Todas as ferramentas que a Linnea pode usar
ALL_TOOLS = [
    scan_disk,
    destacar_card,
    abrir_tela,
    marcar_arquivos,
    iniciar_tour,
    mostrar_plano,
    lembrar,
    buscar_memoria,
    ver_configuracao_pc,
    mudar_configuracao,
    rodar_scan,
    olhar_pasta,
    buscar_arquivos,
    mover_para_lixeira,
    limpar_lixo,
    listar_duplicatas,
    apagar_duplicatas,
    planejar_organizacao_downloads,
    organizar_downloads,
    desfazer_organizacao,
    # Mais funções de limpeza e do sistema
    listar_fotos_parecidas,
    listar_pastas_vazias_e_atalhos,
    renomear_arquivos,
    desfazer_renomeacao,
    compactar_em_zip,
    programas_pesados,
    listar_inicializacao,
    desativar_inicializacao,
    reativar_inicializacao,
    listar_programas_instalados,
    desinstalar_programa,
    tamanho_cache_navegadores,
    limpar_cache_navegador,
]

# Ferramentas que mexem em arquivos ou no sistema: o agente só executa depois que o usuário aprovar na tela
NEEDS_APPROVAL = [
    "mover_para_lixeira",
    "limpar_lixo",
    "apagar_duplicatas",
    "organizar_downloads",
    "desfazer_organizacao",
    "renomear_arquivos",
    "desfazer_renomeacao",
    "compactar_em_zip",
    "desativar_inicializacao",
    "reativar_inicializacao",
    "desinstalar_programa",
    "limpar_cache_navegador",
]

__all__ = ["ALL_TOOLS", "NEEDS_APPROVAL", "run_and_save_scan", "scan_disk"]
