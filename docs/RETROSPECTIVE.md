# BlockGame Retrospective: Lessons Learned from AI-Assisted Game Development

> "The gap between a working prototype and a production system is not measured in code, but in the depth of understanding."


## Tổng quan

BlockGame là một multiplayer puzzle game được phát triển trong khoảng 2 ngày với sự hỗ trợ của AI (Claude Code). Tốc độ phát triển thật sự đáng kinh ngạc, nhưng khi đưa lên production với 200 người dùng đồng thời, những quyết định kiến trúc được đưa ra từ đầu đã bộc lộ những hạn chế không thể khắc phục được sau khi đã launch.

Tài liệu này ghi lại những bài học rút ra - không phải để phê phán, mà để làm hành trang cho những dự án phát triển nhanh trong tương lai.

## 1. Sức mạnh của AI-Assisted Development

Điều làm tôi ngạc nhiên nhất là tốc độ. Một game multiplayer hoàn chỉnh - với đồ họa 3D, mô phỏng vật lý, networking real-time, hệ thống puzzle, và leaderboard - được xây dựng trong 2 ngày bởi một người không có kinh nghiệm gì về BabylonJS, Havok physics, Colyseus networking, hay bất kỳ thứ gì liên quan đến game development.

AI đóng vai trò như một chuyên gia có thể tư vấn về mọi lĩnh vực cùng lúc. Nhưng đây chính là chỗ cần nhấn mạnh: thành công của AI-assisted development phụ thuộc hoàn toàn vào vai trò của con người. AI có thể implement features nhanh chóng, suggest best practices, handle boilerplate - nhưng con người phải định hình vision, đưa ra quyết định kiến trúc, cân nhắc trade-offs, và validate những giả định với thực tế. Bởi vì ở thời điểm hiện tại, AI không thể đủ context, cũng như con người chưa có cơ chế tốt để cung cấp đầy đủ mọi context cần cho cho AI được. AI làm rất tốt trong việc tập trung, bởi vậy nó dễ thường bỏ qua một vài yếu tố, mà vô tình lại là các vấn đề quan trọng.

## 2. Khoảng cách giữa Testing và Production

Tôi đã test game hai lần trước khi lên production. Lần đầu với khoảng 10 người trong điều kiện mạng tốt. Lần hai để test độ trễ khi truy cập từ Đà Nẵng. Cả hai lần đều ổn - gameplay mượt, đồng bộ tốt, physics responsive, không có bug rõ ràng.

Rồi đến ngày production với 200 người dùng đồng thời, server sập trong vài phút.

Điều đáng nói là lỗi không nằm ở code logic - logic đều đúng. Không nằm ở client-side rendering - đã optimize kỹ. Không nằm ở network protocol - Colyseus rất efficient. Lỗi nằm ở **kiến trúc** - một quyết định được đưa ra từ đầu và không thể patch được.

Test với 10 người trên LAN hoàn toàn khác với 200 người trên internet. Physics simulation chạy ở 30Hz với 10 players trở thành bottleneck với 200 players - không phải vì bugs, mà vì đặc tính scaling tuyến tính chỉ bộc lộ ở quy mô lớn.

Bài học ở đây rất rõ ràng: test nhỏ chỉ validate correctness, không validate scalability. Với những ứng dụng target high concurrency, load testing không phải optional.

## 3. Sai lầm về Server-Authoritative Physics

Dự án này áp dụng kiến trúc server-authoritative - một pattern được thiết lập tốt trong multiplayer games để chống cheat. Server chạy Havok physics ở 30Hz và broadcast vị trí chính xác đến tất cả clients.

Nghe thì hợp lý. Nhưng với 200 players, mỗi physics step server phải xử lý khoảng 1000 physics bodies (200 players + 800 tiles). Collision detection là O(n²), nghĩa là khoảng 15 triệu collision checks mỗi giây. Một native physics engine có thể handle được. Nhưng Havok chạy qua WebAssembly - nhanh hơn JavaScript thuần, nhưng vẫn chậm hơn native code 2-5 lần, và không thể tận dụng multi-core.

Chưa kể Node.js chạy single-threaded. Physics simulation phải chia sẻ CPU time với WebSocket handling, state serialization, game logic, và garbage collection. Budget 33ms cho mỗi physics tick liên tục bị vượt quá.

Nếu làm lại, tôi sẽ chọn client-side physics với server validation. Client tự chạy physics locally, server chỉ validate input và xử lý những event quan trọng như tile placement. Trade-off là sẽ có một chút inconsistency trong state giữa các players - nhưng với một game puzzle cooperative kéo dài 10 phút, điều đó hoàn toàn chấp nhận được. Players không cần pixel-perfect synchronization, họ cần game chạy được.

Tôi đã theo đuổi sự nhất quán hoàn hảo, và kết quả là không có sự nhất quán nào cả.

## 4. Thách thức trong việc Support người dùng

Đây là bài học không liên quan đến technical, nhưng có lẽ quan trọng nhất.

Tôi đã implement banner hướng dẫn lớn trên màn hình login, help panels trong game, compass để định hướng, visual indicators rõ ràng. Và người dùng bỏ qua tất cả. Họ thấy text field thì điền, thấy button thì bấm - hành động theo thói quen, không theo nhận thức.

