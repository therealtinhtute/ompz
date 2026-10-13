#!/usr/bin/env bash
# ==============================================================================
# ompz - Interactive OMP Setup & Sync Manager (powered by Gum)
# ==============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OMP_DIR="${HOME}/.omp"
BACKUP_BASE="${OMP_DIR}/.backups"

# Colors for fallback ANSI terminal output
BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
MAGENTA="\033[35m"
RESET="\033[0m"

has_gum() {
  command -v gum >/dev/null 2>&1
}

# Managed entries: "TARGET_REL_PATH|SOURCE_REL_PATH|TYPE"
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

show_banner() {
  if has_gum; then
    gum style \
      --border normal \
      --margin "0 0 1 0" \
      --padding "0 2" \
      --border-foreground 212 \
      --bold \
      "⚡ OMPZ Setup & Sync Manager"
  else
    printf "\n${MAGENTA}${BOLD}================================================${RESET}\n"
    printf "${BOLD}⚡ OMPZ Setup & Sync Manager${RESET}\n"
    printf "${MAGENTA}${BOLD}================================================${RESET}\n\n"
  fi
}

cmd_link() {
  local timestamp
  timestamp="$(date +%Y%m%d_%H%M%S)"
  local backup_dir="${BACKUP_BASE}/${timestamp}"
  local backup_created=false

  if has_gum; then
    gum log --level info --prefix "OMP" "Bắt đầu thiết lập symlinks sang ${OMP_DIR}..."
  else
    printf "${CYAN}ℹ Bắt đầu thiết lập symlinks sang %s...${RESET}\n" "${OMP_DIR}"
  fi

  for item in "${ENTRIES[@]}"; do
    IFS="|" read -r rel_target rel_source item_type <<< "$item"
    local target_path="${OMP_DIR}/${rel_target}"
    local source_path="${REPO_DIR}/${rel_source}"

    # Đảm bảo nguồn tồn tại trong repo
    if [[ ! -e "$source_path" ]]; then
      if [[ "$item_type" == "dir" ]]; then
        mkdir -p "$source_path"
      else
        if has_gum; then
          gum log --level warn "Bỏ qua: không tìm thấy ${rel_source} trong repo."
        else
          printf "${YELLOW}⚠ Bỏ qua: không tìm thấy %s trong repo.${RESET}\n" "${rel_source}"
        fi
        continue
      fi
    fi

    # Đảm bảo thư mục cha của target tồn tại
    mkdir -p "$(dirname "$target_path")"

    # Kiểm tra target đã là symlink hợp lệ chưa
    if [[ -L "$target_path" ]]; then
      local current_link
      current_link="$(canonical_path "$target_path")"
      local expected_link
      expected_link="$(canonical_path "$source_path")"

      if [[ "$current_link" == "$expected_link" ]]; then
        if has_gum; then
          gum log --level info "Đã link sẵn: ~/.omp/${rel_target} -> ${rel_source}"
        else
          printf "${GREEN}✔ Đã link sẵn: ~/.omp/%s -> %s${RESET}\n" "${rel_target}" "${rel_source}"
        fi
        continue
      else
        if has_gum; then
          gum log --level warn "~/.omp/${rel_target} trỏ sai đích, đang thay thế..."
        else
          printf "${YELLOW}⚠ ~/.omp/%s trỏ sai đích, đang thay thế...${RESET}\n" "${rel_target}"
        fi
        rm -rf "$target_path"
      fi
    elif [[ -e "$target_path" ]]; then
      # Tệp/thư mục thật đã có từ trước -> sao lưu trước khi link
      if [[ "$backup_created" == false ]]; then
        mkdir -p "$backup_dir"
        backup_created=true
        if has_gum; then
          gum log --level info "Sao lưu cấu hình cũ vào ${backup_dir}..."
        else
          printf "${CYAN}ℹ Sao lưu cấu hình cũ vào %s...${RESET}\n" "${backup_dir}"
        fi
      fi
      mkdir -p "$(dirname "${backup_dir}/${rel_target}")"
      cp -a "$target_path" "${backup_dir}/${rel_target}"
      rm -rf "$target_path"
      if has_gum; then
        gum log --level warn "Đã backup ~/.omp/${rel_target} -> .backups/${timestamp}/${rel_target}"
      else
        printf "${YELLOW}⚠ Đã backup ~/.omp/%s -> .backups/%s/%s${RESET}\n" "${rel_target}" "${timestamp}" "${rel_target}"
      fi
    fi

    # Tạo symlink
    ln -sfn "$source_path" "$target_path"
    if has_gum; then
      gum log --level info "Đã liên kết: ~/.omp/${rel_target} -> ${rel_source}"
    else
      printf "${GREEN}✔ Đã liên kết: ~/.omp/%s -> %s${RESET}\n" "${rel_target}" "${rel_source}"
    fi
  done

  if [[ "$backup_created" == true ]]; then
    if has_gum; then
      gum style --foreground 212 "📦 Bản backup an toàn đã lưu tại: ${backup_dir}"
    else
      printf "${CYAN}📦 Bản backup an toàn đã lưu tại: %s${RESET}\n" "${backup_dir}"
    fi
  fi

  if has_gum; then
    gum style --foreground 82 --bold "✨ Hoàn tất! ~/.omp hiện đã được liên kết với repo."
  else
    printf "\n${GREEN}${BOLD}✨ Hoàn tất! ~/.omp hiện đã được liên kết với repo.${RESET}\n"
  fi
}

