# Unknown Four-Dimensional Entity Status Panel

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

The examination record uses date, growth cycle, form, body condition, temperature regulation, breathing, circulation, energy reserve, injury, current drive, pain response, tissue condition, observation, mental state, cognition, mobility, posture, activity level, stress response, touch tolerance, senses, communication, intake, rest, learning and memory, dimensional anomaly, risk assessment, care, hygiene, secretion, excretion, muscle tone, three-dimensional stability, self-care, boundary response, social adaptation, and the append-only archive. Each variable is shown once in a compact 3:4 portrait paper table. A second 3:4 daily check-in table records one row per story day, including growth/form, grouped examination completion, completion count, and a brief daily summary. The body diagram creates a red cross only when the current injury text names that region; inactive marks are not rendered.

The paper table also accepts observation fields: `观察重点`, `精神状态`, `行动能力`, `体位`, `活动量`, `应激`, `触碰耐受`, `感官`, `沟通`, `摄入`, `休眠`, `处置`, `清洁状态`, `分泌情况`, `排泄情况`, `肌张力`, `三维稳定度`, `自理能力`, `边界反应`, and `社会适应`. The form uses compact two-column checkboxes as a visual summary of known values and fixed ruled lines for clinical summaries. Omitted fields retain their values only within the same story day.

Opening the floating launcher shows the latest examination record and the daily check-in table together. Each paper can be dragged, proportionally zoomed, and closed independently; opening the launcher again restores both papers. The mouse wheel scrolls a field when that fixed field is overflowing; elsewhere on that paper, the same wheel zooms the whole paper. Scrollbars remain hidden. Long field text, permanent records, and check-in history therefore stay on their original single sheets without continuation pages or data loss. All status and daily history data live only in the active chat's `chat_metadata`; the extension does not create a separate database.

## Install

Place this folder at:

```text
SillyTavern/public/scripts/extensions/third-party/UnknownFourDimensionalStatusPanel
```

Restart SillyTavern or reload the page. The extension works with all active character cards unless they explicitly set `data.extensions.u4d_status_panel.enabled = false`.
