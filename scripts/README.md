# BlockGame Scripts

## split-image.ts

Script để cắt một ảnh lớn thành 400 tiles nhỏ (40×10 grid, tỉ lệ 4:1 ultra-wide) cho game.

### Cách sử dụng

```bash
# Cú pháp
bun scripts/split-image.ts <đường-dẫn-ảnh>

# Ví dụ
bun scripts/split-image.ts ./my-picture.jpg
bun scripts/split-image.ts ~/Downloads/landscape.png
```

### Yêu cầu

- Ảnh đầu vào: JPG, JPEG, hoặc PNG
- Kích thước khuyến nghị: Bội số của 40×10 (ví dụ: 4000×1000px, 8000×2000px)
- Tỉ lệ 4:1 (ultra-wide) phù hợp cho ảnh panorama, landscape rộng
- Nếu ảnh không đúng tỉ lệ, sẽ bị cắt mép

### Kết quả

Tiles sẽ được lưu vào: `packages/ui/public/tiles/`

Cách đánh số tile:
```
tile-0.jpg    tile-1.jpg    ...  tile-39.jpg     (hàng 1)
tile-40.jpg   tile-41.jpg   ...  tile-79.jpg     (hàng 2)
...
tile-360.jpg  tile-361.jpg  ...  tile-399.jpg    (hàng 10)
```

- `tile-0.jpg` = góc trên bên trái
- `tile-39.jpg` = góc trên bên phải
- `tile-360.jpg` = góc dưới bên trái
- `tile-399.jpg` = góc dưới bên phải

### Ví dụ đầy đủ

```bash
# 1. Chuẩn bị ảnh (ví dụ: panorama.jpg với kích thước 8000×2000px)
# 2. Chạy script
bun scripts/split-image.ts ./panorama.jpg

# Output:
# 🖼️  Splitting image: ./panorama.jpg
# 📐 Grid: 40 columns × 10 rows = 400 tiles
# 📁 Output directory: /path/to/packages/ui/public/tiles
# 📏 Input image size: 8000×2000px
# ✂️  Tile size: 200×200px
# 💾 Output format: jpg
#
# 🔄 Splitting...
# [██████████████████████████████████████████████████] 100% (400/400)
#
# ✅ Complete! Split 400 tiles in 2.34s
# 📂 Tiles saved to: /path/to/packages/ui/public/tiles
```

### Lưu ý

- Script sẽ ghi đè các tiles cũ nếu đã tồn tại
- Đảm bảo ảnh đầu vào có kích thước lớn để tiles không bị mờ
- Khuyến nghị: Mỗi tile ít nhất 128×128px (tổng ảnh ít nhất 5120×1280px)
- Tỉ lệ 4:1 phù hợp nhất cho ảnh panorama, landscape rộng, ultra-wide
- Nếu ảnh không đúng tỉ lệ 4:1, phần thừa sẽ bị cắt bỏ

---

## place-all-tiles.ts

Script để **place tất cả tiles lên frame** trong database - dùng để test xem tiles có ghép đúng không.

### Cách sử dụng

```bash
# Place all tiles (default room: 'firegroup')
bun scripts/place-all-tiles.ts

# Place all tiles cho room cụ thể
bun scripts/place-all-tiles.ts my-room-id
```

### Tác dụng

- Load room state từ database
- Đặt tất cả tiles lên frame với đúng vị trí và rotation
- Mark game là complete
- Save lại database

### Khi nào dùng?

- ✅ Test xem tiles có cắt/ghép đúng không
- ✅ Xem preview ảnh hoàn chỉnh trên frame
- ✅ Debug frame positioning/rotation

### Lưu ý

- Server phải đã chạy ít nhất 1 lần để tạo room state
- Database: `packages/server/game.db`
- Restart server để load state mới

---

## remove-all-tiles.ts

Script để **gỡ tất cả tiles khỏi frame** (reset về floor) - dùng để reset game.

### Cách sử dụng

```bash
# Remove all tiles (default room: 'firegroup')
bun scripts/remove-all-tiles.ts

# Remove all tiles cho room cụ thể
bun scripts/remove-all-tiles.ts my-room-id
```

### Tác dụng

- Load room state từ database
- Random position cho tất cả tiles trên floor
- Mark game là incomplete
- Save lại database

### Khi nào dùng?

- ✅ Reset game về trạng thái ban đầu
- ✅ Test lại từ đầu sau khi place all
- ✅ Clear frame để test placement logic

### Lưu ý

- Server phải đã chạy ít nhất 1 lần để tạo room state
- Database: `packages/server/game.db`
- Restart server để load state mới

---

## Workflow testing tiles

```bash
# 1. Cắt ảnh thành 400 tiles
bun scripts/split-image.ts ./my-image.jpg

# 2. Start server (để tạo room state)
bun run dev:server

# 3. (Tắt server) Place all tiles để test
bun scripts/place-all-tiles.ts

# 4. Start server lại để xem kết quả
bun run dev:server

# 5. Nếu muốn test lại - remove all tiles
bun scripts/remove-all-tiles.ts

# 6. Restart server
bun run dev:server
```
