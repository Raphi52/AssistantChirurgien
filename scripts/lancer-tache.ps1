# Lancé par la tâche planifiée « AssistantChirurgien » et au démarrage de session : serveur + tunnel.
# cmd /c garde le journal en UTF-8 (la redirection PowerShell 5 l'écrirait en UTF-16).
Set-Location 'D:\Chirurgien\AssistantChirurgien'
cmd /c "node scripts\public.js > public-run.log 2> public-run.err.log"
