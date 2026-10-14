#!/bin/sh
# Backup diário do banco, guardado 30 dias em docker/backups.
# No servidor, agendar no cron do host (todo dia às 02:00):
#   0 2 * * * cd /caminho/gestao-ti && docker compose -f docker/compose.yml exec -T postgres sh /backup.sh
set -e
arquivo="/backups/gestao-$(date +%F).sql.gz"
pg_dump -U gestao gestao | gzip > "$arquivo"
find /backups -name 'gestao-*.sql.gz' -mtime +30 -delete
echo "backup: $arquivo"
