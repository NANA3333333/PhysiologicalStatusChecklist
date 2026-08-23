# Physiological Status Checklist

## 傻瓜式安装

不懂代码也可以安装。这个插件不需要 npm、不需要编译，也不需要修改角色卡。

### 方法一：下载 ZIP（推荐）

1. 打开本仓库页面：<https://github.com/NANA3333333/PhysiologicalStatusChecklist>
2. 点击绿色的 `Code` 按钮，再点击 `Download ZIP`。
3. 找到下载好的 ZIP 文件，右键选择“解压到当前文件夹”。
4. 把解压出来的文件夹改名为：

   ```text
   UnknownFourDimensionalStatusPanel
   ```

5. 找到 SillyTavern 的安装目录，在里面打开或新建下面这个文件夹：

   ```text
   SillyTavern/public/scripts/extensions/third-party/
   ```

6. 把整个 `UnknownFourDimensionalStatusPanel` 文件夹放进去。

放好以后，目录必须长这样：

```text
SillyTavern/
└─ public/
   └─ scripts/
      └─ extensions/
         └─ third-party/
            └─ UnknownFourDimensionalStatusPanel/
               ├─ index.js
               ├─ manifest.json
               ├─ style.css
               └─ assets/
                  └─ human-outline.png
```

重点检查：`index.js` 必须直接在 `UnknownFourDimensionalStatusPanel` 里面。

下面这种多套了一层文件夹的放法是错误的：

```text
third-party/UnknownFourDimensionalStatusPanel/UnknownFourDimensionalStatusPanel-main/index.js
```

7. 关闭并重新启动 SillyTavern。若 SillyTavern 没有关闭，也可以先按 `Ctrl + F5` 强制刷新网页。
8. 打开任意角色聊天。右下角或页面边缘出现小型 `EXAM` 浮窗，就说明安装成功。
9. 点击 `EXAM`，会同时打开最新的具体检查记录表和日期签到表。

### 方法二：使用 Git

如果电脑已经安装 Git，在 SillyTavern 的插件目录打开 PowerShell，运行：

```powershell
git clone https://github.com/NANA3333333/PhysiologicalStatusChecklist.git UnknownFourDimensionalStatusPanel
```

然后重启 SillyTavern 或按 `Ctrl + F5`。

## 不需要导入插件到角色卡

插件和角色卡是分开的：

- 导入角色卡只会导入人设、开场白和世界书，不会自动带上本插件。
- 这台 SillyTavern 安装过插件后，其他角色卡也可以使用它。
- 插件会自动注入状态协议提示词，角色卡不需要再添加 HTML、CSS 或插件提示词。
- 换到另一台电脑时，需要在那台电脑的 SillyTavern 里重新安装插件。

## 安装后怎么使用

插件安装成功后不需要额外设置：

1. 打开角色聊天。
2. 点击 `EXAM` 浮窗。
3. 继续正常对话。
4. 只有日期、身体状态、损伤、行为或其他记录真正变化时，AI 才需要输出状态行。
5. 没有状态变化时，AI 可以只输出正常正文。
6. 勾选类状态出现异常、恶化或变化时，AI 会同步填写“观察补记”，记录具体表现、发生条件、涉及部位和变化结果。

插件会把状态行隐藏起来，并把数据保存在当前聊天中。正文不需要 HTML，插件也不会把 CSS 追加到正文下面。

## 常见问题

### 看不到 EXAM 浮窗

按下面顺序检查：

1. 确认 `index.js` 在正确的位置：

   ```text
   SillyTavern/public/scripts/extensions/third-party/UnknownFourDimensionalStatusPanel/index.js
   ```

2. 确认不是把 ZIP 文件本身放进了 `third-party`。
3. 确认没有多套一层 `UnknownFourDimensionalStatusPanel-main` 文件夹。
4. 重启 SillyTavern，或按 `Ctrl + F5`。
5. 进入角色聊天后再看页面边缘。

### 导入角色卡后没有插件

这是正常的。插件必须单独安装在 SillyTavern 的 `third-party` 文件夹里；角色卡不会携带插件文件。

### 如何更新插件

下载新版本 ZIP 后，用新文件夹替换旧的 `UnknownFourDimensionalStatusPanel` 文件夹，然后重启 SillyTavern 或按 `Ctrl + F5`。当前聊天里的状态数据保存在聊天元数据中，不在插件文件夹里。

This SillyTavern extension owns the incremental `[STATUS: ...]` protocol and renders a draggable floating entry point for a fixed, light-themed humanoid case record. The protocol prompt is injected by the extension, so other character cards can use the panel without copying prompt text into the card.

The extension is enabled for the active character by default. A character can opt out with `data.extensions.u4d_status_panel.enabled = false`.

## Protocol

The extension injects the following rules before generation. The model only outputs fields that changed. Omitted current fields keep their previous values. A permanent archive entry uses `+=` and is never overwritten:

