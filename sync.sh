#!/usr/bin/env bash
# ==============================================================================
# ompz - Synchronize OMP configuration across machines via Git & Symlinks
# ==============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OMP_DIR="${HOME}/.omp"
BACKUP_BASE="${OMP_DIR}/.backups"

# Colors for terminal output
BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
RESET="\033[0m"

log_info()    { printf "${CYAN}ℹ %s${RESET}\n" "$*"; }
log_success() { printf "${GREEN}✔ %s${RESET}\n" "$*"; }
log_warn()    { printf "${YELLOW}⚠ %s${RESET}\n" "$*"; }
log_error()   { printf "${RED}✖ %s${RESET}\n" "$*"; }

# Managed entries definition: "TARGET_REL_PATH|SOURCE_REL_PATH|TYPE"
# TYPE: file or dir
ENTRIES=(
  "agent/config.yml|config/agent/config.yml|file"
  "agent/extensions|config/agent/extensions|dir"
  "agent/themes|config/agent/themes|dir"
  "agent/managed-skills|config/agent/managed-skills|dir"
  "plugins/omp-plugins.lock.json|config/plugins/omp-plugins.lock.json|file"
)

canonical_path() {
  if command -v realpath >/dev/null 2>&1; then
    realpath "$1" 2>/dev/null || readlink -f "$1" 2>/dev/null || echo "$1"
  elif readlink -f "$1" >/dev/null 2>&1; then
    readlink -f "$1"
  else
    echo "$1"
  fi
}

cmd_link() {
  local timestamp
  timestamp="$(date +%Y%m%d_%H%M%S)"
  local backup_dir="${BACKUP_BASE}/${timestamp}"
  local backup_created=false

  log_info "Setting up symlinks for OMP (target: ${OMP_DIR})..."

  for item in "${ENTRIES[@]}"; do
    IFS="|" read -r rel_target rel_source item_type <<< "$item"
    local target_path="${OMP_DIR}/${rel_target}"
    local source_path="${REPO_DIR}/${rel_source}"

    # Ensure source exists in repo
    if [[ ! -e "$source_path" ]]; then
      if [[ "$item_type" == "dir" ]]; then
        mkdir -p "$source_path"
      else
        log_warn "Source ${rel_source} not found in repo, skipping."
        continue
      fi
    fi

    # Ensure parent dir of target exists
    mkdir -p "$(dirname "$target_path")"

    # Check if target is already correctly symlinked
    if [[ -L "$target_path" ]]; then
      local current_link
      current_link="$(canonical_path "$target_path")"
      local expected_link
      expected_link="$(canonical_path "$source_path")"

      if [[ "$current_link" == "$expected_link" ]]; then
        log_success "Already linked: ~/.omp/${rel_target} -> ${rel_source}"
        continue
      else
        # Symlink points elsewhere, back it up or remove
        log_warn "~/.omp/${rel_target} points elsewhere (${current_link}), replacing..."
        rm -rf "$target_path"
      fi
    elif [[ -e "$target_path" ]]; then
      # Existing file or directory - backup before linking
      if [[ "$backup_created" == false ]]; then
        mkdir -p "$backup_dir"
        backup_created=true
        log_info "Backing up pre-existing files to ${backup_dir}..."
      fi
      mkdir -p "$(dirname "${backup_dir}/${rel_target}")"
      cp -a "$target_path" "${backup_dir}/${rel_target}"
      rm -rf "$target_path"
      log_warn "Backed up ~/.omp/${rel_target} -> .backups/${timestamp}/${rel_target}"
    fi

    # Create symlink
    ln -sfn "$source_path" "$target_path"
    log_success "Linked ~/.omp/${rel_target} -> ${rel_source}"
  done

  if [[ "$backup_created" == true ]]; then
    log_info "Backup saved at: ${backup_dir}"
  fi
  printf "\n${GREEN}${BOLD}Setup complete! Your OMP is now linked to ${REPO_DIR}.${RESET}\n"
}

