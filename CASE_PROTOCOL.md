# 病例与纸面标记格式（1.29.0）

英文模式使用相同的 STATUS 封套和隔离规则，角色/指令支持英文别名 `writer`、`patient`、`writing`、`ink`、`blood`、`water`。普通字段使用 date/growth/form/body/injury/drive/focus/observationNote/care 和检查项目英文 key。quote 必须逐字来自英文填写值，不翻译后再定位。新增 font ID 为 `caveat`、`kalam`、`patrickhand`；`kalam` 是英文默认字体。英文选择项和格式由病例设置自动提供给模型。

```text
[STATUS: writer=Dr. Lin | patient=Orion | date=Day 3, evening | temperature=Low | observationNote=A slight tremor. Continue observation. | writing={"font":"kalam","size":16,"tilt":0.4} | ink={"field":"observationNote","quote":"slight tremor","type":"blur","amount":0.4} | blood={"field":"observationNote","quote":"Continue observation.","variant":"drops","position":"after","size":65}]
```

用户通过 EXAM → 病例设置指定记录者、受检者和书写要求。插件将这些设置与格式规则发送给模型；模型在正常回复末尾的同一个 STATUS 块内完成字段与纸面方案。正常正文不需要包含指令。

```text
[STATUS: 日期=第三天 | 记录者=林医生 | 受检者=Orion | 观察补记=左手轻微发抖。继续观察。 | 处置=保暖并复查。
| 书写={"font":"yozai","size":15,"tilt":0.5,"blur":0.05,"messiness":0.3}
| 笔迹={"field":"observationNote","quote":"左手轻微发抖","type":"blur","amount":0.4}
| 笔迹={"field":"observationNote","quote":"左手轻微发抖","type":"enlarge","scale":1.3}
| 血迹={"field":"observationNote","quote":"继续观察。","variant":"drops","position":"after","size":60,"opacity":0.6}
| 水渍={"field":"care","quote":"保暖并复查。","variant":"edge","position":"over","size":110,"opacity":0.35}]
```

每条指令是单独的 JSON 对象，重复写 `笔迹=`、`血迹=` 或 `水渍=`；不使用数组。每次最多接受 48 条局部标记。填写值不要包含半角 `|` 或 `]`。原句逐字匹配；可用 `occurrence`（1–20，默认 1）选择同一字段里第几次出现。

## 全局与局部书写

全局 `书写` 的 font 可选 yozai（悠哉）、wenkai（霞鹜文楷）、xiaolai（小赖）或 system（系统楷体）；size 为 11–18，tilt、blur、messiness 为 0–1。固定表头、标签、选项不受影响。

| 局部 type | 参数 | 表现 |
| --- | --- | --- |
| font | font：上述字体名 | 更换指定文字字体 |
| blur | amount：0–1 | 局部模糊，可重复叠加 |
| enlarge | scale：1–1.8 | 放大，可重复叠加至 1.8 倍 |
| tilt | angle：−30–30 | 歪斜，可重复叠加至 ±35° |
| strike | amount：0–1 | 划掉指定原句，保留原文数据 |
| scribble | amount：0–1 | 来回涂抹指定原句，允许重复 |

局部 `field` 使用内部字段名。常用：writer、patient、date、growth、form、body、injury、drive、focus、observationNote、care；其他有手写补记框的检查项目也可用，完整清单由插件自动提供给模型。

## 血迹与水渍

| 指令 | variant | 素材所表现的形成方式 |
| --- | --- | --- |
| 血迹 | smear | 沾染物接触后擦蹭转印 |
| 血迹 | drops | 液滴受重力滴落 |
| 血迹 | grip | 沾染手指握持或接触纸面 |
| 血迹 | flow | 液体沿倾斜表面流淌 |
| 血迹 | wipe | 湿迹被擦拭拖开 |
| 血迹 | soak | 纸纤维吸附浸染 |
| 水渍 | spill | 泼洒后干涸形成水线 |
| 水渍 | rain | 分散雨点浸润 |
| 水渍 | edge | 纸边受潮并向内洇开 |

这些是绘图素材的场景说明，不能据此作真实案件的形成机制鉴定。来源与生成记录在 `assets/generated-assets.json`。

同一张病例最多使用每个 variant 一次，血迹与水渍可共存；重复时保留首个有效原句标记。`position` 为 before、after、over；size 为 25–180，opacity 为 0.05–1，可用 dx/dy（−60–60）微调。after 默认贴在原句后方，行尾空间不足时移到其下一行。素材仅从插件本地注册表加载，不接受模型提供的 URL、CSS 或 HTML。

## 保存与隔离

每条助手回复和候选回复独立保存 STATUS 原块至 `extra.u4d_status_fields`，正文及历史出站请求剥离这些块。标记的格式错误、重复和锚点错误显示在正文下方的折叠区；不完整 JSON 块整体隔离，不将尾部误当正文。

新回复替换该病例的纸面方案，不从旧回复累加污渍。同日未填写的普通状态字段可沿用上次显示值，换日按原规则重建；明确设置另一组记录者/受检者后，不混用上一组记录。更换聊天后设置隔离，已经打开的旧设置对话框不能误保存到新聊天。

用户关闭血迹、水渍或涂抹时，对应模型指令不会显示；关闭 AI 选择笔迹后使用手动书写参数，不应用模型的局部字体效果。修改显示参数不改写既有原始字段。历史字段和纸面方案不反馈到模型；用户设置及格式说明仍会随正常请求发送。

本轮在模拟宿主中验证解析、保存、渲染和隔离；真实模型遵循格式的程度取决于使用的模型与上下文。读取任意 `extra`、DOM 或原始网络响应的第三方记忆插件需单独核查。
