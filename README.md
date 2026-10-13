# ompz

> Đồng bộ cấu hình, extensions, themes và plugins của **OMP** qua Git repository cá nhân, hỗ trợ giao diện tương tác đẹp mắt với **Gum**.

Dự án này sử dụng cơ chế **Symlink** kết hợp script quản trị `setup.sh` (tích hợp **[Gum](https://github.com/charmbracelet/gum)** cho giao diện menu TUI trực quan, mượt mà). Mọi thay đổi trong cấu hình OMP trên máy sẽ lập tức hiển thị trong Git working tree để bạn kiểm tra, commit và push lên private repository.

---

## 📁 Cấu trúc thư mục

```text
ompz/
├── .gitignore                     # Chặn triệt để DBs, logs, caches, sessions, tokens
├── README.md                      # Hướng dẫn sử dụng
├── setup.sh                       # Script quản trị chính (Menu interactive với Gum)
├── sync.sh                        # Alias symlink trỏ về setup.sh (backward compatibility)
└── config/
    ├── agent/
    │   ├── config.yml             # Cấu hình chính OMP Agent (~/.omp/agent/config.yml)
    │   ├── extensions/            # Các TypeScript extensions tuỳ biến
    │   ├── themes/                # Themes tuỳ biến (dark-nord-claude.json, ...)
    │   └── managed-skills/        # Các skills được quản trị tự động
    └── plugins/
        └── omp-plugins.lock.json  # Danh sách plugins OMP đã cài đặt
```

---

## ⚡ Menu tương tác (Interactive Mode)

Chỉ cần gõ lệnh không kèm tham số:
```bash
./setup.sh
```

Menu TUI trực quan sẽ xuất hiện với các lựa chọn:
```text
┌────────────────────────────────┐
│  ⚡ OMPZ Setup & Sync Manager  │
└────────────────────────────────┘

Chọn thao tác muốn thực hiện:
> 🔗 link    - Thiết lập symlinks ~/.omp -> repo
  📊 status  - Kiểm tra trạng thái liên kết & Git
  💾 backup  - Tạo bản sao lưu snapshot ~/.omp
  🚀 push    - Commit & Push thay đổi lên GitHub
  🔄 pull    - Cập nhật cấu hình mới từ GitHub
  ❌ unlink  - Gỡ symlinks (khôi phục file thật)
  🚪 exit    - Thoát
```

---

## 🚀 Thiết lập trên máy mới (Restore / Clone)

Khi chuyển sang một máy tính mới:

1. **Cài đặt Gum (nếu muốn dùng menu tương tác):**
   ```bash
   brew install gum   # macOS / Linuxbrew
   ```
   *(Nếu không có Gum, script vẫn tự động chuyển sang chế độ fallback chuẩn).*

2. **Clone repository này về máy:**
   ```bash
   git clone git@github.com:therealtinhtute/ompz.git ~/Lab/ompz
   cd ~/Lab/ompz
   ```

3. **Chạy liên kết:**
   ```bash
   ./setup.sh link
   # hoặc chạy ./setup.sh rồi chọn "link"
   ```
   *Script sẽ tự động sao lưu cấu hình cũ (nếu có) vào `~/.omp/.backups/<timestamp>` trước khi tạo symlink.*

4. **Kiểm tra trạng thái:**
   ```bash
   ./setup.sh status
   ```

---

## 🔄 Quy trình làm việc hàng ngày (Workflow)

Nhờ cơ chế symlink, bạn **không cần** xuất file thủ công:

1. Bạn sửa cấu hình OMP hoặc thêm extension mới.
2. Kiểm tra & đẩy lên GitHub bằng 1 lệnh duy nhất:
   ```bash
   ./setup.sh push
   # hoặc chạy ./setup.sh rồi chọn "🚀 push"
   ```
   *Script sẽ hiển thị các file thay đổi, dùng Gum để bạn nhập commit message và đẩy lên GitHub.*
3. Ở máy tính khác, chỉ cần kéo về:
   ```bash
   ./setup.sh pull
   ```

---

## 🛠 Danh sách lệnh CLI trực tiếp

Bạn cũng có thể chạy lệnh trực tiếp mà không cần qua menu:

| Lệnh | Mô tả |
| :--- | :--- |
| `./setup.sh` | Mở menu tương tác trực quan (Gum TUI). |
| `./setup.sh link` | Tạo symlink từ `~/.omp` sang repo (tự động backup file cũ). |
| `./setup.sh status` | Kiểm tra tình trạng link của từng mục và git status. |
| `./setup.sh push` | Nhập commit message và push thay đổi lên GitHub. |
| `./setup.sh pull` | Kéo cấu hình mới nhất từ GitHub. |
| `./setup.sh backup` | Tạo snapshot backup độc lập của cấu hình hiện tại. |
| `./setup.sh unlink` | Gỡ bỏ symlink và khôi phục các file độc lập về `~/.omp`. |
| `./setup.sh help` | Hiển thị hướng dẫn. |
