# life-rpg 移动端 (iOS + Android) — 设计规格

Date: 2026-06-01
Status: Approved (decisions locked) — pending user review of this doc

## 目标

把 life-rpg（Next.js 16 / React 19 Web 应用）做成一个**高级、手机友好的原生 App**（iOS + Android），用 **Expo + Expo Router + TypeScript + NativeWind**，作为仓库内新的 pnpm workspace 包 `mobile/`，**根目录的 Web 应用保持原样不动**。

非目标（本规格不含）：在本沙箱内完成上架（需要 Expo/EAS 工具链、模拟器/真机、Apple/Google 开发者账号 —— 这些在用户本机进行，本规格给出完整步骤）。

## 锁定决策（已与用户确认）

- 框架：Expo + Expo Router + TS + NativeWind；`mobile/` 作为 pnpm workspace 包。
- 数据：supabase-js 直读 RLS 表 + 复用现有 `/api/*` 路由（新增 Bearer 鉴权，保留 cookie 给 Web）。
- 鉴权：Supabase 邮箱密码 + WHOOP OAuth 经 HTTPS 回调 bounce 到 `liferpg://` 深链。
- 推送：Expo Notifications，从现有 morning cron **追加**下发（**不替代** Telegram 早报）。
- UI：移动优先**高级**重设计，保留 Doodles + Neo-brutalism 识别（黑粗描边、硬 offset 阴影、糖果色；禁 emoji/深色/blur/gradient，legendary shimmer 例外）。
- **底部 5 tab**：首页 / 冒险 / 宠物 / 背包 / 角色；任务折进首页，商店从首页/背包入口进、暂不占 tab。
- 登录**邀请制**（仅登录，无 App 内注册）。
- App 标识：显示名 **Life RPG**；iOS bundle id / Android package = **com.karlartist7.liferpg**；深链 scheme = **liferpg://**。
- 技术默认（全部采用推荐）：WHOOP 用**单次 link-token**（migration 016 `oauth_states`，避免 access token 进日志/历史）；底部 sheet 用 **@gorhom/bottom-sheet**；图表用 **victory-native**；**开启 Supabase Realtime**（实时章节解锁 / 进化·孵化完成）。

## 架构

### 后端适配（最小、向后兼容；Web 必须继续可用）
- 新增 `lib/supabase/route-auth.ts` 导出 `getRouteUser(req)`：若有 `Authorization: Bearer <jwt>`，用 token-scoped anon client（`createClient(URL, ANON_KEY, { global:{ headers:{ Authorization } }, auth:{ persistSession:false }})`）经 `auth.getUser(jwt)` 校验，返回 `{ supabase, user }`，该 client 带 JWT 故所有 `.eq('user_id', user.id)` 走该用户 RLS（与 cookie 隔离等价）；否则回退现有 cookie `createServerClient`。每个用户路由只改一行 preamble。
- 新增 `lib/http/cors.ts`（`corsHeaders` / `withCors` + OPTIONS），仅用于 App 调用的用户路由：`Allow-Headers: authorization, content-type`、`Allow-Methods: GET,POST,PATCH,OPTIONS`、env 驱动的 `NATIVE_ORIGINS` 白名单、**不加** `Allow-Credentials`。Web 同源不受影响；原生 fetch 无 Origin 不受影响。
- 改 Bearer+CORS 的**用户路由**：`dashboard`、`pets`(GET/PATCH)、`pets/evolve`、`inventory`(GET)、`inventory/use`、`inventory/equip`、`adventures`(GET+`?id=`)、`adventures/retry`、`sync/whoop`、`whoop/status`、`debug/whoami`。`dashboard` 的 `GET()` 要改成 `GET(req)`。
- **机器路由不动**：`cron/daily-morning(+preview)`、`webhook/whoop`、`adventures/trigger`、`adventures/render`、`admin/backfill`、`debug/telegram-test` 保留 `Bearer ${CRON_SECRET}` 精确比较与 service-role 逻辑。真实 Supabase JWT 是三段点分、CRON_SECRET 是固定串，不会撞。加测试：CRON_SECRET 被用户路由拒绝；用户 JWT 被机器路由拒绝。

### App 端数据访问
- **调 `/api`**（含逻辑/聚合，避免在端上分叉）：dashboard、pets(+evolve)、inventory(+use/equip)、adventures(GET+retry)、sync/whoop、whoop/status。
- **直读 supabase-js + Realtime**（RLS 保护、次级/实时）：adventures 详情章节解锁 + 宠物 `pending_render` 完成、各列表（user_pets、user_inventory、character_state、daily_settlements、quests、achievements、streaks、morning_briefings）。
- **绝不碰**机器路由。

