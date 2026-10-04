from tools.disk_scan import scan_disk
from tools.file_tools import apagar_duplicatas, limpar_lixo, listar_duplicatas, mover_para_lixeira
from tools.file_lists import buscar_arquivos
from tools.folder_map import olhar_pasta
from tools.memory import buscar_memoria, lembrar
from tools.pc_health import ver_configuracao_pc
from tools.organize_tools import desfazer_organizacao, organizar_downloads, planejar_organizacao_downloads
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
]

# Ferramentas que mexem em arquivos: o agente só executa depois que o usuário aprovar na tela
NEEDS_APPROVAL = ["mover_para_lixeira", "limpar_lixo", "apagar_duplicatas", "organizar_downloads", "desfazer_organizacao"]

__all__ = ["ALL_TOOLS", "NEEDS_APPROVAL", "run_and_save_scan", "scan_disk"]
