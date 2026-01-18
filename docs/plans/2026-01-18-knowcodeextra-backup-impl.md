# knowcodeextra Backup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automated daily SQLite backups from VPS (qrp.lol) to local storage (blackpearl).

**Architecture:** VPS-side backup script creates consistent SQLite snapshot; blackpearl pulls via SSH/SCP on systemd timer; 30-day retention with automatic cleanup.

**Tech Stack:** Ansible, Bash, systemd timers, SSH, sqlite3

---

## Task 1: Create VPS Backup Script (vps-ansible)

**Files:**
- Create: `/home/jsvana/projects/vps-ansible/roles/knowcodeextra/files/backup.sh`

**Step 1: Create the backup script**

```bash
#!/bin/bash
set -euo pipefail

DB_PATH="/opt/knowcodeextra/knowcodeextra.db"
BACKUP_PATH="/opt/knowcodeextra/knowcodeextra.db.backup"

# Create atomic backup using sqlite3's backup command
sqlite3 "$DB_PATH" ".backup '$BACKUP_PATH'"

echo "Backup created: $BACKUP_PATH"
```

**Step 2: Verify file created**

Run: `ls -la /home/jsvana/projects/vps-ansible/roles/knowcodeextra/files/backup.sh`
Expected: File exists

**Step 3: Commit**

```bash
cd /home/jsvana/projects/vps-ansible
git add roles/knowcodeextra/files/backup.sh
git commit -m "feat(knowcodeextra): add database backup script"
```

---

## Task 2: Add VPS Backup Tasks (vps-ansible)

**Files:**
- Modify: `/home/jsvana/projects/vps-ansible/roles/knowcodeextra/tasks/main.yml`

**Step 1: Add tasks to deploy backup script and SSH access**

Append to end of tasks/main.yml:

```yaml
# Backup support
- name: Deploy backup script
  ansible.builtin.copy:
    src: backup.sh
    dest: /opt/knowcodeextra/backup.sh
    owner: knowcodeextra
    group: knowcodeextra
    mode: "0755"

- name: Create knowcodeextra .ssh directory
  ansible.builtin.file:
    path: /opt/knowcodeextra/.ssh
    state: directory
    owner: knowcodeextra
    group: knowcodeextra
    mode: "0700"

- name: Deploy backup authorized_keys
  ansible.builtin.copy:
    content: "{{ knowcodeextra_backup_pubkey }}"
    dest: /opt/knowcodeextra/.ssh/authorized_keys
    owner: knowcodeextra
    group: knowcodeextra
    mode: "0600"
  when: knowcodeextra_backup_pubkey is defined
```

**Step 2: Run ansible-lint**

Run: `cd /home/jsvana/projects/vps-ansible && ansible-lint roles/knowcodeextra/tasks/main.yml`
Expected: No errors (warnings OK)

**Step 3: Commit**

```bash
cd /home/jsvana/projects/vps-ansible
git add roles/knowcodeextra/tasks/main.yml
git commit -m "feat(knowcodeextra): add backup script deployment and SSH access"
```

---

## Task 3: Update knowcodeextra User Home Directory (vps-ansible)

**Files:**
- Modify: `/home/jsvana/projects/vps-ansible/roles/knowcodeextra/tasks/main.yml`

**Step 1: Update user creation task to set home directory**

Find and modify the "Create knowcodeextra user" task:

```yaml
- name: Create knowcodeextra user
  ansible.builtin.user:
    name: knowcodeextra
    create_home: false
    home: /opt/knowcodeextra
    system: true
```

**Step 2: Run ansible-lint**

Run: `cd /home/jsvana/projects/vps-ansible && ansible-lint roles/knowcodeextra/tasks/main.yml`
Expected: No errors

**Step 3: Commit**

```bash
cd /home/jsvana/projects/vps-ansible
git add roles/knowcodeextra/tasks/main.yml
git commit -m "feat(knowcodeextra): set user home directory for SSH access"
```

---

## Task 4: Create Blackpearl Role Defaults (ansible-blackpearl)

**Files:**
- Create: `/home/jsvana/projects/ansible-blackpearl/roles/knowcodeextra_backup/defaults/main.yml`

**Step 1: Create defaults directory and file**

```yaml
---
knowcodeextra_backup_enabled: true
knowcodeextra_backup_remote_host: "qrp.lol"
knowcodeextra_backup_remote_user: "knowcodeextra"
knowcodeextra_backup_ssh_key_path: "/root/.ssh/knowcodeextra_backup"
knowcodeextra_backup_local_dir: "/mnt/storage/backups/knowcodeextra"
knowcodeextra_backup_retention_days: 30
```

**Step 2: Verify file created**

Run: `ls -la /home/jsvana/projects/ansible-blackpearl/roles/knowcodeextra_backup/defaults/main.yml`
Expected: File exists

**Step 3: Commit**

```bash
cd /home/jsvana/projects/ansible-blackpearl
git add roles/knowcodeextra_backup/defaults/main.yml
git commit -m "feat(knowcodeextra_backup): add role defaults"
```