### App 端会话/网络
- `mobile/src/lib/supabase.ts`：`createClient` + **分块 SecureStore** 存储适配器（绕过 Keychain/Keystore ~2KB/值上限）、`autoRefreshToken:true`、`persistSession:true`、`detectSessionInUrl:false` + AppState 前后台启停 autoRefresh（防睡眠后 401）。SecureStore 只存 session。
- `api-client.ts`：fetch 包装，附当前 access token；遇 401 刷新一次重试，失败回登录。
- `query-client.ts`：TanStack React Query + AsyncStorage persister（**只缓存非敏感游戏数据**）+ NetInfo onlineManager；乐观更新 + 失效；Realtime 写入回灌缓存。

### WHOOP OAuth 深链
- 保留 `redirect_uri = ${origin}/api/auth/whoop/callback`（WHOOP 仅允许 HTTPS）。login/callback 加 `client=app` 分支：用单次 `link_token`（migration 016 `oauth_states`，服务端发、回调消费）识别用户；CSRF 用 HMAC 签进 `state`（新 `WHOOP_STATE_SECRET`，cookieless）；callback 结束 302 到 `liferpg://whoop-callback?status=connected|whoop_error=...`。App 用 `expo-web-browser openAuthSessionAsync`（SFSafariViewController / Chrome Custom Tabs，非裸 WebView），经 Expo Router/Linking 捕获深链，再 GET `/api/whoop/status` 确认。

### 推送
- migration 015 `push_tokens(user_id, expo_token, platform, unique(user_id,expo_token))` + owner-only RLS。
- 新 Bearer 路由 `POST /api/push/register` upsert。
- `cron/daily-morning` 的 `processUser` 里，在 Telegram 发送 + `morning_briefings` 插入**之后**，取该用户 push_tokens 并 best-effort（fire-and-forget）调 Expo Push API；失败不阻塞早报。Telegram 仍是事实来源，推送是增强 nudge，深链进 App。

### 平台/合规
- 路由全留 Vercel Node runtime（libs 用 Node fetch/OpenAI/crypto + maxDuration/waitUntil；cron/webhook 已指向 Vercel）。**不**迁 Supabase Edge Functions —— **唯一例外**：新增 `delete-account` Edge Function（anon/JWT 删不了 auth user，需 service-role；ON DELETE CASCADE 已就绪），满足商店强制的 App 内删号。
- env：App 只暴露 `EXPO_PUBLIC_*`（Supabase URL、anon key、API base）。服务端新增 `WHOOP_STATE_SECRET`、`EXPO_PUSH_ACCESS_TOKEN`(可选)、`NATIVE_ORIGINS`。

## 设计系统（移动高级化）