Lúc đầu tôi frustrated. Nhưng nghĩ lại, đây không phải lỗi của người dùng. Đây là **cognitive efficiency** - đọc instructions tốn effort, pattern matching thì tự động. Con người, suy cho cùng, hành trình phát triển trí thông minh cũng chỉ như một nốt dạo đầu trong lịch sử của cả vũ trụ. Chúng ta là những cỗ máy pattern-matching, không phải instruction-following.

Điều này có implications sâu sắc cho design. Tutorial phải thông qua action, không phải text. Default states phải đúng sẵn - happy path không nên yêu cầu đọc gì cả. Nếu thông tin quan trọng nằm trong text, assume nó sẽ bị bỏ qua. Dùng visual design để communicate - màu sắc, kích thước, vị trí, animation.

Gánh nặng hiểu biết thuộc về người tạo ra sản phẩm, không phải người dùng. Điều này không công bằng, nhưng đó là thực tế.

## 5. Những gì sẽ làm khác

Về kiến trúc, nếu làm lại tôi sẽ dùng client-side physics với server validation thay vì server-authoritative hoàn toàn. Điều này giảm server load đi khoảng 100 lần. Tôi cũng sẽ shard rooms ở mức 50 players thay vì nhét tất cả vào một room, và giảm physics tick xuống 20Hz hoặc thấp hơn cho server. Như vậy ta sẽ có nhiều room hơn, và nhiều server có thể chạy đồng thời. Chỉ cần đồng bộ điểm số là sẽ ổn.

Về process, bài học lớn nhất là load test sớm. Simulate target capacity trước khi phát triển features, dùng synthetic clients để stress test architecture. Và quan trọng hơn, question "best practices" - server-authoritative là best practice cho competitive FPS, nhưng với cooperative puzzle game, nó có thể là overkill. Match architecture với actual requirements, không phải với ideal requirements.

Về UX, onboarding là product, không phải afterthought. Đầu tư vào tutorial design nhiều như feature development. Test với người dùng thực sự naive, không phải team members.

## 6. Suy ngẫm

AI accelerate tốc độ tạo ra sản phẩm, nhưng không tự động cải thiện chất lượng của những quyết định. Công việc của con người đã shift từ "làm thế nào để implement X" sang "có nên implement X không, và theo cách nào?"

Đây là một sự thay đổi sâu sắc. Với AI, bottleneck không còn là technical skill - mà là **judgment**. Khả năng anticipate scale problems, question architectural assumptions, simulate user behavior, recognize khi "working" không có nghĩa là "ready".

BlockGame là một thành công theo nhiều cách - hơn 200 người đã chơi một game được build trong 2 ngày. Nhưng nó cũng reveal rằng build nhanh không đồng nghĩa với build đúng, cái đúng ở đây được hiểu rằng nó đã không thành công về mặt bussiness. Những bài học ở đây không phải về BabylonJS hay Colyseus hay physics engines. Chúng về khoảng cách giữa prototype và production, sự khác biệt giữa testing và validation, và những yếu tố con người mà không có code nào có thể address.

Bạn build càng nhanh, bạn càng có thể build sai thứ nhanh hơn.

## Technical Appendix

Để hiểu tại sao 200 users là quá tải, hãy xem xét con số cụ thể.

Với 200 players và 50 active tiles, server phải xử lý 250 dynamic physics bodies. Collision detection giữa chúng tạo ra 31,125 potential collision pairs mỗi physics step (250 × 249 / 2). Với 30 steps mỗi giây, đó là gần 1 triệu collision checks mỗi giây. WebAssembly overhead nhân lên khoảng 3 lần so với native, và bạn có effective load tương đương 3 triệu collision operations mỗi giây trên một single-threaded Node.js process.

Về bandwidth, mỗi player update khoảng 46 bytes, mỗi tile update khoảng 32 bytes. Với 200 players, 50 tiles, 30Hz, broadcast đến tất cả clients: (200 × 46 + 50 × 32) × 30 × 200 ≈ 62 MB/s total egress. Con số này vượt quá capacity của hầu hết server configurations.

Với client-side physics, server chỉ cần handle input validation và critical events. Bandwidth giảm xuống còn khoảng 40 KB/s - một sự khác biệt 1500 lần.

Thực tế, khi thống kê, kết quả trả về cho khoảng 100 user có thể chơi và có ghi điểm. Trong đó thì 95% user có điểm lớn hơn 2. Trong đó có nhiều division, team không tham gia. Như vậy, khả năng đáp ứng cũng ước chừng 80%. Với con số như thế, thì cũng tạm chấp nhận được, nhưng tôi vẫn cho là nó thất bại, vì launch lần đầu fail. 

Thực tế thì có hơn 90% user ghi 2  điểm trở lên, 50% có 6 điểm trở lên, Top 10 user có 20 điểm trở lên. với mẫu 200 user ở cty, trong đó 1/4 tới 1/3 không tham gia. 

## Kết luận

BlockGame là một thí nghiệm thành công trong AI-assisted rapid development. Game hoạt động, người dùng chơi được, và core vision được hiện thực hóa. Nhưng production đã reveal rằng build nhanh không giống với build đúng.

Những bài học ở đây là phổ quát: test at scale, không chỉ test correctness; question best practices cho context cụ thể của bạn; design cho người dùng sẽ không đọc; và vai trò của con người trong AI-assisted development là judgment, không phải implementation.

Mong rằng những bài học này sẽ giúp những dự án tương lai tránh được những cạm bẫy tương tự.

*Viết như một retrospective cho BlockGame, tháng 11 năm 2024*