---

## Task 5: Create Blackpearl Backup Script (ansible-blackpearl)

**Files:**
- Create: `/home/jsvana/projects/ansible-blackpearl/roles/knowcodeextra_backup/files/backup-knowcodeextra.sh`

**Step 1: Create files directory and script**

```bash
#!/bin/bash
set -euo pipefail

REMOTE_HOST="$1"
REMOTE_USER="$2"
SSH_KEY="$3"
LOCAL_DIR="$4"
RETENTION_DAYS="$5"

DATE=$(date +%Y-%m-%d)
BACKUP_FILE="knowcodeextra-${DATE}.db"

echo "Starting knowcodeextra backup..."

# Run remote backup script to create consistent snapshot
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o BatchMode=yes \
    "${REMOTE_USER}@${REMOTE_HOST}" "/opt/knowcodeextra/backup.sh"

# Pull the backup file
scp -i "$SSH_KEY" -o BatchMode=yes \
    "${REMOTE_USER}@${REMOTE_HOST}:/opt/knowcodeextra/knowcodeextra.db.backup" \
    "${LOCAL_DIR}/${BACKUP_FILE}"

# Clean up old backups
find "$LOCAL_DIR" -name "knowcodeextra-*.db" -type f -mtime +"${RETENTION_DAYS}" -delete

echo "Backup complete: ${LOCAL_DIR}/${BACKUP_FILE}"
```

**Step 2: Verify file created**

Run: `ls -la /home/jsvana/projects/ansible-blackpearl/roles/knowcodeextra_backup/files/backup-knowcodeextra.sh`
Expected: File exists

**Step 3: Commit**

```bash
cd /home/jsvana/projects/ansible-blackpearl
git add roles/knowcodeextra_backup/files/backup-knowcodeextra.sh
git commit -m "feat(knowcodeextra_backup): add backup script"
```

---

## Task 6: Create Blackpearl Systemd Service Template (ansible-blackpearl)

**Files:**
- Create: `/home/jsvana/projects/ansible-blackpearl/roles/knowcodeextra_backup/templates/knowcodeextra-backup.service.j2`

**Step 1: Create templates directory and service file**

```ini
[Unit]
Description=Backup knowcodeextra database from VPS
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/knowcodeextra-backup/backup-knowcodeextra.sh \
    {{ knowcodeextra_backup_remote_host }} \
    {{ knowcodeextra_backup_remote_user }} \
    {{ knowcodeextra_backup_ssh_key_path }} \
    {{ knowcodeextra_backup_local_dir }} \
    {{ knowcodeextra_backup_retention_days }}

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=knowcodeextra-backup
```

**Step 2: Verify file created**

Run: `ls -la /home/jsvana/projects/ansible-blackpearl/roles/knowcodeextra_backup/templates/knowcodeextra-backup.service.j2`
Expected: File exists

**Step 3: Commit**

```bash
cd /home/jsvana/projects/ansible-blackpearl
git add roles/knowcodeextra_backup/templates/knowcodeextra-backup.service.j2
git commit -m "feat(knowcodeextra_backup): add systemd service template"
```

---

## Task 7: Create Blackpearl Systemd Timer Template (ansible-blackpearl)

**Files:**
- Create: `/home/jsvana/projects/ansible-blackpearl/roles/knowcodeextra_backup/templates/knowcodeextra-backup.timer.j2`

**Step 1: Create timer template**

```ini
[Unit]
Description=Daily backup of knowcodeextra database

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true
RandomizedDelaySec=1800

[Install]
WantedBy=timers.target
```

**Step 2: Verify file created**

Run: `ls -la /home/jsvana/projects/ansible-blackpearl/roles/knowcodeextra_backup/templates/knowcodeextra-backup.timer.j2`
Expected: File exists

**Step 3: Commit**

```bash
cd /home/jsvana/projects/ansible-blackpearl
git add roles/knowcodeextra_backup/templates/knowcodeextra-backup.timer.j2
git commit -m "feat(knowcodeextra_backup): add systemd timer template"
```

---

## Task 8: Create Blackpearl Role Handlers (ansible-blackpearl)

**Files:**
- Create: `/home/jsvana/projects/ansible-blackpearl/roles/knowcodeextra_backup/handlers/main.yml`

**Step 1: Create handlers directory and file**

```yaml
---
- name: Reload systemd
  ansible.builtin.systemd:
    daemon_reload: true

- name: Restart knowcodeextra-backup timer
  ansible.builtin.systemd:
    name: knowcodeextra-backup.timer
    state: restarted
    enabled: true
```

**Step 2: Verify file created**

Run: `ls -la /home/jsvana/projects/ansible-blackpearl/roles/knowcodeextra_backup/handlers/main.yml`
Expected: File exists

**Step 3: Commit**

```bash
cd /home/jsvana/projects/ansible-blackpearl
git add roles/knowcodeextra_backup/handlers/main.yml
git commit -m "feat(knowcodeextra_backup): add handlers"
```

---