- **硬 offset 阴影 = 真实兄弟黑 View（shadow-plate），非原生 shadow**。封装 `<Brutal>`：`position:relative overflow:visible` 容器内放 (1) 与正面同尺寸/圆角、`bg-ink #000`、按 `brutalOffset` 平移、零模糊的绝对定位**阴影板**（z 在下）+ (2) **正面** `bg-<candy>` `borderWidth:2 #000` `overflow:hidden`。几何上与浏览器一致。
- `brutalOffset { sm:2, md:4, lg:6, xl:8 }`（移植 `--shadow-doodle-*`），**不**放进 NativeWind shadow scale（会编译成坏的原生原语）。
- 稀有度阴影 = 两层堆叠板（彩色在黑下）：common 黑@4；rare #4ba3ff@6+黑@6偏移2.5；epic #c850ff@7+黑+2.5+虚线内环；legendary #ffb800@8+黑+2.5+虚线金环+Skia holo shimmer+reanimated 旋转光晕+twinkle（**唯一允许 gradient/shimmer 的表面**）。
- **按压物理**（高级感来源）：pressIn 时正面 spring 向阴影偏移（+offset），阴影板收到 0 —— 视觉上"砸进纸面"（移植 `.btn-doodle:active`）；release 用 reanimated `withSpring`(damping~12, stiffness~180, 移植 --ease-spring) 回弹过冲。配 expo-haptics：按钮 Light、tab 切换 Medium、升级/全任务完成/孵化/进化 Success。
- token 1:1 进 `tailwind.config.js` theme.extend（colors / radii sm8 md16 lg24 pill / fonts Fredoka+Nunito / tabular-nums），并镜像到 `theme/tokens.ts`（板色、偏移、稀有度）。字体用 expo-font + expo-google-fonts，`useFonts` + splash hold。
- **底部 5 tab**：Home/Adventures(Compass)/Pets(PawPrint)/Inventory(Package)/Character(stats)。顶部 `border-t-2 #000` 不透明 paper 条 + safe-area；每 tab ≥64px；ACTIVE = periwinkle 实心 Brutal 胶囊（paper 色 icon+label）spring 进。自定义 `tabBar` 渲染。
- **组件套件**（全建于 `<Brutal>`）：Button(变体 mint/pink/peri/coral/sunshine/sky/lilac，sm/default，press 物理+Light)、Card+CardInner、StatTile(AnimatedNumber count-up)、RarityCard、Badge/RarityBadge/ActiveStamp、ProgressBar、LoadingState(reanimated 转动，非 CSS spin)、EmptyState、Toast+ToastProvider、Sheet(@gorhom/bottom-sheet，顶边+黑唇板+grab handle+扁平 ink scrim 0.45 无 blur)+center Modal、AnimatedNumber、PetCard、ItemCard、icons.tsx(lucide-react-native 再导出)。
- **动效语言**：列表入场 moti fade+translateY spring 错峰；数字 count-up；ProgressBar 值变填充；庆祝 react-native-confetti-cannon（纸片糖果形，无渐变粒子）+ Success haptic；头像/宠物 idle 呼吸 scale 1↔1.02 ~4s；折叠头 scroll-driven；下拉刷新自定义 doodle 弹跳 spinner。遵守 reduced-motion。
- **克制硬规则**：无 emoji（lucide strokeWidth 2.5）、无深色、无 blur（sheet 背景扁平 ink scrim；图片淡入用 opacity 非 blur）、无 gradient（legendary 例外）。骨架 = 描边 cream 矩形 + 左→右糖果条扫光（reanimated translateX），保留 2px 黑边。
- **性能**：双板翻倍 View 数 —— 阴影板叶子节点、memo `<Brutal>`、大网格用 FlashList、限制并发 legendary Skia 动画并离屏暂停。**Android 风险**：Android 历来无视 `overflow:visible` 裁剪子节点 —— 阴影板可能要做成正面的**真兄弟节点**而非子节点；**Phase 1 真机验证**。

## 屏幕（移动优先重设计）