cmd_status() {
  if has_gum; then
    gum style --bold --foreground 99 "=== Trạng thái cấu hình OMPZ ==="
  else
    printf "${BOLD}=== Trạng thái cấu hình OMPZ ===${RESET}\n"
  fi
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
      printf "  ${RED}✖ [DETACHED] ${RESET} ~/.omp/%-30s là tệp thật (chưa link)\n" "${rel_target}"
    else
      printf "  ${YELLOW}? [MISSING]  ${RESET} ~/.omp/%-30s không tồn tại\n" "${rel_target}"
    fi
  done

  printf "\n"
  if has_gum; then
    gum style --bold --foreground 99 "=== Trạng thái Git Repo ==="
  else
    printf "${BOLD}=== Trạng thái Git Repo ===${RESET}\n"
  fi

  if git -C "${REPO_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local status_output
    status_output="$(git -C "${REPO_DIR}" status -s)"
    if [[ -z "$status_output" ]]; then
      printf "  ${GREEN}✔ Working tree sạch (toàn bộ thay đổi đã được commit).${RESET}\n"
    else
      printf "  ${YELLOW}⚠ Phát hiện thay đổi chưa commit:${RESET}\n"
      echo "$status_output" | sed 's/^/    /'
    fi
  else
    printf "  ${RED}✖ Thư mục này chưa phải git repository.${RESET}\n"
  fi
}

cmd_backup() {
  local timestamp
  timestamp="$(date +%Y%m%d_%H%M%S)"
  local dest="${BACKUP_BASE}/${timestamp}"
  mkdir -p "$dest"

  if has_gum; then
    gum log --level info "Đang tạo bản sao lưu snapshot ~/.omp vào ${dest}..."
  else
    printf "${CYAN}ℹ Đang tạo bản sao lưu snapshot ~/.omp vào %s...${RESET}\n" "${dest}"
  fi

  for item in "${ENTRIES[@]}"; do
    IFS="|" read -r rel_target _ _ <<< "$item"
    local target_path="${OMP_DIR}/${rel_target}"
    if [[ -e "$target_path" ]]; then
      mkdir -p "$(dirname "${dest}/${rel_target}")"
      cp -aL "$target_path" "${dest}/${rel_target}"
    fi
  done

  if has_gum; then
    gum style --foreground 82 "✔ Đã tạo bản backup thành công tại: ${dest}"
  else
    printf "${GREEN}✔ Đã tạo bản backup thành công tại: %s${RESET}\n" "${dest}"
  fi
}

cmd_unlink() {
  if has_gum; then
    if ! gum confirm "Bạn có chắc muốn gỡ bỏ symlinks và phục hồi file thật không?"; then
      gum style --faint "Đã hủy thao tác."
      return 0
    fi
  else
    printf "${YELLOW}Bạn có chắc muốn gỡ bỏ symlinks? (y/N): ${RESET}"
    read -r confirm_choice
    if [[ "$confirm_choice" != "y" && "$confirm_choice" != "Y" ]]; then
      printf "Đã hủy thao tác.\n"
      return 0
    fi
  fi

  for item in "${ENTRIES[@]}"; do
    IFS="|" read -r rel_target rel_source _ <<< "$item"
    local target_path="${OMP_DIR}/${rel_target}"
    local source_path="${REPO_DIR}/${rel_source}"

    if [[ -L "$target_path" ]]; then
      rm -f "$target_path"
      if [[ -e "$source_path" ]]; then
        cp -a "$source_path" "$target_path"
        if has_gum; then
          gum log --level info "Đã gỡ symlink ~/.omp/${rel_target} (khôi phục thành file thật)."
        else
          printf "${GREEN}✔ Đã gỡ symlink ~/.omp/%s (khôi phục thành file thật).${RESET}\n" "${rel_target}"
        fi
      fi
    fi
  done

  if has_gum; then
    gum style --foreground 82 "✔ Đã gỡ bỏ symlink hoàn tất."
  else
    printf "${GREEN}✔ Đã gỡ bỏ symlink hoàn tất.${RESET}\n"
  fi
}

