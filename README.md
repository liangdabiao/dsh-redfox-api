# dsh-redfox-api · 红狐数据调研工作台

DeepSeek Harness（dsh）插件：**RedFoxHub（红狐数据）API** 的端点检索与调用工作台（抖音、小红书、公众号、B站、快手、视频号、今日头条、TikTok、YouTube、X、Instagram、微博、知乎、汽车/电商、全网热点榜、AI 搜索、图片视频生成等 **28 类共 201 个端点**）。

技能来自 [redfox_api_skill](https://github.com/liangdabiao/redfox_api_skill)（liangdabiao）。
<img width="2099" height="909" alt="image" src="https://github.com/user-attachments/assets/8581a151-3fe5-4d30-89f3-03a6b5c87728" />

## 使用

需要 [RedFox](https://redfox.hk) key：侧栏「⚙️ 设置」里直接粘贴保存（或插件 Config / `REDFOX_API_KEY` 环境变量）。key 在 https://redfox.hk/settings/api-keys 获取。

**端点检索（`redfox_endpoint`）纯本地目录、零积分**；`redfox_call` 按次计费（最低约 ¥0.02/次），回执会标注业务码分类与扣费情况。

## 三步工作流

```text
1. redfox_endpoint action=search keyword=「抖音 账号 搜索」   → 找端点（零积分）
2. redfox_endpoint action=detail key=douyin.search_users      → 真实字段名/必填项/默认值
3. redfox_call method=POST path=/story/api/dyData/searchUser
   params={"keyword":"乐高"}                                  → 真实调用（按次计费）
```

字段名用 `detail` 给出的 `api_name`（camelCase，如 `sortType`），不要照抄 SDK 文档的 snake_case；部分「可选」参数服务端实际必填（`page`/`offset`/`sourceType`），照抄 `detail` 的 `example_call` 默认值即可。

## 业务码三分类（插件替你判好）

| 分类 | 含义 | 面板显示 |
|---|---|---|
| `ok` | `code=2000`，数据在 `data` | ✓ 成功 |
| `no_data` | `3203/3801` 且文案是「未查询到相关数据/暂未收录/暂无作品」——**空结果不是失败**，但按 `msg` 判断扣费（`3203` 常写明积分未扣除，`3801` 实测会扣 0.600 积分） | ◌ 无数据 |
| `error` | 其他 code：`1001/1002` 参数、`3103/3105/3107` key、`3201` 积分不足、`4004` 限流 | ✗ 错误 |

## 侧栏工作台

| 标签 | 内容 |
|---|---|
| 🏠 概览 | 调用次数/成功/无数据/失败/今日/Key 状态 + 剩余积分 + 常用调研（一键填进对话）+ 最近调用 |
| 📋 调用历史 | 每次调用的方法、路径、参数、业务码、扣费说明、响应片段；可搜索、展开、删除、清空、一键「再调一次」 |
| 🔎 端点库 | 201 端点本地目录：平台筛选 + 关键词搜索 + 点开看参数/必填/默认值/示例，一键「用这个调研」 |
| ⚙️ 设置 | 面板内直配 API key（显示来源：面板/Config/环境变量），明文不回显 |
| 📖 指南 | 三步工作流 + 业务码速查 + 调用避坑 |

## 工具

- `redfox_endpoint` — 端点目录检索：`platforms` / `platform` / `search` / `detail`（本地零积分）
- `redfox_call` — 真实 GET/POST 调用（key 走设置面板；`params` GET 进 query、POST 进 JSON body；multipart 上传接口传 `file`），自动入历史
- `redfox_history` — 列表 / 详情 / 删除 / 清空调用历史

## 安装

```bash
dsh plugin --profile web add https://github.com/liangdabiao/dsh-redfox-api
```

## 许可

MIT