## Task 9: Create Blackpearl Role Tasks (ansible-blackpearl)

**Files:**
- Create: `/home/jsvana/projects/ansible-blackpearl/roles/knowcodeextra_backup/tasks/main.yml`

**Step 1: Create tasks file**

```yaml
---
- name: Create knowcodeextra backup directories
  ansible.builtin.file:
    path: "{{ item }}"
    state: directory
    owner: root
    group: root
    mode: "0755"
  loop:
    - /opt/knowcodeextra-backup
    - "{{ knowcodeextra_backup_local_dir }}"

- name: Generate SSH key pair for backups
  community.crypto.openssh_keypair:
    path: "{{ knowcodeextra_backup_ssh_key_path }}"
    type: ed25519
    comment: "knowcodeextra-backup@blackpearl"
  register: knowcodeextra_backup_keypair

- name: Display public key for VPS configuration
  ansible.builtin.debug:
    msg: |
      Add this public key to vps-ansible group_vars/qrp_servers/main.yml:
      knowcodeextra_backup_pubkey: "{{ knowcodeextra_backup_keypair.public_key }}"
  when: knowcodeextra_backup_keypair.changed

- name: Deploy backup script
  ansible.builtin.copy:
    src: backup-knowcodeextra.sh
    dest: /opt/knowcodeextra-backup/backup-knowcodeextra.sh
    owner: root
    group: root
    mode: "0755"

- name: Deploy systemd service
  ansible.builtin.template:
    src: knowcodeextra-backup.service.j2
    dest: /etc/systemd/system/knowcodeextra-backup.service
    owner: root
    group: root
    mode: "0644"
  notify:
    - Reload systemd
    - Restart knowcodeextra-backup timer

- name: Deploy systemd timer
  ansible.builtin.template:
    src: knowcodeextra-backup.timer.j2
    dest: /etc/systemd/system/knowcodeextra-backup.timer
    owner: root
    group: root
    mode: "0644"
  notify:
    - Reload systemd
    - Restart knowcodeextra-backup timer

- name: Enable and start backup timer
  ansible.builtin.systemd:
    name: knowcodeextra-backup.timer
    state: started
    enabled: true
    daemon_reload: true
```

**Step 2: Run ansible-lint**

Run: `cd /home/jsvana/projects/ansible-blackpearl && ansible-lint roles/knowcodeextra_backup/tasks/main.yml`
Expected: No errors (warnings OK)

**Step 3: Commit**

```bash
cd /home/jsvana/projects/ansible-blackpearl
git add roles/knowcodeextra_backup/tasks/main.yml
git commit -m "feat(knowcodeextra_backup): add main tasks"
```

---

## Task 10: Add Role to site.yml (ansible-blackpearl)

**Files:**
- Modify: `/home/jsvana/projects/ansible-blackpearl/site.yml`

**Step 1: Add knowcodeextra_backup role after monitoring role**

Add this block after the monitoring role:

```yaml
    - role: knowcodeextra_backup
      when: knowcodeextra_backup_enabled | default(false)
      tags: [knowcodeextra, backup]
```

**Step 2: Run ansible-lint**

Run: `cd /home/jsvana/projects/ansible-blackpearl && ansible-lint site.yml`
Expected: No errors

**Step 3: Commit**

```bash
cd /home/jsvana/projects/ansible-blackpearl
git add site.yml
git commit -m "feat: add knowcodeextra_backup role to site.yml"
```

---

## Task 11: Enable Role in host_vars (ansible-blackpearl)

**Files:**
- Modify: `/home/jsvana/projects/ansible-blackpearl/host_vars/blackpearl/main.yml`

**Step 1: Add enable flag**

Add to the file:

```yaml
# knowcodeextra backup
knowcodeextra_backup_enabled: true
```

**Step 2: Commit**

```bash
cd /home/jsvana/projects/ansible-blackpearl
git add host_vars/blackpearl/main.yml
git commit -m "feat: enable knowcodeextra_backup on blackpearl"
```

---

## Post-Implementation: Deployment Steps

After all tasks are complete, deploy in this order:

1. **Run ansible-blackpearl** to generate SSH key:
   ```bash
   cd /home/jsvana/projects/ansible-blackpearl
   ansible-playbook site.yml --tags knowcodeextra
   ```
   Note the public key output.

2. **Add public key to vps-ansible** group_vars:
   Edit `/home/jsvana/projects/vps-ansible/group_vars/qrp_servers/main.yml`:
   ```yaml
   knowcodeextra_backup_pubkey: "ssh-ed25519 AAAA... knowcodeextra-backup@blackpearl"
   ```

3. **Run vps-ansible** to deploy backup script and authorized_keys:
   ```bash
   cd /home/jsvana/projects/vps-ansible
   ansible-playbook site.yml --tags knowcodeextra
   ```

4. **Test backup manually**:
   ```bash
   ssh blackpearl sudo systemctl start knowcodeextra-backup.service
   ssh blackpearl sudo journalctl -u knowcodeextra-backup.service -f
   ```
