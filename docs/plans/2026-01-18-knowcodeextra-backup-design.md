# knowcodeextra Database Backup Design

## Overview

Regular automated backups of the knowcodeextra SQLite database from the VPS (qrp.lol) to local storage (blackpearl).

## Requirements

- **Backup method**: sqlite3 .backup for database consistency
- **Frequency**: Daily (3 AM with 30-minute random delay)
- **Retention**: 30 days
- **Storage**: `/mnt/storage/backups/knowcodeextra/`
- **Implementation**: New ansible role in ansible-blackpearl

## Architecture

### VPS Side (qrp.lol)

A backup script creates consistent SQLite snapshots:

**File: `/opt/knowcodeextra/backup.sh`**
```bash
#!/bin/bash
set -euo pipefail

DB_PATH="/opt/knowcodeextra/knowcodeextra.db"
BACKUP_PATH="/opt/knowcodeextra/knowcodeextra.db.backup"

sqlite3 "$DB_PATH" ".backup '$BACKUP_PATH'"
echo "Backup created: $BACKUP_PATH"
```

- Deployed by vps-ansible knowcodeextra role
- Owned by `knowcodeextra` user
- SSH access enabled for dedicated backup key

### Blackpearl Side (local)

New ansible role `knowcodeextra_backup` with:

**Role structure:**
```
roles/knowcodeextra_backup/
├── defaults/main.yml
├── tasks/main.yml
├── files/
│   └── backup-knowcodeextra.sh
└── templates/
    ├── knowcodeextra-backup.service.j2
    └── knowcodeextra-backup.timer.j2
```

**Configuration defaults:**
```yaml
knowcodeextra_backup_enabled: true
knowcodeextra_backup_remote_host: "qrp.lol"
knowcodeextra_backup_remote_user: "knowcodeextra"
knowcodeextra_backup_ssh_key_path: "/root/.ssh/knowcodeextra_backup"
knowcodeextra_backup_local_dir: "/mnt/storage/backups/knowcodeextra"
knowcodeextra_backup_retention_days: 30
```

**Backup script flow:**
1. SSH to VPS, run `/opt/knowcodeextra/backup.sh`
2. SCP the backup file to local with timestamp
3. Delete backups older than retention period

**Systemd timer:**
- Runs daily at 3 AM
- Persistent (catches up if missed)
- Random delay up to 30 minutes

## Files to Create/Modify

### vps-ansible

1. **New**: `roles/knowcodeextra/files/backup.sh`
2. **Modify**: `roles/knowcodeextra/tasks/main.yml`
   - Deploy backup script
   - Create `.ssh` directory for knowcodeextra user
   - Deploy authorized_keys with backup public key

### ansible-blackpearl

1. **New**: `roles/knowcodeextra_backup/defaults/main.yml`
2. **New**: `roles/knowcodeextra_backup/tasks/main.yml`
3. **New**: `roles/knowcodeextra_backup/files/backup-knowcodeextra.sh`
4. **New**: `roles/knowcodeextra_backup/templates/knowcodeextra-backup.service.j2`
5. **New**: `roles/knowcodeextra_backup/templates/knowcodeextra-backup.timer.j2`
6. **Modify**: `site.yml` - add role

## SSH Key Workflow

1. Run ansible-blackpearl to generate key pair at `/root/.ssh/knowcodeextra_backup`
2. Copy public key to vps-ansible configuration
3. Run vps-ansible to deploy authorized_keys

## Backup File Naming

Files stored as: `knowcodeextra-YYYY-MM-DD.db`

Example: `/mnt/storage/backups/knowcodeextra/knowcodeextra-2026-01-18.db`
