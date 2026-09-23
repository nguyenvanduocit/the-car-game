# BlockGame Scripts

Chạy các script từ thư mục gốc repo: `split-image.ts`, `convert-audio.ts` và các script database dùng đường dẫn tương đối theo thư mục hiện tại.

## split-image.ts

Script để cắt một ảnh lớn thành 400 tiles nhỏ (40×10 grid, tỉ lệ 4:1 ultra-wide) cho game.

### Cách sử dụng

```bash
# Cú pháp
bun scripts/split-image.ts <đường-dẫn-ảnh> [--size=<kích-thước-tile-tối-đa>]

# Ví dụ
bun scripts/split-image.ts ./my-picture.jpg
bun scripts/split-image.ts ./my-picture.jpg --size=512
bun scripts/split-image.ts ~/Downloads/landscape.png
```

`--size` là cạnh dài nhất của tile đầu ra, tính bằng px (mặc định 256, cho phép 64–4096).

### Yêu cầu

- Ảnh đầu vào: định dạng mà `sharp` đọc được (JPG, PNG, ...)
- Tỉ lệ 4:1 (ultra-wide) phù hợp cho ảnh panorama, landscape rộng
- Script không phóng to: muốn tile đầu ra đạt 256px thì ảnh gốc cần ít nhất 10240×2560px

### Kết quả

Tiles sẽ được lưu vào: `packages/ui/public/tiles/` (định dạng WebP, quality 90)

Cách đánh số tile:
```
tile-0.webp    tile-1.webp    ...  tile-39.webp     (hàng 1)
tile-40.webp   tile-41.webp   ...  tile-79.webp     (hàng 2)
...
tile-360.webp  tile-361.webp  ...  tile-399.webp    (hàng 10)
```

- `tile-0.webp` = góc trên bên trái
- `tile-39.webp` = góc trên bên phải
- `tile-360.webp` = góc dưới bên trái
- `tile-399.webp` = góc dưới bên phải

### Lưu ý

- Script sẽ ghi đè các tiles cũ nếu đã tồn tại
- Mỗi tile gốc có kích thước `floor(rộng/40) × floor(cao/10)`; phần pixel dư ở mép phải và mép dưới bị bỏ
- Ảnh không đúng tỉ lệ 4:1 không bị crop, mà cho ra tile không vuông (tỉ lệ tile được giữ khi resize)

---

## place-all-tiles.ts

> ⚠️ Script này lệch với `packages/server/src/database/roomState.ts`: `RoomState` không có field `tiles`, và `saveRoomState()` nhận tham số khác với cách script gọi. Script sẽ lỗi khi chạy.

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

### Lưu ý

- Server phải đã chạy ít nhất 1 lần để tạo room state
- Database: `packages/server/game.db`
- Restart server để load state mới

---

## remove-all-tiles.ts

> ⚠️ Cùng vấn đề với `place-all-tiles.ts`: script đọc `roomState.tiles` và gọi `saveRoomState()` sai tham số, nên sẽ lỗi khi chạy.

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

### Lưu ý

- Server phải đã chạy ít nhất 1 lần để tạo room state
- Database: `packages/server/game.db`
- Restart server để load state mới

---

## reset-room.ts

Xoá room state đã lưu trong database. Lần khởi động tiếp theo server tạo room mới từ đầu.

```bash
# Default room: 'firegroup'
bun scripts/reset-room.ts

# Room cụ thể
bun scripts/reset-room.ts my-room-id
```

- Database: `packages/server/game.db`. Server mở `./game.db` theo thư mục nó chạy, nên file này khớp khi server chạy bằng `cd packages/server && bun run dev`.
- Restart server sau khi chạy script.

---

## convert-csv-questions.ts

Đọc `packages/shared/src/data/question.csv` và ghi đè `packages/shared/src/data/questions.json` (file câu hỏi mà `QuestionBank` load).

```bash
bun scripts/convert-csv-questions.ts
```

- Mỗi dòng CSV (bỏ dòng header): `số thứ tự, câu hỏi, A, B, C, D, đáp án đúng (A/B/C/D)`
- Dòng thiếu cột hoặc câu hỏi rỗng bị bỏ qua; câu hỏi trùng (không phân biệt hoa thường) chỉ giữ lần đầu
- `id` được đánh lại từ 0 theo thứ tự trong CSV

---

## generate-questions.ts

Bổ sung câu hỏi placeholder vào `packages/shared/src/data/questions.json` cho mọi `id` từ 0 đến 399 còn thiếu, rồi ghi đè file.

```bash
bun scripts/generate-questions.ts
```

- Câu hỏi có sẵn được giữ nguyên; câu mới lấy lần lượt từ 10 mẫu có sẵn trong script
- Script dừng với lỗi nếu kết quả không đúng 400 câu (ví dụ file đã có `id` ngoài khoảng 0–399)

---

## convert-audio.ts

Chuyển mọi file `.aac` trong `packages/ui/public/sounds/` sang `.wav` (PCM 16-bit, 44.1kHz), ghi đè file `.wav` cùng tên.

```bash
bun scripts/convert-audio.ts
```

- Cần `ffmpeg` trong `PATH` (`brew install ffmpeg`)
