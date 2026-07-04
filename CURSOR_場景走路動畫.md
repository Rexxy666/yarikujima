# 任務：讓餐廳／臥室的老虎「待機 + 點擊走過去」

## 目標
在「餐廳（kitchen）」和「臥室（bedroom）」兩個場景頁，讓老虎：
1. **預設待機**：播放 tiger4 的待機小動作（呼吸／張望）。
2. **點擊該場景的島 → 走過去**：老虎用 `tiger.png` 的走路幀走到點擊位置、面向移動方向；抵達後回到 tiger4 待機。
3. 只在寵物是「老虎」時啟用（`isTigerSprite()`）；其他生肖維持靜態圖。
4. **不可破壞**：首頁老虎的走路/跳躍系統、以及餐廳餵食（eat）、臥室睡覺（sleep）的既有互動。

## 現況與根本問題（重要，先理解）
專案是單檔 `index.html`（HTML/CSS/JS 全在裡面）+ `assets.js`（base64 素材）。有兩套精靈系統：

- **首頁老虎**：全域狀態 `petAnim`，用 `tiger.png`（`TIGER_SPR.IDX.walk[0..7]` 等）、`tiger2/tiger3`（跳躍/驚慌/睡）。移動流程：`onIsleClick(e,'home')` → `commandPetMoveTo(px,py)` → `beginPetPath` → `petLoop` 的 `walk` 狀態。可行走範圍用 `NAV`（`NAV.ground` 等，%座標）＋ `clampToNav`、`groundSurfaceY`。畫在 `#island .isle-float` 內的 `#petAnchor > #petCanvas`。座標換算 `screenToScenePercent(cx,cy,scene)`。

- **場景老虎（kitchen/bedroom）**：`#petKitchen` / `#petBedroom` 容器，內部由 `mountTiger4Kitchen/ Bedroom()` 掛上 `#kitchenTiger4Sprite` / `#bedroomTiger4Sprite`（用 CSS background sprite 顯示 `tiger4.png`）。`TIGER4_SPR` 只有 `eat`、`idleAwake`、`sleep` 幀，**沒有走路幀**。由 `updateTiger4SceneSprites(dt)`（在 `petLoop` 內呼叫）驅動。由 `Tiger4Scene` 管理狀態。場景島是 `.scene-isle-float`（含 `--px/--py` 變數、`.scene-pet-anchor`、`.scene-pet-shadow`、`.scene-click-layer[data-scene]`、`.scene-click-markers[data-scene]`）。

**問題**：場景的 `.scene-click-layer` 有綁 `onScenePetClick` → `onIsleClick(e, scene)`，但裡面呼叫 `commandPetMoveTo()` 驅動的是**首頁那隻全域 `petAnim`**，不是畫面上的場景老虎。所以點場景島時，會動到看不到的首頁老虎，場景老虎不會走。而且 `tiger4.png` 根本沒有走路幀。

## 建議做法
1. **新增場景走路狀態**（獨立於全域 `petAnim`），例如：
   ```js
   const scenePet = {
     kitchen: {px:50, py:56, tx:50, ty:56, state:'idle', walkIdx:0, walkAccum:0, flip:1},
     bedroom: {px:50, py:56, tx:50, ty:56, state:'idle', walkIdx:0, walkAccum:0, flip:1}
   };
   ```
2. **每個場景各自的可行走範圍 `SCENE_NAV`**（因為場景島圖 `scene_isle.png` 是一塊平坦浮島，跟首頁不同）。用 `.scene-isle-float` 的百分比座標定義一個矩形或多邊形（草地平面），並寫一個 `clampSceneNav(scene, px, py)` 夾限；`py` 可用簡單線性表面高度。
3. **走路時改用 `tiger.png` 走路幀**：場景老虎目前是 CSS background sprite 指向 tiger4 sheet。走路時要把該 sprite 元素的 background sheet 換成 `tiger.png`（`petAnim.sheet` 已載入，或用 `--tiger-sheet` 之類的 CSS 變數）並依 `TIGER_SPR.IDX.walk` 循環幀；待機/吃/睡時換回 `tiger4.png`。（`setTiger4SpriteFrame` 目前只吃 tiger4；需要一個能切換 sheet 的版本。）
4. **更新迴圈**：在 `updateTiger4SceneSprites(dt)`（或新增 `updateScenePetWalk(dt)`，同樣在 `petLoop` 內、`isTigerSprite()` 時呼叫）裡：
   - 若該場景 `state==='walk'`：朝 `tx,ty` 內插移動 `px,py`（速度參考首頁 `PET_MOVE.userSpd`），依 dx 設 `flip`，循環 `TIGER_SPR.IDX.walk`；`Math.hypot(dx,dy) < 到達門檻` 時 `state='idle'`（切回 tiger4 待機）。
   - 依 `px,py` 設定該場景 `.scene-pet-anchor` 的 `--px/--py`（沿用現有 `--px/--py` 機制）。
5. **點擊處理**：修改 `onIsleClick(e,scene)`（或 `onScenePetClick`），當 `scene` 是 kitchen/bedroom 時：
   - **不要**呼叫 `commandPetMoveTo`（那是首頁的）。
   - 改成：`const p=screenToScenePercent(cx,cy,scene)` →（若在島內）設 `scenePet[scene].tx/ty = clampSceneNav(...)`、`state='walk'`；並 `spawnClickMarker(cx,cy,scene)`。
   - 若正在 `eat`/`sleep` 狀態則忽略點擊（或先結束該狀態）。
6. **待機**：`state==='idle'` 時維持現有 tiger4 `idleAwake` 待機序列（`TIGER4_SPR.IDLE_SEQ`）。臥室睡覺、餐廳吃食的既有邏輯保持不動（吃/睡優先於走路）。
7. 只在 `isTigerSprite()` 時啟用；非老虎維持 `setupPetDisplay` 的靜態圖分支。

## 驗收
- 滑到餐廳/臥室：老虎待機會動（呼吸/張望）。
- 點島上任一點：老虎用走路幀走過去、面向正確方向、抵達後回待機。
- 點島外（天空）：可選擇忽略或播驚慌。
- 首頁老虎照舊會走/跳；餐廳餵食、臥室睡覺照舊。
- 換成非老虎生肖時不報錯、顯示靜態圖。

## 關鍵識別字（方便搜尋）
`petAnim`、`TIGER_SPR`、`TIGER4_SPR`、`NAV`、`clampToNav`、`groundSurfaceY`、`screenToScenePercent`、`onIsleClick`、`onScenePetClick`、`commandPetMoveTo`、`beginPetPath`、`petLoop`、`updateTiger4SceneSprites`、`mountTiger4Kitchen`、`mountTiger4Bedroom`、`Tiger4Scene`、`setTiger4SpriteFrame`、`#petKitchen`、`#petBedroom`、`#kitchenTiger4Sprite`、`#bedroomTiger4Sprite`、`.scene-isle-float`、`.scene-pet-anchor`、`.scene-click-layer`、`--px`/`--py`。