```text
[STATUS: 日期=第1天·夜 | 成长周期=幼体·阶段1 | 形态=14岁少年拟态 | 身体=低体温/饥饿 | 损伤=左上肢旧伤裂口 | 驱动=寻找热源 | 观察重点=确认是否能接受拒绝 | 精神=清醒但高度惊恐 | 行动=无法独立站立 | 感官=嗅觉灵敏 | 沟通=仅能发出低鸣 | 摄入=尚未进食 | 休眠=未休眠 | 处置=保持温暖 | 三维稳定=人形拟态不稳定 | 自理=无法独立完成 | 边界=无法理解拒绝 | 适应=不具备人类社会适应能力 | 记录+=首次将用户识别为唯一热源]
```

Later updates on the same story day can be partial:

```text
[STATUS: 身体=体温稳定 | 记录+=第一次理解“睡觉”是拒绝]
```

The model must update `日期` whenever the narrative crosses midnight or explicitly advances to another day. A day key uses `第N天·时段` (or an established calendar date). Changing only the time of day keeps the same sheet. Changing the day starts a fresh daily examination: short-term observations are cleared, while growth cycle, form, and append-only permanent records carry forward. Ongoing injuries must be reassessed in that new-day status line instead of being silently copied or treated as healed.

The extension injects the prompt before each generation with the latest merged snapshot, then scans the character reply after it is received or edited. It merges the current snapshot, accumulates permanent records, hides the protocol line, and renders the fixed examination desk. The model never needs to generate HTML or CSS, and no status CSS is appended below the message body. `因果+=`, `已学会+=`, `形态库+=`, and `记忆+=` are accepted as categorized permanent records.

When a checkbox-style condition becomes abnormal, worsens, or changes from the current snapshot, the protocol also requires an `观察补记` value describing the manifestation, trigger or circumstances, affected region when applicable, and resulting change. A checkbox conclusion by itself is not sufficient.

All status text follows a clinical case-note standard. Field values, injury descriptions, observation notes, care entries, and permanent records must use an objective, restrained, verifiable medical-record voice. The model should record the observed site, manifestation, severity or extent, timing or trigger, care, and outcome when available. It must not invent measurements, diagnoses, test results, medication details, or poetic/chatty descriptions, and any character quotation must be explicitly marked as `原话` rather than treated as a clinical conclusion.

The examination record uses date, growth cycle, form, body condition, temperature regulation, breathing, circulation, energy reserve, injury, current drive, pain response, tissue condition, observation, mental state, cognition, mobility, posture, activity level, stress response, touch tolerance, senses, communication, intake, rest, learning and memory, dimensional anomaly, risk assessment, care, hygiene, secretion, excretion, muscle tone, three-dimensional stability, self-care, boundary response, social adaptation, and the append-only archive. Each variable is shown once in a compact 3:4 portrait paper table. A second 3:4 daily check-in table records one row per story day, including growth/form, grouped examination completion, completion count, and a brief daily summary. The body diagram creates a red cross only when the current injury text names that region; inactive marks are not rendered.

The paper table also accepts observation fields: `观察重点`, `精神状态`, `行动能力`, `体位`, `活动量`, `应激`, `触碰耐受`, `感官`, `沟通`, `摄入`, `休眠`, `处置`, `清洁状态`, `分泌情况`, `排泄情况`, `肌张力`, `三维稳定度`, `自理能力`, `边界反应`, and `社会适应`. The form uses compact two-column checkboxes as a visual summary of known values and fixed ruled lines for clinical summaries. Omitted fields retain their values only within the same story day.

Opening the floating launcher shows the latest examination record and the daily check-in table together. Click a recorded date row to load that day's concrete examination record; opening the launcher again restores the latest record. Each paper can be dragged, proportionally zoomed, and closed independently. The mouse wheel scrolls a field when that fixed field is overflowing; elsewhere on that paper, the same wheel zooms the whole paper. Scrollbars remain hidden. Long field text, permanent records, and check-in history therefore stay on their original single sheets without continuation pages or data loss. All status and daily history data live only in the active chat's `chat_metadata`; the extension does not create a separate database.

On phone-sized viewports, the two papers stack vertically in portrait mode and sit side by side in landscape mode. The initial scale is calculated from the available screen area, the paper remains 3:4, and touch dragging plus two-finger pinch zoom are supported. Rotating the device repositions un-dragged papers within the viewport.

For each story day, the first status update must establish every table field. Until the prompt reports that the current table is complete, the model must fill all missing fields in one status line; only then may later turns update a single changed field or `观察补记`. A new story day starts this completeness check again.

## Developer Install

Place this folder at:

```text
SillyTavern/public/scripts/extensions/third-party/UnknownFourDimensionalStatusPanel
```

Restart SillyTavern or reload the page. The extension works with all active character cards unless they explicitly set `data.extensions.u4d_status_panel.enabled = false`.