- **Login**：全屏 cream（无 tab bar），倾斜品牌锁屏 + 单 Brutal Card 表单（DoodleInput + 56px sunshine 登录按钮砸纸物理）、coral 抖动 ErrorBanner、KeyboardAvoiding；`signInWithPassword` 直连；邀请制（"没有账号？联系管理员"，无注册）。
- **Onboarding**：Welcome（漂浮 doodle 卡 + "开始设置"）→ Connect WHOOP（step1/3，brutalist 恢复环 + idle→authorizing→success→error 状态机，openAuthSessionAsync→liferpg://whoop-callback，成功扫环+Success haptic，检测取消+90s 兜底重开）→ Notifications（step2/3，预许可+mock 通知预览，点按才弹系统框→getExpoPushTokenAsync→/api/push/register，"Telegram 早报照常"）→ Health（step3/3 可选，coming-soon 章，写 `profiles.onboarded_at` 进 Home）。
- **Home / Today**（tab1）：scroll-driven 折叠 mini-header（名+Lv 胶囊+EXP+WHOOP 过期 coral chip）；hero 角色卡（recovery 分桶 art + scene-tier 着色背景 + HP/EXP overlay 条）；今日体力/场景带；2x2 VitalsGrid（Recovery/Sleep/Strain/Streak + delta 箭头）；每日任务摘要；冒险日志 snap 轮播；成就墙；下拉刷新弹跳 compass。单 GET `/api/dashboard` 喂全屏；升级触发 confetti+EXP 溢出+Success haptic。
- **Quests**（折进 Home 子视图）：单列 checklist + sunshine 摘要头（完成/总 环 + earnedExp/totalExp）+ 每 slug 56px 彩 icon + 动画 stat-bar + Circle→Check morph（pop+Light）；完成行下沉；全完成庆祝 banner+星爆+Success；只读 dashboard quests[]（WHOOP 自动结算）。
- **Stats / 数据中心**（tab5 角色）：victory-native brutalist 图（3 属性 tile、EXP 总览 tile、横滚 30 天 EXP 柱[2px 黑描边平顶糖果柱]、7 天三线[mint/sky/lilac 3px + ink 点] + 来源 legend chips）；长按 inspector 替代 hover；无 WHOOP 数据时 EmptyState。
- **Adventures**（tab2 列表）：图片优先单列 16:10 SceneCard（expo-image 淡入 + 预取后 2）+ 场景胶囊 + RarityBadge + 遭遇行 + 3 行故事截断 + 奖励 chips；sticky 2x2 stats 头 + sticky 横向 filter 轨（硬底边"货架"）；GeneratingCard（compass-bob）+ FailedCard（coral + 内联 重试→`/api/adventures/retry`+Success toast）。GET `/api/adventures`，filter 客户端。
- **Adventure Detail**：折叠视差 hero scene → sticky title；meta 胶囊行（tier/rarity/stamina/duration·chapters）；总进度条；**核心：竖直章节时间线** —— 锁定章节显 MM:SS 倒计时，到 0 锁弹开解锁 + 卡展开露出正文 + Medium haptic；宠物遭遇 rarity 卡 + 奖励卡。GET `/api/adventures?id=`；解锁纯客户端时间数学；Realtime 订阅章节/render 完成；可在每个未来 unlockAt 排 Expo 本地通知深链 `liferpg://adventures/{id}`。
- **Collection Shell**（Pets/Inventory tab 对）：sticky AppBar + 48px 分段 Pets/Items 切换（spring 滑动 ink thumb + selectionAsync haptic）覆于横向分页 swipe 面；底部留 tab bar padding。
- **Pet Gallery**：FlashList 2 列贴纸 PetCard（方 art + footer Lv/element/EXP 条 + 稀有度 + 旋转出战章）+ DispatchSlots（出战 N/3，满 coral）+ 可点稀有度摘要 chips + 横向 filter 轨；press scale 0.97+阴影收+Light，错峰 spring。直读 user_pets。
- **Pet Detail**（bottom sheet→全屏）：~88% 可拖 Brutal sheet（稀有度框住整 sheet，legendary holo 环绕立绘）、进化谱系条、Lv/EXP+阶段进度+HP/ATK/DEF；sticky footer：进化（`/api/pets/evolve`→pending_render shimmer+confetti+squash-pop+Success）、出战/收回（POST/PATCH `/api/pets` 原子 3 槽；409 PET_SLOT_FULL→coral toast）；乐观更新+后台回拉；Realtime 换入进化新 art。
- **Inventory**：FlashList 2 列 ItemCard（与 PetCard 物理一致；qty ink 胶囊、装备 sunshine 章）+ StatsStrip 计数 tile + 稀有度 tally + 类型 filter 轨；点开 ItemActionSheet（使用/装备/孵化 + 来源链接）；直读 user_inventory⋈items；动作打 `/api/inventory/use|equip`；蛋孵化是大时刻（heavy haptic + confetti + wobble-crack + pink toast 深链进 Pets）。
- **Shop**（首页/背包入口，coming-soon）：pink 头 + LIVE "你的 EXP" 余额胶囊（character.total_exp）+ 旋转"coming soon"章 + 暗化但完整 brutalist 预览目录（buff/装备/称号 + 假价 + soon 胶囊，禁用点击→抖+toast）；目录 phase1 静态。
- **Empty & Loading**（共享）：骨架 2 列网格糖果条扫光（非 blur）保留 2px 黑边 + 弹跳 doodle spinner；真空 = 大描边字形 + "去冒险" CTA 深链；筛空 = 小字形 + 清筛选 ghost；reduced-motion 静态。

## 分期实现（每期可独立验证/上线）

### Phase 1 — 瘦垂直切片（打通全链路）
对**真实数据**证明每条承重缝：NativeWind token 移植 + 双板 Brutal 阴影、Supabase 邮箱密码 + 分块 SecureStore + AppState 刷新、Bearer API 通路、底部 tab 导航、**一个真实屏 Home/Today 读 live `/api/dashboard`**。
- `mobile/` workspace 包：app.config.ts（liferpg scheme + com.karlartist7.liferpg + EXPO_PUBLIC env）、package.json、metro/babel（nativewind+reanimated）、eas.json（dev/preview/prod）、custom dev client。
- tailwind.config.js + global.css + theme/tokens.ts（移植 globals.css token 1:1）；useFonts(Fredoka+Nunito)+splash。
- components：Brutal（阴影板原语）+ Button + Card + StatTile + ProgressBar + LoadingState + AnimatedNumber；lib/haptics.ts。**先真机验证 Android overflow:visible 裁剪风险**再往上盖。
- src/lib：supabase.ts + secure-store-adapter.ts（分块，长 session 测）+ AppState autoRefresh；api-client.ts（Bearer + 401 刷新重试）；query-client.ts。
- **后端**：`lib/supabase/route-auth.ts` + `lib/http/cors.ts`；**只改** `app/api/dashboard/route.ts`（GET(req)+getRouteUser+CORS/OPTIONS），验证 Web cookie 模式仍可 + 原生 Bearer 模式可（真实 JWT curl）；加 CRON_SECRET-拒/用户JWT-拒 测试。
- app：login（signInWithPassword）+ tabs `_layout`（自定义 5-tab Brutal BottomTabBar）+ Home/Today（live dashboard：hero/vitals/stamina/quest 摘要/下拉刷新）；其余 tab 占位 EmptyState。
- 真机 dev client 跑：登录→token 跨重启/睡眠持久→Home 读 live→下拉刷新。