cmd_push() {
  local changes
  changes="$(git -C "${REPO_DIR}" status -s)"
  if [[ -z "$changes" ]]; then
    if has_gum; then
      gum style --foreground 82 "✔ Không có thay đổi nào mới để push. Git working tree sạch!"
    else
      printf "${GREEN}✔ Không có thay đổi nào mới để push. Git working tree sạch!${RESET}\n"
    fi
    return 0
  fi

  printf "Các tệp có thay đổi:\n"
  echo "$changes" | sed 's/^/  /'
  printf "\n"

  local msg=""
  if has_gum; then
    msg="$(gum input --placeholder "Nhập commit message..." --value "chore: update omp configurations and extensions")"
    if [[ -z "$msg" ]]; then
      gum style --faint "Commit message rỗng, đã hủy push."
      return 0
    fi
  else
    printf "Nhập commit message [chore: update omp config]: "
    read -r input_msg
    msg="${input_msg:-chore: update omp config}"
  fi

  git -C "${REPO_DIR}" add -A
  git -C "${REPO_DIR}" commit -m "$msg"

  if has_gum; then
    gum spin --spinner dot --title "Đang đẩy thay đổi lên GitHub..." -- git -C "${REPO_DIR}" push origin main
    gum style --foreground 82 --bold "🚀 Đã đẩy commit mới lên GitHub thành công!"
  else
    git -C "${REPO_DIR}" push origin main
    printf "${GREEN}${BOLD}🚀 Đã đẩy commit mới lên GitHub thành công!${RESET}\n"
  fi
}

cmd_pull() {
  if has_gum; then
    gum spin --spinner dot --title "Đang kéo cập nhật từ GitHub..." -- git -C "${REPO_DIR}" pull --ff-only origin main
    gum style --foreground 82 "✔ Đã kéo cấu hình mới nhất từ GitHub!"
  else
    git -C "${REPO_DIR}" pull --ff-only origin main
    printf "${GREEN}✔ Đã kéo cấu hình mới nhất từ GitHub!${RESET}\n"
  fi
}

interactive_menu() {
  show_banner

  local choice=""
  if has_gum; then
    choice="$(gum choose \
      --header="Chọn thao tác muốn thực hiện:" \
      --cursor="👉 " \
      --cursor.foreground="212" \
      "🔗 link    - Thiết lập symlinks ~/.omp -> repo" \
      "📊 status  - Kiểm tra trạng thái liên kết & Git" \
      "💾 backup  - Tạo bản sao lưu snapshot ~/.omp" \
      "🚀 push    - Commit & Push thay đổi lên GitHub" \
      "🔄 pull    - Cập nhật cấu hình mới từ GitHub" \
      "❌ unlink  - Gỡ symlinks (khôi phục file thật)" \
      "🚪 exit    - Thoát")"
  else
    printf "Chọn thao tác:\n"
    printf "  1) link    - Thiết lập symlinks ~/.omp -> repo\n"
    printf "  2) status  - Kiểm tra trạng thái liên kết & Git\n"
    printf "  3) backup  - Tạo bản sao lưu snapshot ~/.omp\n"
    printf "  4) push    - Commit & Push thay đổi lên GitHub\n"
    printf "  5) pull    - Cập nhật cấu hình mới từ GitHub\n"
    printf "  6) unlink  - Gỡ symlinks (khôi phục file thật)\n"
    printf "  7) exit    - Thoát\n"
    printf "Nhập lựa chọn [1-7]: "
    read -r num_choice
    case "$num_choice" in
      1) choice="link" ;;
      2) choice="status" ;;
      3) choice="backup" ;;
      4) choice="push" ;;
      5) choice="pull" ;;
      6) choice="unlink" ;;
      *) choice="exit" ;;
    esac
  fi

  case "$choice" in
    *link*)
      cmd_link
      ;;
    *status*)
      cmd_status
      ;;
    *backup*)
      cmd_backup
      ;;
    *push*)
      cmd_push
      ;;
    *pull*)
      cmd_pull
      ;;
    *unlink*)
      cmd_unlink
      ;;
    *exit*)
      printf "Tạm biệt!\n"
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
}

cmd_help() {
  show_banner
  cat <<EOF
Sử dụng:
  ./setup.sh              # Mở menu tương tác trực quan (Interactive TUI với Gum)
  ./setup.sh <lệnh>       # Chạy trực tiếp một lệnh cụ thể

Các lệnh có sẵn:
  link      Thiết lập symlinks ~/.omp sang repo (tự động backup file cũ)
  status    Kiểm tra tình trạng liên kết & thay đổi git
  backup    Tạo bản snapshot backup độc lập của ~/.omp
  push      Tự động thêm, commit và đẩy các thay đổi lên GitHub
  pull      Kéo các thay đổi cấu hình mới nhất từ GitHub
  unlink    Gỡ bỏ symlinks và phục hồi file thật độc lập
  help      Hiển thị hướng dẫn này
EOF
}

# Xử lý tham số đầu vào
ACTION="${1:-}"

if [[ -z "$ACTION" ]]; then
  # Chạy không có tham số: mở interactive menu
  interactive_menu
else
  case "$ACTION" in
    link|install)
      cmd_link
      ;;
    status)
      cmd_status
      ;;
    backup)
      cmd_backup
      ;;
    push)
      cmd_push
      ;;
    pull)
      cmd_pull
      ;;
    unlink)
      cmd_unlink
      ;;
    help|--help|-h)
      cmd_help
      ;;
    *)
      if has_gum; then
        gum log --level error "Lệnh không hợp lệ: $ACTION"
      else
        printf "${RED}✖ Lệnh không hợp lệ: %s${RESET}\n" "$ACTION"
      fi
      cmd_help
      exit 1
      ;;
  esac
fi