cmd_unlink() {
  log_info "Unlinking OMP config from repo (restoring independent copies)..."

  for item in "${ENTRIES[@]}"; do
    IFS="|" read -r rel_target rel_source _ <<< "$item"
    local target_path="${OMP_DIR}/${rel_target}"
    local source_path="${REPO_DIR}/${rel_source}"

    if [[ -L "$target_path" ]]; then
      rm -f "$target_path"
      if [[ -e "$source_path" ]]; then
        cp -a "$source_path" "$target_path"
        log_success "Unlinked ~/.omp/${rel_target} (copied contents from repo as real files)."
      else
        log_warn "Removed symlink ~/.omp/${rel_target}."
      fi
    else
      log_info "~/.omp/${rel_target} is not a symlink, left untouched."
    fi
  done
  log_success "Unlink finished."
}

cmd_status() {
  printf "${BOLD}=== OMPZ Configuration Status ===${RESET}\n"
  printf "Repo directory: %s\n" "${REPO_DIR}"
  printf "Target OMP dir: %s\n\n" "${OMP_DIR}"

  for item in "${ENTRIES[@]}"; do
    IFS="|" read -r rel_target rel_source _ <<< "$item"
    local target_path="${OMP_DIR}/${rel_target}"
    local source_path="${REPO_DIR}/${rel_source}"

    if [[ -L "$target_path" ]]; then
      local current_target
      current_target="$(canonical_path "$target_path")"
      local expected_target
      expected_target="$(canonical_path "$source_path")"

      if [[ "$current_target" == "$expected_target" ]]; then
        printf "  ${GREEN}✔ [LINKED]   ${RESET} ~/.omp/%-30s -> %s\n" "${rel_target}" "${rel_source}"
      else
        printf "  ${YELLOW}⚠ [WRONG]    ${RESET} ~/.omp/%-30s -> %s\n" "${rel_target}" "${current_target}"
      fi
    elif [[ -e "$target_path" ]]; then
      printf "  ${RED}✖ [DETACHED] ${RESET} ~/.omp/%-30s is a regular file/dir (not linked)\n" "${rel_target}"
    else
      printf "  ${YELLOW}? [MISSING]  ${RESET} ~/.omp/%-30s does not exist\n" "${rel_target}"
    fi
  done

  printf "\n${BOLD}=== Git Working Tree Status ===${RESET}\n"
  if git -C "${REPO_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local status_output
    status_output="$(git -C "${REPO_DIR}" status -s)"
    if [[ -z "$status_output" ]]; then
      printf "  ${GREEN}✔ Working tree clean (all changes committed).${RESET}\n"
    else
      printf "  ${YELLOW}⚠ Uncommitted changes detected:${RESET}\n"
      echo "$status_output" | sed 's/^/    /'
    fi
  else
    printf "  ${RED}✖ Not a git repository.${RESET}\n"
  fi
}

cmd_backup() {
  local timestamp
  timestamp="$(date +%Y%m%d_%H%M%S)"
  local dest="${BACKUP_BASE}/${timestamp}"
  mkdir -p "$dest"

  log_info "Creating snapshot backup of ~/.omp into ${dest}..."
  for item in "${ENTRIES[@]}"; do
    IFS="|" read -r rel_target _ _ <<< "$item"
    local target_path="${OMP_DIR}/${rel_target}"
    if [[ -e "$target_path" ]]; then
      mkdir -p "$(dirname "${dest}/${rel_target}")"
      cp -aL "$target_path" "${dest}/${rel_target}"
    fi
  done
  log_success "Backup completed: ${dest}"
}

cmd_help() {
  cat <<EOF
Usage: ./sync.sh <command>

Commands:
  link      Link ~/.omp configs to this repository (auto-backups existing files)
  unlink    Remove symlinks and restore local real files from repo
  status    Check symlink and git status across all managed items
  backup    Create a timestamped backup snapshot of current ~/.omp settings
  help      Show this help message

Examples:
  ./sync.sh link       # First time setup on this or a new machine
  ./sync.sh status     # Check health of links & git diffs
  ./sync.sh unlink     # Disconnect ~/.omp from this repo
EOF
}

case "${1:-status}" in
  link|install)
    cmd_link
    ;;
  unlink)
    cmd_unlink
    ;;
  status)
    cmd_status
    ;;
  backup)
    cmd_backup
    ;;
  help|--help|-h)
    cmd_help
    ;;
  *)
    log_error "Unknown command: $1"
    cmd_help
    exit 1
    ;;
esac