### Phase 2 — Collection + Adventures（直读 + Realtime + 完整组件套件）
- 补齐套件：RarityCard、RarityBadge/Badge/ActiveStamp、Sheet(@gorhom)+Modal、Toast、EmptyState、PetCard、ItemCard、icons.tsx；lib/motion.ts。
- Collection shell（分段分页）+ Pet Gallery + Inventory（直读 FlashList）；Pet Detail sheet（evolve+dispatch）+ Item action sheet；改 pets/evolve、inventory/use/equip 为 Bearer+CORS。
- Adventures 列表 + Detail（live 章节解锁时间线）；改 adventures(+retry) Bearer+CORS；开 Supabase Realtime（adventures + 宠物 pending_render；验证 RLS 允许订阅，兜底轮询）。
- Stats（victory-native brutalist 图）；Home 任务子视图庆祝；共享 empty/loading 糖果扫光。
- confetti + 全 haptic map（evolve/hatch/level-up/all-quests）。

### Phase 3 — WHOOP 深链 OAuth + onboarding
- 后端：migration 016 `oauth_states`（单次 link-token）+ `lib/whoop/state.ts`（HMAC cookieless CSRF）；改 auth/whoop/login（client=app + link-token）+ callback（验签 state + 302 liferpg://whoop-callback）；env WHOOP_STATE_SECRET。
- src/lib/whoop-connect.ts（openAuthSessionAsync）+ Expo Router 深链处理 + GET /api/whoop/status 确认。
- onboarding stack（Welcome/Connect WHOOP/Notifications/Health）；profiles.onboarded_at gating；whoami/sync/whoop/whoop-status 改 Bearer+CORS。

### Phase 4 — Expo 推送（增强早报）
- 后端：migration 015 `push_tokens` + RLS；`/api/push/register`（Bearer upsert）；`lib/push/expo.ts`（best-effort 批量）。
- 改 cron/daily-morning processUser：Telegram + briefing 之后取 push_tokens 并 sendExpoPush（fire-and-forget）；验证 webhook/preview 路径不变、Telegram 输出不变。
- src/lib/push.ts：requestPermissions（priming 点按后）+ getExpoPushTokenAsync + register；深链 payload；冒险 unlockAt 排本地通知。EAS 配 Android FCM；DeviceNotRegistered 剪枝 fast-follow。

### Phase 5 — 商店合规 + 删号 + EAS 发布
- supabase/functions/delete-account Edge Function（级联删 auth user + 撤 WHOOP 授权）+ App 内删号流程（角色/资料页）。
- App Store 隐私标签 + Play Data Safety（健康/健身披露）、隐私政策 URL、推送预提示、无 ATT。
- EAS Build prod profiles + Submit + Update channel；bundle/package id、图标、splash；App Store Connect + Play Console 记录。
- 用户前置清单：Expo 账号、Apple Developer Program、Play Console + service-account JSON + FCM key、Xcode/Android Studio 或云构建。

### Phase 6 — 健康（Apple Health / Health Connect，可选）
- iOS HealthKit（HealthShare 用途串）/ Android Health Connect（理由屏），平台检测；补充步数/健身数据；更新隐私披露；替换 onboarding coming-soon。

## 风险与注意
- **Android overflow 裁剪**：双板阴影最大的未知，Phase 1 真机优先验证；必要时阴影板做真兄弟节点。
- **本机网络不稳**：装 RN 依赖（大、网络重）+ 本沙箱代理 flaky，可能需重试/换源；RN 应用本身无法在此沙箱运行/截图，Phase 1 起的可视验证由用户在真机/模拟器完成。
- **Web 不回归**：每个被改的 `/api` 路由必须保持 cookie 路径行为不变（加测试）。
- **机密**：anon key 可进 App（公开级）；service-role / CRON_SECRET / WHOOP secret 永不进 App 包。

## 用户需自备（上架前）
Expo 账号；Apple Developer Program（iOS）；Google Play Console + service-account JSON + FCM key（Android）；Xcode / Android Studio 或 EAS 云构建；真机或模拟器。
