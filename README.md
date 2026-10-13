# ompz

> Đồng bộ cấu hình, extensions, themes và plugins của **OMP** qua Git repository cá nhân.

Dự án này sử dụng cơ chế **Symlink** kết hợp kịch bản tự động `sync.sh` (POSIX/Bash thuần, không phụ thuộc package ngoài). Mọi thay đổi trong cấu hình OMP trên máy sẽ lập tức hiển thị trong Git working tree để bạn review, commit và push lên private repository.

---

## 📁 Cấu trúc thư mục

```text
ompz/
├── .gitignore                     # Chặn triệt để DBs, logs, caches, sessions, tokens
├── README.md                      # Hướng dẫn sử dụng
├── sync.sh                        # Script quản trị: link, unlink, status, backup
└── config/
    ├── agent/
    │   ├── config.yml             # Cấu hình chính của OMP Agent (~/.omp/agent/config.yml)
    │   ├── extensions/            # Các TypeScript extensions tuỳ biến
    │   ├── themes/                # Themes tuỳ biến (dark-nord-claude.json, ...)
    │   └── managed-skills/        # Các skills được quản trị tự động
    └── plugins/
        └── omp-plugins.lock.json  # Danh sách plugins OMP đã cài đặt
```

---

## 🚀 Thiết lập trên máy mới (Restore / Clone)

Khi chuyển sang một máy tính mới:

1. **Clone repository này về máy:**
   ```bash
   git clone git@github.com:<your-username>/ompz.git ~/Lab/ompz
   cd ~/Lab/ompz
   ```

2. **Chạy lệnh liên kết (link):**
   ```bash
   ./sync.sh link
   ```
   *Script sẽ tự động sao lưu cấu hình cũ (nếu có) vào `~/.omp/.backups/<timestamp>` trước khi tạo symlink.*

3. **Kiểm tra trạng thái:**
   ```bash
   ./sync.sh status
   ```

---

## 🔄 Quy trình làm việc hàng ngày (Workflow)

Nhờ cơ chế symlink, bạn **không cần** chạy lệnh export mỗi khi chỉnh sửa cấu hình:

1. Bạn sửa cấu hình OMP (trong giao diện OMP hoặc chỉnh sửa extension).
2. Kiểm tra thay đổi trong git:
   ```bash
   cd ~/Lab/ompz
   ./sync.sh status
   # hoặc git status / git diff
   ```
3. Commit và đẩy lên GitHub:
   ```bash
   git add config/
   git commit -m "feat: cập nhật cấu hình omp và extensions"
   git push origin main
   ```
4. Ở các máy khác, chỉ cần kéo code về:
   ```bash
   git pull
   ```

---

## 🛠 Lệnh tiện ích (`sync.sh`)

| Lệnh | Mô tả |
| :--- | :--- |
| `./sync.sh link` | Tạo symlink từ `~/.omp` sang repo (tự động backup file cũ). |
| `./sync.sh status` | Kiểm tra tình trạng link của từng file/thư mục và git diff. |
| `./sync.sh backup` | Tạo một bản snapshot backup độc lập của cấu hình hiện tại. |
| `./sync.sh unlink` | Gỡ bỏ symlink và khôi phục các file độc lập từ repo về `~/.omp`. |

---

## 🔒 An toàn & Bảo mật

- **Không commit SQLite/Databases:** `history.db`, `agent.db`, `models.db`, `stats.db`, `autoqa.db`... đều được loại trừ trong `.gitignore`.
- **Không commit runtime data:** Các thư mục `cache/`, `logs/`, `run/`, `blobs/`, `sessions/` không bị theo dõi.
- **Tự động sao lưu:** Khi chạy `./sync.sh link`, bất kỳ file/folder thực tế nào đang tồn tại ở `~/.omp` đều được copy an toàn sang `~/.omp/.backups/`.
